import { PrismaClient } from '../generated/prisma';
import { config } from '../config';
// Module-level singleton — instantiated once, never recreated.
let prisma: PrismaClient | null = null;

export function getDB(): PrismaClient {
    if (!prisma) {
        throw new Error('[db] PrismaClient is not initialised. Call connectDB() first.');
    }
    return prisma;
}

export async function connectDB(): Promise<void> {
    if (prisma) {
        return;
    }

    prisma = new PrismaClient({
        datasourceUrl: config.databaseUrl,
        log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
    });

    try {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await prisma.$disconnect().catch(() => undefined);
        prisma = null;
        throw new Error(`[db] PostgreSQL connection failed: ${reason}`);
    }
}

export async function closeDB(): Promise<void> {
    if (prisma) {
        await prisma.$disconnect();
        prisma = null;
    }
}