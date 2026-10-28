import type { Prisma, PrismaClient } from '../generated/prisma';
import { ReconciliationError } from '../services/reconciliation/errors';
import type {
    CandidateOrder,
    ListMatchesFilter,
    ListMatchesResult,
    ListRunsFilter,
    ListRunsResult,
    MatchBatchItem,
    ReconciliationMatchSummary,
    ReconciliationRepository,
    ReconciliationRunDetail,
    ReconciliationRunListItem,
    ReconciliationTransaction,
} from '../services/reconciliation/types';

export interface ReconciliationDb {
    reconciliationRun: Pick<
        PrismaClient['reconciliationRun'],
        'findUnique' | 'create' | 'update' | 'findMany' | 'count' | 'findFirst'
    >;
    providerTransaction: Pick<PrismaClient['providerTransaction'], 'findMany'>;
    merchantOrder: Pick<PrismaClient['merchantOrder'], 'findMany'>;
    reconciliationMatch: Pick<
        PrismaClient['reconciliationMatch'],
        'createMany' | 'findMany' | 'count'
    >;
    reconciliationException: Pick<PrismaClient['reconciliationException'], 'createMany'>;
    $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export function createReconciliationRepository(db: ReconciliationDb): ReconciliationRepository {
    return {
        async createOrGetRun(
            merchantId: string,
            windowStart: Date,
            windowEnd: Date,
            idempotencyKey: string,
            rulesetVersion: string,
        ) {
            // Check if run already exists for this idempotency key
            const existing = await (db.reconciliationRun as any).findUnique({
                where: {
                    merchantId_idempotencyKey: {
                        merchantId,
                        idempotencyKey,
                    },
                },
            });

            if (existing) {
                return {
                    run: {
                        id: existing.id,
                        merchantId: existing.merchantId,
                        status: existing.status,
                        windowStart: existing.windowStart,
                        windowEnd: existing.windowEnd,
                        rulesetVersion: existing.rulesetVersion,
                        totalConsidered: existing.totalConsidered,
                        matchedCount: existing.matchedCount,
                        unmatchedCount: existing.unmatchedCount,
                        ambiguousCount: existing.ambiguousCount,
                        excludedCount: existing.excludedCount,
                        startedAt: existing.startedAt,
                        completedAt: existing.completedAt,
                        failureReason: existing.failureReason,
                        createdAt: existing.createdAt,
                    },
                    isReused: true,
                };
            }

            // Create new run in RUNNING status
            const now = new Date();
            try {
                const created = await (db.reconciliationRun as any).create({
                    data: {
                        merchantId,
                        idempotencyKey,
                        rulesetVersion,
                        status: 'RUNNING',
                        windowStart,
                        windowEnd,
                        startedAt: now,
                        totalConsidered: 0,
                        matchedCount: 0,
                        unmatchedCount: 0,
                        ambiguousCount: 0,
                        excludedCount: 0,
                    },
                });

                return {
                    run: {
                        id: created.id,
                        merchantId: created.merchantId,
                        status: created.status,
                        windowStart: created.windowStart,
                        windowEnd: created.windowEnd,
                        rulesetVersion: created.rulesetVersion,
                        totalConsidered: created.totalConsidered,
                        matchedCount: created.matchedCount,
                        unmatchedCount: created.unmatchedCount,
                        ambiguousCount: created.ambiguousCount,
                        excludedCount: created.excludedCount,
                        startedAt: created.startedAt,
                        completedAt: created.completedAt,
                        failureReason: created.failureReason,
                        createdAt: created.createdAt,
                    },
                    isReused: false,
                };
            } catch (err: unknown) {
                // If a concurrent request created the run at the exact same time, handle P2002
                if (typeof err === 'object' && err !== null && (err as any).code === 'P2002') {
                    const concurrentExisting = await (db.reconciliationRun as any).findUnique({
                        where: {
                            merchantId_idempotencyKey: {
                                merchantId,
                                idempotencyKey,
                            },
                        },
                    });

                    if (concurrentExisting) {
                        return {
                            run: {
                                id: concurrentExisting.id,
                                merchantId: concurrentExisting.merchantId,
                                status: concurrentExisting.status,
                                windowStart: concurrentExisting.windowStart,
                                windowEnd: concurrentExisting.windowEnd,
                                rulesetVersion: concurrentExisting.rulesetVersion,
                                totalConsidered: concurrentExisting.totalConsidered,
                                matchedCount: concurrentExisting.matchedCount,
                                unmatchedCount: concurrentExisting.unmatchedCount,
                                ambiguousCount: concurrentExisting.ambiguousCount,
                                excludedCount: concurrentExisting.excludedCount,
                                startedAt: concurrentExisting.startedAt,
                                completedAt: concurrentExisting.completedAt,
                                failureReason: concurrentExisting.failureReason,
                                createdAt: concurrentExisting.createdAt,
                            },
                            isReused: true,
                        };
                    }
                }
                throw err;
            }
        },

        async fetchEligibleTransactions(
            merchantId: string,
            providerConnectionId: string,
            windowStart: Date,
            windowEnd: Date,
            skip: number,
            take: number,
        ): Promise<ReconciliationTransaction[]> {
            const rows = await db.providerTransaction.findMany({
                where: {
                    merchantId,
                    providerConnectionId,
                    occurredAt: {
                        gte: windowStart,
                        lt: windowEnd,
                    },
                },
                orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
                skip,
                take,
            });

            return rows.map((r: any) => ({
                id: r.id,
                merchantId: r.merchantId,
                providerConnectionId: r.providerConnectionId,
                providerTxnId: r.providerTxnId,
                providerRecordKey: r.providerRecordKey,
                providerOrderId: r.providerOrderId,
                type: r.type,
                status: r.status,
                amountMinor: BigInt(r.amountMinor),
                currency: r.currency,
                feeMinor: r.feeMinor ? BigInt(r.feeMinor) : null,
                occurredAt: r.occurredAt,
                rawPayload: r.rawPayload,
            }));
        },

        async findCandidateOrders(
            merchantId: string,
            transaction: ReconciliationTransaction,
            timeWindowToleranceMs: number,
        ): Promise<CandidateOrder[]> {
            const minTime = new Date(transaction.occurredAt.getTime() - timeWindowToleranceMs);
            const maxTime = new Date(transaction.occurredAt.getTime() + timeWindowToleranceMs);

            const conditions: Prisma.MerchantOrderWhereInput[] = [];

            // 1. Candidate by externalOrderId if providerOrderId exists
            if (transaction.providerOrderId && transaction.providerOrderId.trim() !== '') {
                conditions.push({
                    externalOrderId: transaction.providerOrderId.trim(),
                });
            }

            // 2. Candidate by amount and currency within time window
            conditions.push({
                currency: transaction.currency,
                amountMinor: transaction.amountMinor,
                orderedAt: {
                    gte: minTime,
                    lte: maxTime,
                },
            });

            const rows = await db.merchantOrder.findMany({
                where: {
                    merchantId, // STRICT TENANT ISOLATION
                    OR: conditions,
                },
                orderBy: [{ orderedAt: 'asc' }, { id: 'asc' }],
                take: 50, // Bounded candidate retrieval
            });

            return rows.map((r: any) => ({
                id: r.id,
                merchantId: r.merchantId,
                externalOrderId: r.externalOrderId,
                amountMinor: BigInt(r.amountMinor),
                currency: r.currency,
                status: r.status,
                orderedAt: r.orderedAt,
                metadata: (r.metadata as Record<string, unknown>) ?? null,
            }));
        },

        async persistBatchOutcomes(
            runId: string,
            merchantId: string,
            items: MatchBatchItem[],
            rulesetVersion: string,
        ): Promise<void> {
            if (items.length === 0) return;

            const matchesToCreate: any[] = [];
            const exceptionsToCreate: any[] = [];

            for (const item of items) {
                const decision = item.decision;

                if (decision.kind === 'matched') {
                    matchesToCreate.push({
                        merchantId,
                        reconciliationRunId: runId,
                        providerTransactionId: item.transaction.id,
                        merchantOrderId: decision.orderId,
                        ruleCode: decision.ruleCode,
                        rulesetVersion,
                        evidence: decision.evidence,
                    });
                } else if (decision.kind === 'unmatched') {
                    exceptionsToCreate.push({
                        merchantId,
                        reconciliationRunId: runId,
                        type: 'MISSING_MERCHANT_COUNTERPART',
                        status: 'OPEN',
                        providerTransactionId: item.transaction.id,
                        merchantOrderId: null,
                        details: decision.evidence,
                    });
                } else if (decision.kind === 'ambiguous') {
                    exceptionsToCreate.push({
                        merchantId,
                        reconciliationRunId: runId,
                        type: 'AMBIGUOUS_MATCH',
                        status: 'OPEN',
                        providerTransactionId: item.transaction.id,
                        merchantOrderId: null,
                        details: {
                            candidateOrderIds: decision.candidateOrderIds,
                            evidence: decision.evidence,
                        },
                    });
                } else if (decision.kind === 'discrepancy') {
                    exceptionsToCreate.push({
                        merchantId,
                        reconciliationRunId: runId,
                        type: decision.exceptionType,
                        status: 'OPEN',
                        providerTransactionId: item.transaction.id,
                        merchantOrderId: decision.orderId,
                        details: {
                            reasonCode: decision.reasonCode,
                            evidence: decision.evidence,
                        },
                    });
                }
                // Excluded records are tracked in counters only and not saved as exceptions
            }

            // Execute atomic persistence in a transaction
            await db.$transaction(async (tx: any) => {
                if (matchesToCreate.length > 0) {
                    await tx.reconciliationMatch.createMany({
                        data: matchesToCreate,
                        skipDuplicates: true,
                    });
                }

                if (exceptionsToCreate.length > 0) {
                    await tx.reconciliationException.createMany({
                        data: exceptionsToCreate,
                        skipDuplicates: true,
                    });
                }
            });
        },

        async finalizeRun(
            runId: string,
            status: 'COMPLETED' | 'FAILED',
            counters: {
                totalConsidered: number;
                matchedCount: number;
                unmatchedCount: number;
                ambiguousCount: number;
                excludedCount: number;
            },
            failureReason?: string,
        ): Promise<void> {
            await (db.reconciliationRun as any).update({
                where: { id: runId },
                data: {
                    status,
                    completedAt: new Date(),
                    totalConsidered: counters.totalConsidered,
                    matchedCount: counters.matchedCount,
                    unmatchedCount: counters.unmatchedCount,
                    ambiguousCount: counters.ambiguousCount,
                    excludedCount: counters.excludedCount,
                    failureReason: failureReason ?? null,
                },
            });
        },

        async listRuns(merchantId: string, filter: ListRunsFilter): Promise<ListRunsResult> {
            const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);

            const where: any = {
                merchantId, // Strict tenant isolation
            };

            if (filter.status) {
                where.status = filter.status;
            }

            if (filter.from || filter.to) {
                where.createdAt = {};
                if (filter.from) {
                    where.createdAt.gte = filter.from;
                }
                if (filter.to) {
                    where.createdAt.lte = filter.to;
                }
            }

            try {
                const [totalCount, rows] = await Promise.all([
                    (db.reconciliationRun as any).count({ where }),
                    (db.reconciliationRun as any).findMany({
                        where,
                        select: {
                            id: true,
                            merchantId: true,
                            status: true,
                            rulesetVersion: true,
                            windowStart: true,
                            windowEnd: true,
                            totalConsidered: true,
                            matchedCount: true,
                            unmatchedCount: true,
                            ambiguousCount: true,
                            excludedCount: true,
                            failureReason: true,
                            startedAt: true,
                            completedAt: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        take: limit + 1,
                        ...(filter.cursor
                            ? {
                                  cursor: { id: filter.cursor },
                                  skip: 1,
                              }
                            : {}),
                    }),
                ]);

                const hasMore = rows.length > limit;
                const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;
                const nextCursor =
                    hasMore && itemsToReturn.length > 0
                        ? itemsToReturn[itemsToReturn.length - 1].id
                        : null;

                const items: ReconciliationRunListItem[] = itemsToReturn.map((r: any) => ({
                    id: r.id,
                    merchantId: r.merchantId,
                    status: r.status,
                    rulesetVersion: r.rulesetVersion,
                    windowStart: r.windowStart.toISOString(),
                    windowEnd: r.windowEnd.toISOString(),
                    totalConsidered: r.totalConsidered,
                    matchedCount: r.matchedCount,
                    unmatchedCount: r.unmatchedCount,
                    ambiguousCount: r.ambiguousCount,
                    excludedCount: r.excludedCount,
                    failureReason: r.failureReason ?? null,
                    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
                    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
                    createdAt: r.createdAt.toISOString(),
                    updatedAt: r.updatedAt.toISOString(),
                }));

                return {
                    items,
                    pagination: {
                        limit,
                        nextCursor,
                        hasMore,
                        totalCount,
                    },
                };
            } catch (err: any) {
                if (err?.code === 'P2025') {
                    throw new ReconciliationError(
                        'RECON_INVALID_INPUT',
                        'Invalid cursor: cursor position does not exist',
                        ['cursor'],
                    );
                }
                throw err;
            }
        },

        async findRunById(merchantId: string, runId: string): Promise<ReconciliationRunDetail | null> {
            const r = await (db.reconciliationRun as any).findFirst({
                where: {
                    id: runId,
                    merchantId, // Strict tenant ownership
                },
                select: {
                    id: true,
                    merchantId: true,
                    status: true,
                    rulesetVersion: true,
                    windowStart: true,
                    windowEnd: true,
                    totalConsidered: true,
                    matchedCount: true,
                    unmatchedCount: true,
                    ambiguousCount: true,
                    excludedCount: true,
                    failureReason: true,
                    startedAt: true,
                    completedAt: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            if (!r) {
                return null;
            }

            return {
                id: r.id,
                merchantId: r.merchantId,
                status: r.status,
                rulesetVersion: r.rulesetVersion,
                windowStart: r.windowStart.toISOString(),
                windowEnd: r.windowEnd.toISOString(),
                totalConsidered: r.totalConsidered,
                matchedCount: r.matchedCount,
                unmatchedCount: r.unmatchedCount,
                ambiguousCount: r.ambiguousCount,
                excludedCount: r.excludedCount,
                failureReason: r.failureReason ?? null,
                startedAt: r.startedAt ? r.startedAt.toISOString() : null,
                completedAt: r.completedAt ? r.completedAt.toISOString() : null,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
            };
        },

        async listMatches(
            merchantId: string,
            runId: string,
            filter: ListMatchesFilter,
        ): Promise<ListMatchesResult> {
            // 1. Verify run exists and belongs to this merchant (defense against foreign tenant access)
            const run = await (db.reconciliationRun as any).findFirst({
                where: {
                    id: runId,
                    merchantId,
                },
                select: { id: true },
            });

            if (!run) {
                throw new ReconciliationError(
                    'RECON_RUN_NOT_FOUND',
                    'Reconciliation run not found or access denied',
                    ['runId'],
                );
            }

            const limit = Math.max(1, Math.min(filter.limit ?? 25, 100));
            const whereClause: any = {
                merchantId,
                reconciliationRunId: runId,
                ...(filter.ruleCode ? { ruleCode: filter.ruleCode } : {}),
            };

            try {
                const [totalCount, rows] = await Promise.all([
                    (db.reconciliationMatch as any).count({ where: whereClause }),
                    (db.reconciliationMatch as any).findMany({
                        where: whereClause,
                        select: {
                            id: true,
                            merchantId: true,
                            reconciliationRunId: true,
                            providerTransactionId: true,
                            merchantOrderId: true,
                            ruleCode: true,
                            rulesetVersion: true,
                            evidence: true,
                            createdAt: true,
                            updatedAt: true,
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
                        },
                        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                        take: limit + 1,
                        ...(filter.cursor
                            ? {
                                  cursor: { id: filter.cursor },
                                  skip: 1,
                              }
                            : {}),
                    }),
                ]);

                const hasMore = rows.length > limit;
                const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;
                const nextCursor =
                    hasMore && itemsToReturn.length > 0
                        ? itemsToReturn[itemsToReturn.length - 1].id
                        : null;

                const items: ReconciliationMatchSummary[] = itemsToReturn.map((m: any) => ({
                    id: m.id,
                    merchantId: m.merchantId,
                    reconciliationRunId: m.reconciliationRunId,
                    providerTransactionId: m.providerTransactionId,
                    merchantOrderId: m.merchantOrderId,
                    ruleCode: m.ruleCode,
                    rulesetVersion: m.rulesetVersion,
                    evidence: m.evidence,
                    providerTransaction: {
                        id: m.providerTransaction.id,
                        providerTxnId: m.providerTransaction.providerTxnId,
                        amountMinor: m.providerTransaction.amountMinor.toString(),
                        currency: m.providerTransaction.currency,
                        status: m.providerTransaction.status,
                        occurredAt: m.providerTransaction.occurredAt.toISOString(),
                    },
                    merchantOrder: {
                        id: m.merchantOrder.id,
                        externalOrderId: m.merchantOrder.externalOrderId,
                        amountMinor: m.merchantOrder.amountMinor.toString(),
                        currency: m.merchantOrder.currency,
                        status: m.merchantOrder.status,
                        orderedAt: m.merchantOrder.orderedAt.toISOString(),
                    },
                    createdAt: m.createdAt.toISOString(),
                    updatedAt: m.updatedAt.toISOString(),
                }));

                return {
                    items,
                    pagination: {
                        limit,
                        nextCursor,
                        hasMore,
                        totalCount,
                    },
                };
            } catch (err: any) {
                if (err?.code === 'P2025') {
                    throw new ReconciliationError(
                        'RECON_INVALID_INPUT',
                        'Invalid cursor: cursor position does not exist',
                        ['cursor'],
                    );
                }
                throw err;
            }
        },
    };
}
