import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import {
    authenticate,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { ProviderConnectionError } from '../services/provider-connection/errors';
import {
    createProviderConnectionService,
    type ProviderConnectionService,
} from '../services/provider-connection/provider-connection.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProviderConnectionRouterDeps {
    service?: ProviderConnectionService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
}

const ListQuerySchema = z.object({
    provider: z.enum(['PAYPAL']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'NEEDS_REAUTH']).optional(),
    cursor: z.string().regex(UUID_REGEX, 'Invalid UUID cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function createProviderConnectionRouter(deps: ProviderConnectionRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createProviderConnectionService();

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

        if (err instanceof ProviderConnectionError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[ProviderConnectionRouter] Unexpected error:', err);
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateUuidParam(paramName: string, value: string): void {
        if (!UUID_REGEX.test(value)) {
            throw ProviderConnectionError.validationFailed(`Invalid ${paramName} parameter: must be a valid UUID`);
        }
    }

    // 1. List connections
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateUuidParam('merchantId', merchantId);

            const filter = ListQuerySchema.parse(req.query);
            const result = await service.listConnections(merchantId, filter);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 2. Connection detail
    router.get('/:connectionId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, connectionId } = req.params;
            validateUuidParam('merchantId', merchantId);
            validateUuidParam('connectionId', connectionId);

            const detail = await service.getConnection(merchantId, connectionId);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}
