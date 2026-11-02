import { sanitizeErrorMessage } from '../outbox/error-sanitizer';
import { OperationsError } from './errors';
import type {
    DeadLetterRecord,
    EventTimelineResult,
    OperationsSummaryResult,
    PipelineHealthStatus,
    ReplayOutboxEventResult,
    TimelineStage,
} from './types';
import type { CacheService } from '../cache';
import { invalidateMerchantScope } from '../cache';
import { redactSensitivePayload } from '../copilot/evidence-resolver';

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
    cache?: CacheService;
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
    private readonly cache?: CacheService;

    constructor(deps: OperationsServiceDeps) {
        this.db = deps.db;
        this.cache = deps.cache;
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
                select: {
                    id: true,
                    aggregateType: true,
                    aggregateId: true,
                    eventType: true,
                    attemptCount: true,
                    lastError: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            this.db.reconciliationRun.findFirst({
                where: { merchantId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, status: true, completedAt: true, createdAt: true },
            }),
            this.db.reconciliationRun.count({
                where: { merchantId, status: 'FAILED' },
            }),
            this.db.reconciliationRun.aggregate({
                where: { merchantId },
                _sum: { ambiguousCount: true },
            }),
            this.db.exceptionInvestigation
                ? this.db.exceptionInvestigation.count({ where: { merchantId } })
                : Promise.resolve(0),
            this.db.exceptionInvestigation
                ? this.db.exceptionInvestigation.count({ where: { merchantId, status: 'FAILED' } })
                : Promise.resolve(0),
        ]);

        const oldestPendingAgeMs = oldestPendingRecord?.createdAt
            ? Math.max(0, now.getTime() - new Date(oldestPendingRecord.createdAt).getTime())
            : 0;

        // Health evaluation
        let pipelineHealth: PipelineHealthStatus = 'HEALTHY';
        if (failedOutboxCount > 5 || failedRunsCount > 0 || oldestPendingAgeMs > 60_000) {
            pipelineHealth = 'CRITICAL';
        } else if (failedOutboxCount > 0 || processingOutboxCount > 10 || oldestPendingAgeMs > 15_000) {
            pipelineHealth = 'DEGRADED';
        }

        const deadLetterQueue: DeadLetterRecord[] = deadLetterRows.map((r: any) => ({
            id: r.id,
            aggregateType: r.aggregateType,
            aggregateId: r.aggregateId,
            eventType: r.eventType,
            attemptCount: r.attemptCount,
            lastError: r.lastError ? sanitizeErrorMessage(r.lastError) : null,
            lastErrorCategory: categorizeError(r.lastError),
            createdAt: new Date(r.createdAt).toISOString(),
            updatedAt: new Date(r.updatedAt).toISOString(),
            replayEligible: r.attemptCount < 5,
        }));

        let cacheHealth:
            | {
                  provider: string;
                  connected: boolean;
                  degraded: boolean;
                  latencyMs?: number;
              }
            | undefined = undefined;

        if (this.cache) {
            try {
                const hc = await this.cache.healthCheck();
                cacheHealth = {
                    provider: this.cache.providerName,
                    connected: hc.ok,
                    degraded: !hc.ok,
                    latencyMs: hc.latencyMs,
                };
            } catch {
                cacheHealth = {
                    provider: this.cache.providerName,
                    connected: false,
                    degraded: true,
                };
            }
        }

        return {
            merchantId,
            generatedAt: now.toISOString(),
            pipelineHealth,
            outbox: {
                pendingCount: pendingOutboxCount,
                processingCount: processingOutboxCount,
                failedCount: failedOutboxCount,
                dispatchedCount: dispatchedOutboxCount,
                deadLetterCount: failedOutboxCount,
                oldestPendingAgeMs,
            },
            reconciliation: {
                latestRunStatus: latestRun?.status ?? null,
                failedRunsCount,
                recentAmbiguousCount: ambiguousAgg?._sum?.ambiguousCount ?? 0,
            },
            investigations: {
                totalInvestigationsCount,
                failedInvestigationsCount,
            },
            deadLetterQueue,
            cacheHealth,
        };
    }

    async replayOutboxEvent(
        merchantId: string,
        eventId: string,
        context?: OperatorContext,
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
            return {
                outcome: 'unavailable',
                eventId,
                reason: 'Outbox event not found or does not belong to this merchant',
            };
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
                replayedBy: context?.actorId || 'operator-user',
            };
        }

        // 2. Structured feedback for dispatched events
        if (existing.status === 'DISPATCHED') {
            return {
                outcome: 'rejected_due_to_state',
                eventId,
                status: 'DISPATCHED',
                reason: 'Dispatched events cannot be replayed as they have already been delivered successfully.',
                replayedAt: now.toISOString(),
                replayedBy: context?.actorId || 'operator-user',
            };
        }

        // 3. Retry ceiling check (5 attempts per worker state machine)
        if (existing.attemptCount >= 5) {
            return {
                outcome: 'attempt_ceiling_reached',
                eventId,
                status: existing.status,
                message: 'Event has reached the maximum attempt ceiling (5 attempts) and cannot be automatically replayed.',
                reason: 'Maximum attempt ceiling reached',
                replayedAt: now.toISOString(),
                replayedBy: context?.actorId || 'operator-user',
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
            return {
                outcome: 'already_queued',
                eventId,
                message: `Outbox event ${eventId} was concurrently replayed or modified by another operator`,
                reason: `Outbox event ${eventId} was concurrently modified or replayed by another operator`,
            };
        }

        // Invalidate operations cache scope if cache is available
        if (this.cache) {
            await invalidateMerchantScope(merchantId, ['operations'], this.cache);
        }

        console.log(
            JSON.stringify({
                level: 'info',
                event: 'outbox.replayed',
                eventId,
                merchantId,
                replayedBy: context?.actorId || 'operator-user',
                timestamp: now.toISOString(),
                correlationId: context?.correlationId ?? null,
            }),
        );

        return {
            outcome: 'replayed',
            eventId,
            status: 'PENDING',
            replayedAt: now.toISOString(),
            replayedBy: context?.actorId || 'operator-user',
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
     * 6 stages backed by persisted evidence:
     * 1. WEBHOOK_RECEIVED
     * 2. SIGNATURE_VERIFIED
     * 3. INBOX_STORED
     * 4. OUTBOX_ENQUEUED
     * 5. WORKER_PROCESSED
     * 6. LEDGER_RECORDED
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

        // Trace correlations if starting from one entity
        if (outbox && !webhook && this.db.webhookEvent?.findFirst) {
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

        if (outbox && !providerTxn && this.db.providerTransaction?.findFirst) {
            if (outbox.aggregateType === 'PROVIDER_TRANSACTION') {
                providerTxn = await this.db.providerTransaction.findFirst({
                    where: { id: outbox.aggregateId, merchantId },
                });
            }
        }

        // Construct the 6 explicit stages
        const stages: TimelineStage[] = [
            {
                stage: 'WEBHOOK_RECEIVED',
                title: 'Webhook Received',
                status: webhook ? 'COMPLETED' : 'NOT_REACHED',
                timestamp: webhook?.receivedAt ? new Date(webhook.receivedAt).toISOString() : null,
                entityId: webhook?.id ?? null,
                summary: webhook
                    ? `PayPal event ${webhook.eventType} received.`
                    : 'Webhook record not found or not reached.',
                data: webhook ? redactSensitivePayload(webhook.payload) : undefined,
                details: webhook ? redactSensitivePayload(webhook.payload) : undefined,
            },
            {
                stage: 'SIGNATURE_VERIFIED',
                title: 'Signature Verification',
                status: webhook?.verifiedAt ? 'COMPLETED' : 'NOT_REACHED',
                timestamp: webhook?.verifiedAt ? new Date(webhook.verifiedAt).toISOString() : null,
                entityId: webhook?.id ?? null,
                summary: webhook?.verifiedAt
                    ? 'Webhook signature and transmission verified.'
                    : 'Signature verification not completed or not reached.',
            },
            {
                stage: 'INBOX_STORED',
                title: 'Inbox Storage',
                status: webhook?.id ? 'COMPLETED' : 'NOT_REACHED',
                timestamp: webhook?.createdAt
                    ? new Date(webhook.createdAt).toISOString()
                    : webhook?.receivedAt
                      ? new Date(webhook.receivedAt).toISOString()
                      : null,
                entityId: webhook?.id ?? null,
                summary: webhook?.id
                    ? `Persisted webhook event ${webhook.id}.`
                    : 'Webhook storage not reached.',
            },
            {
                stage: 'OUTBOX_ENQUEUED',
                title: 'Outbox Enqueued',
                status: outbox ? 'COMPLETED' : 'NOT_REACHED',
                timestamp: outbox?.createdAt ? new Date(outbox.createdAt).toISOString() : null,
                entityId: outbox?.id ?? null,
                summary: outbox
                    ? `Enqueued outbox record ${outbox.id} [${outbox.eventType}].`
                    : 'Outbox enqueuing not reached.',
            },
            {
                stage: 'WORKER_PROCESSED',
                title: 'Worker Processed',
                status:
                    outbox?.status === 'DISPATCHED'
                        ? 'COMPLETED'
                        : outbox?.status === 'FAILED'
                          ? 'FAILED'
                          : outbox?.status === 'PROCESSING' || outbox?.status === 'PENDING'
                            ? 'PENDING'
                            : 'NOT_REACHED',
                timestamp: outbox?.dispatchedAt
                    ? new Date(outbox.dispatchedAt).toISOString()
                    : outbox?.updatedAt
                      ? new Date(outbox.updatedAt).toISOString()
                      : null,
                entityId: outbox?.id ?? null,
                summary: outbox
                    ? `Worker processing state: ${outbox.status} (${outbox.attemptCount} attempt(s)).`
                    : 'Worker processing not reached.',
                error: outbox?.lastError ? sanitizeErrorMessage(outbox.lastError) : null,
            },
            {
                stage: 'LEDGER_RECORDED',
                title: 'Ledger Recorded',
                status: providerTxn ? 'COMPLETED' : 'NOT_REACHED',
                timestamp: providerTxn?.occurredAt
                    ? new Date(providerTxn.occurredAt).toISOString()
                    : providerTxn?.createdAt
                      ? new Date(providerTxn.createdAt).toISOString()
                      : null,
                entityId: providerTxn?.id ?? null,
                summary: providerTxn
                    ? `Normalized provider transaction recorded (${providerTxn.currency} ${providerTxn.amountMinor?.toString()}).`
                    : 'Ledger transaction not reached.',
                data: providerTxn
                    ? {
                          id: providerTxn.id,
                          amountMinor: providerTxn.amountMinor?.toString(),
                          currency: providerTxn.currency,
                          providerTxnId: providerTxn.providerTxnId,
                          type: providerTxn.type,
                          status: providerTxn.status,
                      }
                    : undefined,
                details: providerTxn
                    ? {
                          id: providerTxn.id,
                          amountMinor: providerTxn.amountMinor?.toString(),
                          currency: providerTxn.currency,
                          providerTxnId: providerTxn.providerTxnId,
                          type: providerTxn.type,
                          status: providerTxn.status,
                      }
                    : undefined,
            },
        ];

        let pipelineOutcome: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_REACHED' | 'INCOMPLETE' = 'SUCCESS';
        if (stages.every((s) => s.status === 'NOT_REACHED')) {
            pipelineOutcome = 'NOT_REACHED';
        } else if (stages.some((s) => s.status === 'FAILED')) {
            pipelineOutcome = 'FAILED';
        } else if (stages.some((s) => s.status === 'PENDING')) {
            pipelineOutcome = 'PENDING';
        } else if (stages.every((s) => s.status === 'COMPLETED')) {
            pipelineOutcome = 'SUCCESS';
        } else {
            pipelineOutcome = 'INCOMPLETE';
        }

        return {
            merchantId,
            rootEventId: eventId,
            generatedAt: now.toISOString(),
            pipelineOutcome,
            stages,
            steps: stages,
        };
    }
}
