import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import { createExceptionRepository } from '../repositories/exception.repository';
import { ExceptionManagementError } from '../services/exception-management/errors';
import {
    createExceptionLifecycleService,
    type ExceptionLifecycleService,
} from '../services/exception-management/exception-lifecycle.service';
import type { OperatorContext } from '../services/exception-management/types';
import {
    authenticate,
    resolveMerchantContext,
    requireRole,
    type AuthMiddlewareDeps,
} from '../auth/middleware';
import {
    createInvestigationRouter,
    type InvestigationRouterDeps,
} from './investigations';
import { sanitizeErrorMessage } from '../services/outbox/error-sanitizer';
import { invalidateMerchantIntelligenceCache } from '../services/cache/intelligence-cache';

export interface ExceptionRouterDeps {
    service?: ExceptionLifecycleService;
    resolveOperatorContext?: (req: Request) => OperatorContext;
    authGuard?: RequestHandler;
    merchantGuard?: RequestHandler;
    authDeps?: AuthMiddlewareDeps;
    investigationRouterDeps?: InvestigationRouterDeps;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ListQuerySchema = z.object({
    status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']).optional(),
    type: z
        .enum([
            'MISSING_PROVIDER_COUNTERPART',
            'MISSING_MERCHANT_COUNTERPART',
            'AMOUNT_MISMATCH',
            'STATUS_DISCREPANCY',
            'AMBIGUOUS_MATCH',
        ])
        .optional(),
    reconciliationRunId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
    providerTransactionId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
    merchantOrderId: z.string().regex(UUID_REGEX, 'Invalid UUID').optional(),
    createdFrom: z
        .string()
        .datetime()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    createdTo: z
        .string()
        .datetime()
        .optional()
        .transform((val) => (val ? new Date(val) : undefined)),
    search: z.string().trim().min(1).max(200).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const ResolveBodySchema = z.object({
    resolutionNote: z
        .string({ required_error: 'resolutionNote is required' })
        .min(10, 'resolutionNote must be at least 10 characters')
        .max(1000, 'resolutionNote cannot exceed 1000 characters'),
    expectedVersion: z.number({ required_error: 'expectedVersion is required' }).int().min(1),
});

const ReopenBodySchema = z.object({
    reopenReason: z
        .string({ required_error: 'reopenReason is required' })
        .min(10, 'reopenReason must be at least 10 characters')
        .max(1000, 'reopenReason cannot exceed 1000 characters'),
    expectedVersion: z.number({ required_error: 'expectedVersion is required' }).int().min(1),
});

const DismissBodySchema = z.object({
    dismissReason: z
        .string({ required_error: 'dismissReason is required' })
        .min(10, 'dismissReason must be at least 10 characters')
        .max(1000, 'dismissReason cannot exceed 1000 characters'),
    expectedVersion: z.number({ required_error: 'expectedVersion is required' }).int().min(1),
});

const InvestigateBodySchema = z.object({
    note: z.string().max(1000, 'note cannot exceed 1000 characters').optional(),
    expectedVersion: z.number({ required_error: 'expectedVersion is required' }).int().min(1),
});

function defaultResolveOperatorContext(req: Request): OperatorContext {
    if (req.auth) {
        return {
            actorId: req.auth.user.id,
            actorType: 'OPERATOR',
            roles: [req.auth.membership.role],
            authorizedMerchantIds: [req.auth.merchant.id],
            correlationId: (req.headers['x-correlation-id'] as string) || undefined,
        };
    }

    const actorId = req.authenticatedUser?.id || 'system-operator';
    return {
        actorId,
        actorType: 'OPERATOR',
        roles: ['OPERATOR'],
        authorizedMerchantIds: req.params.merchantId ? [req.params.merchantId] : [],
        correlationId: (req.headers['x-correlation-id'] as string) || undefined,
    };
}

export function createExceptionRouter(deps: ExceptionRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createExceptionLifecycleService(createExceptionRepository(getDB));
    const resolveContext = deps.resolveOperatorContext ?? defaultResolveOperatorContext;

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

        if (err instanceof ExceptionManagementError) {
            res.status(err.statusCode).json({
                error: err.code,
                message: err.message,
                details: err.details,
            });
            return;
        }

        console.error('[ExceptionRouter] Unexpected error:', sanitizeErrorMessage(err));
        res.status(500).json({
            error: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal error occurred',
        });
    }

    function validateMerchantParam(merchantId: string): void {
        if (!UUID_REGEX.test(merchantId)) {
            throw ExceptionManagementError.validationFailed('Invalid merchantId parameter: must be a valid UUID');
        }
    }

    function validateExceptionParam(exceptionId: string): void {
        if (!UUID_REGEX.test(exceptionId)) {
            throw ExceptionManagementError.validationFailed('Invalid exceptionId parameter: must be a valid UUID');
        }
    }

    // 1. List exceptions
    router.get('/', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId } = req.params;
            validateMerchantParam(merchantId);

            const filter = ListQuerySchema.parse(req.query);
            const context = resolveContext(req);

            const result = await service.listExceptions(merchantId, filter, context);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 2. Exception Detail
    router.get('/:exceptionId', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const context = resolveContext(req);
            const detail = await service.getException(merchantId, exceptionId, context);
            res.status(200).json(detail);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 2b. Exception Audit History
    router.get('/:exceptionId/audit', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const context = resolveContext(req);
            const detail = await service.getException(merchantId, exceptionId, context);
            res.status(200).json({
                exceptionId,
                auditEvents: detail.auditEvents,
            });
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 3. Resolve Exception
    router.post('/:exceptionId/resolve', requireRole(['OWNER', 'ADMIN', 'ANALYST']), async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = ResolveBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.resolve(merchantId, exceptionId, body, context);
            void invalidateMerchantIntelligenceCache(merchantId);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 4. Reopen Exception
    router.post('/:exceptionId/reopen', requireRole(['OWNER', 'ADMIN', 'ANALYST']), async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = ReopenBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.reopen(merchantId, exceptionId, body, context);
            void invalidateMerchantIntelligenceCache(merchantId);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 5. Dismiss Exception
    router.post('/:exceptionId/dismiss', requireRole(['OWNER', 'ADMIN', 'ANALYST']), async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = DismissBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.dismiss(merchantId, exceptionId, body, context);
            void invalidateMerchantIntelligenceCache(merchantId);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 6. Investigate Exception
    router.post('/:exceptionId/investigate', requireRole(['OWNER', 'ADMIN', 'ANALYST']), async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = InvestigateBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.investigate(merchantId, exceptionId, body, context);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 7. AI Investigator routes: /:exceptionId/investigations
    router.use(
        '/:exceptionId/investigations',
        createInvestigationRouter({
            ...deps.investigationRouterDeps,
            authGuard: deps.investigationRouterDeps?.authGuard ?? ((_req, _res, next) => next()),
            merchantGuard: deps.investigationRouterDeps?.merchantGuard ?? ((_req, _res, next) => next()),
        }),
    );

    return router;
}
