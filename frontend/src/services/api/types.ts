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

export type ProviderConnectionStatus = 'ACTIVE' | 'DISABLED' | 'NEEDS_REAUTH';
export type ProviderCode = 'PAYPAL';

export interface ProviderConnectionSummary {
    id: string;
    merchantId: string;
    provider: ProviderCode;
    connectionKey: string;
    providerAccountId: string | null;
    status: ProviderConnectionStatus;
    createdAt: string;
    updatedAt: string;
}

export interface ProviderConnectionDetail extends ProviderConnectionSummary {
    syncHealth: {
        status: ProviderConnectionStatus;
        lastTransactionAt: string | null;
        totalTransactions: number;
    };
}

export interface ListConnectionsFilter {
    provider?: ProviderCode;
    status?: ProviderConnectionStatus;
    limit?: number;
    cursor?: string;
}

export interface ListConnectionsResult {
    items: ProviderConnectionSummary[];
    pagination: PaginationMetadata;
}

export type ProviderTransactionType =
    | 'PAYMENT'
    | 'CAPTURE'
    | 'REFUND'
    | 'REVERSAL'
    | 'ADJUSTMENT'
    | 'OTHER';

export type ProviderTransactionStatus =
    | 'CREATED'
    | 'APPROVED'
    | 'PENDING'
    | 'CAPTURED'
    | 'FAILED'
    | 'REFUNDED'
    | 'PARTIALLY_REFUNDED'
    | 'VOIDED';

export interface ProviderTransactionSummary {
    id: string;
    merchantId: string;
    providerConnectionId: string;
    providerTxnId: string;
    providerRecordKey: string;
    providerOrderId: string | null;
    type: ProviderTransactionType;
    status: ProviderTransactionStatus;
    amountMinor: string;
    currency: string;
    feeMinor: string | null;
    occurredAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProviderTransactionDetail extends ProviderTransactionSummary {
    connection: {
        id: string;
        provider: ProviderCode;
        connectionKey: string;
        providerAccountId: string | null;
        status: ProviderConnectionStatus;
    };
}

export interface ListTransactionsFilter {
    connectionId?: string;
    status?: ProviderTransactionStatus;
    type?: ProviderTransactionType;
    currency?: string;
    from?: string;
    to?: string;
    providerTxnId?: string;
    providerRecordKey?: string;
    providerOrderId?: string;
    limit?: number;
    cursor?: string;
}

export interface ListTransactionsResult {
    items: ProviderTransactionSummary[];
    pagination: PaginationMetadata;
}

export type MerchantOrderStatus =
    | 'OPEN'
    | 'PAYMENT_PENDING'
    | 'PAID'
    | 'CANCELLED'
    | 'REFUNDED';

export interface MerchantOrderSummary {
    id: string;
    merchantId: string;
    externalOrderId: string;
    amountMinor: string;
    currency: string;
    status: MerchantOrderStatus;
    orderedAt: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface ListOrdersFilter {
    status?: MerchantOrderStatus;
    currency?: string;
    from?: string;
    to?: string;
    externalOrderId?: string;
    cursor?: string;
    limit?: number;
}

export interface ListOrdersResult {
    items: MerchantOrderSummary[];
    pagination: PaginationMetadata;
}

export interface IngestOrderInput {
    externalOrderId: string;
    amountMinor?: string | number;
    amount?: string;
    currency: string;
    status?: MerchantOrderStatus;
    orderedAt: string;
    metadata?: Record<string, unknown> | null;
}

export interface SingleIngestResult {
    outcome: 'created' | 'duplicate';
    order: MerchantOrderSummary;
}

export interface BatchItemResult {
    index: number;
    externalOrderId: string;
    status: 'created' | 'duplicate' | 'rejected';
    orderId?: string;
    order?: MerchantOrderSummary;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export interface BatchIngestResult {
    summary: {
        received: number;
        created: number;
        duplicates: number;
        rejected: number;
    };
    results: BatchItemResult[];
}

