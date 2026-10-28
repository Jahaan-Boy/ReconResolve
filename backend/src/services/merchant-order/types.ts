import { MerchantOrderStatus } from '../../generated/prisma';

export { MerchantOrderStatus };

export interface MerchantOrderDTO {
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

export interface IngestOrderInput {
    externalOrderId: string;
    amountMinor?: string | number | bigint;
    amount?: string;
    currency: string;
    status?: MerchantOrderStatus;
    orderedAt: string | Date;
    metadata?: Record<string, unknown> | null;
}

export interface SingleIngestResult {
    outcome: 'created' | 'duplicate';
    order: MerchantOrderDTO;
}

export interface BatchItemResult {
    index: number;
    externalOrderId: string;
    status: 'created' | 'duplicate' | 'rejected';
    orderId?: string;
    order?: MerchantOrderDTO;
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

export interface ListOrdersFilter {
    status?: MerchantOrderStatus;
    currency?: string;
    from?: Date;
    to?: Date;
    externalOrderId?: string;
    cursor?: string;
    limit?: number;
}

export interface ListOrdersResult {
    items: MerchantOrderDTO[];
    pagination: {
        limit: number;
        nextCursor: string | null;
        hasMore: boolean;
        totalCount: number;
    };
}
