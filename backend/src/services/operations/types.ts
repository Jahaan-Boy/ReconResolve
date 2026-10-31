export interface OutboxQueueMetrics {
    readonly pendingCount: number;
    readonly processingCount: number;
    readonly failedCount: number;
    readonly dispatchedCount: number;
    readonly oldestPendingAgeMs: number;
    readonly deadLetterCount: number;
}

export interface ReconciliationHealthMetrics {
    readonly latestRunStatus: string | null;
    readonly latestRunId: string | null;
    readonly failedRunsCount: number;
    readonly recentAmbiguousCount: number;
}

export interface InvestigationHealthMetrics {
    readonly totalInvestigationsCount: number;
    readonly recentFailedCount: number;
}

export interface DeadLetterRecord {
    readonly id: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly eventType: string;
    readonly attemptCount: number;
    readonly lastErrorCategory: string | null;
    readonly lastError: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly replayEligible: boolean;
}

export type PipelineHealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL';

export interface OperationsSummaryResult {
    readonly merchantId: string;
    readonly generatedAt: string;
    readonly pipelineHealth: PipelineHealthStatus;
    readonly outbox: OutboxQueueMetrics;
    readonly reconciliation: ReconciliationHealthMetrics;
    readonly investigations: InvestigationHealthMetrics;
    readonly deadLetterQueue: DeadLetterRecord[];
}

export interface ReplayOutboxEventResult {
    readonly outcome: 'replayed';
    readonly eventId: string;
    readonly status: 'PENDING';
    readonly replayedAt: string;
    readonly replayedBy: string;
}
