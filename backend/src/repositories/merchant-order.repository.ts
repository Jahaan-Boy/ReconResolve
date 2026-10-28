import { getDB } from '../db/postgres';
import type { Prisma, PrismaClient, MerchantOrderStatus } from '../generated/prisma';

export interface MerchantOrderRecord {
    id: string;
    merchantId: string;
    externalOrderId: string;
    amountMinor: bigint;
    currency: string;
    status: MerchantOrderStatus;
    orderedAt: Date;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateOrderRecordData {
    externalOrderId: string;
    amountMinor: bigint;
    currency: string;
    status: MerchantOrderStatus;
    orderedAt: Date;
    metadata?: Record<string, unknown> | Prisma.InputJsonValue | null;
}

export interface ListOrdersRepoFilter {
    status?: MerchantOrderStatus;
    currency?: string;
    from?: Date;
    to?: Date;
    externalOrderId?: string;
    cursor?: string;
    limit?: number;
}

export interface ListOrdersRepoResult {
    items: MerchantOrderRecord[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}

export interface MerchantOrderRepository {
    create(merchantId: string, data: CreateOrderRecordData): Promise<MerchantOrderRecord>;
    findByExternalOrderId(merchantId: string, externalOrderId: string): Promise<MerchantOrderRecord | null>;
    findById(merchantId: string, orderId: string): Promise<MerchantOrderRecord | null>;
    list(merchantId: string, filter: ListOrdersRepoFilter): Promise<ListOrdersRepoResult>;
}

export function isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
    if (code !== 'P2002') return false;
    const target = meta?.target;
    const names = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
    if (names.length === 0) return true;
    return names.some((name) => {
        const cleaned = name.toLowerCase().replace(/_/g, '');
        return cleaned.includes('externalorderid') || cleaned.includes('merchantorder');
    });
}

export function createMerchantOrderRepository(dbProvider = getDB): MerchantOrderRepository {
    return {
        async create(merchantId: string, data: CreateOrderRecordData): Promise<MerchantOrderRecord> {
            const db = dbProvider();
            return db.merchantOrder.create({
                data: {
                    merchantId,
                    externalOrderId: data.externalOrderId,
                    amountMinor: data.amountMinor,
                    currency: data.currency,
                    status: data.status,
                    orderedAt: data.orderedAt,
                    ...(data.metadata !== undefined && data.metadata !== null
                        ? { metadata: data.metadata as Prisma.InputJsonValue }
                        : {}),
                },
            });
        },

        async findByExternalOrderId(merchantId: string, externalOrderId: string): Promise<MerchantOrderRecord | null> {
            const db = dbProvider();
            return db.merchantOrder.findUnique({
                where: {
                    merchantId_externalOrderId: {
                        merchantId,
                        externalOrderId,
                    },
                },
            });
        },

        async findById(merchantId: string, orderId: string): Promise<MerchantOrderRecord | null> {
            const db = dbProvider();
            return db.merchantOrder.findFirst({
                where: {
                    id: orderId,
                    merchantId,
                },
            });
        },

        async list(merchantId: string, filter: ListOrdersRepoFilter): Promise<ListOrdersRepoResult> {
            const db = dbProvider();
            const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);

            const where: Prisma.MerchantOrderWhereInput = {
                merchantId, // STRICT TENANT ISOLATION
            };

            if (filter.status) {
                where.status = filter.status;
            }

            if (filter.currency) {
                where.currency = filter.currency;
            }

            if (filter.from || filter.to) {
                where.orderedAt = {};
                if (filter.from) {
                    where.orderedAt.gte = filter.from;
                }
                if (filter.to) {
                    where.orderedAt.lte = filter.to;
                }
            }

            if (filter.externalOrderId) {
                where.externalOrderId = filter.externalOrderId;
            }

            const [totalCount, rows] = await Promise.all([
                db.merchantOrder.count({ where }),
                db.merchantOrder.findMany({
                    where,
                    orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
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

            return {
                items: itemsToReturn,
                pagination: {
                    limit,
                    nextCursor,
                    hasMore,
                    totalCount,
                },
            };
        },
    };
}
