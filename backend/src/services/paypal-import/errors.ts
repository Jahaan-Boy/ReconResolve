export const IMPORT_ERROR_CODES = [
    'PAYPAL_SYNC_INVALID_ARGS',
    'PAYPAL_SYNC_MERCHANT_NOT_FOUND',
    'PAYPAL_SYNC_CONNECTION_NOT_FOUND',
    'PAYPAL_SYNC_CONNECTION_AMBIGUOUS',
    'PAYPAL_SYNC_SOURCE_INCONSISTENT',
    'PAYPAL_RECORD_KEY_INVALID',
    'PAYPAL_RECORD_KEY_COLLISION',
    'PAYPAL_SYNC_PERSISTENCE_FAILED',
] as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];
/**
 * An actionable, safe-to-display import error. `originalError` is non-enumerable
 * so JSON logging does not accidentally serialize database/driver internals.
 */
export class ImportError extends Error {
    readonly code: ImportErrorCode;
    readonly fields: readonly string[];
    declare readonly originalError?: unknown;

    constructor(
        code: ImportErrorCode,
        message: string,
        fields: readonly string[] = [],
        originalError?: unknown,
    ) {
        super(message);
        this.name = 'ImportError';
        this.code = code;
        this.fields = fields;

        if (originalError !== undefined) {
            Object.defineProperty(this, 'originalError', {
                value: originalError,
                enumerable: false,
                configurable: false,
                writable: false,
            });
        }
    }
}