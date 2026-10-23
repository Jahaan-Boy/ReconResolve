/**
 * Calculates exponential backoff with full jitter according to:
 * delay = random(0, min(maxDelay, baseDelay * 2^(attempt - 1)))
 */
export function calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    randomFn: () => number = Math.random,
): number {
    if (attempt <= 0) {
        return 0;
    }

    // Cap the exponent at 30 to prevent numeric overflow with 2^exponent
    const safeExponent = Math.min(attempt - 1, 30);
    const exponentialDelay = baseDelayMs * Math.pow(2, safeExponent);
    const cappedDelay = Math.min(maxDelayMs, exponentialDelay);

    // Full jitter generates a uniform random integer in [0, cappedDelay]
    return Math.round(randomFn() * cappedDelay);
}

/**
 * Computes the timestamp for the next retry attempt based on current time and backoff delay.
 */
export function computeNextAttemptAt(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    now: Date = new Date(),
    randomFn: () => number = Math.random,
): Date {
    const delayMs = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, randomFn);
    return new Date(now.getTime() + delayMs);
}
