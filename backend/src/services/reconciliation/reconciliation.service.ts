import type { PrismaClient } from '../../generated/prisma';
import { getDB } from '../../db/postgres';
import { createReconciliationRepository } from '../../repositories/reconciliation.repository';
import { sanitizeErrorMessage } from '../outbox/error-sanitizer';
import { ReconciliationError } from './errors';
import { evaluateMatch } from './matching-policy';
import type {
    ListRunsFilter,
    ListRunsResult,
    MatchBatchItem,
    ReconciliationRepository,
    ReconciliationRunDetail,
    ReconciliationRunSummary,
    StartReconciliationInput,
} from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_TIME_TOLERANCE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ReconciliationServiceDb {
    merchant: Pick<PrismaClient['merchant'], 'findUnique'>;
    providerConnection: Pick<PrismaClient['providerConnection'], 'findUnique'>;
}

export interface ReconciliationServiceDeps {
    db: ReconciliationServiceDb;
    repository: ReconciliationRepository;
}

export class ReconciliationService {
    private readonly db: ReconciliationServiceDb;
    private readonly repository: ReconciliationRepository;

    constructor(deps: ReconciliationServiceDeps) {
        this.db = deps.db;
        this.repository = deps.repository;
    }

    async run(input: StartReconciliationInput): Promise<ReconciliationRunSummary> {
        const startTime = Date.now();

        // ---------------------------------------------------------------------
        // 1. Input Validation
        // ---------------------------------------------------------------------
        if (!input.merchantId || !UUID_REGEX.test(input.merchantId)) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'merchantId must be a valid UUID',
                ['merchantId'],
            );
        }

        if (!input.providerConnectionId || !UUID_REGEX.test(input.providerConnectionId)) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'providerConnectionId must be a valid UUID',
                ['providerConnectionId'],
            );
        }

        if (!input.idempotencyKey || input.idempotencyKey.trim() === '') {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'idempotencyKey is required and cannot be empty',
                ['idempotencyKey'],
            );
        }

        const windowEnd = input.to ? new Date(input.to) : new Date();
        const windowStart = input.from
            ? new Date(input.from)
            : new Date(windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

        if (isNaN(windowStart.getTime())) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'Invalid "from" timestamp format',
                ['from'],
            );
        }

        if (isNaN(windowEnd.getTime())) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                'Invalid "to" timestamp format',
                ['to'],
            );
        }

        if (windowEnd <= windowStart) {
            throw new ReconciliationError(
                'RECON_INVALID_INPUT',
                '"to" must be strictly greater than "from"',
                ['from', 'to'],
            );
        }

        const batchSize = Math.max(1, Math.min(input.batchSize ?? DEFAULT_BATCH_SIZE, 200));
        const rulesetVersion = input.rulesetVersion ?? 'v1';
        const timeToleranceMs = input.timeWindowToleranceMs ?? DEFAULT_TIME_TOLERANCE_MS;

        // ---------------------------------------------------------------------
        // 2. Tenant Ownership and Provider Connection Verification
        // ---------------------------------------------------------------------
        const merchant = await this.db.merchant.findUnique({
            where: { id: input.merchantId },
        });

        if (!merchant) {
            throw new ReconciliationError(
                'RECON_MERCHANT_NOT_FOUND',
                `Merchant with id ${input.merchantId} was not found`,
                ['merchantId'],
            );
        }

        const connection = await this.db.providerConnection.findUnique({
            where: { id: input.providerConnectionId },
        });

        if (!connection || connection.merchantId !== input.merchantId) {
            throw new ReconciliationError(
                'RECON_CONNECTION_NOT_FOUND',
                `ProviderConnection ${input.providerConnectionId} not found or does not belong to merchant ${input.merchantId}`,
                ['providerConnectionId'],
            );
        }

        // ---------------------------------------------------------------------
        // 3. Create or Reuse Reconciliation Run (Idempotency)
        // ---------------------------------------------------------------------
        const { run, isReused } = await this.repository.createOrGetRun(
            input.merchantId,
            windowStart,
            windowEnd,
            input.idempotencyKey.trim(),
            rulesetVersion,
        );

        if (isReused) {
            // Check for conflicting request semantics
            if (run.rulesetVersion !== rulesetVersion) {
                throw new ReconciliationError(
                    'RECON_IDEMPOTENCY_CONFLICT',
                    `Idempotency key was previously used with rulesetVersion "${run.rulesetVersion}", but received "${rulesetVersion}"`,
                    ['rulesetVersion'],
                );
            }

            if (input.from && Math.abs(run.windowStart.getTime() - windowStart.getTime()) > 1000) {
                throw new ReconciliationError(
                    'RECON_IDEMPOTENCY_CONFLICT',
                    'Idempotency key was previously used with a different "from" window timestamp',
                    ['from'],
                );
            }

            if (input.to && Math.abs(run.windowEnd.getTime() - windowEnd.getTime()) > 1000) {
                throw new ReconciliationError(
                    'RECON_IDEMPOTENCY_CONFLICT',
                    'Idempotency key was previously used with a different "to" window timestamp',
                    ['to'],
                );
            }

            if (run.status === 'RUNNING') {
                throw new ReconciliationError(
                    'RECON_RUN_IN_PROGRESS',
                    `A reconciliation run with idempotency key "${input.idempotencyKey.trim()}" is currently in progress`,
                    ['idempotencyKey'],
                );
            }

            if (run.status === 'FAILED') {
                throw new ReconciliationError(
                    'RECON_RUN_FAILED',
                    `Previous reconciliation run with idempotency key "${input.idempotencyKey.trim()}" failed (${run.failureReason || 'unknown reason'}). A new idempotency key is required to retry.`,
                    ['idempotencyKey'],
                );
            }

            if (run.status === 'COMPLETED') {
                return {
                    runId: run.id,
                    merchantId: run.merchantId,
                    status: 'COMPLETED',
                    windowStart: run.windowStart,
                    windowEnd: run.windowEnd,
                    rulesetVersion: run.rulesetVersion,
                    totalConsidered: run.totalConsidered,
                    matchedCount: run.matchedCount,
                    unmatchedCount: run.unmatchedCount,
                    ambiguousCount: run.ambiguousCount,
                    excludedCount: run.excludedCount,
                    durationMs: Date.now() - startTime,
                    isReusedRun: true,
                    createdAt: run.createdAt,
                    completedAt: run.completedAt ?? undefined,
                };
            }
        }

        // ---------------------------------------------------------------------
        // 4. Batch Processing Loop
        // ---------------------------------------------------------------------
        const counters = {
            totalConsidered: 0,
            matchedCount: 0,
            unmatchedCount: 0,
            ambiguousCount: 0,
            excludedCount: 0,
        };

        let skip = 0;

        try {
            while (true) {
                const transactions = await this.repository.fetchEligibleTransactions(
                    input.merchantId,
                    input.providerConnectionId,
                    windowStart,
                    windowEnd,
                    skip,
                    batchSize,
                );

                if (transactions.length === 0) {
                    break;
                }

                const batchItems: MatchBatchItem[] = [];

                for (const transaction of transactions) {
                    counters.totalConsidered += 1;

                    // Load tenant-isolated candidates
                    const candidateOrders = await this.repository.findCandidateOrders(
                        input.merchantId,
                        transaction,
                        timeToleranceMs,
                    );

                    // Pure deterministic decision
                    const decision = evaluateMatch(transaction, candidateOrders, {
                        rulesetVersion,
                        timeWindowToleranceMs: timeToleranceMs,
                    });

                    if (decision.kind === 'matched') {
                        counters.matchedCount += 1;
                    } else if (decision.kind === 'unmatched') {
                        counters.unmatchedCount += 1;
                    } else if (decision.kind === 'ambiguous') {
                        counters.ambiguousCount += 1;
                    } else if (decision.kind === 'discrepancy') {
                        counters.unmatchedCount += 1; // Counted in exceptions
                    } else if (decision.kind === 'excluded') {
                        counters.excludedCount += 1;
                    }

                    batchItems.push({ transaction, decision });
                }

                // Persist batch outcomes in a single transaction
                await this.repository.persistBatchOutcomes(
                    run.id,
                    input.merchantId,
                    batchItems,
                    rulesetVersion,
                );

                skip += transactions.length;
            }

            const completedAt = new Date();
            // Finalize run as COMPLETED
            await this.repository.finalizeRun(run.id, 'COMPLETED', counters);

            return {
                runId: run.id,
                merchantId: input.merchantId,
                status: 'COMPLETED',
                windowStart,
                windowEnd,
                rulesetVersion,
                totalConsidered: counters.totalConsidered,
                matchedCount: counters.matchedCount,
                unmatchedCount: counters.unmatchedCount,
                ambiguousCount: counters.ambiguousCount,
                excludedCount: counters.excludedCount,
                durationMs: Date.now() - startTime,
                isReusedRun: false,
                createdAt: run.createdAt,
                completedAt,
            };
        } catch (error) {
            const sanitizedError = sanitizeErrorMessage(error);
            await this.repository.finalizeRun(run.id, 'FAILED', counters, sanitizedError);

            if (error instanceof ReconciliationError) {
                throw error;
            }

            throw new ReconciliationError(
                'RECON_PERSISTENCE_FAILED',
                `Reconciliation run failed: ${sanitizedError}`,
                [],
                error,
            );
        }
    }

    async listRuns(merchantId: string, filter: ListRunsFilter): Promise<ListRunsResult> {
        return this.repository.listRuns(merchantId, filter);
    }

    async getRun(merchantId: string, runId: string): Promise<ReconciliationRunDetail> {
        const run = await this.repository.findRunById(merchantId, runId);
        if (!run) {
            throw new ReconciliationError(
                'RECON_RUN_NOT_FOUND',
                'Reconciliation run not found or access denied',
                ['runId'],
            );
        }
        return run;
    }
}

export interface CreateReconciliationServiceDeps {
    getDb?: () => PrismaClient;
}

export function createReconciliationService(
    deps: CreateReconciliationServiceDeps = {},
): ReconciliationService {
    const dbProvider = deps.getDb ?? getDB;
    const prisma = dbProvider();
    const repository = createReconciliationRepository(prisma as any);
    return new ReconciliationService({
        db: prisma as any,
        repository,
    });
}
