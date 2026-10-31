import type { CacheService, RedisClientInterface } from './cache.interface';
import { InMemoryCacheService } from './in-memory-cache';
import { RedisCacheService } from './redis-cache';

export interface CacheFactoryOptions {
    redisUrl?: string;
    keyPrefix?: string;
    defaultTtlSeconds?: number;
    customClient?: RedisClientInterface;
}

let globalCacheInstance: CacheService | null = null;

export function createCacheService(options: CacheFactoryOptions = {}): CacheService {
    // 1. Explicitly provided client (e.g. for testing or custom connections)
    if (options.customClient) {
        return new RedisCacheService(options.customClient, {
            keyPrefix: options.keyPrefix,
            defaultTtlSeconds: options.defaultTtlSeconds,
        });
    }

    const redisUrl = options.redisUrl ?? process.env.REDIS_URL;

    // 2. If no Redis URL is configured, use in-memory store
    if (!redisUrl || redisUrl.trim().length === 0) {
        return new InMemoryCacheService();
    }

    // 3. Attempt to initialize ioredis dynamically
    try {
        // Dynamic require allows building and running even before ioredis package is installed
        const IORedis = require('ioredis');
        const client = new IORedis(redisUrl.trim(), {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
            retryStrategy: (times: number) => Math.min(times * 200, 3000),
        });

        // Suppress unhandled error crashes from disconnected Redis in development
        if (typeof client.on === 'function') {
            client.on('error', (err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[RedisConnection] Transient Redis error: ${message}`);
            });
        }

        return new RedisCacheService(client, {
            keyPrefix: options.keyPrefix,
            defaultTtlSeconds: options.defaultTtlSeconds,
        });
    } catch {
        console.info(
            '[CacheFactory] Notice: Redis client library (ioredis) is not installed. Defaulting to in-memory cache store.',
        );
        return new InMemoryCacheService();
    }
}

export function getCacheService(): CacheService {
    if (!globalCacheInstance) {
        globalCacheInstance = createCacheService();
    }
    return globalCacheInstance;
}

export function setGlobalCacheService(service: CacheService | null): void {
    globalCacheInstance = service;
}

