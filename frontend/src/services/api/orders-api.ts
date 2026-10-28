import {
    ApiClientError,
    type BatchIngestResult,
    type IngestOrderInput,
    type ListOrdersFilter,
    type ListOrdersResult,
    type MerchantOrderSummary,
    type SingleIngestResult,
} from './types';
import { notifyUnauthorized } from './auth-api';

export class HttpOrdersApiClient {
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

    async listOrders(merchantId: string, filter?: ListOrdersFilter): Promise<ListOrdersResult> {
        const params = new URLSearchParams();
        if (filter?.status) params.set('status', filter.status);
        if (filter?.currency) params.set('currency', filter.currency);
        if (filter?.from) params.set('from', filter.from);
        if (filter?.to) params.set('to', filter.to);
        if (filter?.externalOrderId) params.set('externalOrderId', filter.externalOrderId);
        if (filter?.cursor) params.set('cursor', filter.cursor);
        if (filter?.limit) params.set('limit', String(filter.limit));

        const queryString = params.toString();
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/orders${queryString ? `?${queryString}` : ''}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });

        return this.handleResponse<ListOrdersResult>(res);
    }

    async getOrder(merchantId: string, orderId: string): Promise<MerchantOrderSummary> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/orders/${encodeURIComponent(orderId)}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });
        return this.handleResponse<MerchantOrderSummary>(res);
    }

    async ingestSingleOrder(merchantId: string, input: IngestOrderInput): Promise<SingleIngestResult> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/orders`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        return this.handleResponse<SingleIngestResult>(res);
    }

    async ingestBatchOrders(merchantId: string, orders: IngestOrderInput[]): Promise<BatchIngestResult> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/orders/bulk`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify({ orders }),
        });
        return this.handleResponse<BatchIngestResult>(res);
    }
}

export const ordersApiClient = new HttpOrdersApiClient();
