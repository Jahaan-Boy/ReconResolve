import 'dotenv/config';
import { PayPalAdapter } from '../providers/paypal/adapter';
import { createProviderTransactionStore } from '../repositories/provider-transaction.repository';
import { resolvePayPalConnection } from '../services/paypal-import/connection-resolver';
import { ImportError } from '../services/paypal-import/errors';
import { importPayPalTransactions } from '../services/paypal-import/import-paypal-transactions';
import { createPayPalSource } from '../services/paypal-import/paypal-source';
import { sanitizeError } from './format-error';
import { parseSyncArgs } from './parse-args';

const LAG_NOTICE =
    'Note: PayPal Transaction Search can lag recent activity by up to 3 hours. This is not real-time data.';

function readPayPalCredentials(): { clientId: string; clientSecret: string } {
    // Names only are reported, never values. Adjust if your .env uses other names.
    const names = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'] as const;
    const missing = names.filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
        throw new ImportError(
            'PAYPAL_SYNC_CONFIG_MISSING',
            `Missing environment variables: ${missing.join(', ')}.`,
        );
    }
    return {
        clientId: (process.env['PAYPAL_CLIENT_ID'] as string).trim(),
        clientSecret: (process.env['PAYPAL_CLIENT_SECRET'] as string).trim(),
    };
}

async function loadDb(): Promise<typeof import('../db/postgres')> {
    try {
        return await import('../db/postgres');
    } catch {
        throw new ImportError(
            'PAYPAL_SYNC_CONFIG_INVALID',
            'Environment configuration is invalid. Check NODE_ENV, HOST, PORT and DATABASE_URL in .env.',
        );
    }
}

async function run(): Promise<number> {
    const startedAt = Date.now();
    let closeDB: (() => Promise<void>) | undefined;

    try {
        // 1. Validate everything locally before touching the database or the network.
        const args = parseSyncArgs(process.argv.slice(2));
        const credentials = readPayPalCredentials();

        console.log(
            `paypal:sync starting merchant=${args.merchantSlug} from=${args.startDate} to=${args.endDate}`,
        );
        console.log(LAG_NOTICE);

        // 2. Reuse the existing Prisma singleton and its lifecycle.
        const db = await loadDb();
        await db.connectDB();
        closeDB = db.closeDB;
        const prisma = db.getDB();

        const summary = await importPayPalTransactions(
            {
                resolveConnection: (slug) => resolvePayPalConnection(prisma, slug),
                source: createPayPalSource(new PayPalAdapter(credentials)),
                store: createProviderTransactionStore(prisma),
            },
            args,
        );

        console.log(
            JSON.stringify({ status: 'success', durationMs: Date.now() - startedAt, summary }, null, 2),
        );
        return 0;
    } catch (error) {
        console.error(
            JSON.stringify(
                { status: 'failure', durationMs: Date.now() - startedAt, error: sanitizeError(error) },
                null,
                2,
            ),
        );
        return 1;
    } finally {
        if (closeDB) await closeDB().catch(() => undefined);
    }
}

void run().then((code) => {
    process.exitCode = code;
});