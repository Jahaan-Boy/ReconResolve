import { Router, type Request, type Response, type RequestHandler } from 'express';
import { getDB } from '../db/postgres';
import {
    authenticate,
    requireRole,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { OperationsError } from '../services/operations/errors';
import {
    OperationsService,
    type OperationsServiceDeps,
    type OperatorContext,
} from '../services/operations/operations.service';

export interface OperationsRouterDeps {
    service?: OperationsService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    serviceDeps?: OperationsServiceDeps;
}

function resolveOperatorContext(req: Request): OperatorContext {
    if (req.auth) {
        return {
            actorId: req.auth.user.id,
            roles: [req.auth.membership.role],
            correlationId: (req.headers['x-correlation-id'] as string) || undefined,
        };
    }
    const actorId = req.authenticatedUser?.id || 'system-operator';
    return {
        actorId,
        roles: ['OPERATOR'],
        correlationId: (req.headers['x-correlation-id'] as string) || undefined,
    };
}

export function createOperationsRouter(deps: OperationsRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });

    const getService = () =>
        deps.service ??
        new OperationsService({
            db: (deps.serviceDeps?.db ?? getDB()) as any,
        });

    const authGuard = deps.authGuard ?? authenticate(deps.authDeps);
    const merchantGuard = deps.merchantGuard ?? resolveMerchantContext(deps.authDeps);

    router.use(authGuard);
    router.use(merchantGuard);

    function handleRouteError(res: Response, err: unknown): void {
        if (err instanceof OperationsError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[OperationsRouter] Unexpected error:', err);
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected operational error occurred',
        });
    }

    // 1. GET /api/merchants/:merchantId/operations/summary
    // Operational pipeline health, queue backlog, dead-letter items.
    router.get(
        '/summary',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                const service = getService();
                const result = await service.getSummary(merchantId);
                res.status(200).json(result);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 2. POST /api/merchants/:merchantId/operations/outbox/:eventId/replay
    // Replays an eligible FAILED outbox event back to PENDING status.
    // Strictly restricted to OWNER and ADMIN roles.
    router.post(
        '/outbox/:eventId/replay',
        requireRole(['OWNER', 'ADMIN']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, eventId } = req.params;
                const context = resolveOperatorContext(req);
                const service = getService();
                const result = await service.replayOutboxEvent(merchantId, eventId, context);
                res.status(200).json(result);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    return router;
}
