import type { CanonicalTransaction, NormalizeResult } from '../../domain/transaction';
import type { DateRange } from './client';
import { PayPalTransactionClient } from './client';
import { PayPalTokenManager } from './token-manager';
import type { HttpRequestFn } from './token-manager';
import { normalizeTransaction } from './normalize';

export interface PayPalAdapterConfig {
    clientId: string;
    clientSecret: string;
    httpRequest?: HttpRequestFn;
}

export interface FetchResult {
    transactions: CanonicalTransaction[];
    skipped: Array<{ reason: string; rawPayload: unknown }>;
    totalRawRecords: number;
}

function defaultHttpRequest(): HttpRequestFn {
    return async (url, options) => {
        const resp = await fetch(url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: options.signal,
        });

        const headers: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        return {
            status: resp.status,
            headers,
            json: () => resp.json() as Promise<unknown>,
        };
    };
}

export class PayPalAdapter {
    private readonly client: PayPalTransactionClient;
    private readonly tokenManager: PayPalTokenManager;

    constructor(config: PayPalAdapterConfig) {
        const httpRequest = config.httpRequest ?? defaultHttpRequest();

        this.tokenManager = new PayPalTokenManager({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            httpRequest,
        });

        this.client = new PayPalTransactionClient({
            tokenManager: this.tokenManager,
            httpRequest,
        });
    }

    /**
     * Fetch PayPal Sandbox transactions for the given date range,
     * normalize the supported records, and return them in memory.
     *
     * Does NOT persist to a database.
     */
    async fetchTransactions(range: DateRange): Promise<FetchResult> {
        const rawRecords = await this.client.fetchTransactions(range);

        const transactions: CanonicalTransaction[] = [];
        const skipped: FetchResult['skipped'] = [];

        for (const record of rawRecords) {
            const result: NormalizeResult = normalizeTransaction(record);

            if (result.ok) {
                transactions.push(result.transaction);
            } else {
                skipped.push({
                    reason: result.reason,
                    rawPayload: result.rawPayload,
                });
            }
        }

        return {
            transactions,
            skipped,
            totalRawRecords: rawRecords.length,
        };
    }
}