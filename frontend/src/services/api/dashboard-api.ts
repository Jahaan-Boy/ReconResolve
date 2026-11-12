import {
    ApiClientError,
    type DashboardApiClient,
    type DashboardDateRangeFilter,
    type DashboardSummaryResponse,
} from './types';
import { notifyUnauthorized } from './auth-api';
import { queryCache } from './cache';
import { API_BASE_URL } from './config';

export class HttpDashboardApiClient implements DashboardApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = API_BASE_URL) {
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

    async getDashboardSummary(
        merchantId: string,
        filter?: DashboardDateRangeFilter,
        signal?: AbortSignal,
        forceRefresh?: boolean,
    ): Promise<DashboardSummaryResponse> {
        const cacheKey = `dashboard:summary:${merchantId}:${filter?.from || ''}:${filter?.to || ''}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const params = new URLSearchParams();
                if (filter?.from) params.set('from', filter.from);
                if (filter?.to) params.set('to', filter.to);

                const queryString = params.toString();
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/dashboard/summary${queryString ? `?${queryString}` : ''}`;

                try {
                    const res = await fetch(url, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json',
                        },
                        credentials: 'include',
                        signal,
                    });

                    return await this.handleResponse<DashboardSummaryResponse>(res);
                } catch (err: unknown) {
                    const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { statusCode?: number; status?: number })?.status;
                    if (status === 404) {
                        return {
                            range: {
                                from: filter?.from ?? null,
                                to: filter?.to ?? null,
                            },
                            generatedAt: new Date().toISOString(),
                            summary: {
                                runCount: 0,
                                completedRunCount: 0,
                                failedRunCount: 0,
                                inProgressRunCount: 0,
                                openExceptionCount: 0,
                                totalConsideredSum: 0,
                                totalMatchedSum: 0,
                                periodMatchRatePercentage: null,
                            },
                            latestRun: null,
                            trend: [],
                        };
                    }
                    throw err;
                }
            },
            {
                ttl: 30_000,
                staleTtl: 120_000,
                forceRefresh,
                tags: [`dashboard:${merchantId}`],
            },
        );
    }
}

export const dashboardApiClient: DashboardApiClient = new HttpDashboardApiClient();
