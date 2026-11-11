import { TransactionSearchResponseSchema } from './schemas';
import type { TransactionSearchResponse, TransactionDetail } from './schemas';
import { PayPalTokenManager } from './token-manager';
import type { HttpRequestFn, HttpResponse } from './token-manager';
import { PayPalError } from './errors';

// Constants

const SANDBOX_SEARCH_URL =
    'https://api-m.sandbox.paypal.com/v1/reporting/transactions';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_PAGES = 100;
const MAX_RANGE_DAYS = 31;
const MAX_RANGE_MS = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;

// Date-range validation

/** ISO 8601 with explicit timezone (Z, +HH:MM, or -HH:MM). */
const ISO_WITH_TZ = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface DateRange {
    startDate: string;
    endDate: string;
}


export function validateDateRange(range: DateRange): void {
    if (!range.startDate || !range.endDate) {
        throw PayPalError.dateRangeInvalid(
            'Both start_date and end_date must be provided',
        );
    }

    if (!ISO_WITH_TZ.test(range.startDate)) {
        throw PayPalError.dateRangeInvalid(
            `start_date must be ISO-8601 with an explicit timezone: "${range.startDate}"`,
        );
    }
    if (!ISO_WITH_TZ.test(range.endDate)) {
        throw PayPalError.dateRangeInvalid(
            `end_date must be ISO-8601 with an explicit timezone: "${range.endDate}"`,
        );
    }

    const start = new Date(range.startDate);
    const end = new Date(range.endDate);

    if (isNaN(start.getTime())) {
        throw PayPalError.dateRangeInvalid(
            `start_date is not a valid date: "${range.startDate}"`,
        );
    }
    if (isNaN(end.getTime())) {
        throw PayPalError.dateRangeInvalid(
            `end_date is not a valid date: "${range.endDate}"`,
        );
    }

    if (start >= end) {
        throw PayPalError.dateRangeInvalid(
            'start_date must be earlier than end_date',
        );
    }

    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
        throw PayPalError.dateRangeInvalid(
            `Date range exceeds PayPal's ${MAX_RANGE_DAYS}-day maximum`,
        );
    }
}

export interface PayPalClientConfig {
    tokenManager: PayPalTokenManager;
    httpRequest: HttpRequestFn;
}

export class PayPalTransactionClient {
    private readonly tokenManager: PayPalTokenManager;
    private readonly httpRequest: HttpRequestFn;

    constructor(config: PayPalClientConfig) {
        this.tokenManager = config.tokenManager;
        this.httpRequest = config.httpRequest;
    }

    async fetchTransactions(range: DateRange): Promise<TransactionDetail[]> {
        this.tokenManager.assertCredentials();
        validateDateRange(range);

        const allDetails: TransactionDetail[] = [];
        let currentPage = 1;
        const visitedPages = new Set<number>();

        while (currentPage <= MAX_PAGES) {
            // Detect repeated pagination.
            if (visitedPages.has(currentPage)) {
                throw PayPalError.paginationLoop(
                    `Page ${currentPage} already visited — pagination loop detected`,
                );
            }
            visitedPages.add(currentPage);

            const response = await this.fetchPage(range, currentPage);

            for (const detail of response.transaction_details) {
                allDetails.push(detail);
            }

            if (currentPage >= response.total_pages) {
                break;
            }

            currentPage++;
        }

        if (currentPage > MAX_PAGES) {
            throw PayPalError.paginationLoop(
                `Exceeded maximum page limit (${MAX_PAGES})`,
            );
        }

        return allDetails;
    }

    private async fetchPage(
        range: DateRange,
        page: number,
    ): Promise<TransactionSearchResponse> {
        const params = new URLSearchParams({
            start_date: range.startDate,
            end_date: range.endDate,
            fields: 'transaction_info',
            balance_affecting_records_only: 'Y',
            page_size: String(Math.min(DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)),
            page: String(page),
        });

        const url = `${SANDBOX_SEARCH_URL}?${params.toString()}`;

        let lastError: Error | undefined;
        let hasRetried401 = false;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await this.backoff(attempt, lastError);
            }
            const token = await this.tokenManager.getToken();

            let response: HttpResponse;
            try {
                response = await this.makeRequest(url, token);
            } catch (err) {
                lastError =
                    err instanceof Error ? err : new Error(String(err));
                continue;
            }

            if (response.status === 200) {
                return this.parseSearchResponse(response);
            }

            if (response.status === 401 && !hasRetried401) {
                hasRetried401 = true;
                await this.tokenManager.forceRefresh();
                attempt--;
                continue;
            }
            if (response.status === 401) {
                throw PayPalError.authFailed(
                    'Authentication failed after token refresh (401)',
                );
            }

            if (response.status === 403) {
                let detail = '';
                try {
                    const parsed = await response.json();
                    detail = typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed) : String(parsed);
                } catch {
                    // ignore
                }
                throw PayPalError.forbidden(
                    `Insufficient permissions for Transaction Search (403)${detail ? `: ${detail}` : ''}`,
                );
            }

            if (response.status === 429) {
                lastError = PayPalError.rateLimited(
                    `Rate limited (429)`,
                );
                continue;
            }

            if (response.status >= 500) {
                lastError = PayPalError.unavailable(
                    `Server error: ${response.status}`,
                );
                continue;
            }

            throw PayPalError.responseInvalid(
                `Unexpected status ${response.status} from Transaction Search`,
            );
        }

        throw (
            lastError ??
            PayPalError.unavailable('Request failed after retries')
        );
    }

    private async makeRequest(
        url: string,
        token: string,
    ): Promise<HttpResponse> {
        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            REQUEST_TIMEOUT_MS,
        );

        try {
            return await this.httpRequest(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw PayPalError.timeout('Transaction Search request timed out');
            }
            throw PayPalError.unavailable(
                `Network error: ${err instanceof Error ? err.message : 'unknown'}`,
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    private async parseSearchResponse(
        response: HttpResponse,
    ): Promise<TransactionSearchResponse> {
        let rawBody: unknown;
        try {
            rawBody = await response.json();
        } catch {
            throw PayPalError.responseInvalid(
                'Transaction Search returned non-JSON body',
            );
        }

        const parsed = TransactionSearchResponseSchema.safeParse(rawBody);
        if (!parsed.success) {
            throw PayPalError.responseInvalid(
                `Transaction Search response validation failed: ${parsed.error.message}`,
            );
        }

        return parsed.data;
    }

    private backoff(attempt: number, lastError?: Error): Promise<void> {
        let delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        delayMs += Math.random() * delayMs * 0.5;
        delayMs = Math.min(delayMs, 10_000);

        return new Promise((resolve) => setTimeout(resolve, delayMs));
    }
}