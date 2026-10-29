import {
    ApiClientError,
    type DashboardApiClient,
    type DashboardDateRangeFilter,
    type DashboardSummaryResponse,
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
}

export const dashboardApiClient: DashboardApiClient = new AdaptiveDashboardApiClient();
