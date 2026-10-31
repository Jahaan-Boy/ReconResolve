import type { PrismaClient, TransactionStatus } from '../../../generated/prisma';
import { PermanentError } from '../error-sanitizer';
import type { ClaimedOutboxRecord, EventProcessResult } from '../types';

export const SUPPORTED_PAYPAL_EVENTS = new Set([
    'PAYMENT.CAPTURE.COMPLETED',
    'PAYMENT.CAPTURE.DENIED',
    'PAYMENT.CAPTURE.REFUNDED',
    'CHECKOUT.ORDER.APPROVED',
]);

export interface EventHandlerDb {
    webhookEvent: Pick<PrismaClient['webhookEvent'], 'findUnique' | 'update'>;
    providerTransaction?: Pick<PrismaClient['providerTransaction'], 'findUnique' | 'create'>;
}

export interface PayPalEventHandlerConfig {
    db: EventHandlerDb;
}

function parseAmountMinor(valueStr: string): bigint {
    const trimmed = valueStr.trim();
    const parts = trimmed.split('.');
    const integerPart = BigInt(parts[0] || '0');
    const decimalPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    return integerPart * 100n + BigInt(decimalPart);
}

export class PayPalEventHandler {
    private readonly db: EventHandlerDb;

    constructor(config: PayPalEventHandlerConfig) {
        this.db = config.db;
    }

    async handle(record: ClaimedOutboxRecord): Promise<EventProcessResult> {
        // 1. Locate the referenced WebhookEvent
        const webhookEvent = await this.db.webhookEvent.findUnique({
            where: { id: record.aggregateId },
        });

        if (!webhookEvent) {
            throw new PermanentError(
                `Referenced WebhookEvent was not found for outbox aggregateId: ${record.aggregateId}`,
            );
        }

        const eventType = webhookEvent.eventType;

        // 2. Check if event is supported
        if (!SUPPORTED_PAYPAL_EVENTS.has(eventType)) {
            // Acknowledge unsupported event types as intentionally ignored without retrying forever
            await this.db.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { processingStatus: 'PROCESSED' },
            });

            return {
                outcome: 'ignored',
                details: `Ignored unsupported event type: ${eventType}`,
            };
        }

        // 3. Validate minimum resource payload structure
        const payload = webhookEvent.payload as Record<string, unknown> | null;
        if (!payload || typeof payload !== 'object') {
            throw new PermanentError(
                `Payload for WebhookEvent ${webhookEvent.id} is not a valid JSON object`,
            );
        }

        const resource = payload['resource'];
        if (resource !== undefined && (typeof resource !== 'object' || resource === null)) {
            throw new PermanentError(
                `Resource field for WebhookEvent ${webhookEvent.id} is invalid`,
            );
        }

        // 4. Normalize capture events into ProviderTransaction ledger (if providerTransaction db is available)
        if (
            this.db.providerTransaction &&
            resource &&
            typeof resource === 'object' &&
            (eventType === 'PAYMENT.CAPTURE.COMPLETED' || eventType === 'PAYMENT.CAPTURE.DENIED')
        ) {
            const resObj = resource as Record<string, unknown>;
            const providerTxnId = typeof resObj['id'] === 'string' ? resObj['id'] : null;
            const amountObj = resObj['amount'] as Record<string, unknown> | undefined;

            if (
                providerTxnId &&
                amountObj &&
                typeof amountObj['value'] === 'string' &&
                typeof amountObj['currency_code'] === 'string'
            ) {
                const amountMinor = parseAmountMinor(amountObj['value']);
                const currency = amountObj['currency_code'].toUpperCase();

                const supplementaryData = resObj['supplementary_data'] as Record<string, unknown> | undefined;
                const relatedIds = supplementaryData?.['related_ids'] as Record<string, unknown> | undefined;
                const providerOrderId = (
                    (typeof relatedIds?.['order_id'] === 'string' ? relatedIds['order_id'] : null) ||
                    (typeof resObj['custom_id'] === 'string' ? resObj['custom_id'] : null) ||
                    (typeof resObj['invoice_id'] === 'string' ? resObj['invoice_id'] : null) ||
                    null
                );

                const rawCreateTime = resObj['create_time'] || resObj['update_time'];
                const occurredAt = rawCreateTime ? new Date(String(rawCreateTime)) : (webhookEvent.transmissionTime ?? new Date());
                const status: TransactionStatus = eventType === 'PAYMENT.CAPTURE.COMPLETED' ? 'CAPTURED' : 'FAILED';
                const providerRecordKey = providerTxnId;

                // Idempotent upsert check on compound unique key
                const existing = await this.db.providerTransaction.findUnique({
                    where: {
                        providerConnectionId_providerRecordKey: {
                            providerConnectionId: webhookEvent.providerConnectionId,
                            providerRecordKey,
                        },
                    },
                });

                if (!existing) {
                    await this.db.providerTransaction.create({
                        data: {
                            merchantId: webhookEvent.merchantId,
                            providerConnectionId: webhookEvent.providerConnectionId,
                            providerTxnId,
                            providerRecordKey,
                            providerOrderId,
                            type: 'CAPTURE',
                            status,
                            amountMinor,
                            currency,
                            occurredAt,
                            rawPayload: payload as any,
                        },
                    });
                }
            }
        }

        // 5. Mark WebhookEvent durably PROCESSED
        await this.db.webhookEvent.update({
            where: { id: webhookEvent.id },
            data: { processingStatus: 'PROCESSED' },
        });

        return {
            outcome: 'processed',
            details: `Successfully processed event type ${eventType}`,
        };
    }
}
