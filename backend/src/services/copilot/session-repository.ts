import { randomUUID } from 'crypto';
import type {
    CopilotSession,
    CopilotMessage,
    CopilotSessionListResult,
    CopilotMessageListResult,
    CopilotTurnContext,
    CopilotAskResult,
} from './types';

export interface CreateSessionOptions {
    merchantId: string;
    userId: string;
    title?: string;
}

export interface AddMessageOptions {
    merchantId: string;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    answerPayload?: CopilotAskResult;
    requestId?: string;
}

export interface CopilotSessionRepository {
    listSessions(
        merchantId: string,
        userId?: string,
        limit?: number,
        cursor?: string,
    ): Promise<CopilotSessionListResult>;

    getSession(merchantId: string, sessionId: string): Promise<CopilotSession | null>;

    createSession(options: CreateSessionOptions): Promise<CopilotSession>;

    updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | null },
    ): Promise<CopilotSession | null>;

    listMessages(
        merchantId: string,
        sessionId: string,
        limit?: number,
        cursor?: string,
    ): Promise<CopilotMessageListResult>;

    addMessage(options: AddMessageOptions): Promise<CopilotMessage>;

    getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns?: number,
    ): Promise<CopilotTurnContext[]>;
}

/**
 * Tenant-isolated in-memory Copilot Session Repository.
 * Provides durable session operations across requests within application runtime,
 * while relational PostgreSQL schema migration remains blocked per Day 30 guardrails.
 */
export class InMemoryCopilotSessionRepository implements CopilotSessionRepository {
    // Keyed by merchantId -> sessionId -> CopilotSession
    private readonly sessionsByMerchant = new Map<string, Map<string, CopilotSession>>();
    // Keyed by merchantId:sessionId -> CopilotMessage[]
    private readonly messagesBySession = new Map<string, CopilotMessage[]>();

    private getSessionKey(merchantId: string, sessionId: string): string {
        return `${merchantId}:${sessionId}`;
    }

    private getMerchantSessions(merchantId: string): Map<string, CopilotSession> {
        let merchantSessions = this.sessionsByMerchant.get(merchantId);
        if (!merchantSessions) {
            merchantSessions = new Map<string, CopilotSession>();
            this.sessionsByMerchant.set(merchantId, merchantSessions);
        }
        return merchantSessions;
    }

    async listSessions(
        merchantId: string,
        userIdOrOptions?: string | { userId?: string; limit?: number; cursor?: string },
        limitArg: number = 20,
        cursorArg?: string,
    ): Promise<CopilotSessionListResult> {
        let userId: string | undefined;
        let limit = limitArg;
        let cursor = cursorArg;

        if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
            userId = userIdOrOptions.userId;
            limit = userIdOrOptions.limit ?? limitArg;
            cursor = userIdOrOptions.cursor ?? cursorArg;
        } else {
            userId = userIdOrOptions;
        }

        const safeLimit = Math.min(Math.max(limit, 1), 50);
        const merchantSessions = this.getMerchantSessions(merchantId);

        let sessions = Array.from(merchantSessions.values())
            .filter((s) => !s.archivedAt && (!userId || s.createdByUserId === userId))
            .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        if (cursor) {
            const cursorIdx = sessions.findIndex((s) => s.id === cursor);
            if (cursorIdx >= 0) {
                sessions = sessions.slice(cursorIdx + 1);
            }
        }

