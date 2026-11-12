import {
    ApiClientError,
    type InitiateRunInput,
    type InitiateRunResult,
    type ListMatchesFilter,
    type ListMatchesResult,
    type ListRunsFilter,
    type ListRunsResult,
    type ReconciliationRunSummary,
} from './types';
import { notifyUnauthorized } from './auth-api';
import { queryCache } from './cache';

export class HttpReconciliationApiClient {
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

    async initiateRun(merchantId: string, input: InitiateRunInput): Promise<InitiateRunResult> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/runs`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        const result = await this.handleResponse<InitiateRunResult>(res);
        queryCache.invalidateTag(`reconciliation:${merchantId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        return result;
    }

    async listRuns(merchantId: string, filter?: ListRunsFilter): Promise<ListRunsResult> {
        const cacheKey = `reconciliation:runs:${merchantId}:${JSON.stringify(filter || {})}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const params = new URLSearchParams();
                if (filter?.status) params.set('status', filter.status);
                if (filter?.from) params.set('from', filter.from);
                if (filter?.to) params.set('to', filter.to);
                if (filter?.cursor) params.set('cursor', filter.cursor);
                if (filter?.limit) params.set('limit', String(filter.limit));

                const queryString = params.toString();
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/runs${queryString ? `?${queryString}` : ''}`;

                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                        },
                        credentials: 'same-origin',
                    });

                    return await this.handleResponse<ListRunsResult>(res);
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
                tags: [`reconciliation:${merchantId}`],
            },
        );
    }

    async getRun(merchantId: string, runId: string): Promise<ReconciliationRunSummary> {
        const cacheKey = `reconciliation:run:${merchantId}:${runId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/runs/${encodeURIComponent(runId)}`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                    credentials: 'same-origin',
                });
                return this.handleResponse<ReconciliationRunSummary>(res);
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`reconciliation:${merchantId}`, `run:${runId}`],
            },
        );
    }

    async listMatches(
        merchantId: string,
        runId: string,
        filter?: ListMatchesFilter,
    ): Promise<ListMatchesResult> {
        const cacheKey = `reconciliation:matches:${merchantId}:${runId}:${JSON.stringify(filter || {})}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const params = new URLSearchParams();
                if (filter?.ruleCode) params.set('ruleCode', filter.ruleCode);
                if (filter?.cursor) params.set('cursor', filter.cursor);
                if (filter?.limit) params.set('limit', String(filter.limit));

                const queryString = params.toString();
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/runs/${encodeURIComponent(runId)}/matches${queryString ? `?${queryString}` : ''}`;

                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                        },
                        credentials: 'same-origin',
                    });

                    return await this.handleResponse<ListMatchesResult>(res);
                } catch (err: unknown) {
                    const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { statusCode?: number; status?: number })?.status;
                    if (status === 404) {
                        return {
                            items: [],
                            pagination: {
                                limit: filter?.limit ?? 25,
                                nextCursor: null,
                                hasMore: false,
                            },
                        };
                    }
                    throw err;
                }
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`reconciliation:${merchantId}`, `run:${runId}`],
            },
        );
    }
}

export const reconciliationApiClient = new HttpReconciliationApiClient();
