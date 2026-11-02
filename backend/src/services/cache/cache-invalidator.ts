import { type CacheService, getCacheService } from './index';

export type MerchantCacheScope = 'dashboard' | 'trends' | 'operations' | 'exceptions';

/**
 * Builds versioned, tenant-isolated cache keys.
 * Format: v1:m:<merchantId>:<scope>:ver<version>:<uniqueKey>
 */
export function buildMerchantCacheKey(
    merchantId: string,
    scope: MerchantCacheScope,
    uniqueKey: string,
    version: number = 1,
): string {
    return `v1:m:${merchantId}:${scope}:ver${version}:${uniqueKey}`;
}

/**
 * Invalidates cache for a specific merchant across target scopes.
 * Increments scope generation version and deletes legacy top-level keys.
 * Operates gracefully even if Redis is unreachable.
 */
export async function invalidateMerchantScope(
    merchantId: string,
    scopes: MerchantCacheScope[],
    cache: CacheService = getCacheService(),
): Promise<void> {
    if (!merchantId) return;
    try {
        const keysToDelete: string[] = [];
        for (const scope of scopes) {
            // Increment generation counter for this merchant & scope
            await cache.increment(`v1:m:${merchantId}:${scope}:gen`, 86400 * 30);

            // Legacy keys for immediate backward compatibility
            if (scope === 'dashboard') {
                keysToDelete.push(
                    `dashboard:${merchantId}:all:all`,
                    `dashboard:${merchantId}:24h`,
                    `dashboard:${merchantId}:7d`,
                    `dashboard:${merchantId}:30d`,
                );
            } else if (scope === 'operations') {
                keysToDelete.push(`operations:${merchantId}`);
            } else if (scope === 'trends') {
                keysToDelete.push(
                    `trends:${merchantId}:7d`,
                    `trends:${merchantId}:30d`,
                    `trends:${merchantId}:90d`,
                );
            }
        }

        if (keysToDelete.length > 0) {
            await cache.del(keysToDelete);
        }
    } catch (err) {
        // Cache invalidation failure must not abort successful database mutations
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[CacheInvalidator] Invalidation warning for merchant ${merchantId}: ${msg}`);
    }
}

