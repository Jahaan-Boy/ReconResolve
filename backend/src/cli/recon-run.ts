import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createReconciliationRepository } from '../repositories/reconciliation.repository';
import { ReconciliationError } from '../services/reconciliation/errors';
import { ReconciliationService } from '../services/reconciliation/reconciliation.service';

interface ParsedReconArgs {
    merchantSlug?: string;
    merchantId?: string;
    connectionId?: string;
    from?: string;
    to?: string;
    idempotencyKey: string;
}

function parseArgs(argv: string[]): ParsedReconArgs {
    const result: Partial<ParsedReconArgs> = {};

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--merchant-slug' && argv[i + 1]) {
            result.merchantSlug = argv[++i];
        } else if (arg === '--merchant-id' && argv[i + 1]) {
            result.merchantId = argv[++i];
        } else if (arg === '--connection-id' && argv[i + 1]) {
            result.connectionId = argv[++i];
        } else if (arg === '--from' && argv[i + 1]) {
            result.from = argv[++i];
        } else if (arg === '--to' && argv[i + 1]) {
            result.to = argv[++i];
        } else if (arg === '--idempotency-key' && argv[i + 1]) {
            result.idempotencyKey = argv[++i];
        }
    }

    if (!result.merchantId && !result.merchantSlug) {
        throw new Error('Either --merchant-slug or --merchant-id is required.');
    }

    if (!result.idempotencyKey) {
        result.idempotencyKey = `recon-${Date.now()}-${randomUUID().slice(0, 8)}`;
    }

    return result as ParsedReconArgs;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    const { connectDB, getDB, closeDB } = await import('../db/postgres');
    await connectDB();
    const prisma = getDB();

    try {
        let merchantId = args.merchantId;
        if (!merchantId && args.merchantSlug) {
            const m = await prisma.merchant.findUnique({
                where: { slug: args.merchantSlug },
            });
            if (!m) {
                throw new Error(`Merchant not found for slug: ${args.merchantSlug}`);
            }
            merchantId = m.id;
        }

        let connectionId = args.connectionId;
        if (!connectionId) {
            const conn = await prisma.providerConnection.findFirst({
                where: { merchantId: merchantId!, status: 'ACTIVE' },
            });
            if (!conn) {
                throw new Error(`No ACTIVE provider connection found for merchant: ${merchantId}`);
            }
            connectionId = conn.id;
        }

        const repo = createReconciliationRepository(prisma as any);
        const service = new ReconciliationService({
            db: prisma as any,
            repository: repo,
        });

        console.log(`[recon:run] Starting reconciliation run for merchant=${merchantId}`);
        const summary = await service.run({
            merchantId: merchantId!,
            providerConnectionId: connectionId,
            from: args.from,
            to: args.to,
            idempotencyKey: args.idempotencyKey,
        });

        console.log('[recon:run] Completed successfully:');
        console.log(JSON.stringify(summary, null, 2));
    } catch (err) {
        if (err instanceof ReconciliationError) {
            console.error(`[recon:run] Error [${err.code}]: ${err.message}`);
        } else {
            console.error('[recon:run] Unexpected error:', err);
        }
        process.exitCode = 1;
    } finally {
        await closeDB();
    }
}

void main();
