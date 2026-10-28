export type MatchRuleCode =
    | 'EXACT_PROVIDER_ORDER_REFERENCE'
    | 'EXACT_TRANSACTION_REFERENCE'
    | 'EXACT_AMOUNT_CURRENCY_TIME_WINDOW';

export type MatchDecision =
    | {
          kind: 'matched';
          ruleCode: MatchRuleCode;
          orderId: string;
          evidence: Record<string, string | number | boolean>;
      }
    | {
          kind: 'unmatched';
          reasonCode: 'NO_CANDIDATE_ORDERS';
          evidence: Record<string, string | number | boolean>;
      }
    | {
          kind: 'ambiguous';
          reasonCode: 'MULTIPLE_CANDIDATES';
          candidateOrderIds: string[];
          evidence: Record<string, string | number | boolean>;
      }
    | {
          kind: 'discrepancy';
          exceptionType: 'AMOUNT_MISMATCH' | 'STATUS_DISCREPANCY';
          orderId: string;
          reasonCode: string;
          evidence: Record<string, string | number | boolean>;
      }
    | {
          kind: 'excluded';
          reasonCode:
              | 'UNSUPPORTED_TRANSACTION_TYPE'
              | 'UNSUPPORTED_TRANSACTION_STATUS'
              | 'NON_POSITIVE_AMOUNT'
              | 'ALREADY_SETTLED';
          details?: string;
      };

export interface ReconciliationTransaction {
    id: string;
    merchantId: string;
    providerConnectionId: string;
    providerTxnId: string;
    providerRecordKey: string;
    providerOrderId: string | null;
    type: string;
    status: string;
    amountMinor: bigint;
    currency: string;
    feeMinor: bigint | null;
    occurredAt: Date;
    rawPayload: unknown;
}

export interface CandidateOrder {
    id: string;
    merchantId: string;
    externalOrderId: string;
    amountMinor: bigint;
    currency: string;
    status: string;
    orderedAt: Date;
    metadata: Record<string, unknown> | null;
}

export interface MatchingPolicyOptions {
    rulesetVersion?: string;
    timeWindowToleranceMs?: number; // default 24h: 86_400_000 ms
}

export interface StartReconciliationInput {
    merchantId: string;
    providerConnectionId: string;
    from?: Date | string;
    to?: Date | string;
    idempotencyKey: string;
    rulesetVersion?: string;
    batchSize?: number;
    timeWindowToleranceMs?: number;
}

export interface ReconciliationRunSummary {
    runId: string;
    merchantId: string;
    status: 'COMPLETED' | 'FAILED';
    windowStart: Date;
    windowEnd: Date;
    rulesetVersion: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    durationMs: number;
    isReusedRun?: boolean;
    createdAt?: Date;
    completedAt?: Date;
}

export interface MatchBatchItem {
    transaction: ReconciliationTransaction;
    decision: MatchDecision;
}

export interface ReconciliationRepository {
    createOrGetRun(
        merchantId: string,
        windowStart: Date,
        windowEnd: Date,
        idempotencyKey: string,
        rulesetVersion: string,
    ): Promise<{
        run: {
            id: string;
            merchantId: string;
            status: string;
            windowStart: Date;
            windowEnd: Date;
            rulesetVersion: string;
            totalConsidered: number;
            matchedCount: number;
            unmatchedCount: number;
            ambiguousCount: number;
            excludedCount: number;
            startedAt?: Date | null;
            completedAt?: Date | null;
            failureReason?: string | null;
            createdAt?: Date;
        };
        isReused: boolean;
    }>;

    fetchEligibleTransactions(
        merchantId: string,
        providerConnectionId: string,
        windowStart: Date,
        windowEnd: Date,
        skip: number,
        take: number,
    ): Promise<ReconciliationTransaction[]>;

    findCandidateOrders(
        merchantId: string,
        transaction: ReconciliationTransaction,
        timeWindowToleranceMs: number,
    ): Promise<CandidateOrder[]>;

    persistBatchOutcomes(
        runId: string,
        merchantId: string,
        items: MatchBatchItem[],
        rulesetVersion: string,
    ): Promise<void>;

    finalizeRun(
        runId: string,
        status: 'COMPLETED' | 'FAILED',
        counters: {
            totalConsidered: number;
            matchedCount: number;
            unmatchedCount: number;
            ambiguousCount: number;
            excludedCount: number;
        },
        failureReason?: string,
    ): Promise<void>;

    listRuns(merchantId: string, filter: ListRunsFilter): Promise<ListRunsResult>;

    findRunById(merchantId: string, runId: string): Promise<ReconciliationRunDetail | null>;

    listMatches(merchantId: string, runId: string, filter: ListMatchesFilter): Promise<ListMatchesResult>;
}

export interface ListRunsFilter {
    status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    from?: Date;
    to?: Date;
    cursor?: string;
    limit?: number;
}

export interface ReconciliationRunListItem {
    id: string;
    merchantId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    rulesetVersion: string;
    windowStart: string;
    windowEnd: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    failureReason: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ListRunsResult {
    items: ReconciliationRunListItem[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface ReconciliationRunDetail {
    id: string;
    merchantId: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    rulesetVersion: string;
    windowStart: string;
    windowEnd: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
    excludedCount: number;
    failureReason: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ListMatchesFilter {
    ruleCode?: string;
    cursor?: string;
    limit?: number;
}

export interface LinkedProviderTxnInMatch {
    id: string;
    providerTxnId: string;
    amountMinor: string;
    currency: string;
    status: string;
    occurredAt: string;
}

export interface LinkedMerchantOrderInMatch {
    id: string;
    externalOrderId: string;
    amountMinor: string;
    currency: string;
    status: string;
    orderedAt: string;
}

export interface ReconciliationMatchSummary {
    id: string;
    merchantId: string;
    reconciliationRunId: string;
    providerTransactionId: string;
    merchantOrderId: string;
    ruleCode: string;
    rulesetVersion: string;
    evidence: unknown;
    providerTransaction: LinkedProviderTxnInMatch;
    merchantOrder: LinkedMerchantOrderInMatch;
    createdAt: string;
    updatedAt: string;
}

export interface ListMatchesResult {
    items: ReconciliationMatchSummary[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}


