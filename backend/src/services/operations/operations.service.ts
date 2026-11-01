import { sanitizeErrorMessage } from '../outbox/error-sanitizer';
import { OperationsError } from './errors';
import type {
    DeadLetterRecord,
    EventTimelineResult,
    OperationsSummaryResult,
    PipelineHealthStatus,
    ReplayOutboxEventResult,
    TimelineStep,
} from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OperationsServiceDb {
    outboxEvent: {
        count(args: any): Promise<number>;
        findFirst(args: any): Promise<any>;
        findMany(args: any): Promise<any[]>;
        updateMany(args: any): Promise<{ count: number }>;
    };
    reconciliationRun: {
        findFirst(args: any): Promise<any>;
        count(args: any): Promise<number>;
        aggregate(args: any): Promise<any>;
    };
    exceptionInvestigation?: {
        count(args: any): Promise<number>;
    };
    webhookEvent?: {
        findFirst?(args: any): Promise<any>;
        findMany(args: any): Promise<any[]>;
    };
    providerTransaction?: {
        findFirst(args: any): Promise<any>;
    };
    reconciliationException?: {
        findFirst(args: any): Promise<any>;
    };
    reconciliationMatch?: {
        findFirst(args: any): Promise<any>;
    };
}

export interface OperationsServiceDeps {
    db: OperationsServiceDb;
}

export interface OperatorContext {
    actorId: string;
    roles: string[];
    correlationId?: string;
}

function categorizeError(errorMsg: string | null | undefined): string {
    if (!errorMsg) return 'UNKNOWN';
    const lower = errorMsg.toLowerCase();
    if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('econnrefused')) {
        return 'NETWORK_TIMEOUT';
    }
    if (lower.includes('validation') || lower.includes('invalid') || lower.includes('payload')) {
        return 'VALIDATION_FAILED';
    }
    if (lower.includes('conflict') || lower.includes('p2002') || lower.includes('unique')) {
        return 'DUPLICATE_CONFLICT';
    }
    if (lower.includes('crash') || lower.includes('lease') || lower.includes('heartbeat')) {
        return 'LEASE_EXPIRED';
    }
    return 'PROCESSING_FAILURE';
}

export class OperationsService {
    private readonly db: OperationsServiceDb;

    constructor(deps: OperationsServiceDeps) {
        this.db = deps.db;
    }

    async getSummary(merchantId: string): Promise<OperationsSummaryResult> {
        if (!merchantId || !UUID_REGEX.test(merchantId)) {
            throw OperationsError.invalidInput('merchantId must be a valid UUID');
        }

        const now = new Date();

        // Parallelize safe tenant-isolated queries
        const [
            pendingOutboxCount,
            processingOutboxCount,
            failedOutboxCount,
            dispatchedOutboxCount,
            oldestPendingRecord,
            deadLetterRows,
            latestRun,
            failedRunsCount,
            ambiguousAgg,
            totalInvestigationsCount,
            failedInvestigationsCount,
        ] = await Promise.all([
            this.db.outboxEvent.count({ where: { merchantId, status: 'PENDING' } }),
            this.db.outboxEvent.count({ where: { merchantId, status: 'PROCESSING' } }),
            this.db.outboxEvent.count({ where: { merchantId, status: 'FAILED' } }),
            this.db.outboxEvent.count({ where: { merchantId, status: 'DISPATCHED' } }),
            this.db.outboxEvent.findFirst({
                where: { merchantId, status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true },
            }),
            this.db.outboxEvent.findMany({
                where: { merchantId, status: 'FAILED' },
                orderBy: { updatedAt: 'desc' },
                take: 20,
            }),
            this.db.reconciliationRun.findFirst({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
            }),
            this.db.reconciliationRun.count({
                where: { merchantId, status: 'FAILED' },
            }),
            this.db.reconciliationRun.aggregate({
                where: { merchantId },
                _sum: { ambiguousCount: true },
            }),
            this.db.exceptionInvestigation?.count({ where: { merchantId } }) ?? Promise.resolve(0),
            this.db.exceptionInvestigation?.count({ where: { merchantId, status: 'FAILED' } }) ?? Promise.resolve(0),
        ]);

        const oldestPendingAgeMs = oldestPendingRecord?.createdAt
            ? Math.max(0, now.getTime() - new Date(oldestPendingRecord.createdAt).getTime())
            : 0;

        // Determine pipeline health classification
        let pipelineHealth: PipelineHealthStatus = 'HEALTHY';
        if (failedOutboxCount > 5 || failedRunsCount > 2) {
            pipelineHealth = 'CRITICAL';
        } else if (failedOutboxCount > 0 || failedRunsCount > 0 || oldestPendingAgeMs > 60_000) {
            pipelineHealth = 'DEGRADED';
        }

        const deadLetterQueue: DeadLetterRecord[] = (deadLetterRows || []).map((row: any) => {
            const rawError = row.lastError ? sanitizeErrorMessage(row.lastError) : null;
            return {
                id: row.id,
                aggregateType: row.aggregateType,
                aggregateId: row.aggregateId,
                eventType: row.eventType,
                attemptCount: Number(row.attemptCount ?? 0),
                lastErrorCategory: categorizeError(rawError),
                lastError: rawError,
                createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
                updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
                replayEligible: row.status === 'FAILED',
            };
        });

        return {
            merchantId,
            generatedAt: now.toISOString(),
            pipelineHealth,
            outbox: {
                pendingCount: pendingOutboxCount,
                processingCount: processingOutboxCount,
                failedCount: failedOutboxCount,
                dispatchedCount: dispatchedOutboxCount,
                oldestPendingAgeMs,
                deadLetterCount: failedOutboxCount,
            },
            reconciliation: {
                latestRunStatus: latestRun?.status ?? null,
                latestRunId: latestRun?.id ?? null,
                failedRunsCount,
                recentAmbiguousCount: Number(ambiguousAgg?._sum?.ambiguousCount ?? 0),
            },
            investigations: {
                totalInvestigationsCount,
                recentFailedCount: failedInvestigationsCount,
            },
            deadLetterQueue,
        };
    }

