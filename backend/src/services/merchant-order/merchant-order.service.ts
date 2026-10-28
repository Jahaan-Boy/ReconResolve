import {
    createMerchantOrderRepository,
    isUniqueConstraintError,
    type MerchantOrderRecord,
    type MerchantOrderRepository,
} from '../../repositories/merchant-order.repository';
import { getCurrencyExponent, toMinorUnits } from '../../providers/paypal/money';
import { MerchantOrderError } from './errors';
import {
    MerchantOrderStatus,
    type BatchIngestResult,
    type BatchItemResult,
    type IngestOrderInput,
    type ListOrdersFilter,
    type ListOrdersResult,
    type MerchantOrderDTO,
    type SingleIngestResult,
} from './types';

const VALID_STATUSES = new Set<string>([
    MerchantOrderStatus.OPEN,
    MerchantOrderStatus.PAYMENT_PENDING,
    MerchantOrderStatus.PAID,
    MerchantOrderStatus.CANCELLED,
    MerchantOrderStatus.REFUNDED,
]);

export interface ValidatedOrderInput {
    externalOrderId: string;
    amountMinor: bigint;
    currency: string;
    status: MerchantOrderStatus;
    orderedAt: Date;
    metadata: Record<string, unknown> | null;
}

export function toDTO(record: MerchantOrderRecord): MerchantOrderDTO {
    return {
        id: record.id,
        merchantId: record.merchantId,
        externalOrderId: record.externalOrderId,
        amountMinor: record.amountMinor.toString(),
        currency: record.currency,
        status: record.status,
        orderedAt: record.orderedAt.toISOString(),
        metadata: (record.metadata as Record<string, unknown>) ?? null,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    };
}

export function validateAndCanonicalizeOrder(input: IngestOrderInput): ValidatedOrderInput {
    // 1. externalOrderId
    if (!input || typeof input.externalOrderId !== 'string') {
        throw MerchantOrderError.validationFailed('externalOrderId is required and must be a string');
    }
    const externalOrderId = input.externalOrderId.trim();
    if (externalOrderId.length === 0 || externalOrderId.length > 128) {
        throw MerchantOrderError.validationFailed('externalOrderId must be between 1 and 128 characters');
    }

    // 2. currency
    if (!input.currency || typeof input.currency !== 'string') {
        throw MerchantOrderError.validationFailed('currency is required and must be a 3-letter ISO code');
    }
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw MerchantOrderError.validationFailed(`Invalid currency format: "${currency}" must be a 3-letter ISO code`);
    }
    try {
        getCurrencyExponent(currency);
    } catch {
        throw MerchantOrderError.validationFailed(`Unsupported or invalid currency code: "${currency}"`);
    }

    // 3. amount / amountMinor
    let amountMinor: bigint;
    if (input.amountMinor !== undefined && input.amountMinor !== null) {
        if (typeof input.amountMinor === 'bigint') {
            amountMinor = input.amountMinor;
        } else if (typeof input.amountMinor === 'number') {
            if (!Number.isInteger(input.amountMinor)) {
                throw MerchantOrderError.validationFailed('amountMinor must be an integer (minor currency units)');
            }
            amountMinor = BigInt(input.amountMinor);
        } else if (typeof input.amountMinor === 'string') {
            const trimmed = input.amountMinor.trim();
            if (!/^-?\d+$/.test(trimmed)) {
                throw MerchantOrderError.validationFailed('amountMinor string must represent an integer');
            }
            amountMinor = BigInt(trimmed);
        } else {
            throw MerchantOrderError.validationFailed('amountMinor must be a bigint, integer, or numeric integer string');
        }
    } else if (input.amount !== undefined && input.amount !== null) {
        if (typeof input.amount !== 'string') {
            throw MerchantOrderError.validationFailed('amount must be a decimal string (e.g. "25.00")');
        }
        try {
            amountMinor = toMinorUnits(input.amount, currency);
        } catch (err: any) {
            throw MerchantOrderError.validationFailed(`Invalid amount decimal value: ${err.message}`);
        }
    } else {
        throw MerchantOrderError.validationFailed('Either amountMinor or amount must be provided');
    }

    if (amountMinor <= 0n) {
        throw MerchantOrderError.validationFailed(`Amount must be positive, received: ${amountMinor.toString()}`);
    }

    // 4. orderedAt
    if (!input.orderedAt) {
        throw MerchantOrderError.validationFailed('orderedAt is required');
    }
    const orderedAt = input.orderedAt instanceof Date ? input.orderedAt : new Date(input.orderedAt);
    if (isNaN(orderedAt.getTime())) {
        throw MerchantOrderError.validationFailed(`Invalid orderedAt date/time format: "${String(input.orderedAt)}"`);
    }

    // 5. status
    let status: MerchantOrderStatus = MerchantOrderStatus.OPEN;
    if (input.status !== undefined && input.status !== null) {
        if (typeof input.status !== 'string' || !VALID_STATUSES.has(input.status)) {
            throw MerchantOrderError.validationFailed(
                `Invalid status "${String(input.status)}". Allowed values: ${Array.from(VALID_STATUSES).join(', ')}`,
            );
        }
        status = input.status as MerchantOrderStatus;
    }

    // 6. metadata
    let metadata: Record<string, unknown> | null = null;
    if (input.metadata !== undefined && input.metadata !== null) {
        if (typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
            throw MerchantOrderError.validationFailed('metadata must be a JSON object');
        }
        metadata = input.metadata;
    }

    return {
        externalOrderId,
        amountMinor,
        currency,
        status,
        orderedAt,
        metadata,
    };
}

