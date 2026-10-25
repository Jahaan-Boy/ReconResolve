export type ExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

export type ExceptionType =
    | 'MISSING_PROVIDER_COUNTERPART'
    | 'MISSING_MERCHANT_COUNTERPART'
    | 'AMOUNT_MISMATCH'
    | 'STATUS_DISCREPANCY'
    | 'AMBIGUOUS_MATCH';

export type ExceptionAction = 'RESOLVE' | 'REOPEN' | 'DISMISS' | 'INVESTIGATE';

export interface OperatorContext {
    operatorId: string;
    role: string;
    authorizedMerchants?: string[];
    correlationId?: string;
}

export interface ListExceptionsFilter {
    status?: ExceptionStatus;
    type?: ExceptionType;
    reconciliationRunId?: string;
    providerTransactionId?: string;
    merchantOrderId?: string;
    createdFrom?: string;
    createdTo?: string;
    cursor?: string;
    limit?: number;
    search?: string;
}

export interface PaginationMetadata {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
    totalCount?: number;
}

export interface ExceptionSummary {
    id: string;
    merchantId: string;
    reconciliationRunId: string | null;
    type: ExceptionType;
    status: ExceptionStatus;
    providerTransactionId: string | null;
    merchantOrderId: string | null;
    details: Record<string, unknown> | null;
    resolutionNote: string | null;
    resolvedAt: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface LinkedProviderTransactionSummary {
    id: string;
    providerTxnId: string;
    amountMinor: string;
    currency: string;
    status: string;
    occurredAt: string;
}

export interface LinkedMerchantOrderSummary {
    id: string;
    externalOrderId: string;
    amountMinor: string;
    currency: string;
    status: string;
    orderedAt: string;
}

export interface LinkedReconciliationRunSummary {
    id: string;
    rulesetVersion: string;
    windowStart: string;
    windowEnd: string;
    status: string;
}

export interface ExceptionAuditEventSummary {
    id: string;
    merchantId: string;
    exceptionId: string;
    actorId: string;
    actorType: string;
    action: string;
    fromStatus: ExceptionStatus;
    toStatus: ExceptionStatus;
    reason: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}

export interface ExceptionDetail extends ExceptionSummary {
    linkedProviderTransaction?: LinkedProviderTransactionSummary | null;
    linkedMerchantOrder?: LinkedMerchantOrderSummary | null;
    reconciliationRun?: LinkedReconciliationRunSummary | null;
    auditEvents: ExceptionAuditEventSummary[];
}

export interface ListExceptionsResult {
    items: ExceptionSummary[];
    pagination: PaginationMetadata;
}

export interface ResolveExceptionInput {
    resolutionNote: string;
    expectedVersion: number;
}

export interface ReopenExceptionInput {
    reopenReason: string;
    expectedVersion: number;
}

export interface DismissExceptionInput {
    dismissReason: string;
    expectedVersion: number;
}

export interface InvestigateExceptionInput {
    note?: string;
    expectedVersion: number;
}

export interface ApiErrorResponse {
    error: string;
    message: string;
    details?: unknown;
    status?: number;
}

export class ConcurrencyConflictError extends Error {
    readonly code = 'CONCURRENCY_CONFLICT';
    readonly statusCode = 409;
    readonly details?: unknown;

    constructor(message: string, details?: unknown) {
        super(message);
        this.name = 'ConcurrencyConflictError';
        this.details = details;
    }
}

export class ApiClientError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, statusCode: number, details?: unknown) {
        super(message);
        this.name = 'ApiClientError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

export interface ExceptionsApiClient {
    listExceptions(merchantId: string, filter?: ListExceptionsFilter): Promise<ListExceptionsResult>;
    getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail>;
    resolve(merchantId: string, exceptionId: string, input: ResolveExceptionInput, ctx: OperatorContext): Promise<ExceptionDetail>;
    reopen(merchantId: string, exceptionId: string, input: ReopenExceptionInput, ctx: OperatorContext): Promise<ExceptionDetail>;
    dismiss(merchantId: string, exceptionId: string, input: DismissExceptionInput, ctx: OperatorContext): Promise<ExceptionDetail>;
    investigate(merchantId: string, exceptionId: string, input: InvestigateExceptionInput, ctx: OperatorContext): Promise<ExceptionDetail>;
}
