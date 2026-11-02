import { ExceptionManagementError } from './errors';
import { validateAndPlanTransition } from './state-machine';
import { invalidateMerchantScope } from '../cache';
import type {
    DismissExceptionInput,
    ExceptionAction,
    ExceptionDetail,
    ExceptionSummary,
    InvestigateExceptionInput,
    ListExceptionsFilter,
    ListExceptionsResult,
    OperatorContext,
    ReopenExceptionInput,
    ResolveExceptionInput,
} from './types';
import type { ExceptionRepository } from '../../repositories/exception.repository';

export interface ExceptionLifecycleService {
    listExceptions(
        merchantId: string,
        filter: ListExceptionsFilter,
        context: OperatorContext,
    ): Promise<ListExceptionsResult>;
    getException(merchantId: string, exceptionId: string, context: OperatorContext): Promise<ExceptionDetail>;
    resolve(
        merchantId: string,
        exceptionId: string,
        input: ResolveExceptionInput,
        context: OperatorContext,
    ): Promise<{ exception: ExceptionSummary; auditEvent: unknown }>;
    reopen(
        merchantId: string,
        exceptionId: string,
        input: ReopenExceptionInput,
        context: OperatorContext,
    ): Promise<{ exception: ExceptionSummary; auditEvent: unknown }>;
    dismiss(
        merchantId: string,
        exceptionId: string,
        input: DismissExceptionInput,
        context: OperatorContext,
    ): Promise<{ exception: ExceptionSummary; auditEvent: unknown }>;
    investigate(
        merchantId: string,
        exceptionId: string,
        input: InvestigateExceptionInput,
        context: OperatorContext,
    ): Promise<{ exception: ExceptionSummary; auditEvent: unknown }>;
}

export interface ServiceLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: ServiceLogger = {
    info(msg, meta) {
        console.log(`[ExceptionLifecycle] INFO: ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    warn(msg, meta) {
        console.warn(`[ExceptionLifecycle] WARN: ${msg}`, meta ? JSON.stringify(meta) : '');
    },
    error(msg, meta) {
        console.error(`[ExceptionLifecycle] ERROR: ${msg}`, meta ? JSON.stringify(meta) : '');
    },
};

export function createExceptionLifecycleService(
    repository: ExceptionRepository,
    logger: ServiceLogger = defaultLogger,
): ExceptionLifecycleService {
    function assertMerchantAccess(context: OperatorContext, merchantId: string): void {
        if (!context || !context.actorId) {
            throw ExceptionManagementError.unauthorized('Actor identity is missing or unauthenticated');
        }

        const allowed = context.authorizedMerchantIds;
        if (!allowed || (!allowed.includes('*') && !allowed.includes(merchantId))) {
            // Consistent 404 policy to prevent cross-tenant existence leaks
            throw ExceptionManagementError.notFound('Merchant not found or access denied');
        }
    }

    const ALLOWED_MUTATION_ROLES = new Set(['OWNER', 'ADMIN', 'ANALYST', 'OPERATOR']);

    function assertMutationPermission(context: OperatorContext): void {
        const roles = context.roles ?? ['OPERATOR'];
        if (roles.length === 0) {
            throw ExceptionManagementError.forbidden('User has no authorized role to modify exception state');
        }
        const hasPermittedRole = roles.some((r) => ALLOWED_MUTATION_ROLES.has(r));
        if (!hasPermittedRole || (roles.length === 1 && roles[0] === 'VIEWER')) {
            throw ExceptionManagementError.forbidden('Read-only viewers cannot modify exception state');
        }
    }

    async function executeLifecycleAction(
        action: ExceptionAction,
        merchantId: string,
        exceptionId: string,
        expectedVersion: number,
        note: string | undefined,
        context: OperatorContext,
    ) {
        assertMerchantAccess(context, merchantId);
        assertMutationPermission(context);

        if (typeof expectedVersion !== 'number' || isNaN(expectedVersion) || expectedVersion < 1) {
            throw ExceptionManagementError.validationFailed('A valid positive integer expectedVersion is required');
        }

        const startTime = Date.now();

        // 1. Fetch current record to evaluate legal transition
        const current = await repository.findById(merchantId, exceptionId);
        if (!current) {
            throw ExceptionManagementError.notFound(`Exception ${exceptionId} not found for this merchant`);
        }

        // 2. Validate legal transition through state machine
        const plan = validateAndPlanTransition(current.status, action, note);

        // 3. Atomically update exception and append audit event with OCC check
        const result = await repository.applyAtomicTransition({
            merchantId,
            exceptionId,
            fromStatus: plan.fromStatus,
            toStatus: plan.toStatus,
            expectedVersion,
            resolutionNote: plan.resolutionNote,
            resolvedAt: plan.resolvedAt,
            auditEvent: {
                actorId: context.actorId,
                actorType: context.actorType ?? 'OPERATOR',
                action: plan.action,
                reason: plan.reason,
                metadata: {
                    correlationId: context.correlationId ?? null,
                },
            },
        });

        // Safe privacy-conscious logging: metadata only, never raw secrets or customer credentials
        logger.info('Exception transition completed', {
            action,
            actorId: context.actorId,
            merchantId,
            exceptionId,
            fromStatus: plan.fromStatus,
            toStatus: plan.toStatus,
            durationMs: Date.now() - startTime,
        });

        // Invalidate affected merchant cache scopes upon successful state mutation
        invalidateMerchantScope(merchantId, ['dashboard', 'trends', 'exceptions']).catch((err) => {
            logger.warn('Failed to invalidate cache after exception transition', { error: String(err) });
        });

        return result;
    }

    return {
        async listExceptions(merchantId, filter, context) {
            assertMerchantAccess(context, merchantId);
            return await repository.list(merchantId, filter);
        },

        async getException(merchantId, exceptionId, context) {
            assertMerchantAccess(context, merchantId);
            const detail = await repository.findById(merchantId, exceptionId);
            if (!detail) {
                throw ExceptionManagementError.notFound(`Exception ${exceptionId} not found`);
            }
            return detail;
        },

        async resolve(merchantId, exceptionId, input, context) {
            return await executeLifecycleAction(
                'RESOLVE',
                merchantId,
                exceptionId,
                input.expectedVersion,
                input.resolutionNote,
                context,
            );
        },

        async reopen(merchantId, exceptionId, input, context) {
            return await executeLifecycleAction(
                'REOPEN',
                merchantId,
                exceptionId,
                input.expectedVersion,
                input.reopenReason,
                context,
            );
        },

        async dismiss(merchantId, exceptionId, input, context) {
            return await executeLifecycleAction(
                'DISMISS',
                merchantId,
                exceptionId,
                input.expectedVersion,
                input.dismissReason,
                context,
            );
        },

        async investigate(merchantId, exceptionId, input, context) {
            return await executeLifecycleAction(
                'INVESTIGATE',
                merchantId,
                exceptionId,
                input.expectedVersion,
                input.note,
                context,
            );
        },
    };
}
