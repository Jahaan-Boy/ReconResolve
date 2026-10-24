export type ExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';

export type ExceptionType =
    | 'MISSING_PROVIDER_COUNTERPART'
    | 'MISSING_MERCHANT_COUNTERPART'
    | 'AMOUNT_MISMATCH'
    | 'STATUS_DISCREPANCY'
    | 'AMBIGUOUS_MATCH';

export type ExceptionAction = 'RESOLVE' | 'REOPEN' | 'DISMISS' | 'INVESTIGATE';

export interface OperatorContext {
    actorId: string;
    actorType?: 'OPERATOR' | 'SYSTEM' | 'ADMIN';
    roles?: string[];
    authorizedMerchantIds?: string[]; // e.g. ['*'] for superadmin, or array of UUIDs
    correlationId?: string;
}

export interface ListExceptionsFilter {
    status?: ExceptionStatus;
    type?: ExceptionType;
    reconciliationRunId?: string;
    providerTransactionId?: string;
    merchantOrderId?: string;
    createdFrom?: Date;
    createdTo?: Date;
    cursor?: string;
    limit?: number;
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
    details: unknown;
    resolutionNote: string | null;
    resolvedAt: Date | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface LinkedProviderTransactionSummary {
    id: string;
    providerTxnId: string;
    amountMinor: string;
    currency: string;
    status: string;
    occurredAt: Date;
}

export interface LinkedMerchantOrderSummary {
    id: string;
    externalOrderId: string;
    amountMinor: string;
    currency: string;
    status: string;
    orderedAt: Date;
}

export interface LinkedReconciliationRunSummary {
    id: string;
    rulesetVersion: string;
    windowStart: Date;
    windowEnd: Date;
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
    metadata: unknown;
    createdAt: Date;
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
