export const PAYPAL_ERROR_CODES = {
    PAYPAL_CONFIG_MISSING: 'PAYPAL_CONFIG_MISSING',
    PAYPAL_AUTH_FAILED: 'PAYPAL_AUTH_FAILED',
    PAYPAL_FORBIDDEN: 'PAYPAL_FORBIDDEN',
    PAYPAL_RATE_LIMITED: 'PAYPAL_RATE_LIMITED',
    PAYPAL_TIMEOUT: 'PAYPAL_TIMEOUT',
    PAYPAL_UNAVAILABLE: 'PAYPAL_UNAVAILABLE',
    PAYPAL_RESPONSE_INVALID: 'PAYPAL_RESPONSE_INVALID',
    PAYPAL_UNSUPPORTED_RECORD: 'PAYPAL_UNSUPPORTED_RECORD',
    PAYPAL_DATE_RANGE_INVALID: 'PAYPAL_DATE_RANGE_INVALID',
    PAYPAL_PAGINATION_LOOP: 'PAYPAL_PAGINATION_LOOP',
} as const;

export type PayPalErrorCode =
    (typeof PAYPAL_ERROR_CODES)[keyof typeof PAYPAL_ERROR_CODES];

export class PayPalError extends Error {
    readonly code: PayPalErrorCode;

    constructor(code: PayPalErrorCode, message: string) {
        super(message);
        this.name = 'PayPalError';
        this.code = code;
    }

    static configMissing(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_CONFIG_MISSING, message);
    }

    static authFailed(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_AUTH_FAILED, message);
    }

    static forbidden(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_FORBIDDEN, message);
    }

    static rateLimited(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_RATE_LIMITED, message);
    }

    static timeout(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_TIMEOUT, message);
    }

    static unavailable(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_UNAVAILABLE, message);
    }

    static responseInvalid(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_RESPONSE_INVALID, message);
    }

    static unsupportedRecord(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_UNSUPPORTED_RECORD, message);
    }

    static dateRangeInvalid(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_DATE_RANGE_INVALID, message);
    }

    static paginationLoop(message: string): PayPalError {
        return new PayPalError(PAYPAL_ERROR_CODES.PAYPAL_PAGINATION_LOOP, message);
    }
}