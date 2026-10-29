import { HttpExceptionsApiClient } from './exceptions-api';
import { MockExceptionsApiClient } from './mock-exceptions-api';
import type {
    ExceptionsApiClient,
    ExceptionAuditEventSummary,
    ExceptionDetail,
    ListExceptionsFilter,
    ListExceptionsResult,
    OperatorContext,
    ResolveExceptionInput,
    ReopenExceptionInput,
    DismissExceptionInput,
    InvestigateExceptionInput,
} from './types';

export type ApiSource = 'live' | 'mock';

class AdaptiveExceptionsApiClient implements ExceptionsApiClient {
    private readonly httpClient: HttpExceptionsApiClient;
    private readonly mockClient: MockExceptionsApiClient;
    private currentSource: ApiSource = 'mock'; // Default to mock until live is verified or selected
    private hasVerifiedLive = false;
    private listeners = new Set<(source: ApiSource) => void>();

    constructor() {
        this.httpClient = new HttpExceptionsApiClient('');
        this.mockClient = new MockExceptionsApiClient();
    }

    get source(): ApiSource {
        return this.currentSource;
    }

    setSource(source: ApiSource) {
        if (this.currentSource !== source) {
            this.currentSource = source;
            this.notify();
        }
    }

    subscribe(listener: (source: ApiSource) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach((l) => l(this.currentSource));
    }

    async detectBackend(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const res = await fetch('/health', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                this.currentSource = 'live';
                this.hasVerifiedLive = true;
                this.notify();
                return true;
            }
        } catch {
            // Live backend unavailable
        }
        this.currentSource = 'mock';
        this.hasVerifiedLive = false;
        this.notify();
        return false;
    }

    private getActiveClient(): ExceptionsApiClient {
        return this.currentSource === 'live' ? this.httpClient : this.mockClient;
    }

    async listExceptions(merchantId: string, filter?: ListExceptionsFilter): Promise<ListExceptionsResult> {
        // If not verified yet, attempt live check once
        if (!this.hasVerifiedLive) {
            await this.detectBackend();
        }
        try {
            return await this.getActiveClient().listExceptions(merchantId, filter);
        } catch (err) {
            // If live failed with network error, fallback to mock and notify
            if (this.currentSource === 'live' && err instanceof TypeError) {
                console.warn('[AdaptiveExceptionsApiClient] Backend unreachable, falling back to mock adapter.');
                this.setSource('mock');
                return await this.mockClient.listExceptions(merchantId, filter);
            }
            throw err;
        }
    }

    async getAuditEvents(merchantId: string, exceptionId: string): Promise<ExceptionAuditEventSummary[]> {
        return this.getActiveClient().getAuditEvents(merchantId, exceptionId);
    }

    async getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail> {
        return this.getActiveClient().getException(merchantId, exceptionId);
    }

    async resolve(
        merchantId: string,
        exceptionId: string,
        input: ResolveExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.getActiveClient().resolve(merchantId, exceptionId, input, ctx);
    }

    async reopen(
        merchantId: string,
        exceptionId: string,
        input: ReopenExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.getActiveClient().reopen(merchantId, exceptionId, input, ctx);
    }

    async dismiss(
        merchantId: string,
        exceptionId: string,
        input: DismissExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.getActiveClient().dismiss(merchantId, exceptionId, input, ctx);
    }

    async investigate(
        merchantId: string,
        exceptionId: string,
        input: InvestigateExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.getActiveClient().investigate(merchantId, exceptionId, input, ctx);
    }
}

export const adaptiveApiClient = new AdaptiveExceptionsApiClient();
