import crypto from 'node:crypto';
import { config } from '../config';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';
import { getCacheService, type CacheService } from '../services/cache';

export const DEFAULT_SESSION_TTL_MS = config?.sessionTtlMs ?? (7 * 24 * 60 * 60 * 1000); // from config or 7 days fallback

export function hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export interface SessionServiceDeps {
    getDb?: () => PrismaClient;
    cache?: CacheService;
}

export function createSessionService(deps: SessionServiceDeps = {}) {
    const dbProvider = deps.getDb ?? getDB;
    const cacheProvider = () => deps.cache ?? getCacheService();

    return {
        async createSession(userId: string, ttlMs: number = DEFAULT_SESSION_TTL_MS) {
            const db = dbProvider();
            const rawToken = generateSessionToken();
            const tokenHash = hashSessionToken(rawToken);
            const expiresAt = new Date(Date.now() + ttlMs);

            const session = await db.session.create({
                data: {
                    userId,
                    tokenHash,
                    expiresAt,
                },
            });

            return {
                rawToken,
                session: {
                    id: session.id,
                    userId: session.userId,
                    expiresAt: session.expiresAt,
                    createdAt: session.createdAt,
                },
            };
        },

        async validateSession(rawToken: string) {
            if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length === 0) {
                return null;
            }

            const db = dbProvider();
            const tokenHash = hashSessionToken(rawToken.trim());
            const cacheKey = `session:${tokenHash}`;

            // 1. Check Redis / Cache first to avoid hitting PostgreSQL on every request
            const cached = await cacheProvider().get<{
                session: any;
                user: any;
                isUserDisabled: boolean;
            }>(cacheKey);

            if (cached) {
                if (cached.session?.expiresAt) {
                    cached.session.expiresAt = new Date(cached.session.expiresAt);
                    cached.session.createdAt = new Date(cached.session.createdAt);
                }
                return cached;
            }

            // 2. Cache miss: Query database
            const session = await db.session.findFirst({
                where: {
                    tokenHash,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
                include: {
                    user: true,
                },
            });

            if (!session) {
                return null;
            }

            const result = {
                session,
                user: session.user,
                isUserDisabled: session.user.status !== 'ACTIVE',
            };

            // 3. Cache valid session for at most 300 seconds (or remaining lifetime)
            const remainingSeconds = Math.max(
                1,
                Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
            );
            await cacheProvider().set(cacheKey, result, Math.min(300, remainingSeconds));

            return result;
        },

        async revokeSession(rawToken: string): Promise<boolean> {
            if (!rawToken || typeof rawToken !== 'string') {
                return false;
            }

            const db = dbProvider();
            const tokenHash = hashSessionToken(rawToken.trim());
            const cacheKey = `session:${tokenHash}`;

            // Invalidate cached session in Redis immediately
            await cacheProvider().del(cacheKey);

            const result = await db.session.updateMany({
                where: {
                    tokenHash,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });

            return result.count > 0;
        },

        async revokeAllUserSessions(userId: string): Promise<number> {
            const db = dbProvider();
            const result = await db.session.updateMany({
                where: {
                    userId,
                    revokedAt: null,
                },
                data: {
                    revokedAt: new Date(),
                },
            });
            return result.count;
        },
    };
}

export type SessionService = ReturnType<typeof createSessionService>;
