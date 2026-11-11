import {
    ApiClientError,
    type DashboardApiClient,
    type DashboardDateRangeFilter,
    type DashboardSummaryResponse,
} from './types';
import { notifyUnauthorized } from './auth-api';

export class HttpDashboardApiClient implements DashboardApiClient {
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

    async getDashboardSummary(
        merchantId: string,
        filter?: DashboardDateRangeFilter,
        signal?: AbortSignal,
    ): Promise<DashboardSummaryResponse> {
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
                credentials: 'same-origin',
                signal,
            });

            return await this.handleResponse<DashboardSummaryResponse>(res);
        } catch (err: unknown) {
            const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { statusCode?: number; status?: number })?.status;
            if (status === 404) {
                // Initial clean state before runs have executed
                return {
                    summary: {
                        reconciledRate: 0,
                        reconciledAmountMinor: 0,
                        unresolvedExposureMinor: 0,
                        breakdown: {
                            exactMatches: 0,
                            partialMatches: 0,
                            ruleBasedMatches: 0,
                            discrepancies: 0,
                        },
                    },
                    latestRun: null,
                    recentRuns: [],
                };
            }
            throw err;
        }
    }
}

export const dashboardApiClient: DashboardApiClient = new HttpDashboardApiClient();
