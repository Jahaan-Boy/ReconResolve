import {
    ApiClientError,
    type ListTransactionsFilter,
    type ListTransactionsResult,
    type ProviderTransactionDetail,
} from './types';
import { notifyUnauthorized } from './auth-api';

export class HttpTransactionsApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    private async handleResponse<T>(res: Response): Promise<T> {
        if (!res.ok) {
            let errorData: { error?: string; message?: string; details?: unknown } | null = null;
            try {
                errorData = (await res.json()) as { error?: string; message?: string; details?: unknown };
            } catch {
                // Ignore json parse error
            }

            const code = errorData?.error || `HTTP_${res.status}`;
            const message = errorData?.message || res.statusText || 'Request failed';
            const details = errorData?.details;

            if (res.status === 401) {
                notifyUnauthorized();
            }

            throw new ApiClientError(code, message, res.status, details);
        }

        return (await res.json()) as T;
    }

    async listTransactions(merchantId: string, filter?: ListTransactionsFilter): Promise<ListTransactionsResult> {
        const params = new URLSearchParams();
        if (filter?.connectionId) params.set('connectionId', filter.connectionId);
        if (filter?.status) params.set('status', filter.status);
        if (filter?.type) params.set('type', filter.type);
        if (filter?.currency) params.set('currency', filter.currency);
        if (filter?.from) params.set('from', filter.from);
        if (filter?.to) params.set('to', filter.to);
        if (filter?.providerTxnId) params.set('providerTxnId', filter.providerTxnId);
        if (filter?.providerRecordKey) params.set('providerRecordKey', filter.providerRecordKey);
        if (filter?.providerOrderId) params.set('providerOrderId', filter.providerOrderId);
        if (filter?.cursor) params.set('cursor', filter.cursor);
        if (filter?.limit) params.set('limit', String(filter.limit));

        const queryString = params.toString();
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/transactions${queryString ? `?${queryString}` : ''}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });

        return this.handleResponse<ListTransactionsResult>(res);
    }

    async getTransaction(merchantId: string, transactionId: string): Promise<ProviderTransactionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/transactions/${encodeURIComponent(transactionId)}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });
        return this.handleResponse<ProviderTransactionDetail>(res);
    }
}

export const transactionsApiClient = new HttpTransactionsApiClient();
