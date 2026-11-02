export interface DeadLetterRecord {
    readonly id: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly eventType: string;
    readonly attemptCount: number;
    readonly lastError: string | null;
    readonly lastErrorCategory: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly replayEligible: boolean;
}

export interface OutboxQueueMetrics {
    readonly pendingCount: number;
    readonly processingCount: number;
    readonly failedCount: number;
    readonly dispatchedCount: number;
    readonly deadLetterCount: number;
    readonly oldestPendingAgeMs: number;
}

export interface ReconciliationHealthMetrics {
    readonly latestRunStatus: string | null;
    readonly failedRunsCount: number;
    readonly recentAmbiguousCount: number;
}

export interface InvestigationHealthMetrics {
    readonly totalInvestigationsCount: number;
    readonly failedInvestigationsCount: number;
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
    readonly cacheHealth?: {
        readonly provider: string;
        readonly connected: boolean;
        readonly degraded: boolean;
        readonly latencyMs?: number;
    };
}

export type ReplayOutcome =
    | 'replayed'
    | 'rejected'
    | 'already_queued'
    | 'rejected_due_to_state'
    | 'attempt_ceiling_reached'
    | 'unavailable';

export interface ReplayOutboxEventResult {
    readonly outcome: ReplayOutcome;
    readonly eventId: string;
    readonly status?: string;
    readonly reason?: string;
    readonly message?: string;
    readonly replayedAt?: string;
    readonly replayedBy?: string;
}

export type TimelineStageType =
    | 'WEBHOOK_RECEIVED'
    | 'SIGNATURE_VERIFIED'
    | 'INBOX_STORED'
    | 'OUTBOX_ENQUEUED'
    | 'WORKER_PROCESSED'
    | 'LEDGER_RECORDED';

export type TimelineStageStatus =
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING'
    | 'NOT_REACHED';

export interface TimelineStage {
    readonly stage: TimelineStageType;
    readonly title: string;
    readonly status: TimelineStageStatus;
    readonly timestamp: string | null;
    readonly entityId: string | null;
    readonly summary: string;
    readonly data?: Record<string, any>;
    readonly details?: Record<string, any>;
    readonly error?: string | null;
}

// Backward-compatible alias
export type TimelineStep = TimelineStage;

export interface EventTimelineResult {
    readonly merchantId: string;
    readonly rootEventId: string;
    readonly targetEventId?: string;
    readonly generatedAt: string;
    readonly pipelineOutcome: 'SUCCESS' | 'FAILED' | 'PENDING' | 'NOT_REACHED' | 'INCOMPLETE';
    readonly stages: TimelineStage[];
    readonly steps: TimelineStage[];
}
