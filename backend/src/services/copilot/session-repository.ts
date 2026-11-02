import { randomUUID } from 'crypto';
import type {
    CopilotSession,
    CopilotMessage,
    CopilotSessionListResult,
    CopilotMessageListResult,
    CopilotTurnContext,
    CreateSessionOptions,
    AddMessageOptions,
    StorageModeStatus,
    ListSessionsFilter,
    ListMessagesFilter,
} from './types';
import { CopilotError } from './errors';

export {
    CreateSessionOptions,
    AddMessageOptions,
};

export interface CopilotSessionRepository {
    readonly storageMode: string;
    getStorageModeStatus(): StorageModeStatus;

    listSessions(
        merchantId: string,
        userIdOrFilter?: string | ListSessionsFilter,
        limitOrFilter?: number | ListSessionsFilter,
        cursorArg?: string,
    ): Promise<CopilotSessionListResult>;

    getSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession | null>;

    createSession(options: CreateSessionOptions): Promise<CopilotSession>;

    renameSession(merchantId: string, sessionId: string, title: string, userId?: string): Promise<CopilotSession>;

    archiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession>;

    unarchiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession>;

    updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | Date | null; isArchived?: boolean },
    ): Promise<CopilotSession | null>;

    listMessages(
        merchantId: string,
        sessionId: string,
        filterOrLimit?: number | ListMessagesFilter,
        cursor?: string,
    ): Promise<CopilotMessageListResult>;

    appendMessage(options: AddMessageOptions): Promise<CopilotMessage>;
    addMessage(options: AddMessageOptions): Promise<CopilotMessage>;

    getRecentMessages(merchantId: string, sessionId: string, limit?: number): Promise<CopilotMessage[]>;

    getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns?: number,
    ): Promise<CopilotTurnContext[]>;
}

export function encodeCursor(payload: { lastMessageAt: Date | string; id: string }): string {
    const t = payload.lastMessageAt instanceof Date
        ? payload.lastMessageAt.toISOString()
        : new Date(payload.lastMessageAt).toISOString();
    const raw = JSON.stringify({ t, id: payload.id });
    return Buffer.from(raw, 'utf-8').toString('base64url');
}

export function decodeCursor(cursor: string): { lastMessageAt: Date; id: string } | null {
    try {
        const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.t && parsed.id) {
            return {
                lastMessageAt: new Date(parsed.t),
                id: parsed.id,
            };
        }
        return null;
    } catch {
        return null;
    }
}

function isMissingTableOrModelError(err: any): boolean {
    if (!err) return false;
    if (err.code === 'P2021') return true; // Prisma: Table does not exist
    const msg = (err.message || String(err)).toLowerCase();
    return (
        msg.includes('does not exist in the current database') ||
        msg.includes('relation "copilot_sessions" does not exist') ||
        msg.includes('relation "copilot_messages" does not exist') ||
        msg.includes('relation "copilot_session" does not exist') ||
        msg.includes('no such table')
    );
}

/**
 * Tenant-isolated in-memory Copilot Session Repository.
 * Accurately surfaces non-durable status and enforces tenant/user boundaries.
 */
export class InMemoryCopilotSessionRepository implements CopilotSessionRepository {
    public readonly storageMode = 'in-memory';

    // Keyed by sessionId -> CopilotSession
    private readonly sessions = new Map<string, CopilotSession>();
    // Keyed by sessionId -> CopilotMessage[]
    private readonly messages = new Map<string, CopilotMessage[]>();

    getStorageModeStatus(): StorageModeStatus {
        return {
            mode: 'in-memory',
            isDurable: false,
            warning: 'In-memory session storage active — data is runtime-only and will be lost on backend restart.',
        };
    }

