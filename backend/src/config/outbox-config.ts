export interface OutboxConfig {
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly leaseDurationMs: number;
    readonly maxAttempts: number;
    readonly baseBackoffMs: number;
    readonly maxBackoffMs: number;
    readonly drainTimeoutMs: number;
    readonly concurrency: number;
}

export const DEFAULT_OUTBOX_CONFIG: OutboxConfig = {
    pollIntervalMs: 1_000,
    batchSize: 20,
    leaseDurationMs: 30_000,
    maxAttempts: 5,
    baseBackoffMs: 1_000,
    maxBackoffMs: 60_000,
    drainTimeoutMs: 10_000,
    concurrency: 5,
};

function parseBoundedInteger(
    key: string,
    value: string | undefined,
    defaultValue: number,
    min: number,
    max: number,
): number {
    if (!value || value.trim() === '') {
        return defaultValue;
    }
    const parsed = Number(value.trim());
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(
            `[config] ${key} must be an integer between ${min} and ${max} (received: "${value}")`,
        );
    }
    return parsed;
}

export function loadOutboxConfig(env: Record<string, string | undefined> = process.env): OutboxConfig {
    const pollIntervalMs = parseBoundedInteger(
        'OUTBOX_POLL_INTERVAL_MS',
        env['OUTBOX_POLL_INTERVAL_MS'],
        DEFAULT_OUTBOX_CONFIG.pollIntervalMs,
        100,
        60_000,
    );

    const batchSize = parseBoundedInteger(
        'OUTBOX_BATCH_SIZE',
        env['OUTBOX_BATCH_SIZE'],
        DEFAULT_OUTBOX_CONFIG.batchSize,
        1,
        200,
    );

    const leaseDurationMs = parseBoundedInteger(
        'OUTBOX_LEASE_DURATION_MS',
        env['OUTBOX_LEASE_DURATION_MS'],
        DEFAULT_OUTBOX_CONFIG.leaseDurationMs,
        5_000,
        300_000,
    );

    const maxAttempts = parseBoundedInteger(
        'OUTBOX_MAX_ATTEMPTS',
        env['OUTBOX_MAX_ATTEMPTS'],
        DEFAULT_OUTBOX_CONFIG.maxAttempts,
        1,
        20,
    );

    const baseBackoffMs = parseBoundedInteger(
        'OUTBOX_BASE_BACKOFF_MS',
        env['OUTBOX_BASE_BACKOFF_MS'],
        DEFAULT_OUTBOX_CONFIG.baseBackoffMs,
        100,
        30_000,
    );

    const maxBackoffMs = parseBoundedInteger(
        'OUTBOX_MAX_BACKOFF_MS',
        env['OUTBOX_MAX_BACKOFF_MS'],
        DEFAULT_OUTBOX_CONFIG.maxBackoffMs,
        1_000,
        3_600_000,
    );

    const drainTimeoutMs = parseBoundedInteger(
        'OUTBOX_DRAIN_TIMEOUT_MS',
        env['OUTBOX_DRAIN_TIMEOUT_MS'],
        DEFAULT_OUTBOX_CONFIG.drainTimeoutMs,
        1_000,
        60_000,
    );

    const concurrency = parseBoundedInteger(
        'OUTBOX_CONCURRENCY',
        env['OUTBOX_CONCURRENCY'],
        DEFAULT_OUTBOX_CONFIG.concurrency,
        1,
        50,
    );

    // Cross-field validations
    if (baseBackoffMs > maxBackoffMs) {
        throw new Error(
            `[config] OUTBOX_BASE_BACKOFF_MS (${baseBackoffMs}) must not exceed OUTBOX_MAX_BACKOFF_MS (${maxBackoffMs})`,
        );
    }

    return {
        pollIntervalMs,
        batchSize,
        leaseDurationMs,
        maxAttempts,
        baseBackoffMs,
        maxBackoffMs,
        drainTimeoutMs,
        concurrency,
    };
}