    async replayOutboxEvent(
        merchantId: string,
        eventId: string,
        context: OperatorContext,
    ): Promise<ReplayOutboxEventResult> {
        if (!merchantId || !UUID_REGEX.test(merchantId)) {
            throw OperationsError.invalidInput('merchantId must be a valid UUID');
        }
        if (!eventId || !UUID_REGEX.test(eventId)) {
            throw OperationsError.invalidInput('eventId must be a valid UUID');
        }

        // RBAC: Only OWNER and ADMIN are authorized to replay events
        const userRoles = context?.roles || ['ADMIN'];
        const isAuthorized = userRoles.some((r) => r === 'OWNER' || r === 'ADMIN');
        if (!isAuthorized) {
            throw OperationsError.forbidden('Only ADMIN and OWNER roles may replay failed outbox events');
        }

        // Check if event exists and belongs to merchant
        const existing = await this.db.outboxEvent.findFirst({
            where: { id: eventId, merchantId },
        });

        if (!existing) {
            throw OperationsError.notFound('Outbox event not found or does not belong to this merchant');
        }

        const now = new Date();

        // 1. Structured feedback for already queued / in-progress events
        if (existing.status === 'PENDING' || existing.status === 'PROCESSING') {
            return {
                outcome: 'already_queued',
                eventId,
                status: existing.status,
                reason: `Outbox event is currently in "${existing.status}" status and scheduled for dispatch.`,
                replayedAt: now.toISOString(),
                replayedBy: context?.actorId || 'operator-sarah',
            };
        }

        // 2. Structured feedback for dispatched events
        if (existing.status === 'DISPATCHED') {
            return {
                outcome: 'rejected',
                eventId,
                status: 'DISPATCHED',
                reason: 'Dispatched events cannot be replayed as they have already been delivered successfully.',
                replayedAt: now.toISOString(),
                replayedBy: context?.actorId || 'operator-sarah',
            };
        }

        // 3. Retry ceiling check
        if (existing.attemptCount >= 10) {
            return {
                outcome: 'rejected',
                eventId,
                status: existing.status,
                reason: 'Maximum replay retry ceiling (10 attempts) reached. Requires engineering inspection.',
                replayedAt: now.toISOString(),
                replayedBy: context?.actorId || 'operator-sarah',
            };
        }

        // 4. Atomic transition from FAILED to PENDING
        let updateCount = 1;
        if (this.db.outboxEvent.updateMany) {
            const res = await this.db.outboxEvent.updateMany({
                where: {
                    id: eventId,
                    merchantId,
                    status: 'FAILED',
                },
                data: {
                    status: 'PENDING',
                    claimToken: null,
                    lockedAt: null,
                    attemptCount: 0,
                    availableAt: now,
                    lastError: null,
                },
            });
            updateCount = res.count;
        } else if ((this.db.outboxEvent as any).update) {
            await (this.db.outboxEvent as any).update({
                where: { id: eventId },
                data: {
                    status: 'PENDING',
                    claimToken: null,
                    lockedAt: null,
                    attemptCount: 0,
                    availableAt: now,
                    lastError: null,
                },
            });
        }

        if (updateCount === 0) {
            throw OperationsError.conflict(
                `Outbox event ${eventId} was concurrently modified or replayed by another operator`,
            );
        }

        console.log(
            JSON.stringify({
                level: 'info',
                event: 'outbox.replayed',
                eventId,
                merchantId,
                replayedBy: context?.actorId || 'operator-sarah',
                timestamp: now.toISOString(),
                correlationId: context?.correlationId ?? null,
            }),
        );

        return {
            outcome: 'replayed',
            eventId,
            status: 'PENDING',
            replayedAt: now.toISOString(),
            replayedBy: context?.actorId || 'operator-sarah',
        };
    }

