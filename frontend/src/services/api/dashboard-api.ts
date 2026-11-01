import {
    ApiClientError,
    type DashboardApiClient,
    type DashboardDateRangeFilter,
    type DashboardSummaryResponse,
    type PortfolioTrendsResponse,
} from './types';
import { notifyUnauthorized } from './auth-api';
import { MockDashboardApiClient } from './mock-exceptions-api';

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

        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            signal,
        });

        return this.handleResponse<DashboardSummaryResponse>(res);
    }

    async getPortfolioTrends(
        merchantId: string,
        preset: '7d' | '30d' | '90d' = '7d',
        signal?: AbortSignal,
    ): Promise<PortfolioTrendsResponse> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/dashboard/portfolio-trends?preset=${preset}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            signal,
        });
        return this.handleResponse<PortfolioTrendsResponse>(res);
    }
}

export class AdaptiveDashboardApiClient implements DashboardApiClient {
    private readonly httpClient: HttpDashboardApiClient;
    private readonly mockClient: MockDashboardApiClient;

    constructor(baseUrl = '') {
        this.httpClient = new HttpDashboardApiClient(baseUrl);
        this.mockClient = new MockDashboardApiClient();
    }

    async getDashboardSummary(
        merchantId: string,
        filter?: DashboardDateRangeFilter,
        signal?: AbortSignal,
    ): Promise<DashboardSummaryResponse> {
        try {
            return await this.httpClient.getDashboardSummary(merchantId, filter, signal);
        } catch (err) {
            if (
                err instanceof TypeError ||
                (err instanceof ApiClientError && err.statusCode === 404)
            ) {
                return await this.mockClient.getDashboardSummary(merchantId, filter);
            }
            throw err;
        }
    }

    async getPortfolioTrends(
        merchantId: string,
        preset: '7d' | '30d' | '90d' = '7d',
        signal?: AbortSignal,
    ): Promise<PortfolioTrendsResponse> {
        try {
            return await this.httpClient.getPortfolioTrends(merchantId, preset, signal);
        } catch {
            return {
                merchantId,
                generatedAt: new Date().toISOString(),
                status: 'READY',
                window: { preset, windowStart: new Date(Date.now() - 7 * 86400000).toISOString(), windowEnd: new Date().toISOString() },
                totalRunsConsidered: 2,
                completedRunsCount: 2,
                incompleteRuns: [],
                trendPoints: [
                    {
                        runId: 'mock-r1',
                        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
                        status: 'COMPLETED',
                        rulesetVersion: 'v1',
                        totalConsidered: 100,
                        eligibleCount: 95,
                        matchedCount: 92,
                        unmatchedCount: 3,
                        ambiguousCount: 0,
                        excludedCount: 5,
                        matchRatePercentage: 96.84,
                    },
                    {
                        runId: 'mock-r2',
                        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
                        status: 'COMPLETED',
                        rulesetVersion: 'v1',
                        totalConsidered: 120,
                        eligibleCount: 110,
                        matchedCount: 108,
                        unmatchedCount: 2,
                        ambiguousCount: 0,
                        excludedCount: 10,
                        matchRatePercentage: 98.18,
                    },
                ],
                lifecycleFlow: {
                    inflowCount: 5,
                    outflowCount: 3,
                    resolvedCount: 2,
                    dismissedCount: 1,
                    reopenedCount: 0,
                    netActiveDelta: 2,
                },
                recurringPatterns: [
                    {
                        fingerprint: 'fp-fee-variance',
                        type: 'AMOUNT_MISMATCH',
                        reasonCode: 'FEE_VARIANCE',
                        currency: 'USD',
                        count: 4,
                        totalAmountMinor: '1200',
                    },
                ],
                currencyExposures: {
                    USD: { currency: 'USD', totalAmountMinor: '34500', count: 3, decimalPlaces: 2 },
                    EUR: { currency: 'EUR', totalAmountMinor: '12000', count: 1, decimalPlaces: 2 },
                },
            };
        }
    }
}

export const dashboardApiClient: DashboardApiClient = new AdaptiveDashboardApiClient();
