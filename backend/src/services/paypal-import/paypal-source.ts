import type { PayPalAdapter } from '../../providers/paypal/adapter';
import { ImportError } from './errors';
import type { FetchedPage, ImportRange, TransactionSource } from './types';

function rejectedCategory(reason: string): string {
    const normalized = reason.toLowerCase();
    if (/amount|currency|precision/.test(normalized)) return 'invalid_amount_or_currency';
    if (/status|event.?code/.test(normalized)) return 'unsupported_status_or_event';
    if (/timestamp|date|time/.test(normalized)) return 'invalid_timestamp';
    if (/missing|required|absent/.test(normalized)) return 'missing_required_field';
    if (/schema|shape|parse|invalid/.test(normalized)) return 'invalid_provider_record';
    return 'unsupported_record';
}

export function createPayPalSource(adapter: PayPalAdapter): TransactionSource {
    return {
        async *fetchPages(range: ImportRange): AsyncGenerator<FetchedPage> {
            const startDate = range.startDate ?? range.from?.toISOString();
            const endDate = range.endDate ?? range.to?.toISOString();
            if (!startDate || !endDate) {
                throw new ImportError('PAYPAL_SYNC_INVALID_ARGS', 'Both startDate and endDate are required.');
            }
            const result = await adapter.fetchTransactions({
                startDate,
                endDate,
            });
            if (
                typeof result !== 'object' ||
                result === null ||
                !Array.isArray(result.transactions) ||
                !Array.isArray(result.skipped)
            ) {
                throw new ImportError(
                    'PAYPAL_SYNC_SOURCE_INCONSISTENT',
                    'PayPal adapter returned an invalid result structure; import stopped.',
                );
            }

            const rejected = result.skipped.length;
            if (
                !Number.isSafeInteger(result.totalRawRecords) ||
                result.totalRawRecords < 0 ||
                result.totalRawRecords !== result.transactions.length + rejected
            ) {
                throw new ImportError(
                    'PAYPAL_SYNC_SOURCE_INCONSISTENT',
                    'PayPal adapter returned inconsistent row counts; no rows from this result were persisted.',
                );
            }

            const rejectedCategories: Record<string, number> = {};
            for (const skipped of result.skipped) {
                const category = rejectedCategory(skipped.reason);
                rejectedCategories[category] = (rejectedCategories[category] ?? 0) + 1;
            }

            yield {
                fetched: result.totalRawRecords,
                transactions: result.transactions,
                rejected,
                rejectedCategories,
            };
        },
    };
}