    async createSession(options: CreateSessionOptions): Promise<CopilotSession> {
        const now = new Date();
        const id = randomUUID();
        const title = (options.title || 'New Conversation').trim().slice(0, 128);

        const session: CopilotSession = {
            id,
            merchantId: options.merchantId,
            createdByUserId: options.userId,
            title,
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
            archivedAt: null,
            version: 1,
        };

        this.sessions.set(id, session);
        this.messages.set(id, []);
        return session;
    }

    async getSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession | null> {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        if (session.merchantId !== merchantId) return null;
        if (userId && session.createdByUserId !== userId) return null;
        return session;
    }

    async listSessions(
        merchantId: string,
        userIdOrFilter?: string | ListSessionsFilter,
        limitOrFilter?: number | ListSessionsFilter,
        cursorArg?: string,
    ): Promise<CopilotSessionListResult> {
        let userId: string | undefined;
        let limit = 20;
        let cursor: string | undefined;

        if (typeof userIdOrFilter === 'string') {
            userId = userIdOrFilter;
            if (typeof limitOrFilter === 'number') {
                limit = limitOrFilter;
                cursor = cursorArg;
            } else if (typeof limitOrFilter === 'object' && limitOrFilter !== null) {
                limit = limitOrFilter.limit ?? limit;
                cursor = limitOrFilter.cursor ?? cursor;
            }
        } else if (typeof userIdOrFilter === 'object' && userIdOrFilter !== null) {
            userId = (userIdOrFilter as any).userId;
            limit = userIdOrFilter.limit ?? limit;
            cursor = userIdOrFilter.cursor;
        }

        const safeLimit = Math.min(Math.max(limit, 1), 50);

        let matching = Array.from(this.sessions.values()).filter(
            (s) => s.merchantId === merchantId && (!userId || s.createdByUserId === userId) && s.status === 'ACTIVE',
        );

        // Sort descending by (lastMessageAt, id)
        matching.sort((a, b) => {
            const diff = b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
            if (diff !== 0) return diff;
            return b.id.localeCompare(a.id);
        });

        if (cursor) {
            const decoded = decodeCursor(cursor);
            if (decoded) {
                matching = matching.filter((s) => {
                    const diff = s.lastMessageAt.getTime() - decoded.lastMessageAt.getTime();
                    if (diff < 0) return true;
                    if (diff === 0) return s.id.localeCompare(decoded.id) < 0;
                    return false;
                });
            }
        }

        const items = matching.slice(0, safeLimit);
        const hasMore = matching.length > safeLimit;
        const nextCursor =
            hasMore && items.length > 0
                ? encodeCursor({
                      lastMessageAt: items[items.length - 1].lastMessageAt,
                      id: items[items.length - 1].id,
                  })
                : null;

        return {
            sessions: items,
            items,
            nextCursor,
            hasMore,
            storageMode: this.storageMode,
        };
    }

    async renameSession(merchantId: string, sessionId: string, title: string, userId?: string): Promise<CopilotSession> {
        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        const now = new Date();
        const updated: CopilotSession = {
            ...session,
            title: title.trim().slice(0, 128),
            updatedAt: now,
            version: session.version + 1,
        };

        this.sessions.set(sessionId, updated);
        return updated;
    }

    async archiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession> {
        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        const now = new Date();
        const updated: CopilotSession = {
            ...session,
            status: 'ARCHIVED',
            archivedAt: now,
            updatedAt: now,
            version: session.version + 1,
        };

        this.sessions.set(sessionId, updated);
        return updated;
    }

    async unarchiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession> {
        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        const now = new Date();
        const updated: CopilotSession = {
            ...session,
            status: 'ACTIVE',
            archivedAt: null,
            updatedAt: now,
            version: session.version + 1,
        };

        this.sessions.set(sessionId, updated);
        return updated;
    }