export interface MerchantOrderService {
    ingestSingleOrder(merchantId: string, input: IngestOrderInput): Promise<SingleIngestResult>;
    ingestBatchOrders(merchantId: string, orders: IngestOrderInput[]): Promise<BatchIngestResult>;
    listOrders(merchantId: string, filter: ListOrdersFilter): Promise<ListOrdersResult>;
    getOrder(merchantId: string, orderId: string): Promise<MerchantOrderDTO>;
}

export function createMerchantOrderService(
    repository: MerchantOrderRepository = createMerchantOrderRepository(),
): MerchantOrderService {
    async function handleExistingOrder(
        existing: MerchantOrderRecord,
        validated: ValidatedOrderInput,
    ): Promise<SingleIngestResult> {
        const sameAmount = existing.amountMinor === validated.amountMinor;
        const sameCurrency = existing.currency.toUpperCase() === validated.currency.toUpperCase();

        if (sameAmount && sameCurrency) {
            return {
                outcome: 'duplicate',
                order: toDTO(existing),
            };
        }

        throw MerchantOrderError.conflict(
            `External order ID "${validated.externalOrderId}" already exists with conflicting business data`,
            {
                externalOrderId: validated.externalOrderId,
                existing: {
                    amountMinor: existing.amountMinor.toString(),
                    currency: existing.currency,
                    status: existing.status,
                },
                submitted: {
                    amountMinor: validated.amountMinor.toString(),
                    currency: validated.currency,
                    status: validated.status,
                },
            },
        );
    }

    return {
        async ingestSingleOrder(merchantId: string, input: IngestOrderInput): Promise<SingleIngestResult> {
            const validated = validateAndCanonicalizeOrder(input);

            // 1. Check existing order under THIS merchant (strictly tenant-scoped)
            const existing = await repository.findByExternalOrderId(merchantId, validated.externalOrderId);
            if (existing) {
                return handleExistingOrder(existing, validated);
            }

            // 2. Attempt insert
            try {
                const created = await repository.create(merchantId, {
                    externalOrderId: validated.externalOrderId,
                    amountMinor: validated.amountMinor,
                    currency: validated.currency,
                    status: validated.status,
                    orderedAt: validated.orderedAt,
                    metadata: validated.metadata,
                });
                return {
                    outcome: 'created',
                    order: toDTO(created),
                };
            } catch (err: unknown) {
                // 3. Concurrency race backstop: catch database uniqueness error
                if (isUniqueConstraintError(err)) {
                    const concurrentExisting = await repository.findByExternalOrderId(merchantId, validated.externalOrderId);
                    if (concurrentExisting) {
                        return handleExistingOrder(concurrentExisting, validated);
                    }
                }
                throw err;
            }
        },

        async ingestBatchOrders(merchantId: string, orders: IngestOrderInput[]): Promise<BatchIngestResult> {
            if (!Array.isArray(orders)) {
                throw MerchantOrderError.validationFailed('Batch input must be a JSON array of orders');
            }

            if (orders.length === 0) {
                throw MerchantOrderError.validationFailed('Batch orders array cannot be empty');
            }

            if (orders.length > 100) {
                throw MerchantOrderError.batchLimitExceeded('Batch orders array exceeds limit of 100 records');
            }

            const results: BatchItemResult[] = [];
            let createdCount = 0;
            let duplicateCount = 0;
            let rejectedCount = 0;

            // In-batch tracking to handle multiple occurrences of externalOrderId within the same request
            const inBatchSeen = new Map<string, { validated: ValidatedOrderInput; outcome: SingleIngestResult }>();

            for (let i = 0; i < orders.length; i++) {
                const rawItem = orders[i];
                let validated: ValidatedOrderInput;

                try {
                    validated = validateAndCanonicalizeOrder(rawItem);
                } catch (err: any) {
                    rejectedCount++;
                    results.push({
                        index: i,
                        externalOrderId: typeof rawItem?.externalOrderId === 'string' ? rawItem.externalOrderId.trim() : `item-${i}`,
                        status: 'rejected',
                        error: {
                            code: err instanceof MerchantOrderError ? err.code : 'VALIDATION_FAILED',
                            message: err.message || 'Validation failed',
                            details: err instanceof MerchantOrderError ? err.details : undefined,
                        },
                    });
                    continue;
                }

                // Check if this externalOrderId was already processed in this batch
                const priorBatchItem = inBatchSeen.get(validated.externalOrderId);
                if (priorBatchItem) {
                    const sameAmount = priorBatchItem.validated.amountMinor === validated.amountMinor;
                    const sameCurrency = priorBatchItem.validated.currency.toUpperCase() === validated.currency.toUpperCase();

                    if (sameAmount && sameCurrency) {
                        duplicateCount++;
                        results.push({
                            index: i,
                            externalOrderId: validated.externalOrderId,
                            status: 'duplicate',
                            orderId: priorBatchItem.outcome.order.id,
                            order: priorBatchItem.outcome.order,
                        });
                    } else {
                        rejectedCount++;
                        results.push({
                            index: i,
                            externalOrderId: validated.externalOrderId,
                            status: 'rejected',
                            error: {
                                code: 'ORDER_CONFLICT',
                                message: `In-batch conflicting data for externalOrderId "${validated.externalOrderId}"`,
                            },
                        });
                    }
                    continue;
                }

                // Process item through tenant-scoped persistence
                try {
                    // 1. Check existing order
                    const existing = await repository.findByExternalOrderId(merchantId, validated.externalOrderId);
                    let outcome: SingleIngestResult;

                    if (existing) {
                        outcome = await handleExistingOrder(existing, validated);
                    } else {
                        try {
                            const created = await repository.create(merchantId, {
                                externalOrderId: validated.externalOrderId,
                                amountMinor: validated.amountMinor,
                                currency: validated.currency,
                                status: validated.status,
                                orderedAt: validated.orderedAt,
                                metadata: validated.metadata,
                            });
                            outcome = {
                                outcome: 'created',
                                order: toDTO(created),
                            };
                        } catch (err: unknown) {
                            if (isUniqueConstraintError(err)) {
                                const concurrentExisting = await repository.findByExternalOrderId(merchantId, validated.externalOrderId);
                                if (concurrentExisting) {
                                    outcome = await handleExistingOrder(concurrentExisting, validated);
                                } else {
                                    throw err;
                                }
                            } else {
                                throw err;
                            }
                        }
                    }

                    inBatchSeen.set(validated.externalOrderId, { validated, outcome });

                    if (outcome.outcome === 'created') {
                        createdCount++;
                        results.push({
                            index: i,
                            externalOrderId: validated.externalOrderId,
                            status: 'created',
                            orderId: outcome.order.id,
                            order: outcome.order,
                        });
                    } else {
                        duplicateCount++;
                        results.push({
                            index: i,
                            externalOrderId: validated.externalOrderId,
                            status: 'duplicate',
                            orderId: outcome.order.id,
                            order: outcome.order,
                        });
                    }
                } catch (err: any) {
                    rejectedCount++;
                    results.push({
                        index: i,
                        externalOrderId: validated.externalOrderId,
                        status: 'rejected',
                        error: {
                            code: err instanceof MerchantOrderError ? err.code : 'INGESTION_FAILED',
                            message: err.message || 'Ingestion failed for this record',
                            details: err instanceof MerchantOrderError ? err.details : undefined,
                        },
                    });
                }
            }

            return {
                summary: {
                    received: orders.length,
                    created: createdCount,
                    duplicates: duplicateCount,
                    rejected: rejectedCount,
                },
                results,
            };
        },

        async listOrders(merchantId: string, filter: ListOrdersFilter): Promise<ListOrdersResult> {
            if (filter.from && filter.to && filter.from > filter.to) {
                throw MerchantOrderError.validationFailed(
                    'Invalid date range: "from" timestamp must be earlier than or equal to "to" timestamp',
                );
            }

            const result = await repository.list(merchantId, {
                status: filter.status,
                currency: filter.currency,
                from: filter.from,
                to: filter.to,
                externalOrderId: filter.externalOrderId,
                cursor: filter.cursor,
                limit: filter.limit,
            });

            return {
                items: result.items.map(toDTO),
                pagination: result.pagination,
            };
        },

        async getOrder(merchantId: string, orderId: string): Promise<MerchantOrderDTO> {
            const order = await repository.findById(merchantId, orderId);
            if (!order) {
                // Conceal missing or cross-tenant order
                throw MerchantOrderError.notFound();
            }
            return toDTO(order);
        },
    };
}
