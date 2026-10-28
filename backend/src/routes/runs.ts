import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import {
    authenticate,
    resolveMerchantContext,
    requireRole,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import { ReconciliationError } from '../services/reconciliation/errors';
import {
    createReconciliationService,
    type ReconciliationService,
} from '../services/reconciliation/reconciliation.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90 days maximum bounded window

export interface ReconciliationRunRouterDeps {
    service?: ReconciliationService;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    getDb?: () => PrismaClient;
}

const FORBIDDEN_LIFECYCLE_FIELDS = [
    'status',
    'startedAt',
    'completedAt',
    'totalConsidered',
    'matchedCount',
    'unmatchedCount',
    'ambiguousCount',
    'excludedCount',
    'failureReason',
    'merchantId',
    'id',
] as const;

const RunOptionsSchema = z.object({
    providerConnectionId: z.string().regex(UUID_REGEX, 'providerConnectionId must be a valid UUID').optional(),
    from: z.string().datetime({ message: '"from" must be a valid ISO 8601 datetime' }).optional(),
    to: z.string().datetime({ message: '"to" must be a valid ISO 8601 datetime' }).optional(),
    rulesetVersion: z.string().trim().min(1).max(32).optional(),
    batchSize: z.coerce.number().int().min(1).max(200).optional(),
    timeWindowToleranceMs: z.coerce.number().int().min(1000).max(7 * 24 * 60 * 60 * 1000).optional(),
}).strict();

const InitiateRunBodySchema = z.object({
    idempotencyKey: z
        .string()
        .trim()
        .min(1, 'idempotencyKey cannot be empty')
        .max(128, 'idempotencyKey cannot exceed 128 characters')
        .optional(),
    providerConnectionId: z.string().regex(UUID_REGEX, 'providerConnectionId must be a valid UUID').optional(),
    from: z.string().datetime({ message: '"from" must be a valid ISO 8601 datetime' }).optional(),
    to: z.string().datetime({ message: '"to" must be a valid ISO 8601 datetime' }).optional(),
    rulesetVersion: z.string().trim().min(1).max(32).optional(),
    batchSize: z.coerce.number().int().min(1).max(200).optional(),
    timeWindowToleranceMs: z.coerce.number().int().min(1000).max(7 * 24 * 60 * 60 * 1000).optional(),
    options: RunOptionsSchema.optional(),
}).strict();

const ListRunsQuerySchema = z.object({
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
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
    cursor: z.string().regex(UUID_REGEX, 'Invalid UUID cursor').optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export function createReconciliationRunRouter(deps: ReconciliationRunRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const dbProvider = deps.getDb ?? getDB;
    const service = deps.service ?? createReconciliationService({ getDb: dbProvider });

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

        if (err instanceof ReconciliationError) {
            switch (err.code) {
                case 'RECON_INVALID_INPUT':
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: err.message,
                        details: { fields: err.fields },
                    });
                    return;
                case 'RECON_MERCHANT_NOT_FOUND':
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Merchant not found or access denied',
                    });
                    return;
                case 'RECON_CONNECTION_NOT_FOUND':
                    res.status(404).json({
                        error: 'CONNECTION_NOT_FOUND',
                        message: err.message,
                    });
                    return;
                case 'RECON_IDEMPOTENCY_CONFLICT':
                    res.status(409).json({
                        error: 'IDEMPOTENCY_CONFLICT',
                        message: err.message,
                    });
                    return;
                case 'RECON_RUN_IN_PROGRESS':
                    res.status(409).json({
                        error: 'RUN_IN_PROGRESS',
                        message: err.message,
                    });
                    return;
                case 'RECON_RUN_FAILED':
                    res.status(409).json({
                        error: 'RUN_FAILED',
                        message: err.message,
                    });
                    return;
                case 'RECON_RUN_NOT_FOUND':
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Reconciliation run not found or access denied',
                    });
                    return;
                case 'RECON_PERSISTENCE_FAILED':
                default:
                    res.status(500).json({
                        error: 'RECONCILIATION_FAILED',
                        message: err.message,
                    });
                    return;
            }
        }

        console.error('[ReconciliationRunRouter] Unexpected error:', err);
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateMerchantParam(merchantId: string): void {
        if (!UUID_REGEX.test(merchantId)) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'Invalid merchantId parameter: must be a valid UUID',
                ['merchantId'],
            );
        }
    }

    function validateRunIdParam(runId: string): void {
        if (!UUID_REGEX.test(runId)) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'Invalid runId parameter: must be a valid UUID',
                ['runId'],
            );
        }
    }

    /**
     * POST /api/merchants/:merchantId/runs
     * Initiates a deterministic reconciliation run or returns existing run if idempotent retry.
     * Permission: OWNER, ADMIN, ANALYST (VIEWER receives 403 Forbidden).
     */
    router.post(
        '/',
        requireRole(['OWNER', 'ADMIN', 'ANALYST']),
        async (req: Request, res: Response): Promise<void> => {
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

                // Reject any attempt by client to supply lifecycle or internal fields
                if (req.body && typeof req.body === 'object') {
                    for (const forbiddenField of FORBIDDEN_LIFECYCLE_FIELDS) {
                        if (forbiddenField in req.body) {
                            res.status(400).json({
                                error: 'VALIDATION_FAILED',
                                message: `Client-supplied lifecycle field "${forbiddenField}" is not permitted`,
                            });
                            return;
                        }
                    }
                }

                const parsedBody = InitiateRunBodySchema.parse(req.body ?? {});

                // Resolve idempotency key: header takes precedence, or body idempotencyKey
                const headerKey = req.headers['idempotency-key'];
                const rawHeaderKey = typeof headerKey === 'string' ? headerKey.trim() : undefined;
                const rawBodyKey = parsedBody.idempotencyKey;

                if (rawHeaderKey && rawBodyKey && rawHeaderKey !== rawBodyKey) {
                    res.status(400).json({
                        error: 'IDEMPOTENCY_KEY_MISMATCH',
                        message: 'Idempotency key provided in Idempotency-Key header does not match idempotencyKey in request body',
                    });
                    return;
                }

                const resolvedIdempotencyKey = rawHeaderKey || rawBodyKey;
                if (!resolvedIdempotencyKey || resolvedIdempotencyKey.length === 0) {
                    res.status(400).json({
                        error: 'IDEMPOTENCY_KEY_REQUIRED',
                        message: 'An idempotency key is required via Idempotency-Key header or idempotencyKey in body',
                    });
                    return;
                }

                if (resolvedIdempotencyKey.length > 128) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Idempotency key cannot exceed 128 characters',
                    });
                    return;
                }

                // Merge options with top-level parameters
                const options = parsedBody.options ?? {};
                const fromStr = options.from ?? parsedBody.from;
                const toStr = options.to ?? parsedBody.to;
                const explicitConnectionId = options.providerConnectionId ?? parsedBody.providerConnectionId;
                const rulesetVersion = options.rulesetVersion ?? parsedBody.rulesetVersion ?? 'v1';
                const batchSize = options.batchSize ?? parsedBody.batchSize;
                const timeWindowToleranceMs = options.timeWindowToleranceMs ?? parsedBody.timeWindowToleranceMs;

                // Validate bounded date window
                if (fromStr && toStr) {
                    const fromDate = new Date(fromStr);
                    const toDate = new Date(toStr);
                    if (toDate <= fromDate) {
                        throw new ReconciliationError(
                            'RECON_INVALID_INPUT',
                            '"to" must be strictly greater than "from"',
                            ['from', 'to'],
                        );
                    }
                    if (toDate.getTime() - fromDate.getTime() > MAX_WINDOW_MS) {
                        throw new ReconciliationError(
                            'RECON_INVALID_INPUT',
                            'Reconciliation date window cannot exceed 90 days',
                            ['from', 'to'],
                        );
                    }
                } else if (fromStr) {
                    const fromDate = new Date(fromStr);
                    const now = new Date();
                    if (now.getTime() - fromDate.getTime() > MAX_WINDOW_MS) {
                        throw new ReconciliationError(
                            'RECON_INVALID_INPUT',
                            'Reconciliation date window cannot exceed 90 days',
                            ['from'],
                        );
                    }
                }

                // Resolve provider connection: use explicit connection ID or auto-resolve active connection
                const prisma = dbProvider();
                let resolvedConnectionId = explicitConnectionId;

                if (!resolvedConnectionId) {
                    const activeConnection = await prisma.providerConnection.findFirst({
                        where: {
                            merchantId: trustedMerchantId,
                            status: 'ACTIVE',
                        },
                    });

                    if (!activeConnection) {
                        res.status(404).json({
                            error: 'NO_ACTIVE_CONNECTION',
                            message: 'No active provider connection found for this merchant. Please configure or specify a provider connection.',
                        });
                        return;
                    }

                    resolvedConnectionId = activeConnection.id;
                } else {
                    // Verify explicit connection belongs to this merchant
                    const connection = await prisma.providerConnection.findUnique({
                        where: { id: resolvedConnectionId },
                    });

                    if (!connection || connection.merchantId !== trustedMerchantId) {
                        res.status(404).json({
                            error: 'CONNECTION_NOT_FOUND',
                            message: `ProviderConnection ${resolvedConnectionId} not found or does not belong to merchant`,
                        });
                        return;
                    }
                }

                // Delegate execution to the canonical deterministic reconciliation engine
                const summary = await service.run({
                    merchantId: trustedMerchantId,
                    providerConnectionId: resolvedConnectionId,
                    from: fromStr,
                    to: toStr,
                    idempotencyKey: resolvedIdempotencyKey,
                    rulesetVersion,
                    batchSize,
                    timeWindowToleranceMs,
                });

                const isReused = Boolean(summary.isReusedRun);
                const statusCode = isReused ? 200 : 201;

                res.status(statusCode).json({
                    outcome: isReused ? 'reused' : 'created',
                    run: {
                        id: summary.runId,
                        merchantId: summary.merchantId,
                        status: summary.status,
                        windowStart: summary.windowStart.toISOString(),
                        windowEnd: summary.windowEnd.toISOString(),
                        rulesetVersion: summary.rulesetVersion,
                        totalConsidered: summary.totalConsidered,
                        matchedCount: summary.matchedCount,
                        unmatchedCount: summary.unmatchedCount,
                        ambiguousCount: summary.ambiguousCount,
                        excludedCount: summary.excludedCount,
                        durationMs: summary.durationMs,
                        createdAt: summary.createdAt ? summary.createdAt.toISOString() : undefined,
                        completedAt: summary.completedAt ? summary.completedAt.toISOString() : undefined,
                    },
                });
            } catch (err) {
                handleRouteError(res, err);
            }
        },
    );

    /**
     * GET /api/merchants/:merchantId/runs
     * List reconciliation runs with bounded pagination and allowlisted filters.
     * Permission: Any authenticated member of the merchant (OWNER, ADMIN, ANALYST, VIEWER).
     */
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateMerchantParam(merchantId);

            const trustedMerchantId = req.auth!.merchant.id;
            if (merchantId !== trustedMerchantId) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Merchant not found or access denied',
                });
                return;
            }

            const filter = ListRunsQuerySchema.parse(req.query);

            if (filter.from && filter.to && filter.to < filter.from) {
                res.status(400).json({
                    error: 'VALIDATION_FAILED',
                    message: 'Invalid date range: "from" timestamp must be earlier than or equal to "to" timestamp',
                });
                return;
            }

            const result = await service.listRuns(trustedMerchantId, filter);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    /**
     * GET /api/merchants/:merchantId/runs/:runId
     * Get run summary, status, counters, timestamps, and sanitized failure reason.
     * Permission: Any authenticated member of the merchant (OWNER, ADMIN, ANALYST, VIEWER).
     */
    router.get('/:runId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, runId } = req.params;
            validateMerchantParam(merchantId);
            validateRunIdParam(runId);

            const trustedMerchantId = req.auth!.merchant.id;
            if (merchantId !== trustedMerchantId) {
                res.status(404).json({
                    error: 'NOT_FOUND',
                    message: 'Merchant not found or access denied',
                });
                return;
            }

            const detail = await service.getRun(trustedMerchantId, runId);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    return router;
}
