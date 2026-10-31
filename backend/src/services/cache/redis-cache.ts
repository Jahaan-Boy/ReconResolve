import type { CacheService, RedisClientInterface } from './cache.interface';

export interface RedisCacheOptions {
    keyPrefix?: string;
    defaultTtlSeconds?: number;
}

export class RedisCacheService implements CacheService {
    public readonly providerName = 'redis';

    private readonly client: RedisClientInterface;
    private readonly prefix: string;
    private readonly defaultTtl: number;
    private readonly inflight = new Map<string, Promise<any>>();

    constructor(client: RedisClientInterface, options: RedisCacheOptions = {}) {
        this.client = client;
        this.prefix = options.keyPrefix ? `${options.keyPrefix}:` : 'flowops:';
        this.defaultTtl = options.defaultTtlSeconds ?? 300;
    }

    private formatKey(key: string): string {
        return key.startsWith(this.prefix) ? key : `${this.prefix}${key}`;
    }

    public async get<T>(key: string): Promise<T | null> {
        const fullKey = this.formatKey(key);
        try {
            const raw = await this.client.get(fullKey);
            if (!raw) {
                return null;
            }
            try {
                return JSON.parse(raw) as T;
            } catch {
                return raw as unknown as T;
            }
        } catch (error) {
            console.warn(`[RedisCache] GET error for key ${key}:`, error instanceof Error ? error.message : String(error));
            return null; // Graceful degradation on cache error
        }
    }

    public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const fullKey = this.formatKey(key);
        const ttl = ttlSeconds !== undefined && ttlSeconds > 0 ? ttlSeconds : this.defaultTtl;
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);

        try {
            if (ttl > 0) {
                await this.client.set(fullKey, serialized, 'EX', ttl);
            } else {
                await this.client.set(fullKey, serialized);
            }
        } catch (error) {
            console.warn(`[RedisCache] SET error for key ${key}:`, error instanceof Error ? error.message : String(error));
        }
    }

    public async del(key: string | string[]): Promise<void> {
        const keys = Array.isArray(key) ? key : [key];
        if (keys.length === 0) return;

        const fullKeys = keys.map((k) => this.formatKey(k));
        try {
            await this.client.del(...fullKeys);
        } catch (error) {
            console.warn(`[RedisCache] DEL error:`, error instanceof Error ? error.message : String(error));
        }
    }

    public async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // Cache stampede coalescing on the same key
        const pending = this.inflight.get(key);
        if (pending) {
            return pending as Promise<T>;
        }

        const task = (async () => {
            try {
                const fresh = await fetcher();
                await this.set(key, fresh, ttlSeconds);
                return fresh;
            } finally {
                this.inflight.delete(key);
            }
        })();

        this.inflight.set(key, task);
        return task;
    }

    public async increment(
        key: string,
        windowSeconds: number,
    ): Promise<{ count: number; ttlRemainingSeconds: number }> {
        const fullKey = this.formatKey(`ratelimit:${key}`);
        try {
            const count = await this.client.incr(fullKey);
            let ttl = await this.client.ttl(fullKey);

            // First request in the window or key had no expiry
            if (count === 1 || ttl === -1) {
                await this.client.expire(fullKey, windowSeconds);
                ttl = windowSeconds;
            }

            return {
                count,
                ttlRemainingSeconds: ttl > 0 ? ttl : windowSeconds,
            };
        } catch (error) {
            console.warn(`[RedisCache] INCR error for ${key}:`, error instanceof Error ? error.message : String(error));
            // In case of Redis outage, fail open to avoid blocking legitimate users
            return { count: 1, ttlRemainingSeconds: windowSeconds };
        }
    }

    public async flush(): Promise<void> {
        try {
            if (typeof this.client.flushdb === 'function') {
                await this.client.flushdb();
            }
        } catch (error) {
            console.warn(`[RedisCache] FLUSHDB error:`, error instanceof Error ? error.message : String(error));
        }
    }

    public async healthCheck(): Promise<{ ok: boolean; provider: string; latencyMs: number }> {
        const start = Date.now();
        try {
            const pingRes = await this.client.ping();
            const latencyMs = Date.now() - start;
            return {
                ok: pingRes === 'PONG' || typeof pingRes === 'string',
                provider: this.providerName,
                latencyMs,
            };
        } catch (error) {
            return {
                ok: false,
                provider: this.providerName,
                latencyMs: Date.now() - start,
            };
        }
    }

    public async disconnect(): Promise<void> {
        try {
            if (typeof this.client.quit === 'function') {
                await this.client.quit();
            } else if (typeof this.client.disconnect === 'function') {
                this.client.disconnect();
            }
        } catch {
            // Ignore clean teardown error
        }
    }
}

