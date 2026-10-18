// ---------------------------------------------------------------------------
// Canonical ProviderTransaction — domain-level record.
// Mirrors the Prisma ProviderTransaction model but remains independent of any
// ORM or persistence layer so that provider adapters can construct records
// in-memory without importing Prisma.
// ---------------------------------------------------------------------------

/** Mirrors the Prisma `TransactionStatus` enum. */
export type TransactionStatus =
    | 'CREATED'
    | 'APPROVED'
    | 'PENDING'
    | 'CAPTURED'
    | 'FAILED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'VOIDED';

/** Mirrors the Prisma `ProviderTransactionType` enum. */
export type ProviderTransactionType =
    | 'PAYMENT'
    | 'CAPTURE'
    | 'REFUND'
    | 'REVERSAL'
    | 'ADJUSTMENT'
    | 'OTHER';

/**
 * In-memory canonical transaction record.
 *
 * - Monetary amounts are stored as `bigint` in minor-unit (cents, pence, etc.).
 * - `currency` is an uppercase ISO 4217 three-letter code.
 * - `rawPayload` holds the original provider response for auditability.
 * - `providerOrderId` is only set when the provider reference is confirmed
 *   to be an order-level ID.
 */
export interface CanonicalTransaction {
    /** Provider-native transaction identifier (e.g. PayPal transaction_id). */
    providerTxnId: string;

    /** Provider-native order identifier, if confirmed. */
    providerOrderId?: string;

    /** Canonical transaction type. */
    type: ProviderTransactionType;

    /** Canonical transaction status. */
    status: TransactionStatus;

    /** Gross amount in minor-unit (e.g. cents). Always an integer bigint. */
    amountMinor: bigint;

    /** ISO 4217 currency code, uppercase. */
    currency: string;

    /** Fee amount in minor-unit, if present. */
    feeMinor?: bigint;

    /** When the transaction occurred according to the provider. */
    occurredAt: Date;

    /** Complete original provider record for later persistence. */
    rawPayload: unknown;
}

/**
 * Result of normalizing one provider record. Exactly one of `transaction`
 * or `skipped` will be present.
 */
export type NormalizeResult =
    | { ok: true; transaction: CanonicalTransaction }
    | { ok: false; reason: string; rawPayload: unknown };
