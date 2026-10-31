export interface OutboxRecord {
    id: string;
    merchantId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    status: 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'FAILED' | string;
    attemptCount: number;
    claimToken: string | null;
    lockedAt: Date | null;
    availableAt: Date;
    dispatchedAt: Date | null;
    createdAt: Date;
}

export interface ClaimedOutboxRecord extends OutboxRecord {
    claimToken: string;
}

export interface EventProcessResult {
    outcome: 'processed' | 'ignored';
    details?: string;
}

export interface OutboxEventHandler {
    handle(record: ClaimedOutboxRecord): Promise<EventProcessResult>;
}

export interface OutboxRepository {
    claimBatch(
        batchSize: number,
        leaseDurationMs: number,
        now?: Date,
        claimToken?: string,
    ): Promise<ClaimedOutboxRecord[]>;

    markDispatched(id: string, claimToken: string, now?: Date): Promise<boolean>;

    scheduleRetry(
        id: string,
        claimToken: string,
        nextAvailableAt: Date,
        errorMessage: string,
        now?: Date,
    ): Promise<boolean>;

    markFailed(
        id: string,
        claimToken: string,
        errorMessage: string,
        now?: Date,
    ): Promise<boolean>;

    releaseClaim?(
        id: string,
        claimToken: string,
        now?: Date,
    ): Promise<boolean>;
}
