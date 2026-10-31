/**
 * Generic Cache Service Interface for FlowOps.
 * Provides unified abstraction over Redis and In-Memory fallback stores.
 */

export interface CacheService {
    readonly providerName: 'redis' | 'in-memory';

    /**
     * Retrieve a cached item by key.
     * Returns null if key is not found or has expired.
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Store an item in the cache with an optional TTL (in seconds).
     * If ttlSeconds is omitted or <= 0, the item does not expire.
     */
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

    /**
     * Delete one or multiple keys from the cache.
     */
    del(key: string | string[]): Promise<void>;

    /**
     * Atomic cache-aside helper with cache-stampede protection.
     * Returns cached value if present; otherwise invokes fetcher, caches result, and returns it.
     */
    getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T>;

    /**
     * Atomically increment a numeric counter associated with a key and set a TTL window.
     * Used for distributed rate limiting and request throttling.
     */
    increment(key: string, windowSeconds: number): Promise<{ count: number; ttlRemainingSeconds: number }>;

    /**
     * Clear all cached keys managed by this store.
     */
    flush(): Promise<void>;

    /**
     * Check provider health and measure round-trip latency.
     */
    healthCheck(): Promise<{ ok: boolean; provider: string; latencyMs: number }>;

    /**
     * Gracefully close connections.
     */
    disconnect(): Promise<void>;
}

export interface RedisClientInterface {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
    del(...keys: string[]): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    ping(): Promise<string>;
    flushdb?(): Promise<unknown>;
    quit?(): Promise<unknown>;
    disconnect?(): void;
    status?: string;
    on?(event: string, callback: (...args: any[]) => void): void;
}

