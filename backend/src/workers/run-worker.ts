import { loadOutboxConfig } from '../config/outbox-config';
import { closeDB, connectDB, getDB } from '../db/postgres';
import { createOutboxRepository } from '../repositories/outbox.repository';
import { OutboxEventDispatcher } from '../services/outbox/event-dispatcher';
import { PayPalEventHandler } from '../services/outbox/handlers/paypal-event-handler';
import { JsonOutboxLogger } from '../services/outbox/outbox-logger';
import { OutboxWorker } from '../services/outbox/outbox-worker';

async function main(): Promise<void> {
    const logger = new JsonOutboxLogger();

    try {
        const config = loadOutboxConfig();
        await connectDB();
        const prisma = getDB();

        const repository = createOutboxRepository(prisma);
        const dispatcher = new OutboxEventDispatcher();

        // Register event handlers
        dispatcher.register('WebhookEvent', new PayPalEventHandler({ db: prisma }));

        const worker = new OutboxWorker({
            repository,
            dispatcher,
            config,
            logger,
        });

        const shutdown = async (signal: string) => {
            logger.info({
                workerId: worker.id,
                event: 'signal_received',
                error: `Received ${signal}, initiating graceful shutdown`,
            });

            await worker.stop();
            await closeDB();
            process.exit(0);
        };

        process.once('SIGINT', () => void shutdown('SIGINT'));
        process.once('SIGTERM', () => void shutdown('SIGTERM'));

        worker.start();
    } catch (error) {
        logger.error({
            workerId: 'bootstrap',
            event: 'worker_bootstrap_failed',
            error: error instanceof Error ? error.message : String(error),
        });
        await closeDB().catch(() => undefined);
        process.exit(1);
    }
}

void main();
