import { getDB } from '../db/postgres';
import type { Prisma, Provider, ProviderConnectionStatus } from '../generated/prisma';

export interface ListConnectionsFilter {
    provider?: Provider;
    status?: ProviderConnectionStatus;
    limit?: number;
    cursor?: string;
}

export interface ProviderConnectionSummary {
    id: string;
    merchantId: string;
    provider: Provider;
    connectionKey: string;
    providerAccountId: string | null;
    status: ProviderConnectionStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface ProviderConnectionDetail extends ProviderConnectionSummary {
    syncHealth: {
        status: ProviderConnectionStatus;
        lastTransactionAt: Date | null;
        totalTransactions: number;
    };
}

export interface ListConnectionsResult {
    items: ProviderConnectionSummary[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface ProviderConnectionRepository {
    list(merchantId: string, filter: ListConnectionsFilter): Promise<ListConnectionsResult>;
    findById(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail | null>;
}

export function createProviderConnectionRepository(dbProvider = getDB): ProviderConnectionRepository {
    return {
        async list(merchantId: string, filter: ListConnectionsFilter): Promise<ListConnectionsResult> {
            const db = dbProvider();
            const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);

            const where: Prisma.ProviderConnectionWhereInput = {
                merchantId,
            };

            if (filter.provider) {
                where.provider = filter.provider;
            }

            if (filter.status) {
                where.status = filter.status;
            }

            const [totalCount, rows] = await Promise.all([
                db.providerConnection.count({ where }),
                db.providerConnection.findMany({
                    where,
                    select: {
                        id: true,
                        merchantId: true,
                        provider: true,
                        connectionKey: true,
                        providerAccountId: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
            const items = hasMore ? rows.slice(0, limit) : rows;
            const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

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

        async findById(merchantId: string, connectionId: string): Promise<ProviderConnectionDetail | null> {
            const db = dbProvider();

            // Strictly tenant-scoped lookup
            const connection = await db.providerConnection.findFirst({
                where: {
                    id: connectionId,
                    merchantId,
                },
                select: {
                    id: true,
                    merchantId: true,
                    provider: true,
                    connectionKey: true,
                    providerAccountId: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            if (!connection) {
                return null;
            }

            // Stored sync health metrics: aggregate tenant-scoped transaction statistics
            const [lastTxn, totalTxns] = await Promise.all([
                db.providerTransaction.findFirst({
                    where: {
                        merchantId,
                        providerConnectionId: connectionId,
                    },
                    orderBy: { occurredAt: 'desc' },
                    select: { occurredAt: true },
                }),
                db.providerTransaction.count({
                    where: {
                        merchantId,
                        providerConnectionId: connectionId,
                    },
                }),
            ]);

            return {
                ...connection,
                syncHealth: {
                    status: connection.status,
                    lastTransactionAt: lastTxn?.occurredAt ?? null,
                    totalTransactions: totalTxns,
                },
            };
        },
    };
}
