import { sanitizeErrorMessage } from '../outbox/error-sanitizer';
import { OperationsError } from './errors';
import type {
    DeadLetterRecord,
    OperationsSummaryResult,
    PipelineHealthStatus,
    ReplayOutboxEventResult,
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
        findMany(args: any): Promise<any[]>;
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
        const isAuthorized = context.roles.some((r) => r === 'OWNER' || r === 'ADMIN');
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

        if (existing.status !== 'FAILED') {
            throw OperationsError.conflict(
                `Outbox event ${eventId} is currently in status "${existing.status}". Only FAILED events can be replayed.`,
            );
        }

        // Atomic transition from FAILED to PENDING
        const now = new Date();
        const updateResult = await this.db.outboxEvent.updateMany({
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

        if (updateResult.count === 0) {
            throw OperationsError.conflict(
                `Outbox event ${eventId} was concurrently modified or replayed`,
            );
        }

        console.log(
            JSON.stringify({
                level: 'info',
                event: 'outbox.replayed',
                eventId,
                merchantId,
                replayedBy: context.actorId,
                timestamp: now.toISOString(),
                correlationId: context.correlationId ?? null,
            }),
        );

        return {
            outcome: 'replayed',
            eventId,
            status: 'PENDING',
            replayedAt: now.toISOString(),
            replayedBy: context.actorId,
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
}
