import type { Prisma, PrismaClient } from '../generated/prisma';
import type {
    CandidateOrder,
    MatchBatchItem,
    ReconciliationRepository,
    ReconciliationTransaction,
} from '../services/reconciliation/types';

export interface ReconciliationDb {
    reconciliationRun: Pick<
        PrismaClient['reconciliationRun'],
        'findUnique' | 'create' | 'update'
    >;
    providerTransaction: Pick<PrismaClient['providerTransaction'], 'findMany'>;
    merchantOrder: Pick<PrismaClient['merchantOrder'], 'findMany'>;
    reconciliationMatch: { createMany: (args: any) => Promise<any> };
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
    };
}
