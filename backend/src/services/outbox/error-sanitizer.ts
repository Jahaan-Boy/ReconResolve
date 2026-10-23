export class TransientError extends Error {
    readonly isTransient = true;

    constructor(message: string, readonly originalError?: unknown) {
        super(message);
        this.name = 'TransientError';
    }
}

export class PermanentError extends Error {
    readonly isTransient = false;

    constructor(message: string, readonly originalError?: unknown) {
        super(message);
        this.name = 'PermanentError';
    }
}

const REDACT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Bearer / OAuth tokens
    { pattern: /Bearer\s+[A-Za-z0-9_\-\.~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
    // Database connection strings
    { pattern: /postgres(ql)?:\/\/[^\s"']+/gi, replacement: 'postgresql://[REDACTED]' },
    // Client secrets or passwords in key=val or json format
    { pattern: /(client_secret|secret|password|authorization)=([^&\s,]+)/gi, replacement: '$1=[REDACTED]' },
    { pattern: /"(client_secret|secret|password|authorization)"\s*:\s*"[^"]+"/gi, replacement: '"$1":"[REDACTED]"' },
];

const KNOWN_TRANSIENT_CODES = new Set([
    'P1001', // Cannot reach database server
    'P1002', // Database server was reached but timed out
    'P1008', // Operations timed out
    'P1017', // Server has closed the connection
    'P2034', // Transaction failed due to write conflict / deadlock
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
]);

export function isTransientError(error: unknown): boolean {
    if (error instanceof TransientError) {
        return true;
    }
    if (error instanceof PermanentError) {
        return false;
    }

    if (typeof error === 'object' && error !== null) {
        const anyError = error as { code?: unknown; isRetryable?: unknown; name?: unknown };
        if (typeof anyError.code === 'string' && KNOWN_TRANSIENT_CODES.has(anyError.code)) {
            return true;
        }
        if (anyError.isRetryable === true) {
            return true;
        }
        if (anyError.name === 'AbortError') {
            return true;
        }
    }

    // Default unclassified errors to transient so transient blips are retried before failure
    return true;
}

export function sanitizeErrorMessage(error: unknown, maxLength: number = 1000): string {
    let rawMessage: string;
    if (error instanceof Error) {
        rawMessage = `${error.name}: ${error.message}`;
    } else if (typeof error === 'string') {
        rawMessage = error;
    } else {
        try {
            rawMessage = JSON.stringify(error);
        } catch {
            rawMessage = String(error);
        }
    }

    let sanitized = rawMessage;
    for (const { pattern, replacement } of REDACT_PATTERNS) {
        sanitized = sanitized.replace(pattern, replacement);
    }

    if (sanitized.length > maxLength) {
        sanitized = sanitized.slice(0, maxLength - 3) + '...';
    }

    return sanitized;
}
