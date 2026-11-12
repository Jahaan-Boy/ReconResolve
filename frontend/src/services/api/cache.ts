/**
 * High-Performance Client-Side In-Memory SWR Query Cache & Request Deduplicator
 *
 * Provides:
 * 1. Stale-While-Revalidate (SWR): Returns fresh cached data immediately (0ms).
 *    If stale, returns cached data immediately and revalidates in the background without UI flicker.
 * 2. In-Flight Request Deduplication: Merges concurrent identical requests into a single promise.
 * 3. Tag/Pattern Invalidation: Safely evicts or updates cache on mutations.
 * 4. Zero dependencies, type-safe, minimal memory footprint.
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    staleTtl: number;
}

export interface FetchOptions {
    ttl?: number;          // Milliseconds data is strictly fresh (default: 30,000ms / 30s)
    staleTtl?: number;     // Milliseconds stale data can be served while revalidating (default: 180,000ms / 3m)
    forceRefresh?: boolean;// Bypass cache and fetch fresh
    tags?: string[];       // Semantic tags for targeted invalidation
}

class ClientQueryCache {
    private cache = new Map<string, CacheEntry<unknown>>();
    private inflight = new Map<string, Promise<unknown>>();
    private keyTags = new Map<string, Set<string>>();

    /**
     * Executes fetcher with SWR caching and in-flight request deduplication.
     */
    async fetch<T>(
        key: string,
        fetcher: () => Promise<T>,
        options: FetchOptions = {},
    ): Promise<T> {
        const ttl = options.ttl ?? 30_000;
        const staleTtl = options.staleTtl ?? 180_000;
        const now = Date.now();

        // Register semantic tags
        if (options.tags && options.tags.length > 0) {
            let tagsSet = this.keyTags.get(key);
            if (!tagsSet) {
                tagsSet = new Set<string>();
                this.keyTags.set(key, tagsSet);
            }
            for (const tag of options.tags) {
                tagsSet.add(tag);
            }
        }

        // 1. Check existing cache
        if (!options.forceRefresh && this.cache.has(key)) {
            const entry = this.cache.get(key) as CacheEntry<T>;
            const age = now - entry.timestamp;

            // Completely fresh: return immediately (0ms latency)
            if (age < entry.ttl) {
                return entry.data;
            }

            // Stale but within SWR window: return cached data immediately, revalidate in background
            if (age < entry.staleTtl) {
                this.revalidateInBackground(key, fetcher, ttl, staleTtl);
                return entry.data;
            }
        }

        // 2. In-flight request deduplication
        if (this.inflight.has(key)) {
            return this.inflight.get(key) as Promise<T>;
        }

        // 3. Perform network fetch
        const promise = (async () => {
            try {
                const data = await fetcher();
                this.cache.set(key, {
                    data,
                    timestamp: Date.now(),
                    ttl,
                    staleTtl,
                });
                return data;
            } finally {
                this.inflight.delete(key);
            }
        })();

        this.inflight.set(key, promise);
        return promise;
    }

    private revalidateInBackground<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number,
        staleTtl: number,
    ) {
        if (this.inflight.has(key)) return;

        const promise = (async () => {
            try {
                const data = await fetcher();
                this.cache.set(key, {
                    data,
                    timestamp: Date.now(),
                    ttl,
                    staleTtl,
                });
            } catch {
                // Silently swallow background revalidation errors so user UI remains undisturbed
            } finally {
                this.inflight.delete(key);
            }
        })();

        this.inflight.set(key, promise);
    }

    /**
     * Direct synchronous cache read.
     */
    get<T>(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        return entry.data as T;
    }

    /**
     * Direct synchronous cache write.
     */
    set<T>(key: string, data: T, ttl = 30_000, staleTtl = 180_000): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
            staleTtl,
        });
    }

    /**
     * Invalidates keys matching string prefix or RegExp.
     */
    invalidate(keyOrPattern: string | RegExp): void {
        if (typeof keyOrPattern === 'string') {
            for (const key of this.cache.keys()) {
                if (key.startsWith(keyOrPattern)) {
                    this.cache.delete(key);
                    this.keyTags.delete(key);
                }
            }
        } else {
            for (const key of this.cache.keys()) {
                if (keyOrPattern.test(key)) {
                    this.cache.delete(key);
                    this.keyTags.delete(key);
                }
            }
        }
    }

    /**
     * Invalidate all keys matching semantic tag.
     */
    invalidateTag(tag: string): void {
        for (const [key, tags] of this.keyTags.entries()) {
            if (tags.has(tag)) {
                this.cache.delete(key);
                this.keyTags.delete(key);
            }
        }
    }

    /**
     * Completely clear all cache and pending requests.
     */
    clear(): void {
        this.cache.clear();
        this.inflight.clear();
        this.keyTags.clear();
    }
}

export const queryCache = new ClientQueryCache();
