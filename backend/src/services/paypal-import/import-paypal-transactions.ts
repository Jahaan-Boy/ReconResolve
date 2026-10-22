import type { CanonicalTransaction } from '../../domain/transaction';
import { deriveProviderRecordKey } from './record-key';
import { toImportRecord, UnsupportedRecordError } from './mapper';
import { ImportError } from './errors';
import type {
    ImportContext,
    ImportRange,
    ImportRecord,
    ImportSummary,
    KeyedImportRecord,
    ProviderTransactionStore,
    TransactionSource,
} from './types';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 1_000;
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;

export interface ImportDeps {
    resolveConnection(merchantSlug: string): Promise<ImportContext>;
    source: TransactionSource;
    store: ProviderTransactionStore;
    batchSize?: number;
}

export interface ImportRequest extends ImportRange {
    merchantSlug: string;
}

function createEmptySummary(): ImportSummary {
    return {
        fetched: 0,
        normalized: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        rejected: 0,
        rejectedCategories: {},
    };
}

function bumpCategory(summary: ImportSummary, category: string, by: number): void {
    summary.rejectedCategories[category] = (summary.rejectedCategories[category] ?? 0) + by;
}

function* chunk<T>(items: readonly T[], size: number): Generator<T[]> {
    for (let start = 0; start < items.length; start += size) {
        yield items.slice(start, start + size);
    }
}

function validateRequest(request: ImportRequest, batchSize: number): {
    merchantSlug: string;
    startDate: string;
    endDate: string;
    from: Date;
    to: Date;
} {
    const merchantSlug = request.merchantSlug.trim();
    if (merchantSlug.length === 0 || merchantSlug.length > 128) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'A valid --merchant-slug is required.');
    }

    const startDate = request.startDate ?? (request.from instanceof Date ? request.from.toISOString() : undefined);
    const endDate = request.endDate ?? (request.to instanceof Date ? request.to.toISOString() : undefined);

    if (!startDate || !endDate) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'The import range must contain valid dates with from < to.');
    }

    const fromDate = request.from instanceof Date ? request.from : new Date(startDate);
    const toDate = request.to instanceof Date ? request.to : new Date(endDate);
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();

    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'The import range must contain valid dates with from < to.');
    }
    if (toMs - fromMs > MAX_RANGE_MS) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'The PayPal reporting range must not exceed 31 days.');
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new ImportError(
            'PAYPAL_SYNC_INVALID_ARGS',
            `Batch size must be an integer between 1 and ${MAX_BATCH_SIZE}.`,
        );
    }

    return { merchantSlug, startDate, endDate, from: fromDate, to: toDate };
}

function validateFetchedPage(page: {
    fetched: number;
    transactions: readonly CanonicalTransaction[];
    rejected: number;
}): void {
    if (
        !Number.isSafeInteger(page.fetched) ||
        page.fetched < 0 ||
        !Number.isSafeInteger(page.rejected) ||
        page.rejected < 0 ||
        !Array.isArray(page.transactions) ||
        page.fetched !== page.transactions.length + page.rejected
    ) {
        throw new ImportError(
            'PAYPAL_SYNC_SOURCE_INCONSISTENT',
            'The provider source returned inconsistent row counts; import stopped to avoid a misleading summary.',
        );
    }
}

function validateAndKeyPage(
    transactions: readonly CanonicalTransaction[],
    summary: ImportSummary,
): KeyedImportRecord[] {
    const records: KeyedImportRecord[] = [];
    for (const transaction of transactions) {
        let record: ImportRecord;
        try {
            record = toImportRecord(transaction);
        } catch (error) {
            if (error instanceof UnsupportedRecordError) {
                summary.rejected += 1;
                bumpCategory(summary, error.category, 1);
                continue;
            }
            throw error;
        }

        const eventCode = record.providerEventCode ?? record.eventCode ?? '';
        const providerRecordKey = deriveProviderRecordKey({
            providerTxnId: record.providerTxnId,
            providerEventCode: eventCode,
            occurredAt: record.occurredAt,
            amountMinor: record.amountMinor,
            currency: record.currency,
        });
        records.push({ ...record, providerRecordKey });
    }
    return records;
}

/**
 * Coordinates an idempotent import. Each batch commits independently; this is
 * replay-safe, not an all-or-nothing transaction across every provider page.
 */
export async function importPayPalTransactions(
    deps: ImportDeps,
    request: ImportRequest,
): Promise<ImportSummary> {
    const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
    const validated = validateRequest(request, batchSize);

    // Resolve local tenant/connection before making any provider network request.
    const context = await deps.resolveConnection(validated.merchantSlug);
    const summary = createEmptySummary();
    const range: ImportRange = {
        startDate: validated.startDate,
        endDate: validated.endDate,
        from: validated.from,
        to: validated.to,
    };

    for await (const page of deps.source.fetchPages(range)) {
        validateFetchedPage(page);
        summary.fetched += page.fetched;
        summary.rejected += page.rejected;

        for (const [category, count] of Object.entries(page.rejectedCategories ?? {})) {
            if (!Number.isSafeInteger(count) || count < 0) {
                throw new ImportError(
                    'PAYPAL_SYNC_SOURCE_INCONSISTENT',
                    'The provider source returned an invalid rejected-row count.',
                );
            }
            bumpCategory(summary, category, count);
        }

        const records = validateAndKeyPage(page.transactions, summary);
        summary.normalized += records.length;

        for (const batch of chunk(records, batchSize)) {
            const counts = await deps.store.persist(context, batch);
            summary.inserted += counts.inserted;
            summary.updated += counts.updated;
            summary.unchanged += counts.unchanged;
        }
    }

    if (summary.fetched !== summary.normalized + summary.rejected) {
        throw new ImportError(
            'PAYPAL_SYNC_SOURCE_INCONSISTENT',
            'Import accounting did not balance; inspect source classification before trusting this run.',
        );
    }
    if (summary.normalized !== summary.inserted + summary.updated + summary.unchanged) {
        throw new ImportError(
            'PAYPAL_SYNC_PERSISTENCE_FAILED',
            'Persisted-row counts did not balance; the import result cannot be reported as successful.',
        );
    }

    return summary;
}