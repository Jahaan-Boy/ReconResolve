export type ProviderTransactionErrorCode =
    | 'TRANSACTION_NOT_FOUND'
    | 'CONNECTION_NOT_FOUND'
    | 'VALIDATION_FAILED'
    | 'INTERNAL_ERROR';

export class ProviderTransactionError extends Error {
    public readonly statusCode: number;
    public readonly code: ProviderTransactionErrorCode;
    public readonly details?: unknown;

    constructor(statusCode: number, code: ProviderTransactionErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'ProviderTransactionError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, ProviderTransactionError.prototype);
    }

    static notFound(message = 'Provider transaction not found or access denied'): ProviderTransactionError {
        return new ProviderTransactionError(404, 'TRANSACTION_NOT_FOUND', message);
    }

    static connectionNotFound(message = 'Specified provider connection not found or access denied'): ProviderTransactionError {
        return new ProviderTransactionError(404, 'CONNECTION_NOT_FOUND', message);
    }

    static validationFailed(message: string, details?: unknown): ProviderTransactionError {
        return new ProviderTransactionError(400, 'VALIDATION_FAILED', message, details);
    }
}
