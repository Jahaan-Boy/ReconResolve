import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

router.get('/health/ready', async (_req, res) => {
    try {
        const { getDB } = await import('../db/postgres');
        const db = getDB();
        await db.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'ready', database: 'connected' });
    } catch {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

router.get('/ready', async (_req, res) => {
    try {
        const { getDB } = await import('../db/postgres');
        const db = getDB();
        await db.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'ready', database: 'connected' });
    } catch {
        res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
});

export default router;