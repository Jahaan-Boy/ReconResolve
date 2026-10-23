import type { PrismaClient } from '../../../generated/prisma';
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
}

export interface PayPalEventHandlerConfig {
    db: EventHandlerDb;
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

        // 4. Mark WebhookEvent durably PROCESSED
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
