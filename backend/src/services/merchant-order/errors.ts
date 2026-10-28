export type MerchantOrderErrorCode =
    | 'ORDER_NOT_FOUND'
    | 'ORDER_CONFLICT'
    | 'VALIDATION_FAILED'
    | 'BATCH_LIMIT_EXCEEDED'
    | 'INTERNAL_ERROR';

export class MerchantOrderError extends Error {
    public readonly statusCode: number;
    public readonly code: MerchantOrderErrorCode;
    public readonly details?: unknown;

    constructor(statusCode: number, code: MerchantOrderErrorCode, message: string, details?: unknown) {
        super(message);
        this.name = 'MerchantOrderError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, MerchantOrderError.prototype);
    }

    static notFound(message = 'Merchant order not found or access denied'): MerchantOrderError {
        return new MerchantOrderError(404, 'ORDER_NOT_FOUND', message);
    }

    static conflict(message = 'External order reference conflict', details?: unknown): MerchantOrderError {
        return new MerchantOrderError(409, 'ORDER_CONFLICT', message, details);
    }

    static validationFailed(message: string, details?: unknown): MerchantOrderError {
        return new MerchantOrderError(400, 'VALIDATION_FAILED', message, details);
    }

    static batchLimitExceeded(message = 'Batch limit exceeded: maximum allowed records is 100'): MerchantOrderError {
        return new MerchantOrderError(400, 'BATCH_LIMIT_EXCEEDED', message);
    }

    static internal(message = 'An unexpected internal error occurred'): MerchantOrderError {
        return new MerchantOrderError(500, 'INTERNAL_ERROR', message);
    }
}
