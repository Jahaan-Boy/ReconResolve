import type { CacheService } from './cache.interface';

interface MemoryCacheEntry {
    value: string;
    expiresAt: number | null; // null = never expires
}

interface RateLimitBucket {
    count: number;
    resetAt: number;
}

export class InMemoryCacheService implements CacheService {
    public readonly providerName = 'in-memory';

    private readonly store = new Map<string, MemoryCacheEntry>();
    private readonly inflight = new Map<string, Promise<any>>();
    private readonly maxEntries: number;

    constructor(options: { maxEntries?: number } = {}) {
        this.maxEntries = options.maxEntries ?? 10_000;
    }

    public async get<T>(key: string): Promise<T | null> {
        this.purgeExpiredIfNeeded();
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }

        try {
            return JSON.parse(entry.value) as T;
        } catch {
            return entry.value as unknown as T;
        }
    }

    public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        this.evictIfFull();

        const expiresAt = ttlSeconds && ttlSeconds > 0
            ? Date.now() + ttlSeconds * 1000
            : null;

        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        this.store.set(key, { value: serialized, expiresAt });
    }

    public async del(key: string | string[]): Promise<void> {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) {
            this.store.delete(k);
        }
    }

    public async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // In-flight coalescing prevents cache stampedes on the same key
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
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || (entry.expiresAt !== null && now > entry.expiresAt)) {
            const expiresAt = now + windowSeconds * 1000;
            this.store.set(key, { value: '1', expiresAt });
            return { count: 1, ttlRemainingSeconds: windowSeconds };
        }

        const currentCount = Number.parseInt(entry.value, 10) || 0;
        const newCount = currentCount + 1;
        this.store.set(key, { value: String(newCount), expiresAt: entry.expiresAt });

        const remainingMs = entry.expiresAt ? Math.max(0, entry.expiresAt - now) : 0;
        return {
            count: newCount,
            ttlRemainingSeconds: Math.ceil(remainingMs / 1000),
        };
    }

    public async flush(): Promise<void> {
        this.store.clear();
        this.inflight.clear();
    }

    public async healthCheck(): Promise<{ ok: boolean; provider: string; latencyMs: number }> {
        const start = Date.now();
        const testKey = '__health_ping__';
        this.store.set(testKey, { value: 'pong', expiresAt: Date.now() + 1000 });
        this.store.delete(testKey);
        return {
            ok: true,
            provider: this.providerName,
            latencyMs: Date.now() - start,
        };
    }

    public async disconnect(): Promise<void> {
        this.store.clear();
        this.inflight.clear();
    }

    private purgeExpiredIfNeeded(): void {
        if (this.store.size < 50) return;
        const now = Date.now();
        for (const [k, v] of this.store.entries()) {
            if (v.expiresAt !== null && now > v.expiresAt) {
                this.store.delete(k);
            }
        }
    }

    private evictIfFull(): void {
        if (this.store.size < this.maxEntries) return;
        // Evict expired first
        this.purgeExpiredIfNeeded();
        if (this.store.size < this.maxEntries) return;

        // Evict oldest (FIFO) key
        const oldest = this.store.keys().next().value;
        if (oldest) {
            this.store.delete(oldest);
        }
    }
}

