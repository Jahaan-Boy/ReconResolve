import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import {
    authenticate,
    requireRole,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { AIInvestigatorError } from '../services/ai-investigator/errors';
import {
    createInvestigationService,
    type InvestigationService,
} from '../services/ai-investigator/investigation.service';

import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

export interface InvestigationRouterDeps {
    service?: InvestigationService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const InvestigateBodySchema = z.object({
    idempotencyKey: z.string().trim().max(128, 'idempotencyKey cannot exceed 128 characters').optional(),
});

export function createInvestigationRouter(deps: InvestigationRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createInvestigationService();

    // Server-enforced authentication and merchant isolation guards
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

        if (err instanceof AIInvestigatorError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[InvestigationRouter] Unexpected error:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateParams(merchantId: string, exceptionId: string, investigationId?: string): void {
        if (!UUID_REGEX.test(merchantId)) {
            throw AIInvestigatorError.validationFailed('Invalid merchantId parameter: must be a valid UUID');
        }
        if (!UUID_REGEX.test(exceptionId)) {
            throw AIInvestigatorError.validationFailed('Invalid exceptionId parameter: must be a valid UUID');
        }
        if (investigationId && !UUID_REGEX.test(investigationId)) {
            throw AIInvestigatorError.validationFailed('Invalid investigationId parameter: must be a valid UUID');
        }
    }

    // 1. POST /api/merchants/:merchantId/exceptions/:exceptionId/investigations
    // Triggers an AI investigation for the given exception. Strictly read-only with respect to exception state.
    router.post(
        '/',
        requireRole(['OWNER', 'ADMIN', 'ANALYST']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, exceptionId } = req.params;
                validateParams(merchantId, exceptionId);

                const body = InvestigateBodySchema.parse(req.body || {});
                const actorId = req.auth?.user.id || req.authenticatedUser?.id;
                const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

                const record = await service.investigate({
                    merchantId,
                    exceptionId,
                    actorId,
                    idempotencyKey: body.idempotencyKey,
                    correlationId,
                });

                res.status(200).json(record);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 2. GET /api/merchants/:merchantId/exceptions/:exceptionId/investigations
    // Lists all persisted investigations for this exception
    router.get(
        '/',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, exceptionId } = req.params;
                validateParams(merchantId, exceptionId);

                const records = await service.listInvestigations(merchantId, exceptionId);
                res.status(200).json({
                    exceptionId,
                    investigations: records,
                });
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 3. GET /api/merchants/:merchantId/exceptions/:exceptionId/investigations/latest
    // Retrieves the most recent investigation for this exception
    router.get(
        '/latest',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, exceptionId } = req.params;
                validateParams(merchantId, exceptionId);

                const record = await service.getLatestInvestigation(merchantId, exceptionId);
                if (!record) {
                    throw AIInvestigatorError.notFound('No investigation found for this exception');
                }

                res.status(200).json(record);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    // 4. GET /api/merchants/:merchantId/exceptions/:exceptionId/investigations/:investigationId
    // Retrieves a specific investigation by ID
    router.get(
        '/:investigationId',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, exceptionId, investigationId } = req.params;
                validateParams(merchantId, exceptionId, investigationId);

                const record = await service.getInvestigation(merchantId, exceptionId, investigationId);
                if (!record) {
                    throw AIInvestigatorError.notFound('Investigation not found or access denied');
                }

                res.status(200).json(record);
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    return router;
}
