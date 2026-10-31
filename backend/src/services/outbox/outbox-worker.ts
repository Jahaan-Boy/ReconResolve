import { randomUUID } from 'node:crypto';
import type { OutboxConfig } from '../../config/outbox-config';
import { computeNextAttemptAt } from './backoff';
import { isTransientError, sanitizeErrorMessage } from './error-sanitizer';
import type { OutboxEventDispatcher } from './event-dispatcher';
import { JsonOutboxLogger, type OutboxLogger } from './outbox-logger';
import type { ClaimedOutboxRecord, OutboxRepository } from './types';

export interface OutboxWorkerDeps {
    repository: OutboxRepository;
    dispatcher: OutboxEventDispatcher;
    config: OutboxConfig;
    logger?: OutboxLogger;
    workerId?: string;
    randomFn?: () => number;
}

export class OutboxWorker {
    private readonly repository: OutboxRepository;
    private readonly dispatcher: OutboxEventDispatcher;
    private readonly config: OutboxConfig;
    private readonly logger: OutboxLogger;
    private readonly workerId: string;
    private readonly randomFn: () => number;

    private isRunning = false;
    private isPolling = false;
    private isDraining = false;
    private activeWorkCount = 0;
    private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private drainResolvers: Array<() => void> = [];

    constructor(deps: OutboxWorkerDeps) {
        this.repository = deps.repository;
        this.dispatcher = deps.dispatcher;
        this.config = deps.config;
        this.logger = deps.logger ?? new JsonOutboxLogger();
        this.workerId = deps.workerId ?? `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
        this.randomFn = deps.randomFn ?? Math.random;
    }

    get id(): string {
        return this.workerId;
    }

    get running(): boolean {
        return this.isRunning;
    }

    get draining(): boolean {
        return this.isDraining;
    }

    get inFlightCount(): number {
        return this.activeWorkCount;
    }

    start(): void {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.isDraining = false;

        this.logger.info({
            workerId: this.workerId,
            event: 'worker_started',
            batchSize: this.config.batchSize,
            concurrency: this.config.concurrency,
        });

        void this.scheduleNextPoll(0);
    }

    async stop(): Promise<void> {
        if (!this.isRunning && !this.isDraining) {
            return;
        }

        this.isRunning = false;
        this.isDraining = true;

        if (this.pollTimeoutId !== null) {
            clearTimeout(this.pollTimeoutId);
            this.pollTimeoutId = null;
        }

        this.logger.info({
            workerId: this.workerId,
            event: 'worker_stopping',
            inFlightCount: this.activeWorkCount,
        });

        if (this.activeWorkCount === 0) {
            this.isDraining = false;
            return;
        }

        // Wait for in-flight work with bounded drain timeout
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                this.logger.warn({
                    workerId: this.workerId,
                    event: 'drain_timeout_exceeded',
                    inFlightCount: this.activeWorkCount,
                });
                resolve();
            }, this.config.drainTimeoutMs);

            this.drainResolvers.push(() => {
                clearTimeout(timeout);
                resolve();
            });
        });

        this.isDraining = false;
        this.logger.info({
            workerId: this.workerId,
            event: 'worker_stopped',
        });
    }

    /**
     * Executes a single poll-and-process iteration.
     * Guaranteed not to overlap with concurrent poll cycles.
     */
    async pollOnce(): Promise<number> {
        if (!this.isRunning || this.isDraining || this.isPolling) {
            return 0;
        }

        this.isPolling = true;
        let claimedCount = 0;

        try {
            const claimToken = randomUUID();
            const records = await this.repository.claimBatch(
                this.config.batchSize,
                this.config.leaseDurationMs,
                new Date(),
                claimToken,
            );

            claimedCount = records.length;

            if (claimedCount > 0) {
                const concurrency = Math.max(
                    1,
                    Math.min(this.config.concurrency ?? 5, records.length),
                );
                let nextIndex = 0;
                const unstartedRecords: ClaimedOutboxRecord[] = [];

                const runWorkerSlot = async () => {
                    while (nextIndex < records.length) {
                        if (!this.isRunning) {
                            // Worker is shutting down; capture unstarted records to release
                            unstartedRecords.push(records[nextIndex++]);
                            continue;
                        }
                        const record = records[nextIndex++];
                        await this.processRecord(record);
                    }
                };

                // Execute claimed records with bounded worker concurrency
                await Promise.all(
                    Array.from({ length: concurrency }, () => runWorkerSlot()),
                );

                // Release unstarted claims on shutdown so other workers don't wait for lease timeout
                if (unstartedRecords.length > 0 && typeof this.repository.releaseClaim === 'function') {
                    for (const record of unstartedRecords) {
                        try {
                            await this.repository.releaseClaim(record.id, record.claimToken);
                            this.logger.info({
                                workerId: this.workerId,
                                event: 'claim_released_on_shutdown',
                                outboxId: record.id,
                                aggregateId: record.aggregateId,
                                eventType: record.eventType,
                            });
                        } catch (releaseErr) {
                            this.logger.warn({
                                workerId: this.workerId,
                                event: 'claim_release_failed',
                                outboxId: record.id,
                                error: sanitizeErrorMessage(releaseErr),
                            });
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error({
                workerId: this.workerId,
                event: 'poll_error',
                error: sanitizeErrorMessage(error),
            });
        } finally {
            this.isPolling = false;
        }

        return claimedCount;
    }

    private async processRecord(record: ClaimedOutboxRecord): Promise<void> {
        this.activeWorkCount += 1;
        const startedAt = Date.now();

        try {
            const result = await this.dispatcher.dispatch(record);
            const durationMs = Date.now() - startedAt;

            // Commit success using claim-token fencing check
            const committed = await this.repository.markDispatched(record.id, record.claimToken);

            if (!committed) {
                this.logger.warn({
                    workerId: this.workerId,
                    event: 'stale_claim_lost',
                    outboxId: record.id,
                    aggregateId: record.aggregateId,
                    eventType: record.eventType,
                    durationMs,
                });
                return;
            }

            this.logger.info({
                workerId: this.workerId,
                event: 'record_processed',
                outboxId: record.id,
                aggregateId: record.aggregateId,
                eventType: record.eventType,
                outcome: result.outcome,
                durationMs,
            });
        } catch (error) {
            const durationMs = Date.now() - startedAt;
            const transient = isTransientError(error);
            const sanitizedError = sanitizeErrorMessage(error);
            const currentAttempt = record.attemptCount;

            if (transient && currentAttempt < this.config.maxAttempts) {
                const nextAttemptAt = computeNextAttemptAt(
                    currentAttempt,
                    this.config.baseBackoffMs,
                    this.config.maxBackoffMs,
                    new Date(),
                    this.randomFn,
                );

                const scheduled = await this.repository.scheduleRetry(
                    record.id,
                    record.claimToken,
                    nextAttemptAt,
                    sanitizedError,
                );

                if (scheduled) {
                    this.logger.warn({
                        workerId: this.workerId,
                        event: 'retry_scheduled',
                        outboxId: record.id,
                        aggregateId: record.aggregateId,
                        eventType: record.eventType,
                        attempt: currentAttempt,
                        nextAttemptAt: nextAttemptAt.toISOString(),
                        error: sanitizedError,
                        durationMs,
                    });
                }
            } else {
                // Permanent error OR attempt limit exceeded -> Terminal failure
                const failed = await this.repository.markFailed(
                    record.id,
                    record.claimToken,
                    sanitizedError,
                );

                if (failed) {
                    this.logger.error({
                        workerId: this.workerId,
                        event: 'terminal_failure',
                        outboxId: record.id,
                        aggregateId: record.aggregateId,
                        eventType: record.eventType,
                        attempt: currentAttempt,
                        outcome: 'terminal_failure',
                        error: sanitizedError,
                        durationMs,
                    });
                }
            }
        } finally {
            this.activeWorkCount -= 1;
            if (this.activeWorkCount === 0 && this.drainResolvers.length > 0) {
                for (const resolver of this.drainResolvers) {
                    resolver();
                }
                this.drainResolvers = [];
            }
        }
    }

    private async scheduleNextPoll(delayMs: number): Promise<void> {
        if (!this.isRunning || this.isDraining) {
            return;
        }

        this.pollTimeoutId = setTimeout(async () => {
            this.pollTimeoutId = null;
            if (!this.isRunning || this.isDraining) return;

            const processedCount = await this.pollOnce();

            // If we processed items, poll immediately for more; otherwise sleep pollIntervalMs
            const nextDelay = processedCount > 0 ? 0 : this.config.pollIntervalMs;
            void this.scheduleNextPoll(nextDelay);
        }, delayMs);
    }
}
