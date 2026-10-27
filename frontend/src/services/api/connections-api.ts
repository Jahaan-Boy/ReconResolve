import {
    ApiClientError,
    type ListConnectionsFilter,
    type ListConnectionsResult,
    type ProviderConnectionDetail,
} from './types';
import { notifyUnauthorized } from './auth-api';

export class HttpConnectionsApiClient {
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

    async listConnections(merchantId: string, filter?: ListConnectionsFilter): Promise<ListConnectionsResult> {
        const params = new URLSearchParams();
        if (filter?.provider) params.set('provider', filter.provider);
        if (filter?.status) params.set('status', filter.status);
        if (filter?.cursor) params.set('cursor', filter.cursor);
        if (filter?.limit) params.set('limit', String(filter.limit));

        const queryString = params.toString();
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections${queryString ? `?${queryString}` : ''}`;

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });

        return this.handleResponse<ListConnectionsResult>(res);
    }

    async getConnection(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections/${encodeURIComponent(connectionId)}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });
        return this.handleResponse<ProviderConnectionDetail>(res);
    }
}

export const connectionsApiClient = new HttpConnectionsApiClient();
