import crypto from 'node:crypto';
import { getDB } from '../db/postgres';
import type { PrismaClient } from '../generated/prisma';

export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export interface SessionServiceDeps {
    getDb?: () => PrismaClient;
}

export function createSessionService(deps: SessionServiceDeps = {}) {
    const dbProvider = deps.getDb ?? getDB;

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

            if (session.user.status !== 'ACTIVE') {
                return {
                    session,
                    user: session.user,
                    isUserDisabled: true,
                };
            }

            return {
                session,
                user: session.user,
                isUserDisabled: false,
            };
        },

        async revokeSession(rawToken: string): Promise<boolean> {
            if (!rawToken || typeof rawToken !== 'string') {
                return false;
            }

            const db = dbProvider();
            const tokenHash = hashSessionToken(rawToken.trim());

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
