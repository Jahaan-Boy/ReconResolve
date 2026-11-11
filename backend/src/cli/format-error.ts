import { PayPalError } from '../providers/paypal/errors';
import { ImportError } from '../services/paypal-import/errors';

export interface SanitizedError {
    code: string;
    message: string;
    fields?: readonly string[];
}

/**
 * Only stable codes and authored messages are ever printed. The original error
 * message is never forwarded: it may contain response bodies, SQL or URLs.
 */
export function sanitizeError(error: unknown): SanitizedError {
    if (error instanceof ImportError) {
        return {
            code: error.code,
            message: error.message,
            ...(error.fields.length > 0 ? { fields: error.fields } : {}),
        };
    }

    if (error instanceof PayPalError) {
        if (error.code === 'PAYPAL_FORBIDDEN') {
            return {
                code: error.code,
                message:
                    `PayPal 403 Forbidden: Transaction Search permission is not enabled on this app. Go to developer.paypal.com -> Apps & Credentials -> Select your Sandbox App -> App Settings / Features -> Enable "Transaction Search" and click Save. Detail: ${error.message}`,
            };
        }

        return {
            code: error.code,
            message:
                error.message ||
                'The PayPal request failed. Verify the sandbox credentials in .env and the requested window, then retry.',
        };
    }

    return {
        code: 'PAYPAL_SYNC_UNEXPECTED_ERROR',
        message: 'Unexpected failure. The import is idempotent: re-run with the same arguments.',
    };
}