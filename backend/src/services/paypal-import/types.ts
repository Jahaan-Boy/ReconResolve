import type {
    CanonicalTransaction,
    ProviderTransactionType,
    TransactionStatus,
} from '../../domain/transaction';

export interface ImportRange {
    from: Date;
    to: Date;
}

export interface ImportContext {
    readonly merchantId: string;
    readonly providerConnectionId: string;
}

export interface ImportRecord {
    providerTxnId: string;
    providerEventCode: string;
    providerOrderId: string | null;
    type: ProviderTransactionType;
    status: TransactionStatus;
    amountMinor: bigint;
    currency: string;
    feeMinor: bigint | null;
    occurredAt: Date;
    rawPayload: Record<string, unknown>;
}

export interface KeyedImportRecord extends ImportRecord {
    providerRecordKey: string;
}

export interface FetchedPage {
    fetched: number;
    transactions: readonly CanonicalTransaction[];
    rejected: number;
    rejectedCategories?: Readonly<Record<string, number>>;
}

export interface TransactionSource {
    fetchPages(range: ImportRange): AsyncIterable<FetchedPage>;
}

export interface PersistCounts {
    inserted: number;
    updated: number;
    unchanged: number;
}

export interface ProviderTransactionStore {
    persist(context: ImportContext, records: readonly KeyedImportRecord[]): Promise<PersistCounts>;
}

export interface ImportSummary {
    fetched: number;
    normalized: number;
    inserted: number;
    updated: number;
    unchanged: number;
    rejected: number;
    rejectedCategories: Record<string, number>;
}