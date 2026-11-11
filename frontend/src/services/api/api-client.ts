import { HttpExceptionsApiClient } from './exceptions-api';
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
    InvestigationRecord,
    TriggerInvestigationInput,
} from './types';

export type ApiSource = 'live';

class LiveExceptionsApiClient implements ExceptionsApiClient {
    private readonly httpClient: HttpExceptionsApiClient;
    readonly source: ApiSource = 'live';

    constructor() {
        this.httpClient = new HttpExceptionsApiClient('');
    }

    setSource(_source: ApiSource) {
        // Always live
    }

    subscribe(_listener: (source: ApiSource) => void): () => void {
        return () => undefined;
    }

    async detectBackend(): Promise<boolean> {
        return true;
    }

    async listExceptions(merchantId: string, filter?: ListExceptionsFilter): Promise<ListExceptionsResult> {
        try {
            return await this.httpClient.listExceptions(merchantId, filter);
        } catch (err: unknown) {
            const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { statusCode?: number; status?: number })?.status;
            if (status === 404) {
                // If tenant has no recorded exceptions yet, return clean empty list
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
    }

    async getAuditEvents(merchantId: string, exceptionId: string): Promise<ExceptionAuditEventSummary[]> {
        return this.httpClient.getAuditEvents(merchantId, exceptionId);
    }

    async getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail> {
        return this.httpClient.getException(merchantId, exceptionId);
    }

    async resolve(
        merchantId: string,
        exceptionId: string,
        input: ResolveExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.httpClient.resolve(merchantId, exceptionId, input, ctx);
    }

    async reopen(
        merchantId: string,
        exceptionId: string,
        input: ReopenExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.httpClient.reopen(merchantId, exceptionId, input, ctx);
    }

    async dismiss(
        merchantId: string,
        exceptionId: string,
        input: DismissExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.httpClient.dismiss(merchantId, exceptionId, input, ctx);
    }

    async investigate(
        merchantId: string,
        exceptionId: string,
        input: InvestigateExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        return this.httpClient.investigate(merchantId, exceptionId, input, ctx);
    }

    async triggerAiInvestigation(
        merchantId: string,
        exceptionId: string,
        input?: TriggerInvestigationInput,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord> {
        return this.httpClient.triggerAiInvestigation(merchantId, exceptionId, input, signal, ctx);
    }

    async getLatestAiInvestigation(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord | null> {
        return this.httpClient.getLatestAiInvestigation(merchantId, exceptionId, signal, ctx);
    }

    async listAiInvestigations(
        merchantId: string,
        exceptionId: string,
        signal?: AbortSignal,
        ctx?: OperatorContext,
    ): Promise<InvestigationRecord[]> {
        return this.httpClient.listAiInvestigations(merchantId, exceptionId, signal, ctx);
    }
}

export const adaptiveApiClient = new LiveExceptionsApiClient();
