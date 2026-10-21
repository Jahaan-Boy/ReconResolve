import { z } from 'zod';
import type {
    CanonicalTransaction,
    ProviderTransactionType,
    TransactionStatus,
} from '../../domain/transaction';
import type { ImportRecord } from './types';

const STATUSES = [
    'CREATED',
    'APPROVED',
    'PENDING',
    'CAPTURED',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
    'VOIDED',
] as const satisfies readonly TransactionStatus[];

const TYPES = [
    'PAYMENT',
    'CAPTURE',
    'REFUND',
    'REVERSAL',
    'ADJUSTMENT',
    'OTHER',
] as const satisfies readonly ProviderTransactionType[];

export class UnsupportedRecordError extends Error {
    readonly category: string;

    constructor(category: string) {
        super(category);
        this.name = 'UnsupportedRecordError';
        this.category = category;
    }
}

const Shape = z.object({
    providerTxnId: z.string().trim().min(1).max(128),
    providerEventCode: z.string().trim().min(1).max(32),
    providerOrderId: z.string().trim().min(1).max(128).nullable(),
    type: z.enum(TYPES),
    status: z.enum(STATUSES),
    amountMinor: z.bigint(),
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
    feeMinor: z.bigint().nullable(),
    occurredAt: z.date(),
    rawPayload: z.record(z.string(), z.unknown()),
});

export function extractEventCode(rawPayload: unknown): string | null {
    if (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload)) return null;
    const info = (rawPayload as { transaction_info?: unknown }).transaction_info;
    if (typeof info !== 'object' || info === null || Array.isArray(info)) return null;
    const code = (info as { transaction_event_code?: unknown }).transaction_event_code;
    return typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
}

export function toImportRecord(canonical: CanonicalTransaction): ImportRecord {
    const eventCode = extractEventCode(canonical.rawPayload);
    if (!eventCode) {
        throw new UnsupportedRecordError('missing_transaction_event_code');
    }

    const parsed = Shape.safeParse({
        providerTxnId: canonical.providerTxnId,
        providerEventCode: eventCode,
        providerOrderId: canonical.providerOrderId ?? null,
        type: canonical.type,
        status: canonical.status,
        amountMinor: canonical.amountMinor,
        currency: canonical.currency,
        feeMinor: canonical.feeMinor ?? null,
        occurredAt: canonical.occurredAt,
        rawPayload: canonical.rawPayload,
    });

    if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'record'))];
        throw new UnsupportedRecordError(`invalid_field:${fields.sort().join(',')}`);
    }

    return parsed.data;
}