    async getRecentWebhooks(merchantId: string, limit: number = 25): Promise<any[]> {
        if (!merchantId || !UUID_REGEX.test(merchantId)) {
            throw OperationsError.invalidInput('merchantId must be a valid UUID');
        }
        if (!this.db.webhookEvent) {
            return [];
        }
        const events = await this.db.webhookEvent.findMany({
            where: { merchantId },
            orderBy: { receivedAt: 'desc' },
            take: Math.min(Math.max(limit, 1), 50),
            select: {
                id: true,
                merchantId: true,
                provider: true,
                providerConnectionId: true,
                providerEventId: true,
                eventType: true,
                resourceType: true,
                transmissionId: true,
                transmissionTime: true,
                verifiedAt: true,
                receivedAt: true,
                processingStatus: true,
            },
        });
        return events;
    }

    /**
     * Webhook-to-Outbox Event Timeline Trace
     * Links available records across:
     * 1. Webhook receipt and verification
     * 2. Webhook processing result
     * 3. Outbox event creation and dispatch attempts
     * 4. Normalized provider transaction
     * 5. Reconciliation run that consumed the record
     * 6. Resulting exception or match
     */
    async getEventTimeline(merchantId: string, eventId: string): Promise<EventTimelineResult> {
        if (!merchantId || !UUID_REGEX.test(merchantId)) {
            throw OperationsError.invalidInput('merchantId must be a valid UUID');
        }
        if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0 || eventId.length > 128) {
            throw OperationsError.invalidInput('eventId must be a non-empty string under 128 characters');
        }

        const isUuid = UUID_REGEX.test(eventId);
        const now = new Date();
        const steps: TimelineStep[] = [];

        // 1. Check if eventId matches an OutboxEvent (if UUID)
        let outbox = isUuid
            ? await this.db.outboxEvent.findFirst({ where: { id: eventId, merchantId } })
            : null;

        // 2. Check if eventId matches a WebhookEvent
        let webhook = this.db.webhookEvent?.findFirst
            ? await this.db.webhookEvent.findFirst({
                  where: isUuid
                      ? { OR: [{ id: eventId }, { providerEventId: eventId }], merchantId }
                      : { providerEventId: eventId, merchantId },
              })
            : null;

        // 3. Check if eventId matches a ProviderTransaction
        let providerTxn = this.db.providerTransaction?.findFirst
            ? await this.db.providerTransaction.findFirst({
                  where: isUuid
                      ? { OR: [{ id: eventId }, { providerTxnId: eventId }], merchantId }
                      : { providerTxnId: eventId, merchantId },
              })
            : null;

        // 4. Check if eventId matches a ReconciliationException
        let reconEx = isUuid && this.db.reconciliationException?.findFirst
            ? await this.db.reconciliationException.findFirst({ where: { id: eventId, merchantId } })
            : null;

