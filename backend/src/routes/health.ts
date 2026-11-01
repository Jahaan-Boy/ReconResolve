import { Router } from 'express';
import { getCacheService } from '../services/cache/cache-factory';

const router = Router();

// Process liveness probe
router.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
});

// Dependency readiness probe
async function checkReadiness(_req: any, res: any) {
    try {
        const { getDB } = await import('../db/postgres');
        const db = getDB();
        await db.$queryRaw`SELECT 1`;
    } catch {
        res.status(503).json({
            status: 'unhealthy',
            database: 'disconnected',
            message: 'Database connection failed',
        });
        return;
    }

    // Optional cache check: degraded cache does not fail readiness if in-memory fallback is active
    let cacheStatus: { provider: string; ok: boolean; status: string } = {
        provider: 'unknown',
        ok: false,
        status: 'disconnected',
    };

    try {
        const cache = getCacheService();
        const health = await cache.healthCheck();
        cacheStatus = {
            provider: health.provider,
            ok: health.ok,
            status: health.ok ? 'connected' : 'degraded',
        };
    } catch {
        cacheStatus = {
            provider: 'in-memory',
            ok: true,
            status: 'fallback_active',
        };
    }

    res.status(200).json({
        status: 'ready',
        database: 'connected',
        cache: cacheStatus,
    });
}

router.get('/health/ready', checkReadiness);
router.get('/ready', checkReadiness);

export default router;