export type CopilotErrorCode =
    | 'VALIDATION_FAILED'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'SESSION_ARCHIVED'
    | 'READ_ONLY_VIOLATION'
    | 'PERSISTENCE_ERROR'
    | 'EVIDENCE_UNAVAILABLE'
    | 'INTERNAL_ERROR';

export class CopilotError extends Error {
    readonly code: CopilotErrorCode;
    readonly statusCode: number;
    readonly details?: unknown;

    constructor(
        code: CopilotErrorCode,
        message: string,
        statusCode: number,
        details?: unknown,
    ) {
        super(message);
        this.name = 'CopilotError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }

    static validationFailed(message: string, details?: unknown): CopilotError {
        return new CopilotError('VALIDATION_FAILED', message, 400, details);
    }

    static unauthorized(message = 'Authentication required'): CopilotError {
        return new CopilotError('UNAUTHORIZED', message, 401);
    }

    static forbidden(message = 'Access forbidden'): CopilotError {
        return new CopilotError('FORBIDDEN', message, 403);
    }

    static notFound(message = 'Session or evidence not found'): CopilotError {
        return new CopilotError('NOT_FOUND', message, 404);
    }

    static sessionArchived(message = 'Session is archived. Cannot append messages.'): CopilotError {
        return new CopilotError('SESSION_ARCHIVED', message, 409);
    }

    static readOnlyViolation(message: string): CopilotError {
        return new CopilotError('READ_ONLY_VIOLATION', message, 400);
    }

    static persistenceError(message: string, details?: unknown): CopilotError {
        return new CopilotError('PERSISTENCE_ERROR', message, 500, details);
    }
}

