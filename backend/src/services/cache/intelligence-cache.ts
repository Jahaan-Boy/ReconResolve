import { getCacheService } from './cache-factory';

export const CACHE_NAMESPACE = 'flowops:v1';

export function getPortfolioCacheKey(merchantId: string, window: string): string {
    return `${CACHE_NAMESPACE}:merchant:${merchantId}:intelligence:portfolio:${window}`;
}

export function getTrendsCacheKey(merchantId: string, window: string): string {
    return `${CACHE_NAMESPACE}:merchant:${merchantId}:intelligence:trends:${window}`;
}

export async function invalidateMerchantIntelligenceCache(merchantId: string): Promise<void> {
    try {
        const cache = getCacheService();
        const windows = ['24h', '7d', '30d', '90d', 'all'];
        const keys: string[] = [];
        for (const w of windows) {
            keys.push(getPortfolioCacheKey(merchantId, w));
            keys.push(getTrendsCacheKey(merchantId, w));
        }
        await cache.del(keys);
    } catch (err) {
        // Safe degrade - invalidation failure should not fail transaction
        console.warn(`[IntelligenceCache] Failed to invalidate cache for merchant ${merchantId}:`, err);
    }
}