    async updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | Date | null; isArchived?: boolean },
    ): Promise<CopilotSession | null> {
        const session = await this.getSession(merchantId, sessionId);
        if (!session) return null;

        const now = new Date();
        let archivedAt = session.archivedAt;
        let status = session.status;

        if (updates.isArchived !== undefined) {
            if (updates.isArchived) {
                archivedAt = now;
                status = 'ARCHIVED';
            } else {
                archivedAt = null;
                status = 'ACTIVE';
            }
        } else if (updates.archivedAt !== undefined) {
            if (updates.archivedAt) {
                archivedAt = updates.archivedAt instanceof Date ? updates.archivedAt : new Date(updates.archivedAt);
                status = 'ARCHIVED';
            } else {
                archivedAt = null;
                status = 'ACTIVE';
            }
        }

        const updated: CopilotSession = {
            ...session,
            title: updates.title !== undefined ? updates.title.trim().slice(0, 128) : session.title,
            status,
            archivedAt,
            updatedAt: now,
            version: session.version + 1,
        };

        this.sessions.set(sessionId, updated);
        return updated;
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        filterOrLimit?: number | ListMessagesFilter,
        cursor?: string,
    ): Promise<CopilotMessageListResult> {
        const session = await this.getSession(merchantId, sessionId);
        if (!session) {
            return {
                messages: [],
                items: [],
                nextCursor: null,
                hasMore: false,
                storageMode: this.storageMode,
            };
        }

        let limit = 50;
        let cursorArg = cursor;
        if (typeof filterOrLimit === 'number') {
            limit = filterOrLimit;
        } else if (typeof filterOrLimit === 'object' && filterOrLimit !== null) {
            limit = filterOrLimit.limit ?? limit;
            cursorArg = filterOrLimit.cursor ?? cursorArg;
        }

        const safeLimit = Math.min(Math.max(limit, 1), 100);
        let list = [...(this.messages.get(sessionId) || [])];

        if (cursorArg) {
            const idx = list.findIndex((m) => m.id === cursorArg);
            if (idx >= 0) {
                list = list.slice(idx + 1);
            }
        }

        const items = list.slice(0, safeLimit);
        const hasMore = list.length > safeLimit;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
            messages: items,
            items,
            nextCursor,
            hasMore,
            storageMode: this.storageMode,
        };
    }

    async appendMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        const { merchantId, sessionId, role, content, answerPayload, requestId } = options;
        const session = await this.getSession(merchantId, sessionId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found for merchant ${merchantId}`);
        }

        if (session.status === 'ARCHIVED' || session.archivedAt !== null) {
            throw CopilotError.sessionArchived(`Session ${sessionId} is archived. Cannot append messages.`);
        }

        const now = new Date();
        const messageId = randomUUID();
        const boundedContent = content.trim().slice(0, 4000);

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

        const list = this.messages.get(sessionId) || [];
        list.push(message);
        this.messages.set(sessionId, list);

        // Update session's lastMessageAt and title if first user message
        const isFirstUserMessage = role === 'user' && list.filter((m) => m.role === 'user').length === 1;
        const newTitle =
            isFirstUserMessage && session.title === 'New Conversation'
                ? boundedContent.slice(0, 60)
                : session.title;

        this.sessions.set(sessionId, {
            ...session,
            title: newTitle,
            lastMessageAt: now,
            updatedAt: now,
            version: session.version + 1,
        });

        return message;
    }

    async addMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        return this.appendMessage(options);
    }

    async getRecentMessages(merchantId: string, sessionId: string, limit: number = 6): Promise<CopilotMessage[]> {
        const session = await this.getSession(merchantId, sessionId);
        if (!session) return [];
        const list = this.messages.get(sessionId) || [];
        return list.slice(-Math.min(limit, 100));
    }

    async getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns: number = 6,
    ): Promise<CopilotTurnContext[]> {
        const messages = await this.getRecentMessages(merchantId, sessionId, maxTurns);
        return messages.map((m) => ({
            role: m.role,
            content: m.content,
            intent: m.answerPayload?.intent,
        }));
    }
}

/**
 * Prisma-backed relational PostgreSQL Copilot Session Repository.
 * Preserves durability and uses narrow, explicit fallback only when tables are missing.
 */
export class PrismaCopilotSessionRepository implements CopilotSessionRepository {
    public readonly storageMode = 'postgres';
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

    getStorageModeStatus(): StorageModeStatus {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.getStorageModeStatus();
        }
        return {
            mode: 'postgres',
            isDurable: true,
        };
    }

    private mapSessionRow(r: any): CopilotSession {
        return {
            id: r.id,
            merchantId: r.merchantId,
            createdByUserId: r.createdByUserId,
            title: r.title,
            status: r.archivedAt ? 'ARCHIVED' : 'ACTIVE',
            createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
            updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
            lastMessageAt: r.lastMessageAt instanceof Date ? r.lastMessageAt : new Date(r.lastMessageAt),
            archivedAt: r.archivedAt ? (r.archivedAt instanceof Date ? r.archivedAt : new Date(r.archivedAt)) : null,
            version: r.version ?? 1,
        };
    }

    async createSession(options: CreateSessionOptions): Promise<CopilotSession> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.createSession(options);
        }

        try {
            const now = new Date();
            const title = (options.title || 'New Conversation').trim().slice(0, 128);

            const row = await this.db.copilotSession.create({
                data: {
                    merchantId: options.merchantId,
                    createdByUserId: options.userId,
                    title,
                    lastMessageAt: now,
                },
            });

            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                console.warn('[PrismaCopilotSessionRepository] Missing table, using in-memory store:', err);
                return this.inMemoryFallback.createSession(options);
            }
            throw err;
        }
    }

    async getSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession | null> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.getSession(merchantId, sessionId, userId);
        }

        try {
            const where: any = { id: sessionId, merchantId };
            if (userId) {
                where.createdByUserId = userId;
            }

            const row = await this.db.copilotSession.findFirst({ where });
            if (!row) return null;
            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                console.warn('[PrismaCopilotSessionRepository] Missing table, using in-memory store:', err);
                return this.inMemoryFallback.getSession(merchantId, sessionId, userId);
            }
            throw err;
        }
    }

    async listSessions(
        merchantId: string,
        userIdOrFilter?: string | ListSessionsFilter,
        limitOrFilter?: number | ListSessionsFilter,
        cursorArg?: string,
    ): Promise<CopilotSessionListResult> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.listSessions(merchantId, userIdOrFilter, limitOrFilter, cursorArg);
        }

        try {
            let userId: string | undefined;
            let limit = 20;
            let cursor: string | undefined;

            if (typeof userIdOrFilter === 'string') {
                userId = userIdOrFilter;
                if (typeof limitOrFilter === 'number') {
                    limit = limitOrFilter;
                    cursor = cursorArg;
                } else if (typeof limitOrFilter === 'object' && limitOrFilter !== null) {
                    limit = limitOrFilter.limit ?? limit;
                    cursor = limitOrFilter.cursor ?? cursor;
                }
            } else if (typeof userIdOrFilter === 'object' && userIdOrFilter !== null) {
                userId = (userIdOrFilter as any).userId;
                limit = userIdOrFilter.limit ?? limit;
                cursor = userIdOrFilter.cursor;
            }

            const safeLimit = Math.min(Math.max(limit, 1), 50);
            const where: any = {
                merchantId,
                archivedAt: null,
                ...(userId ? { createdByUserId: userId } : {}),
            };

            if (cursor) {
                const decoded = decodeCursor(cursor);
                if (decoded) {
                    where.OR = [
                        { lastMessageAt: { lt: decoded.lastMessageAt } },
                        {
                            AND: [
                                { lastMessageAt: decoded.lastMessageAt },
                                { id: { lt: decoded.id } },
                            ],
                        },
                    ];
                }
            }

            const rows = await this.db.copilotSession.findMany({
                where,
                orderBy: [
                    { lastMessageAt: 'desc' },
                    { id: 'desc' },
                ],
                take: safeLimit + 1,
            });

            const hasMore = rows.length > safeLimit;
            const items = rows.slice(0, safeLimit).map((r: any) => this.mapSessionRow(r));
            const nextCursor =
                hasMore && items.length > 0
                    ? encodeCursor({
                          lastMessageAt: items[items.length - 1].lastMessageAt,
                          id: items[items.length - 1].id,
                      })
                    : null;

            return {
                sessions: items,
                items,
                nextCursor,
                hasMore,
                storageMode: this.storageMode,
            };
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                console.warn('[PrismaCopilotSessionRepository] Missing table, using in-memory store:', err);
                return this.inMemoryFallback.listSessions(merchantId, userIdOrFilter, limitOrFilter, cursorArg);
            }
            throw err;
        }
    }

    async renameSession(merchantId: string, sessionId: string, title: string, userId?: string): Promise<CopilotSession> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.renameSession(merchantId, sessionId, title, userId);
        }

        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        try {
            const row = await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    title: title.trim().slice(0, 128),
                    version: { increment: 1 },
                },
            });

            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.renameSession(merchantId, sessionId, title, userId);
            }
            throw err;
        }
    }

    async archiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.archiveSession(merchantId, sessionId, userId);
        }

        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        try {
            const now = new Date();
            const row = await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    archivedAt: now,
                    version: { increment: 1 },
                },
            });

            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.archiveSession(merchantId, sessionId, userId);
            }
            throw err;
        }
    }

    async unarchiveSession(merchantId: string, sessionId: string, userId?: string): Promise<CopilotSession> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.unarchiveSession(merchantId, sessionId, userId);
        }

        const session = await this.getSession(merchantId, sessionId, userId);
        if (!session) {
            throw CopilotError.notFound(`Session ${sessionId} not found or access denied`);
        }

        try {
            const row = await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    archivedAt: null,
                    version: { increment: 1 },
                },
            });

            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.unarchiveSession(merchantId, sessionId, userId);
            }
            throw err;
        }
    }

    async updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | Date | null; isArchived?: boolean },
    ): Promise<CopilotSession | null> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.updateSession(merchantId, sessionId, updates);
        }

        const session = await this.getSession(merchantId, sessionId);
        if (!session) return null;

        try {
            const now = new Date();
            let archivedAt = session.archivedAt;
            if (updates.isArchived !== undefined) {
                archivedAt = updates.isArchived ? now : null;
            } else if (updates.archivedAt !== undefined) {
                archivedAt = updates.archivedAt
                    ? updates.archivedAt instanceof Date
                        ? updates.archivedAt
                        : new Date(updates.archivedAt)
                    : null;
            }

            const row = await this.db.copilotSession.update({
                where: { id: sessionId },
                data: {
                    ...(updates.title !== undefined ? { title: updates.title.trim().slice(0, 128) } : {}),
                    ...(archivedAt !== undefined ? { archivedAt } : {}),
                    version: { increment: 1 },
                },
            });

            return this.mapSessionRow(row);
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.updateSession(merchantId, sessionId, updates);
            }
            throw err;
        }
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        filterOrLimit?: number | ListMessagesFilter,
        cursor?: string,
    ): Promise<CopilotMessageListResult> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.listMessages(merchantId, sessionId, filterOrLimit, cursor);
        }

        try {
            let limit = 50;
            let cursorArg = cursor;
            if (typeof filterOrLimit === 'number') {
                limit = filterOrLimit;
            } else if (typeof filterOrLimit === 'object' && filterOrLimit !== null) {
                limit = filterOrLimit.limit ?? limit;
                cursorArg = filterOrLimit.cursor ?? cursorArg;
            }

            const safeLimit = Math.min(Math.max(limit, 1), 100);

            const rows = await this.db.copilotMessage.findMany({
                where: { sessionId, merchantId },
                orderBy: { createdAt: 'asc' },
                take: safeLimit + 1,
                ...(cursorArg ? { skip: 1, cursor: { id: cursorArg } } : {}),
            });

            const hasMore = rows.length > safeLimit;
            const items: CopilotMessage[] = rows.slice(0, safeLimit).map((r: any) => ({
                id: r.id,
                sessionId: r.sessionId,
                merchantId: r.merchantId,
                role: r.role,
                content: r.content,
                answerPayload: r.answerPayload,
                createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
                requestId: r.requestId,
            }));

            const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

            return {
                messages: items,
                items,
                nextCursor,
                hasMore,
                storageMode: this.storageMode,
            };
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.listMessages(merchantId, sessionId, filterOrLimit, cursor);
            }
            throw err;
        }
    }

    async appendMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.appendMessage(options);
        }

        const session = await this.getSession(options.merchantId, options.sessionId);
        if (!session) {
            throw CopilotError.notFound(`Session ${options.sessionId} not found for merchant ${options.merchantId}`);
        }

        if (session.status === 'ARCHIVED' || session.archivedAt !== null) {
            throw CopilotError.sessionArchived(`Session ${options.sessionId} is archived. Cannot append messages.`);
        }

        try {
            const { merchantId, sessionId, role, content, answerPayload, requestId } = options;
            const now = new Date();
            const boundedContent = content.trim().slice(0, 4000);

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
                createdAt: message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt),
                requestId: message.requestId,
            };
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.appendMessage(options);
            }
            throw err;
        }
    }

    async addMessage(options: AddMessageOptions): Promise<CopilotMessage> {
        return this.appendMessage(options);
    }

    async getRecentMessages(merchantId: string, sessionId: string, limit: number = 6): Promise<CopilotMessage[]> {
        if (!this.hasPrismaModel()) {
            return this.inMemoryFallback.getRecentMessages(merchantId, sessionId, limit);
        }

        try {
            const rows = await this.db.copilotMessage.findMany({
                where: { sessionId, merchantId },
                orderBy: { createdAt: 'desc' },
                take: Math.min(limit, 100),
            });

            return rows.reverse().map((r: any) => ({
                id: r.id,
                sessionId: r.sessionId,
                merchantId: r.merchantId,
                role: r.role,
                content: r.content,
                answerPayload: r.answerPayload,
                createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
                requestId: r.requestId,
            }));
        } catch (err) {
            if (isMissingTableOrModelError(err)) {
                return this.inMemoryFallback.getRecentMessages(merchantId, sessionId, limit);
            }
            throw err;
        }
    }

    async getRecentTurnWindow(
        merchantId: string,
        sessionId: string,
        maxTurns: number = 6,
    ): Promise<CopilotTurnContext[]> {
        const messages = await this.getRecentMessages(merchantId, sessionId, maxTurns);
        return messages.map((m) => ({
            role: m.role,
            content: m.content,
            intent: m.answerPayload?.intent,
        }));
    }
}

export function createCopilotSessionRepository(db?: any): CopilotSessionRepository {
    if (db && db.copilotSession && typeof db.copilotSession.findMany === 'function') {
        return new PrismaCopilotSessionRepository(db);
    }
    return new InMemoryCopilotSessionRepository();
}

let globalSessionRepo: CopilotSessionRepository | null = null;

export function getCopilotSessionRepository(db?: any): CopilotSessionRepository {
    if (!globalSessionRepo) {
        let database = db;
        if (!database) {
            try {
                const { getDB } = require('../../db/postgres');
                database = getDB();
            } catch {
                // Ignore if db is not connected yet
            }
        }
        globalSessionRepo = createCopilotSessionRepository(database);
    } else if (db && globalSessionRepo instanceof PrismaCopilotSessionRepository) {
        globalSessionRepo.setDb(db);
    }
    return globalSessionRepo;
}

export function setCopilotSessionRepository(repo: CopilotSessionRepository | null): void {
    globalSessionRepo = repo;
}
