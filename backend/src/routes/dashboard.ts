import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import {
    authenticate,
    resolveMerchantContext,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import {
    createDashboardService,
    DashboardError,
    type DashboardService,
} from '../services/dashboard';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface DashboardRouterDeps {
    service?: DashboardService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    getDb?: () => PrismaClient;
}

const DashboardSummaryQuerySchema = z
    .object({
        from: z
            .string()
            .datetime({ message: '"from" must be a valid ISO 8601 datetime' })
            .optional()
            .transform((val) => (val ? new Date(val) : undefined)),
        to: z
            .string()
            .datetime({ message: '"to" must be a valid ISO 8601 datetime' })
            .optional()
            .transform((val) => (val ? new Date(val) : undefined)),
    })
    .strict();

export function createDashboardRouter(deps: DashboardRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const dbProvider = deps.getDb ?? getDB;
    const getService = () => deps.service ?? createDashboardService({ getDb: dbProvider });

    // Server-enforced authentication and tenant context isolation
    const authGuard = deps.authGuard ?? authenticate(deps.authDeps);
    const merchantGuard = deps.merchantGuard ?? resolveMerchantContext(deps.authDeps);

    router.use(authGuard);
    router.use(merchantGuard);

    function handleRouteError(res: Response, err: unknown): void {
        if (err instanceof z.ZodError) {
            res.status(400).json({
                error: 'VALIDATION_FAILED',
                message: 'Invalid query parameters',
                details: err.flatten(),
            });
            return;
        }

        if (err instanceof DashboardError) {
            switch (err.code) {
                case 'DASHBOARD_INVALID_INPUT':
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: err.message,
                        details: { fields: err.fields },
                    });
                    return;
                case 'DASHBOARD_MERCHANT_NOT_FOUND':
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Merchant not found or access denied',
                    });
                    return;
                case 'DASHBOARD_ERROR':
                default:
                    res.status(500).json({
                        error: 'DASHBOARD_FAILED',
                        message: err.message,
                    });
                    return;
            }
        }

        console.error('[DashboardRouter] Unexpected error:', err);
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateMerchantParam(merchantId: string): void {
        if (!UUID_REGEX.test(merchantId)) {
            throw new DashboardError(
                'DASHBOARD_INVALID_INPUT',
                'Invalid merchantId parameter: must be a valid UUID',
                ['merchantId'],
            );
        }
    }

    /**
     * GET /api/merchants/:merchantId/dashboard/summary
     * Returns tenant-scoped operational reconciliation summary and bounded trends.
     * Permission: Any authenticated member of the merchant (OWNER, ADMIN, ANALYST, VIEWER).
     */
    router.get('/summary', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateMerchantParam(merchantId);

            // Tenant identity is strictly derived from server-authenticated context
            const trustedMerchantId = req.auth!.merchant.id;
            if (merchantId !== trustedMerchantId) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Merchant not found or access denied',
                });
                return;
            }

            const filter = DashboardSummaryQuerySchema.parse(req.query);

            if (filter.from && filter.to) {
                if (filter.to < filter.from) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid date range: "from" timestamp must be earlier than or equal to "to" timestamp',
                    });
                    return;
                }
                if (filter.to.getTime() - filter.from.getTime() > MAX_RANGE_MS) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Reconciliation dashboard date window cannot exceed 90 days',
                    });
                    return;
                }
            }

            const service = getService();
            const summary = await service.getSummary(trustedMerchantId, filter);
            res.status(200).json(summary);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}

