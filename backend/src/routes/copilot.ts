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
import { EvidenceResolver } from '../services/copilot/evidence-resolver';
import {
    getCopilotSessionRepository,
    type CopilotSessionRepository,
} from '../services/copilot/session-repository';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CopilotRouterDeps {
    service?: CopilotService;
    sessionRepo?: CopilotSessionRepository;
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

const CreateSessionSchema = z.object({
    title: z.string().trim().max(100).optional(),
});

const UpdateSessionSchema = z.object({
    title: z.string().trim().min(1).max(100).optional(),
    archivedAt: z.string().nullable().optional(),
});

const PaginationQuerySchema = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function createCopilotRouter(deps: CopilotRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });

    const getService = () =>
        deps.service ??
        new CopilotService({
            db: (deps.serviceDeps?.db ?? getDB()) as any,
        });

    const getSessionRepo = () => {
        if (deps.sessionRepo) return deps.sessionRepo;
        let db: any = deps.serviceDeps?.db;
        if (!db) {
            try {
                db = getDB();
            } catch {
                // DB not yet connected or mock unit test
            }
        }
        return getCopilotSessionRepository(db);
    };

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

    function validateSessionParam(sessionId: string): void {
        if (!UUID_REGEX.test(sessionId)) {
            const err = new Error('Invalid sessionId: must be a valid UUID');
            (err as any).statusCode = 400;
            throw err;
        }
    }

    function getActorId(req: Request): string {
        return req.auth?.user?.id || (req as any).authenticatedUser?.id || 'operator-user';
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

    // 1b. GET /api/merchants/:merchantId/copilot/storage-status
    router.get(
        '/storage-status',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (_req: Request, res: Response): Promise<void> => {
            try {
                const sessionRepo = getSessionRepo();
                res.status(200).json(sessionRepo.getStorageModeStatus());
            } catch (err: any) {
                console.error('[CopilotRouter:storage-status] Unexpected error:', sanitizeErrorMessage(err));
                res.status(500).json({
                    error: 'COPILOT_STORAGE_ERROR',
                    message: 'Failed to retrieve copilot storage status',
                });
            }
        },
    );

    // 2. GET /api/merchants/:merchantId/copilot/sessions
    router.get(
        '/sessions',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateMerchantParam(merchantId);

                const query = PaginationQuerySchema.parse(req.query);
                const sessionRepo = getSessionRepo();
                const userId = getActorId(req);

                const result = await sessionRepo.listSessions(merchantId, userId, query.limit, query.cursor);
                res.status(200).json({
                    ...result,
                    storageStatus: sessionRepo.getStorageModeStatus(),
                });
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid pagination parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:listSessions] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_SESSION_ERROR',
                    message: err.message || 'Failed to list copilot sessions',
                });
            }
        },
    );

    // 3. POST /api/merchants/:merchantId/copilot/sessions
    router.post(
        '/sessions',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId } = req.params;
                validateMerchantParam(merchantId);

                const body = CreateSessionSchema.parse(req.body || {});
                const sessionRepo = getSessionRepo();
                const userId = getActorId(req);

                const session = await sessionRepo.createSession({
                    merchantId,
                    userId,
                    title: body.title,
                });

                res.status(201).json(session);
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid session creation parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:createSession] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_SESSION_ERROR',
                    message: err.message || 'Failed to create copilot session',
                });
            }
        },
    );

    // 4. GET /api/merchants/:merchantId/copilot/sessions/:sessionId/messages
    router.get(
        '/sessions/:sessionId/messages',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, sessionId } = req.params;
                validateMerchantParam(merchantId);
                validateSessionParam(sessionId);

                const query = PaginationQuerySchema.parse(req.query);
                const sessionRepo = getSessionRepo();

                const session = await sessionRepo.getSession(merchantId, sessionId);
                if (!session) {
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Session ${sessionId} not found for this merchant`,
                    });
                    return;
                }

                const result = await sessionRepo.listMessages(merchantId, sessionId, query.limit, query.cursor);
                res.status(200).json(result);
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid pagination parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:listMessages] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_SESSION_ERROR',
                    message: err.message || 'Failed to list session messages',
                });
            }
        },
    );

    // 5. POST /api/merchants/:merchantId/copilot/sessions/:sessionId/messages
    router.post(
        '/sessions/:sessionId/messages',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, sessionId } = req.params;
                validateMerchantParam(merchantId);
                validateSessionParam(sessionId);

                const body = AskBodySchema.parse(req.body);
                const sessionRepo = getSessionRepo();
                const service = getService();

                const session = await sessionRepo.getSession(merchantId, sessionId);
                if (!session) {
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Session ${sessionId} not found for this merchant`,
                    });
                    return;
                }

                // Retrieve explicit bounded recent context window (max 6 messages = 3 user/assistant turns)
                const recentTurns = await sessionRepo.getRecentTurnWindow(merchantId, sessionId, 6);

                // Add user message to session
                const userMessage = await sessionRepo.addMessage({
                    merchantId,
                    sessionId,
                    role: 'user',
                    content: body.question,
                    requestId: req.headers['x-correlation-id'] as string,
                });

                // Generate fresh database-grounded response
                const result = await service.answerQuestion(merchantId, {
                    question: body.question,
                    context: body.context,
                    recentTurns,
                });

                // Add assistant response message to session
                const assistantMessage = await sessionRepo.addMessage({
                    merchantId,
                    sessionId,
                    role: 'assistant',
                    content: result.answer,
                    answerPayload: result,
                    requestId: req.headers['x-correlation-id'] as string,
                });

                res.status(200).json({
                    userMessage,
                    assistantMessage,
                    result,
                });
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid message request body',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:addMessage] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_SESSION_ERROR',
                    message: err.message || 'Failed to post message to session',
                });
            }
        },
    );

    // 6. PATCH /api/merchants/:merchantId/copilot/sessions/:sessionId
    router.patch(
        '/sessions/:sessionId',
        requireRole(['OWNER', 'ADMIN', 'ANALYST']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, sessionId } = req.params;
                validateMerchantParam(merchantId);
                validateSessionParam(sessionId);

                const body = UpdateSessionSchema.parse(req.body);
                const sessionRepo = getSessionRepo();

                const updated = await sessionRepo.updateSession(merchantId, sessionId, body);
                if (!updated) {
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Session ${sessionId} not found for this merchant`,
                    });
                    return;
                }

                res.status(200).json(updated);
            } catch (err: any) {
                if (err instanceof z.ZodError) {
                    res.status(400).json({
                        error: 'VALIDATION_FAILED',
                        message: 'Invalid session update parameters',
                        details: err.flatten(),
                    });
                    return;
                }
                console.error('[CopilotRouter:updateSession] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_SESSION_ERROR',
                    message: err.message || 'Failed to update copilot session',
                });
            }
        },
    );

    // 7. POST /api/merchants/:merchantId/copilot/ask (Legacy stateless endpoint maintained for backward compatibility)
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

    // 8. GET /api/merchants/:merchantId/copilot/evidence/:refType/:refId
    // Authorized, tenant-scoped evidence resolver with automatic secret redaction
    router.get(
        '/evidence/:refType/:refId',
        requireRole(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER']),
        async (req: Request, res: Response): Promise<void> => {
            try {
                const { merchantId, refType, refId } = req.params;
                validateMerchantParam(merchantId);

                let db: any = deps.serviceDeps?.db;
                if (!db) {
                    try {
                        db = getDB();
                    } catch {
                        // DB unavailable
                    }
                }

                if (!db) {
                    res.status(503).json({
                        error: 'DATABASE_UNAVAILABLE',
                        message: 'Database service unavailable to resolve evidence reference',
                    });
                    return;
                }

                const resolver = new EvidenceResolver(db);
                const item = await resolver.resolveReference(merchantId, refType, refId);

                if (!item.available) {
                    res.status(404).json({
                        error: 'NOT_FOUND',
                        message: item.reason || 'Evidence reference not found or access denied for this merchant',
                        item,
                    });
                    return;
                }

                res.status(200).json(item);
            } catch (err: any) {
                console.error('[CopilotRouter:resolveEvidence] Unexpected error:', sanitizeErrorMessage(err));
                res.status(err.statusCode || 500).json({
                    error: 'COPILOT_EVIDENCE_ERROR',
                    message: err.message || 'Failed to resolve evidence reference',
                });
            }
        },
    );

    return router;
}
