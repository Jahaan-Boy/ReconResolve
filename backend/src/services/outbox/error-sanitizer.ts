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

const PERMANENT_ERROR_CODES = new Set([
    'INVALID_SIGNATURE',
    'INVALID_JSON',
    'INVALID_REQUEST_BODY',
    'INVALID_EVENT_ENVELOPE',
    'INVALID_CERT_URL',
    'VALIDATION_FAILED',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONNECTION_NOT_FOUND',
]);

export function isTransientError(error: unknown): boolean {
    if (error instanceof TransientError) {
        return true;
    }
    if (error instanceof PermanentError) {
        return false;
    }
    if (error instanceof SyntaxError) {
        return false;
    }

    if (typeof error === 'object' && error !== null) {
        const anyError = error as {
            code?: unknown;
            status?: unknown;
            statusCode?: unknown;
            isRetryable?: unknown;
            isTransient?: unknown;
            name?: unknown;
        };

        if (anyError.isTransient === false || anyError.isRetryable === false) {
            return false;
        }

        if (anyError.name === 'ZodError') {
            return false;
        }

        const status =
            typeof anyError.status === 'number'
                ? anyError.status
                : typeof anyError.statusCode === 'number'
                ? anyError.statusCode
                : null;
        if (status !== null) {
            if (status === 408 || status === 429) {
                return true;
            }
            if (status >= 400 && status < 500) {
                return false;
            }
            if (status >= 500) {
                return true;
            }
        }

        if (typeof anyError.code === 'string') {
            if (KNOWN_TRANSIENT_CODES.has(anyError.code)) {
                return true;
            }
            if (PERMANENT_ERROR_CODES.has(anyError.code)) {
                return false;
            }
        }

        if (anyError.isRetryable === true || anyError.isTransient === true) {
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
