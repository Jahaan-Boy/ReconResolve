import { createHash } from 'node:crypto';
import { ImportError } from './errors';

export const RECORD_KEY_VERSION = 'v2';

export interface RecordKeyInput {
    providerTxnId: string;
    providerEventCode: string;
    occurredAt: Date;
    amountMinor: bigint;
    currency: string;
}

export function deriveProviderRecordKey(input: RecordKeyInput): string {
    const providerTxnId = input.providerTxnId.trim();
    const providerEventCode = input.providerEventCode.trim();
    const currency = input.currency.trim().toUpperCase();

    if (
        providerTxnId === '' ||
        providerEventCode === '' ||
        !Number.isFinite(input.occurredAt.getTime()) ||
        !/^[A-Z]{3}$/.test(currency)
    ) {
        throw new ImportError(
            'PAYPAL_RECORD_KEY_INVALID',
            'A provider record is missing valid identity fields needed to derive its record key.',
        );
    }

    const canonical = JSON.stringify([
        RECORD_KEY_VERSION,
        'PAYPAL',
        providerTxnId,
        providerEventCode,
        input.occurredAt.toISOString(),
        input.amountMinor.toString(),
        currency,
    ]);
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
    return `${RECORD_KEY_VERSION}:${digest}`;
}
