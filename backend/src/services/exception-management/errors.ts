export type ExceptionManagementErrorCode =
    | 'FORBIDDEN_TENANT_ACCESS'
    | 'UNAUTHORIZED_OPERATOR'
    | 'EXCEPTION_NOT_FOUND'
    | 'INVALID_STATE_TRANSITION'
    | 'CONCURRENCY_CONFLICT'
    | 'VALIDATION_FAILED'
    | 'INTERNAL_ERROR';

export class ExceptionManagementError extends Error {
    public readonly statusCode: number;
    public readonly code: ExceptionManagementErrorCode;
    public readonly details?: unknown;

    constructor(statusCode: number, code: ExceptionManagementErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'ExceptionManagementError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, ExceptionManagementError.prototype);
    }

    static forbidden(message = 'Access to this merchant scope is forbidden'): ExceptionManagementError {
        return new ExceptionManagementError(403, 'FORBIDDEN_TENANT_ACCESS', message);
    }

    static unauthorized(message = 'Authentication required to access exception management'): ExceptionManagementError {
        return new ExceptionManagementError(401, 'UNAUTHORIZED_OPERATOR', message);
    }

    static notFound(message = 'Exception not found'): ExceptionManagementError {
        return new ExceptionManagementError(404, 'EXCEPTION_NOT_FOUND', message);
    }

    static invalidTransition(
        fromStatus: string,
        toStatus: string,
        action: string,
        reason?: string,
    ): ExceptionManagementError {
        const msg = reason ?? `Illegal exception state transition from ${fromStatus} to ${toStatus} via ${action}`;
        return new ExceptionManagementError(409, 'INVALID_STATE_TRANSITION', msg, { fromStatus, toStatus, action });
    }

    static concurrencyConflict(message = 'Exception has been modified by another process. Please refresh and retry.'): ExceptionManagementError {
        return new ExceptionManagementError(409, 'CONCURRENCY_CONFLICT', message);
    }

    static validationFailed(message: string, details?: unknown): ExceptionManagementError {
        return new ExceptionManagementError(400, 'VALIDATION_FAILED', message, details);
    }
}
