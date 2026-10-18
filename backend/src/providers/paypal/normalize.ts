import type {
    CanonicalTransaction,
    NormalizeResult,
    TransactionStatus,
    ProviderTransactionType,
} from '../../domain/transaction';
import type { TransactionDetail } from './schemas';
import { toMinorUnits, MoneyConversionError } from './money';

/*
 * Event code families:
 *  T00xx – General purchases / payments
 *  T03xx – Temporary holds
 *  T04xx – Buyers
 *  T05xx – Bonuses & incentives
 *  T07xx – Website payments
 *  T11xx – Reversals / refunds / chargebacks
 *  T12xx – Adjustment (disputes, corrections)
 *  T22xx – Currency conversion
*/

interface CanonicalMapping {
    status: TransactionStatus;
    type: ProviderTransactionType;
}


const STATUS_EVENT_MAP: Record<string, CanonicalMapping> = {
    // ── Successful payments ────────────────────────────────────────────
    'S:T0006': { status: 'CAPTURED', type: 'PAYMENT' },
    'S:T0007': { status: 'CAPTURED', type: 'PAYMENT' },   // Website payment
    'S:T0003': { status: 'CAPTURED', type: 'PAYMENT' },   // Pre-approved payment
    'S:T0000': { status: 'CAPTURED', type: 'PAYMENT' },   // General payment
    'S:T0001': { status: 'CAPTURED', type: 'PAYMENT' },   // Mass payment
    'S:T0002': { status: 'CAPTURED', type: 'PAYMENT' },   // Subscription payment
    'S:T0004': { status: 'CAPTURED', type: 'PAYMENT' },   // eBay auction payment
    'S:T0005': { status: 'CAPTURED', type: 'PAYMENT' },   // Direct payment
    'S:T0008': { status: 'CAPTURED', type: 'PAYMENT' },   // Postage payment
    'S:T0009': { status: 'CAPTURED', type: 'PAYMENT' },   // Gift certificate
    'S:T0010': { status: 'CAPTURED', type: 'PAYMENT' },   // 3rd party logistics
    'S:T0011': { status: 'CAPTURED', type: 'PAYMENT' },   // Mobile payment
    'S:T0012': { status: 'CAPTURED', type: 'PAYMENT' },   // Virtual terminal payment
    'S:T0700': { status: 'CAPTURED', type: 'PAYMENT' },   // General website payment

    // ── Pending payments ───────────────────────────────────────────────
    'P:T0006': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0007': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0003': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0000': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0001': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0002': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0005': { status: 'PENDING', type: 'PAYMENT' },
    'P:T0700': { status: 'PENDING', type: 'PAYMENT' },

    // ── Denied payments ────────────────────────────────────────────────
    'D:T0006': { status: 'FAILED', type: 'PAYMENT' },
    'D:T0007': { status: 'FAILED', type: 'PAYMENT' },
    'D:T0003': { status: 'FAILED', type: 'PAYMENT' },
    'D:T0000': { status: 'FAILED', type: 'PAYMENT' },
    'D:T0005': { status: 'FAILED', type: 'PAYMENT' },
    'D:T0700': { status: 'FAILED', type: 'PAYMENT' },

    // ── Reversals / refunds ────────────────────────────────────────────
    'V:T1106': { status: 'REFUNDED', type: 'REFUND' },    // Payment reversal
    'V:T1107': { status: 'REFUNDED', type: 'REFUND' },    // Payment refund
    'V:T1108': { status: 'REFUNDED', type: 'REFUND' },    // Fee reversal
    'V:T1110': { status: 'REFUNDED', type: 'REVERSAL' },  // Hold reversal
    'V:T1111': { status: 'REFUNDED', type: 'REVERSAL' },  // Chargeback reversal
    'S:T1106': { status: 'REFUNDED', type: 'REFUND' },    // Completed reversal
    'S:T1107': { status: 'REFUNDED', type: 'REFUND' },    // Completed refund
    'S:T1108': { status: 'REFUNDED', type: 'REFUND' },    // Completed fee reversal
    'P:T1107': { status: 'PENDING', type: 'REFUND' },     // Pending refund

    // ── Adjustments ────────────────────────────────────────────────────
    'S:T1201': { status: 'CAPTURED', type: 'ADJUSTMENT' }, // Chargeback
    'S:T1202': { status: 'CAPTURED', type: 'ADJUSTMENT' }, // Chargeback reversal
    'S:T1203': { status: 'CAPTURED', type: 'ADJUSTMENT' }, // Chargeback settlement

    // ── Captures (Order API v2-style) ──────────────────────────────────
    'S:T0400': { status: 'CAPTURED', type: 'CAPTURE' },   // General Buyer credit
    'S:T0401': { status: 'CAPTURED', type: 'CAPTURE' },   // Virtual debit card
};

export function lookupMapping(
    paypalStatus: string,
    eventCode: string,
): CanonicalMapping | undefined {
    const key = `${paypalStatus}:${eventCode}`;
    return STATUS_EVENT_MAP[key];
}


const ORDER_REF_TYPES = new Set(['ODR', 'ORD']);

export function normalizeTransaction(
    detail: TransactionDetail,
): NormalizeResult {
    const info = detail.transaction_info;

    const mapping = lookupMapping(
        info.transaction_status,
        info.transaction_event_code,
    );

    if (!mapping) {
        return {
            ok: false,
            reason: `Unsupported status/event combination: status="${info.transaction_status}" event="${info.transaction_event_code}"`,
            rawPayload: detail,
        };
    }

    const currency = info.transaction_amount.currency_code.toUpperCase();
    let amountMinor: bigint;
    try {
        amountMinor = toMinorUnits(info.transaction_amount.value, currency);
    } catch (err) {
        const msg = err instanceof MoneyConversionError ? err.message : String(err);
        return { ok: false, reason: `Amount conversion failed: ${msg}`, rawPayload: detail };
    }

    let feeMinor: bigint | undefined;
    if (info.fee_amount) {
        const feeCurrency = info.fee_amount.currency_code.toUpperCase();
        try {
            feeMinor = toMinorUnits(info.fee_amount.value, feeCurrency);
        } catch (err) {
            const msg = err instanceof MoneyConversionError ? err.message : String(err);
            return { ok: false, reason: `Fee conversion failed: ${msg}`, rawPayload: detail };
        }
    }

    const occurredAt = new Date(info.transaction_initiation_date);
    if (isNaN(occurredAt.getTime())) {
        return {
            ok: false,
            reason: `Invalid transaction initiation date: "${info.transaction_initiation_date}"`,
            rawPayload: detail,
        };
    }

    let providerOrderId: string | undefined;
    if (
        info.paypal_reference_id &&
        info.paypal_reference_id_type &&
        ORDER_REF_TYPES.has(info.paypal_reference_id_type.toUpperCase())
    ) {
        providerOrderId = info.paypal_reference_id;
    }

    const canonical: CanonicalTransaction = {
        providerTxnId: info.transaction_id,
        type: mapping.type,
        status: mapping.status,
        amountMinor,
        currency,
        occurredAt,
        rawPayload: detail,
        ...(providerOrderId !== undefined && { providerOrderId }),
        ...(feeMinor !== undefined && { feeMinor }),
    };

    return { ok: true, transaction: canonical };
}