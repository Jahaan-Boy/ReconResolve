import {
    ApiClientError,
    ConcurrencyConflictError,
    type ExceptionAuditEventSummary,
    type ExceptionDetail,
    type ExceptionsApiClient,
    type ListExceptionsFilter,
    type ListExceptionsResult,
    type OperatorContext,
    type ResolveExceptionInput,
    type ReopenExceptionInput,
    type DismissExceptionInput,
    type InvestigateExceptionInput,
    type InvestigationRecord,
    type TriggerInvestigationInput,
} from './types';
import { validateInvestigationRecord } from './investigation-validator';
import { notifyUnauthorized } from './auth-api';
import { queryCache } from './cache';
import { API_BASE_URL } from './config';

export class HttpExceptionsApiClient implements ExceptionsApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    private buildHeaders(ctx?: OperatorContext): Record<string, string> {
        const correlationId = ctx?.correlationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}`);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-correlation-id': correlationId,
        };
        if (ctx) {
            headers['x-operator-id'] = ctx.operatorId;
            headers['x-operator-role'] = ctx.role;
            headers['x-authorized-merchants'] = (ctx.authorizedMerchants ?? ['*']).join(',');
        }
        return headers;
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

            if (res.status === 409 && (code === 'CONCURRENCY_CONFLICT' || code.includes('CONFLICT'))) {
                throw new ConcurrencyConflictError(message, details);
            }

            throw new ApiClientError(code, message, res.status, details);
        }

        return (await res.json()) as T;
    }

    async listExceptions(merchantId: string, filter?: ListExceptionsFilter): Promise<ListExceptionsResult> {
        const cacheKey = `exceptions:list:${merchantId}:${JSON.stringify(filter || {})}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const params = new URLSearchParams();
                if (filter?.status) params.set('status', filter.status);
                if (filter?.type) params.set('type', filter.type);
                if (filter?.reconciliationRunId) params.set('reconciliationRunId', filter.reconciliationRunId);
                if (filter?.providerTransactionId) params.set('providerTransactionId', filter.providerTransactionId);
                if (filter?.merchantOrderId) params.set('merchantOrderId', filter.merchantOrderId);
                if (filter?.createdFrom) params.set('createdFrom', filter.createdFrom);
                if (filter?.createdTo) params.set('createdTo', filter.createdTo);
                if (filter?.search) params.set('search', filter.search);
                if (filter?.cursor) params.set('cursor', filter.cursor);
                if (filter?.limit) params.set('limit', String(filter.limit));

                const queryString = params.toString();
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions${queryString ? `?${queryString}` : ''}`;

                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                    credentials: 'include',
                });

                return this.handleResponse<ListExceptionsResult>(res);
            },
            {
                ttl: 30_000,
                staleTtl: 120_000,
                tags: [`exceptions:${merchantId}`],
            },
        );
    }

    async getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail> {
        const cacheKey = `exceptions:detail:${merchantId}:${exceptionId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                    credentials: 'include',
                });
                return this.handleResponse<ExceptionDetail>(res);
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`exceptions:${merchantId}`, `exception:${exceptionId}`],
            },
        );
    }

    async getAuditEvents(merchantId: string, exceptionId: string): Promise<ExceptionAuditEventSummary[]> {
        const cacheKey = `exceptions:audit:${merchantId}:${exceptionId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/audit`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                    },
                    credentials: 'include',
                });
                const data = await this.handleResponse<{ exceptionId: string; auditEvents: ExceptionAuditEventSummary[] }>(res);
                return data.auditEvents;
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`exceptions:${merchantId}`, `exception:${exceptionId}`],
            },
        );
    }

    async resolve(
        merchantId: string,
        exceptionId: string,
        input: ResolveExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/resolve`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(ctx),
            credentials: 'include',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`exception:${exceptionId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return this.getException(merchantId, exceptionId);
    }

    async reopen(
        merchantId: string,
        exceptionId: string,
        input: ReopenExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/reopen`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(ctx),
            credentials: 'include',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`exception:${exceptionId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return this.getException(merchantId, exceptionId);
    }

    async dismiss(
        merchantId: string,
        exceptionId: string,
        input: DismissExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/dismiss`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(ctx),
            credentials: 'include',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`exception:${exceptionId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return this.getException(merchantId, exceptionId);
    }

    async investigate(
        merchantId: string,
        exceptionId: string,
        input: InvestigateExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigate`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(ctx),
            credentials: 'include',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
        queryCache.invalidateTag(`exceptions:${merchantId}`);
        queryCache.invalidateTag(`exception:${exceptionId}`);
        queryCache.invalidateTag(`dashboard:${merchantId}`);
        return this.getException(merchantId, exceptionId);
    }

    async triggerAiInvestigation(
        merchantId: string,
        exceptionId: string,
        input?: TriggerInvestigationInput,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations`;
        const res = await fetch(url, {
            method: 'POST',
            headers: this.buildHeaders(ctx),
            credentials: 'include',
            body: JSON.stringify(input || {}),
            signal,
        });
        const raw = await this.handleResponse<unknown>(res);
        queryCache.invalidateTag(`exception:${exceptionId}`);
        return validateInvestigationRecord(raw);
    }

    async getLatestAiInvestigation(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord | null> {
        const cacheKey = `exceptions:ai:latest:${merchantId}:${exceptionId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations/latest`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: this.buildHeaders(ctx),
                    credentials: 'include',
                    signal,
                });
                if (res.status === 404) return null;
                const raw = await this.handleResponse<unknown>(res);
                return validateInvestigationRecord(raw);
            },
            {
                ttl: 60_000,
                staleTtl: 180_000,
                tags: [`exceptions:${merchantId}`, `exception:${exceptionId}`],
            },
        );
    }

    async listAiInvestigations(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord[]> {
        const cacheKey = `exceptions:ai:list:${merchantId}:${exceptionId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations`;
                const res = await fetch(url, {
                    method: 'GET',
                    headers: this.buildHeaders(ctx),
                    credentials: 'include',
                    signal,
                });
                const data = await this.handleResponse<{ exceptionId: string; investigations: unknown[] }>(res);
                const list = Array.isArray(data?.investigations) ? data.investigations : [];
                return list.map(validateInvestigationRecord);
            },
            {
                ttl: 60_000,
                staleTtl: 180_000,
                tags: [`exceptions:${merchantId}`, `exception:${exceptionId}`],
            },
        );
    }
}
