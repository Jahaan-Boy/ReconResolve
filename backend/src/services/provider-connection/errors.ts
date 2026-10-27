export type ProviderConnectionErrorCode =
    | 'CONNECTION_NOT_FOUND'
    | 'VALIDATION_FAILED'
    | 'INTERNAL_ERROR';

export class ProviderConnectionError extends Error {
    public readonly statusCode: number;
    public readonly code: ProviderConnectionErrorCode;
    public readonly details?: unknown;

    constructor(statusCode: number, code: ProviderConnectionErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'ProviderConnectionError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, ProviderConnectionError.prototype);
    }

    static notFound(message = 'Provider connection not found or access denied'): ProviderConnectionError {
        return new ProviderConnectionError(404, 'CONNECTION_NOT_FOUND', message);
    }

    static validationFailed(message: string, details?: unknown): ProviderConnectionError {
        return new ProviderConnectionError(400, 'VALIDATION_FAILED', message, details);
    }
}
