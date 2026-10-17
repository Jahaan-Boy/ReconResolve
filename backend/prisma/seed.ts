/**
 * Development seed — creates one demo merchant.
 *
 * This is development scaffolding, NOT a real merchant account or
 * authentication mechanism. It must never be run against production.
 *
 * Idempotent: uses upsert on the stable `slug` field so running this
 * script twice produces exactly one row.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main(): Promise<void> {
    const merchant = await prisma.merchant.upsert({
        where: { slug: 'demo-merchant' },
        update: {},
        create: {
            name: 'Demo Merchant',
            slug: 'demo-merchant',
            status: 'ACTIVE',
        },
    });

    console.log(`[seed] Upserted demo merchant: id=${merchant.id} slug=${merchant.slug}`);
}

main()
    .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[seed] Fatal error: ${message}`);
        process.exit(1);
    })
    .finally(() => {
        void prisma.$disconnect();
    });