        const items = sessions.slice(0, safeLimit);
        const hasMore = sessions.length > safeLimit;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
            items,
            nextCursor,
            hasMore,
            storageMode: 'tenant_session_store',
        };
    }

    async getSession(merchantId: string, sessionId: string): Promise<CopilotSession | null> {
        const merchantSessions = this.getMerchantSessions(merchantId);
        const session = merchantSessions.get(sessionId);
        if (!session || session.merchantId !== merchantId) {
            return null;
        }
        return session;
    }

    async createSession(options: CreateSessionOptions | { merchantId: string; createdByUserId?: string; userId?: string; title?: string }): Promise<CopilotSession> {
        const merchantId = options.merchantId;
        const userId = options.userId || (options as any).createdByUserId || 'operator';
        const title = options.title;
        const merchantSessions = this.getMerchantSessions(merchantId);

        const now = new Date().toISOString();
        const sessionId = randomUUID();
        const cleanTitle = (title || 'New Conversation').trim().slice(0, 100);

        const session: CopilotSession = {
            id: sessionId,
            merchantId,
            createdByUserId: userId,
            title: cleanTitle,
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            archivedAt: null,
            version: 1,
        };

        merchantSessions.set(sessionId, session);
        this.messagesBySession.set(this.getSessionKey(merchantId, sessionId), []);

        return session;
    }

    async updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | null; isArchived?: boolean },
    ): Promise<CopilotSession | null> {
        const session = await this.getSession(merchantId, sessionId);
        if (!session) return null;

        const now = new Date().toISOString();
        const archivedAt = updates.isArchived !== undefined
            ? (updates.isArchived ? now : null)
            : updates.archivedAt !== undefined
              ? updates.archivedAt
              : session.archivedAt;

        const updated: CopilotSession = {
            ...session,
            title: updates.title !== undefined ? updates.title.trim().slice(0, 100) : session.title,
            archivedAt,
            updatedAt: now,
            version: session.version + 1,
        };

        const merchantSessions = this.getMerchantSessions(merchantId);
        merchantSessions.set(sessionId, updated);
        return updated;
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        limit: number = 50,
        cursor?: string,
    ): Promise<CopilotMessageListResult> {
        const session = await this.getSession(merchantId, sessionId);
        if (!session) {
            return {
                items: [],
                nextCursor: null,
                hasMore: false,
                storageMode: 'tenant_session_store',
            };
        }

        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const key = this.getSessionKey(merchantId, sessionId);
        let messages = [...(this.messagesBySession.get(key) || [])];

        if (cursor) {
            const cursorIdx = messages.findIndex((m) => m.id === cursor);
            if (cursorIdx >= 0) {
                messages = messages.slice(cursorIdx + 1);
            }
        }

        const items = messages.slice(0, safeLimit);
        const hasMore = messages.length > safeLimit;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
            items,
            nextCursor,
            hasMore,
            storageMode: 'tenant_session_store',
        };
    }

    async addMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        const { merchantId, sessionId, role, content, answerPayload, requestId } = options;
        const session = await this.getSession(merchantId, sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found for merchant ${merchantId}`);
        }

        const now = new Date().toISOString();
        const messageId = randomUUID();
        const boundedContent = content.trim().slice(0, 1000);

        const message: CopilotMessage = {
            id: messageId,
            sessionId,
            merchantId,
            role,
            content: boundedContent,
            answerPayload,
            createdAt: now,
            requestId,
        };

        const key = this.getSessionKey(merchantId, sessionId);
        const list = this.messagesBySession.get(key) || [];
        list.push(message);
        this.messagesBySession.set(key, list);

        // Update session's lastMessageAt and title if it was first message
        const merchantSessions = this.getMerchantSessions(merchantId);
        const isFirstUserMessage = role === 'user' && list.filter((m) => m.role === 'user').length === 1;
        const newTitle =
            isFirstUserMessage && session.title === 'New Conversation'
                ? boundedContent.slice(0, 48)
                : session.title;

        merchantSessions.set(sessionId, {
            ...session,
            title: newTitle,
            lastMessageAt: now,
            updatedAt: now,
            version: session.version + 1,
        });

        return message;
    }

    async getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns: number = 6,
    ): Promise<CopilotTurnContext[]> {
        const key = this.getSessionKey(merchantId, sessionId);
        const list = this.messagesBySession.get(key) || [];
        // Bounded to last maxTurns messages (at most 3 user/assistant pairs = 6 messages)
        const recent = list.slice(-Math.min(maxTurns, 6));

        return recent.map((m) => ({
            role: m.role,
            content: m.content,
            intent: m.answerPayload?.intent,
        }));
    }
}

/**
 * Prisma-backed relational Copilot Session Repository.
 * Automatically delegates to PostgreSQL when the model and table are available,
 * and seamlessly falls back to the tenant-isolated in-memory store until prisma migrations are run.
 */
export class PrismaCopilotSessionRepository implements CopilotSessionRepository {
    private readonly inMemoryFallback = new InMemoryCopilotSessionRepository();
    private db: any;

    constructor(db?: any) {
        this.db = db;
    }

    public setDb(db: any): void {
        this.db = db;
    }

    private hasPrismaModel(): boolean {
        return Boolean(this.db && typeof this.db.copilotSession?.findMany === 'function');
    }

    async listSessions(
        merchantId: string,
        userIdOrOptions?: string | { userId?: string; limit?: number; cursor?: string },
        limitArg: number = 20,
        cursorArg?: string,
    ): Promise<CopilotSessionListResult> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.listSessions(merchantId, userIdOrOptions, limitArg, cursorArg);
        }

        try {
            let userId: string | undefined;
            let limit = limitArg;
            let cursor = cursorArg;

            if (typeof userIdOrOptions === 'object' && userIdOrOptions !== null) {
                userId = userIdOrOptions.userId;
                limit = userIdOrOptions.limit ?? limitArg;
                cursor = userIdOrOptions.cursor ?? cursorArg;
            } else {
                userId = userIdOrOptions;
            }

            const safeLimit = Math.min(Math.max(limit, 1), 50);

            const where: any = {
                merchantId,
                archivedAt: null,
                ...(userId ? { createdByUserId: userId } : {}),
            };

            const rows = await this.db.copilotSession.findMany({
                where,
                orderBy: { lastMessageAt: 'desc' },
                take: safeLimit + 1,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });

            const hasMore = rows.length > safeLimit;
            const items = rows.slice(0, safeLimit).map((r: any) => ({
                id: r.id,
                merchantId: r.merchantId,
                createdByUserId: r.createdByUserId,
                title: r.title,
                createdAt: new Date(r.createdAt).toISOString(),
                updatedAt: new Date(r.updatedAt).toISOString(),
                lastMessageAt: new Date(r.lastMessageAt).toISOString(),
                archivedAt: r.archivedAt ? new Date(r.archivedAt).toISOString() : null,
                version: r.version,
            }));

            const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

            return {
                items,
                nextCursor,
                hasMore,
                storageMode: 'postgresql',
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:listSessions] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.listSessions(merchantId, userIdOrOptions, limitArg, cursorArg);
        }
    }

    async getSession(merchantId: string, sessionId: string): Promise<CopilotSession | null> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.getSession(merchantId, sessionId);
        }

        try {
            const row = await this.db.copilotSession.findFirst({
                where: { id: sessionId, merchantId },
            });

            if (!row) return null;

            return {
                id: row.id,
                merchantId: row.merchantId,
                createdByUserId: row.createdByUserId,
                title: row.title,
                createdAt: new Date(row.createdAt).toISOString(),
                updatedAt: new Date(row.updatedAt).toISOString(),
                lastMessageAt: new Date(row.lastMessageAt).toISOString(),
                archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
                version: row.version,
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:getSession] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.getSession(merchantId, sessionId);
        }
    }

    async createSession(options: CreateSessionOptions | { merchantId: string; createdByUserId?: string; userId?: string; title?: string }): Promise<CopilotSession> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.createSession(options);
        }

        try {
            const merchantId = options.merchantId;
            const userId = options.userId || (options as any).createdByUserId || 'operator';
            const title = (options.title || 'New Conversation').trim().slice(0, 100);

            const row = await this.db.copilotSession.create({
                data: {
                    merchantId,
                    createdByUserId: userId,
                    title,
                },
            });

            return {
                id: row.id,
                merchantId: row.merchantId,
                createdByUserId: row.createdByUserId,
                title: row.title,
                createdAt: new Date(row.createdAt).toISOString(),
                updatedAt: new Date(row.updatedAt).toISOString(),
                lastMessageAt: new Date(row.lastMessageAt).toISOString(),
                archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
                version: row.version,
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:createSession] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.createSession(options);
        }
    }

    async updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | null; isArchived?: boolean },
    ): Promise<CopilotSession | null> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.updateSession(merchantId, sessionId, updates);
        }

        try {
            const session = await this.getSession(merchantId, sessionId);
            if (!session) return null;

            const now = new Date();
            const archivedAt = updates.isArchived !== undefined
                ? (updates.isArchived ? now : null)
                : updates.archivedAt !== undefined
                  ? (updates.archivedAt ? new Date(updates.archivedAt) : null)
                  : undefined;

            const row = await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    ...(updates.title !== undefined ? { title: updates.title.trim().slice(0, 100) } : {}),
                    ...(archivedAt !== undefined ? { archivedAt } : {}),
                    version: { increment: 1 },
                },
            });

            return {
                id: row.id,
                merchantId: row.merchantId,
                createdByUserId: row.createdByUserId,
                title: row.title,
                createdAt: new Date(row.createdAt).toISOString(),
                updatedAt: new Date(row.updatedAt).toISOString(),
                lastMessageAt: new Date(row.lastMessageAt).toISOString(),
                archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
                version: row.version,
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:updateSession] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.updateSession(merchantId, sessionId, updates);
        }
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        limit: number = 50,
        cursor?: string,
    ): Promise<CopilotMessageListResult> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.listMessages(merchantId, sessionId, limit, cursor);
        }

        try {
            const safeLimit = Math.min(Math.max(limit, 1), 100);

            const rows = await this.db.copilotMessage.findMany({
                where: { sessionId, merchantId },
                orderBy: { createdAt: 'asc' },
                take: safeLimit + 1,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            });

            const hasMore = rows.length > safeLimit;
            const items = rows.slice(0, safeLimit).map((r: any) => ({
                id: r.id,
                sessionId: r.sessionId,
                merchantId: r.merchantId,
                role: r.role,
                content: r.content,
                answerPayload: r.answerPayload,
                createdAt: new Date(r.createdAt).toISOString(),
                requestId: r.requestId,
            }));

            const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

            return {
                items,
                nextCursor,
                hasMore,
                storageMode: 'postgresql',
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:listMessages] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.listMessages(merchantId, sessionId, limit, cursor);
        }
    }

    async addMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.addMessage(options);
        }

        try {
            const { merchantId, sessionId, role, content, answerPayload, requestId } = options;
            const boundedContent = content.trim().slice(0, 1000);

            const message = await this.db.copilotMessage.create({
                data: {
                    sessionId,
                    merchantId,
                    role,
                    content: boundedContent,
                    answerPayload: answerPayload ?? undefined,
                    requestId,
                },
            });

            // Update session's lastMessageAt
            const now = new Date();
            await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    lastMessageAt: now,
                    version: { increment: 1 },
                },
            });

            return {
                id: message.id,
                sessionId: message.sessionId,
                merchantId: message.merchantId,
                role: message.role,
                content: message.content,
                answerPayload: message.answerPayload,
                createdAt: new Date(message.createdAt).toISOString(),
                requestId: message.requestId,
            };
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:addMessage] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.addMessage(options);
        }
    }

    async getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns: number = 6,
    ): Promise<CopilotTurnContext[]> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.getRecentTurnWindow(merchantId, sessionId, maxTurns);
        }

        try {
            const rows = await this.db.copilotMessage.findMany({
                where: { sessionId, merchantId },
                orderBy: { createdAt: 'desc' },
                take: Math.min(maxTurns, 6),
            });

            return rows.reverse().map((m: any) => ({
                role: m.role,
                content: m.content,
                intent: m.answerPayload?.intent,
            }));
        } catch (err: any) {
            console.warn('[PrismaCopilotSessionRepository:getRecentTurnWindow] Database query failed, falling back to runtime store:', err?.message || err);
            return this.inMemoryFallback.getRecentTurnWindow(merchantId, sessionId, maxTurns);
        }
    }
}

// Global default instance for runtime session persistence
let globalSessionRepo: PrismaCopilotSessionRepository | null = null;

export function getCopilotSessionRepository(db?: any): CopilotSessionRepository {
    if (!globalSessionRepo) {
        let database = db;
        if (!database) {
            try {
                // Lazily get default database if available
                const { getDB } = require('../../db/postgres');
                database = getDB();
            } catch {
                // Ignore if in standalone test environment without db
            }
        }
        globalSessionRepo = new PrismaCopilotSessionRepository(database);
    } else if (db) {
        globalSessionRepo.setDb(db);
    }
    return globalSessionRepo;
}

export function setCopilotSessionRepository(repo: CopilotSessionRepository | null): void {
    if (repo instanceof PrismaCopilotSessionRepository || repo === null) {
        globalSessionRepo = repo;
    } else {
        // If an arbitrary repo is injected (e.g. In mock test), wrap or cast
        globalSessionRepo = repo as any;
    }
}
