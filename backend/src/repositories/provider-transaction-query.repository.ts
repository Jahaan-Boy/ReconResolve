import { getDB } from '../db/postgres';
import type {
    Prisma,
    Provider,
    ProviderConnectionStatus,
    ProviderTransactionType,
    TransactionStatus,
} from '../generated/prisma';

export interface ListTransactionsFilter {
    connectionId?: string;
    status?: TransactionStatus;
    type?: ProviderTransactionType;
    currency?: string;
    from?: Date;
    to?: Date;
    providerTxnId?: string;
    providerRecordKey?: string;
    providerOrderId?: string;
    limit?: number;
    cursor?: string;
}

export interface ProviderTransactionSummary {
    id: string;
    merchantId: string;
    providerConnectionId: string;
    providerTxnId: string;
    providerRecordKey: string;
    providerOrderId: string | null;
    type: ProviderTransactionType;
    status: TransactionStatus;
    amountMinor: string;
    currency: string;
    feeMinor: string | null;
    occurredAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProviderTransactionDetail extends ProviderTransactionSummary {
    connection: {
        id: string;
        provider: Provider;
        connectionKey: string;
        providerAccountId: string | null;
        status: ProviderConnectionStatus;
    };
}

export interface ListTransactionsResult {
    items: ProviderTransactionSummary[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface ProviderTransactionQueryRepository {
    list(merchantId: string, filter: ListTransactionsFilter): Promise<ListTransactionsResult>;
    findById(merchantId: string, transactionId: string): Promise<ProviderTransactionDetail | null>;
    verifyConnectionOwnership(merchantId: string, connectionId: string): Promise<boolean>;
}

export function createProviderTransactionQueryRepository(dbProvider = getDB): ProviderTransactionQueryRepository {
    return {
        async verifyConnectionOwnership(merchantId: string, connectionId: string): Promise<boolean> {
            const db = dbProvider();
            const conn = await db.providerConnection.findFirst({
                where: {
                    id: connectionId,
                    merchantId,
                },
                select: { id: true },
            });
            return conn !== null;
        },

        async list(merchantId: string, filter: ListTransactionsFilter): Promise<ListTransactionsResult> {
            const db = dbProvider();
            const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);

            const where: Prisma.ProviderTransactionWhereInput = {
                merchantId,
            };

            if (filter.connectionId) {
                where.providerConnectionId = filter.connectionId;
            }

            if (filter.status) {
                where.status = filter.status;
            }

            if (filter.type) {
                where.type = filter.type;
            }

            if (filter.currency) {
                where.currency = filter.currency;
            }

            if (filter.from || filter.to) {
                where.occurredAt = {};
                if (filter.from) {
                    where.occurredAt.gte = filter.from;
                }
                if (filter.to) {
                    where.occurredAt.lte = filter.to;
                }
            }

            if (filter.providerTxnId) {
                where.providerTxnId = filter.providerTxnId;
            }

            if (filter.providerRecordKey) {
                where.providerRecordKey = filter.providerRecordKey;
            }

            if (filter.providerOrderId) {
                where.providerOrderId = filter.providerOrderId;
            }

            const [totalCount, rows] = await Promise.all([
                db.providerTransaction.count({ where }),
                db.providerTransaction.findMany({
                    where,
                    select: {
                        id: true,
                        merchantId: true,
                        providerConnectionId: true,
                        providerTxnId: true,
                        providerRecordKey: true,
                        providerOrderId: true,
                        type: true,
                        status: true,
                        amountMinor: true,
                        currency: true,
                        feeMinor: true,
                        occurredAt: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
                    take: limit + 1,
                    ...(filter.cursor
                        ? {
                            cursor: { id: filter.cursor },
                            skip: 1,
                        }
                        : {}),
                }),
            ]);

            const hasMore = rows.length > limit;
            const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;
            const nextCursor = hasMore && itemsToReturn.length > 0 ? itemsToReturn[itemsToReturn.length - 1].id : null;

            const items: ProviderTransactionSummary[] = itemsToReturn.map((r) => ({
                id: r.id,
                merchantId: r.merchantId,
                providerConnectionId: r.providerConnectionId,
                providerTxnId: r.providerTxnId,
                providerRecordKey: r.providerRecordKey,
                providerOrderId: r.providerOrderId,
                type: r.type,
                status: r.status,
                amountMinor: r.amountMinor.toString(),
                currency: r.currency,
                feeMinor: r.feeMinor !== null ? r.feeMinor.toString() : null,
                occurredAt: r.occurredAt,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));

            return {
                items,
                pagination: {
                    limit,
                    nextCursor,
                    hasMore,
                    totalCount,
                },
            };
        },

        async findById(merchantId: string, transactionId: string): Promise<ProviderTransactionDetail | null> {
            const db = dbProvider();

            // Strictly tenant-scoped lookup
            const row = await db.providerTransaction.findFirst({
                where: {
                    id: transactionId,
                    merchantId,
                },
                select: {
                    id: true,
                    merchantId: true,
                    providerConnectionId: true,
                    providerTxnId: true,
                    providerRecordKey: true,
                    providerOrderId: true,
                    type: true,
                    status: true,
                    amountMinor: true,
                    currency: true,
                    feeMinor: true,
                    occurredAt: true,
                    createdAt: true,
                    updatedAt: true,
                    providerConnection: {
                        select: {
                            id: true,
                            provider: true,
                            connectionKey: true,
                            providerAccountId: true,
                            status: true,
                        },
                    },
                },
            });

            if (!row) {
                return null;
            }

            return {
                id: row.id,
                merchantId: row.merchantId,
                providerConnectionId: row.providerConnectionId,
                providerTxnId: row.providerTxnId,
                providerRecordKey: row.providerRecordKey,
                providerOrderId: row.providerOrderId,
                type: row.type,
                status: row.status,
                amountMinor: row.amountMinor.toString(),
                currency: row.currency,
                feeMinor: row.feeMinor !== null ? row.feeMinor.toString() : null,
                occurredAt: row.occurredAt,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                connection: row.providerConnection,
            };
        },
    };
}
