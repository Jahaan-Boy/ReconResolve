import { PermanentError } from './error-sanitizer';
import type { ClaimedOutboxRecord, EventProcessResult, OutboxEventHandler } from './types';

export class OutboxEventDispatcher {
    private readonly handlers = new Map<string, OutboxEventHandler>();

    register(aggregateType: string, handler: OutboxEventHandler): this {
        this.handlers.set(aggregateType, handler);
        return this;
    }

    async dispatch(record: ClaimedOutboxRecord): Promise<EventProcessResult> {
        const handler = this.handlers.get(record.aggregateType);

        if (!handler) {
            throw new PermanentError(
                `No outbox handler registered for aggregateType: "${record.aggregateType}"`,
            );
        }

        return await handler.handle(record);
    }
}
