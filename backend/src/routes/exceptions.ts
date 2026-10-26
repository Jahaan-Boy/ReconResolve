import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getDB } from '../db/postgres';
import { createExceptionRepository } from '../repositories/exception.repository';
import { ExceptionManagementError } from '../services/exception-management/errors';
import {
    createExceptionLifecycleService,
    type ExceptionLifecycleService,
} from '../services/exception-management/exception-lifecycle.service';
import type { OperatorContext } from '../services/exception-management/types';

export interface ExceptionRouterDeps {
    service?: ExceptionLifecycleService;
    resolveOperatorContext?: (req: Request) => OperatorContext;
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
    const rawActorId = req.headers['x-operator-id'];
    const actorId = rawActorId !== undefined ? String(rawActorId).trim() : 'system-operator';
    const role = (req.headers['x-operator-role'] as string) || 'OPERATOR';
    const authMerchantsHeader = req.headers['x-authorized-merchants'] as string;
    const authorizedMerchantIds = authMerchantsHeader
        ? authMerchantsHeader.split(',').map((s) => s.trim())
        : ['*'];
    const correlationId = (req.headers['x-correlation-id'] as string) || undefined;

    return {
        actorId,
        actorType: 'OPERATOR',
        roles: [role],
        authorizedMerchantIds,
        correlationId,
    };
}

export function createExceptionRouter(deps: ExceptionRouterDeps = {}): Router {
    const router = Router({ mergeParams: true });
    const service = deps.service ?? createExceptionLifecycleService(createExceptionRepository(getDB));
    const resolveContext = deps.resolveOperatorContext ?? defaultResolveOperatorContext;

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

        console.error('[ExceptionRouter] Unexpected error:', err);
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

    // 3. Resolve Exception
    router.post('/:exceptionId/resolve', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = ResolveBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.resolve(merchantId, exceptionId, body, context);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 4. Reopen Exception
    router.post('/:exceptionId/reopen', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = ReopenBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.reopen(merchantId, exceptionId, body, context);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 5. Dismiss Exception
    router.post('/:exceptionId/dismiss', async (req: Request, res: Response): Promise<void> => {
        try {
            const { merchantId, exceptionId } = req.params;
            validateMerchantParam(merchantId);
            validateExceptionParam(exceptionId);

            const body = DismissBodySchema.parse(req.body);
            const context = resolveContext(req);

            const result = await service.dismiss(merchantId, exceptionId, body, context);
            res.status(200).json(result);
        } catch (err) {
            handleRouteError(res, err);
        }
    });

    // 6. Investigate Exception
    router.post('/:exceptionId/investigate', async (req: Request, res: Response): Promise<void> => {
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

    return router;
}
