import {
    ApiClientError,
    type ListConnectionsFilter,
    type ListConnectionsResult,
    type ProviderConnectionDetail,
} from './types';
import { notifyUnauthorized } from './auth-api';
import { queryCache } from './cache';

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
        const cacheKey = `connections:list:${merchantId}:${JSON.stringify(filter || {})}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const params = new URLSearchParams();
                if (filter?.provider) params.set('provider', filter.provider);
                if (filter?.status) params.set('status', filter.status);
                if (filter?.cursor) params.set('cursor', filter.cursor);
                if (filter?.limit) params.set('limit', String(filter.limit));

                const queryString = params.toString();
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections${queryString ? `?${queryString}` : ''}`;

                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                        },
                        credentials: 'same-origin',
                    });

                    return await this.handleResponse<ListConnectionsResult>(res);
                } catch (err: unknown) {
                    const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { statusCode?: number; status?: number })?.status;
                    if (status === 404) {
                        return {
                            items: [],
                            pagination: {
                                limit: filter?.limit ?? 20,
                                nextCursor: null,
                                hasMore: false,
                            },
                        };
                    }
                    throw err;
                }
            },
            {
                ttl: 30_000,
                staleTtl: 120_000,
                tags: [`connections:${merchantId}`],
            },
        );
    }

    async getConnection(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail> {
        const cacheKey = `connections:detail:${merchantId}:${connectionId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections/${encodeURIComponent(connectionId)}`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                    credentials: 'same-origin',
                });
                return this.handleResponse<ProviderConnectionDetail>(res);
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`connections:${merchantId}`],
            },
        );
    }

    async syncConnection(
        merchantId: string,
        connectionId?: string,
        range?: { from?: string; to?: string },
    ): Promise<{
        status: string;
        summary: {
            fetched: number;
            normalized: number;
            inserted: number;
            updated: number;
            unchanged: number;
            rejected: number;
            rejectedCategories?: Record<string, number>;
        };
    }> {
        const url = connectionId
            ? `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections/${encodeURIComponent(connectionId)}/sync`
            : `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections/sync`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(range || {}),
        });

        const result = await this.handleResponse<{
            status: string;
            summary: {
                fetched: number;
                normalized: number;
                inserted: number;
                updated: number;
                unchanged: number;
                rejected: number;
                rejectedCategories?: Record<string, number>;
            };
        }>(res);

        queryCache.invalidateTag(`connections:${merchantId}`);
        queryCache.invalidateTag(`operations:${merchantId}`);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return result;
    }

    async simulateWebhook(
        merchantId: string,
        payload?: Record<string, unknown>,
    ): Promise<{ status?: string; outcome?: string; webhookEventId?: string; eventId?: string }> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/connections/simulate-webhook`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(payload || {}),
        });
        const result = await this.handleResponse<{
            status?: string;
            outcome?: string;
            webhookEventId?: string;
            eventId?: string;
        }>(res);
        queryCache.invalidateTag(`operations:${merchantId}`);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return result;
    }
}

export const connectionsApiClient = new HttpConnectionsApiClient();
