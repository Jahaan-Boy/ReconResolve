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

export class HttpExceptionsApiClient implements ExceptionsApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    private buildHeaders(ctx: OperatorContext): HeadersInit {
        const correlationId = ctx.correlationId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}`);
        return {
            'Content-Type': 'application/json',
            'x-operator-id': ctx.operatorId,
            'x-operator-role': ctx.role,
            'x-correlation-id': correlationId,
            'x-authorized-merchants': (ctx.authorizedMerchants ?? ['*']).join(','),
        };
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
            credentials: 'same-origin',
        });

        return this.handleResponse<ListExceptionsResult>(res);
    }

    async getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });
        return this.handleResponse<ExceptionDetail>(res);
    }

    async getAuditEvents(merchantId: string, exceptionId: string): Promise<ExceptionAuditEventSummary[]> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/audit`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
        });
        const data = await this.handleResponse<{ exceptionId: string; auditEvents: ExceptionAuditEventSummary[] }>(res);
        return data.auditEvents;
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
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
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
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
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
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
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
            credentials: 'same-origin',
            body: JSON.stringify(input),
        });
        await this.handleResponse<{ exception: unknown; auditEvent: unknown }>(res);
        return this.getException(merchantId, exceptionId);
    }

    async triggerAiInvestigation(
        merchantId: string,
        exceptionId: string,
        input?: TriggerInvestigationInput,
        signal?: AbortSignal,
    ): Promise<InvestigationRecord> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(input || {}),
            signal,
        });
        const raw = await this.handleResponse<unknown>(res);
        return validateInvestigationRecord(raw);
    }

    async getLatestAiInvestigation(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
    ): Promise<InvestigationRecord | null> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations/latest`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            signal,
        });
        if (res.status === 404) return null;
        const raw = await this.handleResponse<unknown>(res);
        return validateInvestigationRecord(raw);
    }

    async listAiInvestigations(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
    ): Promise<InvestigationRecord[]> {
        const url = `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/exceptions/${encodeURIComponent(exceptionId)}/investigations`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            credentials: 'same-origin',
            signal,
        });
        const data = await this.handleResponse<{ exceptionId: string; investigations: unknown[] }>(res);
        const list = Array.isArray(data?.investigations) ? data.investigations : [];
        return list.map(validateInvestigationRecord);
    }
}
