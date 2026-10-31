export type OperationsErrorCode =
    | 'OPERATIONS_INVALID_INPUT'
    | 'OPERATIONS_UNAUTHORIZED'
    | 'OPERATIONS_FORBIDDEN'
    | 'OPERATIONS_EVENT_NOT_FOUND'
    | 'OPERATIONS_REPLAY_CONFLICT'
    | 'OPERATIONS_ERROR';

export class OperationsError extends Error {
    readonly code: OperationsErrorCode;
    readonly statusCode: number;
    readonly details?: unknown;

    constructor(
        code: OperationsErrorCode,
        message: string,
        statusCode = 400,
        details?: unknown,
    ) {
        super(message);
        this.name = 'OperationsError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }

    static invalidInput(message: string, details?: unknown): OperationsError {
        return new OperationsError('OPERATIONS_INVALID_INPUT', message, 400, details);
    }

    static unauthorized(message = 'Authentication required'): OperationsError {
        return new OperationsError('OPERATIONS_UNAUTHORIZED', message, 401);
    }

    static forbidden(message = 'Insufficient permissions to perform operational recovery'): OperationsError {
        return new OperationsError('OPERATIONS_FORBIDDEN', message, 403);
    }

    static notFound(message = 'Outbox event not found or access denied'): OperationsError {
        return new OperationsError('OPERATIONS_EVENT_NOT_FOUND', message, 404);
    }

    static conflict(message: string): OperationsError {
        return new OperationsError('OPERATIONS_REPLAY_CONFLICT', message, 409);
    }

    static internal(message: string, details?: unknown): OperationsError {
        return new OperationsError('OPERATIONS_ERROR', message, 500, details);
    }
}
