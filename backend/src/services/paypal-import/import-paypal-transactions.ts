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
    const safeCategory = /^[a-z0-9_.:-]{1,80}$/i.test(category) ? category : 'unsupported_record';
    summary.rejectedCategories[safeCategory] = (summary.rejectedCategories[safeCategory] ?? 0) + by;
}

function* chunk<T>(items: readonly T[], size: number): Generator<T[]> {
    for (let start = 0; start < items.length; start += size) {
        yield items.slice(start, start + size);
    }
}

function validateRequest(request: ImportRequest, batchSize: number): string {
    const merchantSlug = request.merchantSlug.trim();
    if (merchantSlug.length === 0 || merchantSlug.length > 128) {
        throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'A valid --merchant-slug is required.');
    }

    const fromMs = request.from instanceof Date ? request.from.getTime() : Number.NaN;
    const toMs = request.to instanceof Date ? request.to.getTime() : Number.NaN;
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

    return merchantSlug;
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

        // An unkeyable record is fatal: persisting it without a stable key would
        // make reruns unsafe. Do not quietly count an identity failure as a skip.
        const providerRecordKey = deriveProviderRecordKey({
            providerTxnId: record.providerTxnId,
            providerEventCode: record.providerEventCode,
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
    const merchantSlug = validateRequest(request, batchSize);

    // Resolve local tenant/connection before making any provider network request.
    const context = await deps.resolveConnection(merchantSlug);
    const summary = createEmptySummary();
    const range: ImportRange = { from: request.from, to: request.to };

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