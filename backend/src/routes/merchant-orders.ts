import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import {
    authenticate,
    resolveMerchantContext,
    requireRole,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { MerchantOrderError } from '../services/merchant-order/errors';
import {
    createMerchantOrderService,
    type MerchantOrderService,
} from '../services/merchant-order/merchant-order.service';
import { MerchantOrderStatus } from '../services/merchant-order/types';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MerchantOrderRouterDeps {
    service?: MerchantOrderService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
}

const OrderInputSchema = z.object({
    externalOrderId: z.string({ required_error: 'externalOrderId is required' }).trim().min(1).max(128),
    amountMinor: z.union([z.number(), z.string(), z.bigint()]).optional(),
    amount: z.string().trim().optional(),
    currency: z
        .string({ required_error: 'currency is required' })
        .trim()
        .length(3, 'Currency must be 3 characters')
        .regex(/^[A-Z]{3}$/i, 'Currency must be a 3-letter ISO code'),
    status: z
        .enum([
            MerchantOrderStatus.OPEN,
            MerchantOrderStatus.PAYMENT_PENDING,
            MerchantOrderStatus.PAID,
            MerchantOrderStatus.CANCELLED,
            MerchantOrderStatus.REFUNDED,
        ])
        .optional(),
    orderedAt: z.union([z.string().datetime(), z.string().min(1)]),
    metadata: z.record(z.unknown()).nullable().optional(),
}).refine(
    (data) => data.amountMinor !== undefined || data.amount !== undefined,
    { message: 'Either amountMinor or amount must be provided', path: ['amountMinor'] },
);

const BulkOrdersBodySchema = z.object({
    orders: z
        .array(OrderInputSchema, { required_error: 'orders array is required' })
        .min(1, 'Batch must contain at least 1 order')
        .max(100, 'Batch cannot exceed 100 orders'),
});

const ListQuerySchema = z.object({
    status: z
        .enum([
            MerchantOrderStatus.OPEN,
            MerchantOrderStatus.PAYMENT_PENDING,
            MerchantOrderStatus.PAID,
            MerchantOrderStatus.CANCELLED,
            MerchantOrderStatus.REFUNDED,
        ])
        .optional(),
    currency: z
        .string()
        .trim()
        .length(3, 'Currency must be 3 characters')
        .regex(/^[A-Z]{3}$/i, 'Currency must be a 3-letter ISO code')
        .optional(),
    from: z
        .string()
        .datetime()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    to: z
        .string()
        .datetime()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    externalOrderId: z.string().trim().min(1).max(128).optional(),
    cursor: z.string().regex(UUID_REGEX, 'Invalid UUID cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function createMerchantOrderRouter(deps: MerchantOrderRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createMerchantOrderService();

    // Server-enforced authentication and merchant tenant isolation
    const authGuard = deps.authGuard ?? authenticate(deps.authDeps);
    const merchantGuard = deps.merchantGuard ?? resolveMerchantContext(deps.authDeps);

    router.use(authGuard);
    router.use(merchantGuard);

    function handleRouteError(res: Response, err: unknown): void {
        if (err instanceof z.ZodError) {
            res.status(400).json({
                error: 'VALIDATION_FAILED',
                message: 'Invalid request input',
                details: err.flatten(),
            });
            return;
        }

        if (err instanceof MerchantOrderError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[MerchantOrderRouter] Unexpected error:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateUuidParam(paramName: string, value: string): void {
        if (!UUID_REGEX.test(value)) {
            throw MerchantOrderError.validationFailed(`Invalid ${paramName} parameter: must be a valid UUID`);
        }
    }

    // 1. Ingest single order (write permission required)
    router.post(
        '/',
        requireRole(['OWNER', 'ADMIN', 'ANALYST']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateUuidParam('merchantId', merchantId);

                const body = OrderInputSchema.parse(req.body);
                // Tenant ownership comes strictly from the server-authorized route param / context
                const result = await service.ingestSingleOrder(merchantId, body);

                const statusCode = result.outcome === 'created' ? 201 : 200;
                res.status(statusCode).json(result);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 2. Ingest bounded batch orders (write permission required)
    router.post(
        '/bulk',
        requireRole(['OWNER', 'ADMIN', 'ANALYST']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateUuidParam('merchantId', merchantId);

                const body = BulkOrdersBodySchema.parse(req.body);
                const result = await service.ingestBatchOrders(merchantId, body.orders);

                res.status(200).json(result);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 3. List orders
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateUuidParam('merchantId', merchantId);

            const filter = ListQuerySchema.parse(req.query);
            const result = await service.listOrders(merchantId, filter);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 4. Order detail
    router.get('/:orderId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, orderId } = req.params;
            validateUuidParam('merchantId', merchantId);
            validateUuidParam('orderId', orderId);

            const detail = await service.getOrder(merchantId, orderId);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}
