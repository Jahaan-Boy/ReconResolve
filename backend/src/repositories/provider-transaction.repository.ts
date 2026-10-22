import type { Prisma, PrismaClient } from '../generated/prisma';
import { ImportError } from '../services/paypal-import/errors';
import { extractEventCode } from '../services/paypal-import/mapper';
import type {
    ImportContext,
    ImportRecord,
    KeyedImportRecord,
    PersistCounts,
    ProviderTransactionStore,
} from '../services/paypal-import/types';

type StoreDb = Pick<PrismaClient, 'providerTransaction'>;
type Outcome = keyof PersistCounts;

interface ExistingRow {
    providerOrderId: string | null;
    type: string;
    status: string;
    amountMinor: bigint;
    currency: string;
    feeMinor: bigint | null;
    occurredAt: Date;
    rawPayload: unknown;
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([key, inner]) => [key, sortKeys(inner)]),
        );
    }
    return value;
}

function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

function isConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
    if (code !== 'P2002') return false;
    const target = meta?.target;
    const names = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
    return names.some((name) => {
        const cleaned = name.toLowerCase().replace(/_/g, '');
        return (
            cleaned.includes('providertxnid') ||
            cleaned.includes('providerrecordkey') ||
            cleaned.includes('recordkey')
        );
    });
}

function assertSameIdentity(existing: ExistingRow, record: KeyedImportRecord | ImportRecord): void {
    const mismatched: string[] = [];
    if (String(existing.type) !== String(record.type)) mismatched.push('type');
    if (existing.amountMinor !== record.amountMinor) mismatched.push('amountMinor');
    if (existing.currency !== record.currency) mismatched.push('currency');
    if (existing.occurredAt.getTime() !== record.occurredAt.getTime()) mismatched.push('occurredAt');

    const existingEvent = extractEventCode(existing.rawPayload);
    const recordEvent = record.eventCode ?? record.providerEventCode ?? extractEventCode(record.rawPayload);
    if (existingEvent !== null && recordEvent !== undefined && recordEvent !== null && existingEvent !== recordEvent) {
        mismatched.push('eventCode');
    }

    if (mismatched.length > 0) {
        throw new ImportError(
            'PAYPAL_RECORD_KEY_COLLISION',
            'Two materially different provider records share one transaction id; import aborted.',
            mismatched,
        );
    }
}

interface MutableChanges {
    status?: KeyedImportRecord['status'];
    feeMinor?: bigint | null;
    providerOrderId?: string | null;
    rawPayload?: Prisma.InputJsonValue;
}

function diffMutable(existing: ExistingRow, record: KeyedImportRecord | ImportRecord): MutableChanges {
    const changes: MutableChanges = {};
    if (existing.status !== record.status) changes.status = record.status;
    if ((existing.feeMinor ?? null) !== record.feeMinor) changes.feeMinor = record.feeMinor;
    if ((existing.providerOrderId ?? null) !== record.providerOrderId) {
        changes.providerOrderId = record.providerOrderId;
    }
    if (!sameJson(existing.rawPayload, record.rawPayload)) {
        changes.rawPayload = record.rawPayload as Prisma.InputJsonValue;
    }
    return changes;
}

async function persistOne(
    db: StoreDb,
    context: ImportContext,
    record: KeyedImportRecord | ImportRecord,
): Promise<Outcome> {
    const keyedRecord = record as Partial<KeyedImportRecord>;
    const where = keyedRecord.providerRecordKey
        ? {
            providerConnectionId_providerRecordKey: {
                providerConnectionId: context.providerConnectionId,
                providerRecordKey: keyedRecord.providerRecordKey,
            },
        }
        : {
            providerConnectionId_providerTxnId: {
                providerConnectionId: context.providerConnectionId,
                providerTxnId: record.providerTxnId,
            },
        };

    let existing: ExistingRow | null = await (db.providerTransaction.findUnique as Function)({ where });

    if (!existing) {
        try {
            await (db.providerTransaction.create as Function)({
                data: {
                    merchantId: context.merchantId,
                    providerConnectionId: context.providerConnectionId,
                    providerTxnId: record.providerTxnId,
                    ...(keyedRecord.providerRecordKey ? { providerRecordKey: keyedRecord.providerRecordKey } : {}),
                    providerOrderId: record.providerOrderId,
                    type: record.type,
                    status: record.status,
                    amountMinor: record.amountMinor,
                    currency: record.currency,
                    feeMinor: record.feeMinor,
                    occurredAt: record.occurredAt,
                    rawPayload: record.rawPayload as Prisma.InputJsonValue,
                },
            });
            return 'inserted';
        } catch (error) {
            if (!isConflict(error)) throw error;
            existing = await (db.providerTransaction.findUnique as Function)({ where });
            if (!existing) throw error;
        }
    }

    assertSameIdentity(existing, record);

    const changes = diffMutable(existing, record);
    if (Object.keys(changes).length === 0) return 'unchanged';

    await (db.providerTransaction.update as Function)({ where, data: changes });
    return 'updated';
}

export function createProviderTransactionStore(db: StoreDb): ProviderTransactionStore {
    return {
        async persist(context, records) {
            const counts: PersistCounts = { inserted: 0, updated: 0, unchanged: 0 };
            try {
                for (const record of records) {
                    counts[await persistOne(db, context, record)] += 1;
                }
                return counts;
            } catch (error) {
                if (error instanceof ImportError) throw error;
                throw new ImportError(
                    'PAYPAL_SYNC_PERSISTENCE_FAILED',
                    'A database write failed and the import stopped. Re-run the same window to resume safely.',
                    [],
                    error,
                );
            }
        },
    };
}