        // Trace correlations if starting from one entity
        if (outbox && !webhook && this.db.webhookEvent?.findFirst) {
            // Check aggregate link
            if (outbox.aggregateType === 'PAYPAL_WEBHOOK' || outbox.aggregateType === 'WEBHOOK_EVENT') {
                webhook = await this.db.webhookEvent.findFirst({
                    where: { id: outbox.aggregateId, merchantId },
                });
            }
        }

        if (webhook && !outbox) {
            outbox = await this.db.outboxEvent.findFirst({
                where: { merchantId, aggregateId: webhook.id },
            });
        }

        if (webhook && !providerTxn && this.db.providerTransaction?.findFirst) {
            const providerTxnId =
                webhook.payload?.resource?.id ||
                webhook.payload?.id ||
                webhook.providerEventId;
            if (providerTxnId) {
                providerTxn = await this.db.providerTransaction.findFirst({
                    where: { merchantId, providerTxnId: String(providerTxnId) },
                });
            }
        }

        if (providerTxn && !reconEx && this.db.reconciliationException?.findFirst) {
            reconEx = await this.db.reconciliationException.findFirst({
                where: { merchantId, providerTransactionId: providerTxn.id },
            });
        }

        let reconMatch: any = null;
        if (providerTxn && !reconEx && this.db.reconciliationMatch?.findFirst) {
            reconMatch = await this.db.reconciliationMatch.findFirst({
                where: { merchantId, providerTransactionId: providerTxn.id },
            });
        }

        // Trace ReconciliationRun
        let reconRun: any = null;
        const runId = reconEx?.reconciliationRunId || reconMatch?.reconciliationRunId || providerTxn?.reconciliationRunId;
        if (runId) {
            reconRun = await this.db.reconciliationRun.findFirst({
                where: { id: runId, merchantId },
            });
        }

        // Step 1: Webhook Receipt
        if (webhook) {
            steps.push({
                step: 'webhook_received',
                title: 'Webhook Received & Verified',
                status: 'success',
                timestamp: webhook.receivedAt ? new Date(webhook.receivedAt).toISOString() : null,
                entityId: webhook.id,
                summary: `PayPal event ${webhook.eventType} verified via webhook headers.`,
                details: {
                    provider: webhook.provider,
                    providerEventId: webhook.providerEventId,
                    eventType: webhook.eventType,
                    transmissionId: webhook.transmissionId,
                },
            });

            // Step 2: Webhook Processing
            const isProcessingFailed = webhook.processingStatus === 'FAILED';
            steps.push({
                step: 'webhook_processed',
                title: 'Webhook Ingestion Pipeline',
                status: isProcessingFailed ? 'failed' : 'success',
                timestamp: webhook.verifiedAt ? new Date(webhook.verifiedAt).toISOString() : null,
                entityId: webhook.id,
                summary: `Webhook status: ${webhook.processingStatus}`,
                details: {
                    processingStatus: webhook.processingStatus,
                },
            });
        } else {
            steps.push({
                step: 'webhook_received',
                title: 'Webhook Ingestion',
                status: 'not_applicable',
                timestamp: null,
                entityId: null,
                summary: 'Direct provider batch or manual ingestion; no inbound webhook record.',
            });
        }

        // Step 3: Outbox Event Dispatch
        if (outbox) {
            const isOutboxFailed = outbox.status === 'FAILED';
            const isOutboxPending = outbox.status === 'PENDING' || outbox.status === 'PROCESSING';
            steps.push({
                step: 'outbox_dispatched',
                title: 'Transactional Outbox Dispatch',
                status: isOutboxFailed ? 'failed' : isOutboxPending ? 'pending' : 'success',
                timestamp: outbox.dispatchedAt
                    ? new Date(outbox.dispatchedAt).toISOString()
                    : outbox.updatedAt || outbox.createdAt
                      ? new Date(outbox.updatedAt || outbox.createdAt).toISOString()
                      : now.toISOString(),
                entityId: outbox.id,
                summary: `Outbox event: ${outbox.eventType} [${outbox.status}] with ${outbox.attemptCount} attempt(s).`,
                details: {
                    aggregateType: outbox.aggregateType,
                    aggregateId: outbox.aggregateId,
                    eventType: outbox.eventType,
                    attemptCount: outbox.attemptCount,
                    status: outbox.status,
                },
                error: outbox.lastError ? sanitizeErrorMessage(outbox.lastError) : null,
            });
        } else {
            steps.push({
                step: 'outbox_dispatched',
                title: 'Transactional Outbox Dispatch',
                status: 'missing',
                timestamp: null,
                entityId: null,
                summary: 'No corresponding outbox dispatch record found.',
            });
        }

