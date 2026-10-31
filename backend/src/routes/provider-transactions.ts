import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import {
    authenticate,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { ProviderTransactionError } from '../services/provider-transaction/errors';
import {
    createProviderTransactionService,
    type ProviderTransactionService,
} from '../services/provider-transaction/provider-transaction.service';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProviderTransactionRouterDeps {
    service?: ProviderTransactionService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
}

const ListQuerySchema = z.object({
    connectionId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
    status: z
        .enum([
            'CREATED',
            'APPROVED',
            'PENDING',
            'CAPTURED',
            'FAILED',
            'REFUNDED',
            'PARTIALLY_REFUNDED',
            'VOIDED',
        ])
        .optional(),
    type: z
        .enum([
            'PAYMENT',
            'CAPTURE',
            'REFUND',
            'REVERSAL',
            'ADJUSTMENT',
            'OTHER',
        ])
        .optional(),
    currency: z
        .string()
        .trim()
        .length(3, 'Currency must be 3 characters')
        .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO code')
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
    providerTxnId: z.string().trim().min(1).max(128).optional(),
    providerRecordKey: z.string().trim().min(1).max(128).optional(),
    providerOrderId: z.string().trim().min(1).max(128).optional(),
    cursor: z.string().regex(UUID_REGEX, 'Invalid UUID cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function createProviderTransactionRouter(deps: ProviderTransactionRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createProviderTransactionService();

    // Server-enforced authentication and tenant context isolation
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

        if (err instanceof ProviderTransactionError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[ProviderTransactionRouter] Unexpected error:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateUuidParam(paramName: string, value: string): void {
        if (!UUID_REGEX.test(value)) {
            throw ProviderTransactionError.validationFailed(`Invalid ${paramName} parameter: must be a valid UUID`);
        }
    }

    // 1. List transactions
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateUuidParam('merchantId', merchantId);

            const filter = ListQuerySchema.parse(req.query);
            const result = await service.listTransactions(merchantId, filter);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 2. Transaction detail
    router.get('/:transactionId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, transactionId } = req.params;
            validateUuidParam('merchantId', merchantId);
            validateUuidParam('transactionId', transactionId);

            const detail = await service.getTransaction(merchantId, transactionId);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}
