import { getDB } from '../db/postgres';
import { ExceptionManagementError } from '../services/exception-management/errors';
import type {
    ExceptionAuditEventSummary,
    ExceptionDetail,
    ExceptionStatus,
    ExceptionSummary,
    ListExceptionsFilter,
    ListExceptionsResult,
} from '../services/exception-management/types';

export interface AtomicTransitionParams {
    merchantId: string;
    exceptionId: string;
    fromStatus: ExceptionStatus;
    toStatus: ExceptionStatus;
    expectedVersion: number;
    resolutionNote: string | null;
    resolvedAt: Date | null;
    auditEvent: {
        actorId: string;
        actorType: string;
        action: string;
        reason: string | null;
        metadata?: unknown;
    };
}

export interface ExceptionRepository {
    list(merchantId: string, filter: ListExceptionsFilter): Promise<ListExceptionsResult>;
    findById(merchantId: string, exceptionId: string): Promise<ExceptionDetail | null>;
    applyAtomicTransition(params: AtomicTransitionParams): Promise<{
        exception: ExceptionSummary;
        auditEvent: ExceptionAuditEventSummary;
    }>;
}

export function createExceptionRepository(dbProvider = getDB): ExceptionRepository {
    return {
        async list(merchantId: string, filter: ListExceptionsFilter): Promise<ListExceptionsResult> {
            const db = dbProvider();
            const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);

            const whereClause: any = {
                merchantId,
            };

            if (filter.status) {
                whereClause.status = filter.status;
            }
            if (filter.type) {
                whereClause.type = filter.type;
            }
            if (filter.reconciliationRunId) {
                whereClause.reconciliationRunId = filter.reconciliationRunId;
            }
            if (filter.providerTransactionId) {
                whereClause.providerTransactionId = filter.providerTransactionId;
            }
            if (filter.merchantOrderId) {
                whereClause.merchantOrderId = filter.merchantOrderId;
            }
            if (filter.createdFrom || filter.createdTo) {
                whereClause.createdAt = {};
                if (filter.createdFrom) {
                    whereClause.createdAt.gte = filter.createdFrom;
                }
                if (filter.createdTo) {
                    whereClause.createdAt.lte = filter.createdTo;
                }
            }

            const queryArgs: any = {
                where: whereClause,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: limit + 1,
            };

            if (filter.cursor) {
                queryArgs.cursor = { id: filter.cursor };
                queryArgs.skip = 1;
            }

            const rows: any[] = await (db.reconciliationException as any).findMany(queryArgs);

            const hasMore = rows.length > limit;
            const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;
            const nextCursor = hasMore && itemsToReturn.length > 0 ? itemsToReturn[itemsToReturn.length - 1].id : null;

            const items: ExceptionSummary[] = itemsToReturn.map((r) => ({
                id: r.id,
                merchantId: r.merchantId,
                reconciliationRunId: r.reconciliationRunId,
                type: r.type,
                status: r.status,
                providerTransactionId: r.providerTransactionId,
                merchantOrderId: r.merchantOrderId,
                details: r.details,
                resolutionNote: r.resolutionNote,
                resolvedAt: r.resolvedAt,
                version: r.version ?? 1,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));

            return {
                items,
                pagination: {
                    limit,
                    nextCursor,
                    hasMore,
                },
            };
        },

        async findById(merchantId: string, exceptionId: string): Promise<ExceptionDetail | null> {
            const db = dbProvider();

            const row: any = await (db.reconciliationException as any).findFirst({
                where: {
                    id: exceptionId,
                    merchantId,
                },
                include: {
                    providerTransaction: {
                        select: {
                            id: true,
                            providerTxnId: true,
                            amountMinor: true,
                            currency: true,
                            status: true,
                            occurredAt: true,
                        },
                    },
                    merchantOrder: {
                        select: {
                            id: true,
                            externalOrderId: true,
                            amountMinor: true,
                            currency: true,
                            status: true,
                            orderedAt: true,
                        },
                    },
                    reconciliationRun: {
                        select: {
                            id: true,
                            rulesetVersion: true,
                            windowStart: true,
                            windowEnd: true,
                            status: true,
                        },
                    },
                    auditEvents: {
                        orderBy: { createdAt: 'asc' },
                    },
                },
            });

            if (!row) {
                return null;
            }

            return {
                id: row.id,
                merchantId: row.merchantId,
                reconciliationRunId: row.reconciliationRunId,
                type: row.type,
                status: row.status,
                providerTransactionId: row.providerTransactionId,
                merchantOrderId: row.merchantOrderId,
                details: row.details,
                resolutionNote: row.resolutionNote,
                resolvedAt: row.resolvedAt,
                version: row.version ?? 1,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                linkedProviderTransaction: row.providerTransaction
                    ? {
                          id: row.providerTransaction.id,
                          providerTxnId: row.providerTransaction.providerTxnId,
                          amountMinor: row.providerTransaction.amountMinor.toString(),
                          currency: row.providerTransaction.currency,
                          status: row.providerTransaction.status,
                          occurredAt: row.providerTransaction.occurredAt,
                      }
                    : null,
                linkedMerchantOrder: row.merchantOrder
                    ? {
                          id: row.merchantOrder.id,
                          externalOrderId: row.merchantOrder.externalOrderId,
                          amountMinor: row.merchantOrder.amountMinor.toString(),
                          currency: row.merchantOrder.currency,
                          status: row.merchantOrder.status,
                          orderedAt: row.merchantOrder.orderedAt,
                      }
                    : null,
                reconciliationRun: row.reconciliationRun
                    ? {
                          id: row.reconciliationRun.id,
                          rulesetVersion: row.reconciliationRun.rulesetVersion,
                          windowStart: row.reconciliationRun.windowStart,
                          windowEnd: row.reconciliationRun.windowEnd,
                          status: row.reconciliationRun.status,
                      }
                    : null,
                auditEvents: (row.auditEvents ?? []).map((e: any) => ({
                    id: e.id,
                    merchantId: e.merchantId,
                    exceptionId: e.exceptionId,
                    actorId: e.actorId,
                    actorType: e.actorType,
                    action: e.action,
                    fromStatus: e.fromStatus,
                    toStatus: e.toStatus,
                    reason: e.reason,
                    metadata: e.metadata,
                    createdAt: e.createdAt,
                })),
            };
        },

        async applyAtomicTransition(params: AtomicTransitionParams): Promise<{
            exception: ExceptionSummary;
            auditEvent: ExceptionAuditEventSummary;
        }> {
            const db = dbProvider();

            return await db.$transaction(async (tx: any) => {
                // 1. Conditional optimistic update against expected version and expected status
                const updateResult = await tx.reconciliationException.updateMany({
                    where: {
                        id: params.exceptionId,
                        merchantId: params.merchantId,
                        status: params.fromStatus,
                        version: params.expectedVersion,
                    },
                    data: {
                        status: params.toStatus,
                        version: { increment: 1 },
                        resolutionNote: params.resolutionNote,
                        resolvedAt: params.resolvedAt,
                    },
                });

                if (updateResult.count === 0) {
                    // Check why it failed
                    const current = await tx.reconciliationException.findFirst({
                        where: {
                            id: params.exceptionId,
                            merchantId: params.merchantId,
                        },
                        select: {
                            id: true,
                            status: true,
                            version: true,
                        },
                    });

                    if (!current) {
                        throw ExceptionManagementError.notFound('Exception not found');
                    }

                    if (current.version !== params.expectedVersion) {
                        throw ExceptionManagementError.concurrencyConflict(
                            `Exception has been updated by another operator (expected version ${params.expectedVersion}, found ${current.version})`,
                        );
                    }

                    if (current.status !== params.fromStatus) {
                        throw ExceptionManagementError.invalidTransition(
                            current.status,
                            params.toStatus,
                            params.auditEvent.action,
                            `Exception is currently in status ${current.status}, expected ${params.fromStatus}`,
                        );
                    }

                    throw ExceptionManagementError.concurrencyConflict(
                        'Concurrent update detected on exception record',
                    );
                }

                // 2. Append immutable audit event in the SAME transaction
                const auditRecord = await tx.exceptionAuditEvent.create({
                    data: {
                        merchantId: params.merchantId,
                        exceptionId: params.exceptionId,
                        actorId: params.auditEvent.actorId,
                        actorType: params.auditEvent.actorType,
                        action: params.auditEvent.action,
                        fromStatus: params.fromStatus,
                        toStatus: params.toStatus,
                        reason: params.auditEvent.reason,
                        metadata: params.auditEvent.metadata ?? null,
                    },
                });

                // 3. Fetch latest record state
                const updatedRow = await tx.reconciliationException.findUnique({
                    where: { id: params.exceptionId },
                });

                const exceptionSummary: ExceptionSummary = {
                    id: updatedRow.id,
                    merchantId: updatedRow.merchantId,
                    reconciliationRunId: updatedRow.reconciliationRunId,
                    type: updatedRow.type,
                    status: updatedRow.status,
                    providerTransactionId: updatedRow.providerTransactionId,
                    merchantOrderId: updatedRow.merchantOrderId,
                    details: updatedRow.details,
                    resolutionNote: updatedRow.resolutionNote,
                    resolvedAt: updatedRow.resolvedAt,
                    version: updatedRow.version,
                    createdAt: updatedRow.createdAt,
                    updatedAt: updatedRow.updatedAt,
                };

                const auditSummary: ExceptionAuditEventSummary = {
                    id: auditRecord.id,
                    merchantId: auditRecord.merchantId,
                    exceptionId: auditRecord.exceptionId,
                    actorId: auditRecord.actorId,
                    actorType: auditRecord.actorType,
                    action: auditRecord.action,
                    fromStatus: auditRecord.fromStatus,
                    toStatus: auditRecord.toStatus,
                    reason: auditRecord.reason,
                    metadata: auditRecord.metadata,
                    createdAt: auditRecord.createdAt,
                };

                return {
                    exception: exceptionSummary,
                    auditEvent: auditSummary,
                };
            });
        },
    };
}
