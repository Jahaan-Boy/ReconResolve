export const RECONCILIATION_ERROR_CODES = [
    'RECON_INVALID_INPUT',
    'RECON_MERCHANT_NOT_FOUND',
    'RECON_CONNECTION_NOT_FOUND',
    'RECON_PERSISTENCE_FAILED',
    'RECON_IDEMPOTENCY_CONFLICT',
    'RECON_RUN_IN_PROGRESS',
    'RECON_RUN_FAILED',
] as const;

export type ReconciliationErrorCode = (typeof RECONCILIATION_ERROR_CODES)[number];

export class ReconciliationError extends Error {
    readonly code: ReconciliationErrorCode;
    readonly fields: readonly string[];
    declare readonly originalError?: unknown;

    constructor(
        code: ReconciliationErrorCode,
        message: string,
        fields: readonly string[] = [],
        originalError?: unknown,
    ) {
        super(message);
        this.name = 'ReconciliationError';
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
