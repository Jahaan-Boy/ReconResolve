import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import {
    authenticate,
    resolveMerchantContext,
    requireRole,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import {
    PortfolioIntelligenceService,
    type PortfolioIntelligenceServiceDeps,
} from '../services/intelligence/portfolio-intelligence.service';
import type { PortfolioWindow } from '../services/intelligence/types';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IntelligenceRouterDeps {
    service?: PortfolioIntelligenceService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    serviceDeps?: PortfolioIntelligenceServiceDeps;
}

const QuerySchema = z.object({
    window: z.enum(['24h', '7d', '30d', 'all']).default('30d'),
});

export function createIntelligenceRouter(deps: IntelligenceRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });

    const getService = () =>
        deps.service ??
        new PortfolioIntelligenceService({
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

    // GET /api/merchants/:merchantId/intelligence/portfolio
    router.get(
        '/portfolio',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateMerchantParam(merchantId);

                const query = QuerySchema.parse(req.query);
                const service = getService();
                const result = await service.getPortfolioAnalysis(
                    merchantId,
                    query.window as PortfolioWindow,
                );

                res.status(200).json(result);
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid query parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[IntelligenceRouter] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'INTELLIGENCE_ERROR',
                    message: err.message || 'An unexpected intelligence analysis error occurred',
                });
            }
        },
    );

    return router;
}