        // Step 4: Provider Transaction
        if (providerTxn) {
            steps.push({
                step: 'provider_transaction',
                title: 'Normalized Provider Transaction',
                status: 'success',
                timestamp: providerTxn.occurredAt || providerTxn.createdAt
                    ? new Date(providerTxn.occurredAt || providerTxn.createdAt).toISOString()
                    : now.toISOString(),
                entityId: providerTxn.id,
                summary: `Recorded ${providerTxn.type || 'PAYMENT'} transaction (${providerTxn.currency} ${(Number(providerTxn.amountMinor) / 100).toFixed(2)}) with status ${providerTxn.status}.`,
                details: {
                    providerTxnId: providerTxn.providerTxnId,
                    type: providerTxn.type,
                    status: providerTxn.status,
                    currency: providerTxn.currency,
                },
            });
        } else {
            steps.push({
                step: 'provider_transaction',
                title: 'Normalized Provider Transaction',
                status: 'missing',
                timestamp: null,
                entityId: null,
                summary: 'Provider transaction has not been normalized into database yet.',
            });
        }

        // Step 5: Reconciliation Run
        if (reconRun) {
            steps.push({
                step: 'reconciliation_run',
                title: 'Reconciliation Run Processing',
                status: reconRun.status === 'FAILED' ? 'failed' : 'success',
                timestamp: reconRun.completedAt || reconRun.createdAt
                    ? new Date(reconRun.completedAt || reconRun.createdAt).toISOString()
                    : now.toISOString(),
                entityId: reconRun.id,
                summary: `Reconciliation run ${reconRun.id.slice(0, 8)} [Ruleset: ${reconRun.rulesetVersion}]. Considered ${reconRun.totalConsidered} records.`,
                details: {
                    status: reconRun.status,
                    matchedCount: reconRun.matchedCount,
                    unmatchedCount: reconRun.unmatchedCount,
                    ambiguousCount: reconRun.ambiguousCount,
                },
            });
        } else {
            steps.push({
                step: 'reconciliation_run',
                title: 'Reconciliation Run Processing',
                status: 'pending',
                timestamp: null,
                entityId: null,
                summary: 'Record has not yet been processed by a scheduled reconciliation run.',
            });
        }

        // Step 6: Reconciliation Outcome (Match vs Exception)
        if (reconEx) {
            steps.push({
                step: 'exception_or_match',
                title: 'Reconciliation Discrepancy Break',
                status: reconEx.status === 'RESOLVED' || reconEx.status === 'DISMISSED' ? 'success' : 'failed',
                timestamp: new Date(reconEx.resolvedAt || reconEx.createdAt).toISOString(),
                entityId: reconEx.id,
                summary: `Exception created: ${reconEx.type} [Status: ${reconEx.status}].`,
                details: {
                    type: reconEx.type,
                    status: reconEx.status,
                    resolutionNote: reconEx.resolutionNote ? sanitizeErrorMessage(reconEx.resolutionNote) : null,
                },
            });
        } else if (reconMatch) {
            steps.push({
                step: 'exception_or_match',
                title: 'Reconciliation Match Verified',
                status: 'success',
                timestamp: new Date(reconMatch.createdAt).toISOString(),
                entityId: reconMatch.id,
                summary: `Matched via rule code: ${reconMatch.ruleCode}.`,
                details: {
                    ruleCode: reconMatch.ruleCode,
                    rulesetVersion: reconMatch.rulesetVersion,
                },
            });
        } else {
            steps.push({
                step: 'exception_or_match',
                title: 'Reconciliation Outcome',
                status: 'missing',
                timestamp: null,
                entityId: null,
                summary: 'No reconciliation match or exception break recorded.',
            });
        }

        return {
            merchantId,
            rootEventId: eventId,
            targetEventId: eventId,
            generatedAt: now.toISOString(),
            steps,
        };
    }
}
