import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import {
    authenticate,
    resolveMerchantContext,
    requireRole,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { CopilotService, type CopilotServiceDeps } from '../services/copilot/copilot.service';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CopilotRouterDeps {
    service?: CopilotService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    serviceDeps?: CopilotServiceDeps;
}

const AskBodySchema = z.object({
    question: z
        .string()
        .trim()
        .min(2, 'Question must be at least 2 characters')
        .max(500, 'Question must not exceed 500 characters'),
    context: z
        .object({
            runId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
            exceptionId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
            window: z.enum(['24h', '7d', '30d', 'all']).optional(),
        })
        .optional(),
});

export function createCopilotRouter(deps: CopilotRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });

    const getService = () =>
        deps.service ??
        new CopilotService({
            db: (deps.serviceDeps?.db ?? getDB()) as any,
        });

    const authGuard = deps.authGuard ?? authenticate(deps.authDeps);
    const merchantGuard = deps.merchantGuard ?? resolveMerchantContext(deps.authDeps);

    router.use(authGuard);
    router.use(merchantGuard);

    function validateMerchantParam(merchantId: string): void {
        if (!UUID_REGEX.test(merchantId)) {
            const err = new Error('Invalid merchantId: must be a valid UUID');
            (err as any).statusCode = 400;
            throw err;
        }
    }

    // 1. GET /api/merchants/:merchantId/copilot/capabilities
    router.get(
        '/capabilities',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (_req: Request, res: Response): Promise<void> => {
            try {
                const service = getService();
                const capabilities = service.getCapabilities();
                res.status(200).json(capabilities);
            } catch (err: any) {
                console.error('[CopilotRouter:capabilities] Unexpected error:', sanitizeErrorMessage(err));
                res.status(500).json({
                    error: 'COPILOT_ERROR',
                    message: 'Failed to retrieve copilot capabilities',
                });
            }
        },
    );

    // 2. POST /api/merchants/:merchantId/copilot/ask
    router.post(
        '/ask',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateMerchantParam(merchantId);

                const body = AskBodySchema.parse(req.body);
                const service = getService();
                const result = await service.answerQuestion(merchantId, body);

                res.status(200).json(result);
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid question parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:ask] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_ERROR',
                    message: err.message || 'An unexpected copilot answering error occurred',
                });
            }
        },
    );

    return router;
}
