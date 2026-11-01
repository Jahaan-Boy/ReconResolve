import { ApiClientError } from './types';

export interface StorageModeStatus {
    mode: 'postgres' | 'in-memory';
    isDurable: boolean;
    warning?: string;
    engine?: string;
}

export interface EvidenceReference {
    type: 'ptxn' | 'mord' | 'run' | 'exc';
    id: string;
    label: string;
    url?: string;
    snippet?: string;
}

export interface CopilotAnswerPayload {
    facts: string[];
    interpretation: string;
    unknowns: string[];
    evidenceRefs: EvidenceReference[];
    currencyExposures?: Record<string, { amountMinor: string; count: number }>;
    clarificationPrompt?: string;
    isReadOnlyNotice?: boolean;
}

export interface CopilotMessage {
    id: string;
    sessionId: string;
    merchantId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    requestId?: string;
    answerPayload?: CopilotAnswerPayload;
    createdAt: string;
export type CopilotIntent =
    | 'largest_unresolved_exceptions'
    | 'exception_breakdown'
    | 'run_comparison'
    | 'recent_run_summary'
    | 'duplicate_candidates'
    | 'missing_order_exceptions'
    | 'general_reconciliation_summary'
    | 'ambiguous_clarification'
    | 'guardrail_blocked'
    | 'unsupported';

export interface CopilotEvidenceRef {
    id: string;
    type: 'exception' | 'run' | 'transaction' | 'order';
    label: string;
    details?: string;
}

export interface CopilotAskRequest {
    question: string;
    context?: {
        runId?: string;
        exceptionId?: string;
        window?: '24h' | '7d' | '30d' | 'all';
    };
    recentTurns?: Array<{
        role: 'user' | 'assistant';
        content: string;
        intent?: CopilotIntent;
    }>;
}

export interface CopilotAskResult {
    question: string;
    intent: CopilotIntent;
    answer: string;
    summary: string;
    observedFacts: string[];
    interpretations: string[];
    unknowns: string[];
    evidenceRefs: CopilotEvidenceRef[];
    suggestedActions: string[];
    isAiGenerated: boolean;
    generatedAt: string;
    queryWindow: string;
    storageMode?: string;
}

export interface CopilotCapabilitiesResult {
    supportedIntents: Array<{
        intent: CopilotIntent;
        label: string;
        description: string;
        exampleQuestions: string[];
    }>;
}

export interface CopilotSession {
    id: string;
    merchantId: string;
    userId: string;
    title: string;
    status: 'ACTIVE' | 'ARCHIVED';
    storageMode: 'postgres' | 'in-memory';
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
}

export interface ListSessionsResult {
    sessions: CopilotSession[];
    nextCursor: string | null;
    hasMore: boolean;
}

export interface ListMessagesResult {
    messages: CopilotMessage[];
    nextCursor: string | null;
    hasMore: boolean;
}

export interface CopilotApiClient {
    getStorageModeStatus(merchantId: string, signal?: AbortSignal): Promise<StorageModeStatus>;
    listSessions(merchantId: string, options?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<ListSessionsResult>;
    createSession(merchantId: string, title?: string, signal?: AbortSignal): Promise<CopilotSession>;
    getSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession>;
    renameSession(merchantId: string, sessionId: string, title: string, signal?: AbortSignal): Promise<CopilotSession>;
    archiveSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession>;
    unarchiveSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession>;
    listMessages(merchantId: string, sessionId: string, options?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<ListMessagesResult>;
    sendMessage(merchantId: string, sessionId: string, content: string, signal?: AbortSignal): Promise<{ userMessage: CopilotMessage; assistantMessage: CopilotMessage }>;
    resolveEvidence(merchantId: string, type: string, id: string, signal?: AbortSignal): Promise<Record<string, unknown>>;
    createdByUserId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string;
    archivedAt: string | null;
    version: number;
}

export interface CopilotMessage {
    id: string;
    sessionId: string;
    merchantId: string;
    role: 'user' | 'assistant';
    content: string;
    answerPayload?: CopilotAskResult;
    createdAt: string;
    requestId?: string;
}

export interface CopilotSessionListResult {
    items: CopilotSession[];
    nextCursor: string | null;
    hasMore: boolean;
    storageMode: string;
}

export interface CopilotMessageListResult {
    items: CopilotMessage[];
    nextCursor: string | null;
    hasMore: boolean;
    storageMode: string;
}

export interface PostSessionMessageResponse {
    userMessage: CopilotMessage;
    assistantMessage: CopilotMessage;
    result: CopilotAskResult;
}

export interface CopilotApiClient {
    getCapabilities(merchantId: string, signal?: AbortSignal): Promise<CopilotCapabilitiesResult>;
    askQuestion(
        merchantId: string,
        request: CopilotAskRequest,
        signal?: AbortSignal,
    ): Promise<CopilotAskResult>;
    listSessions(
        merchantId: string,
        limit?: number,
        cursor?: string,
        signal?: AbortSignal,
    ): Promise<CopilotSessionListResult>;
    createSession(
        merchantId: string,
        title?: string,
        signal?: AbortSignal,
    ): Promise<CopilotSession>;
    listMessages(
        merchantId: string,
        sessionId: string,
        limit?: number,
        cursor?: string,
        signal?: AbortSignal,
    ): Promise<CopilotMessageListResult>;
    postSessionMessage(
        merchantId: string,
        sessionId: string,
        request: CopilotAskRequest,
        signal?: AbortSignal,
    ): Promise<PostSessionMessageResponse>;
    updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | null },
        signal?: AbortSignal,
    ): Promise<CopilotSession>;
}

export class HttpCopilotApiClient implements CopilotApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        const token = typeof window !== 'undefined' ? localStorage.getItem('flowops_auth_token') : null;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    private async handleResponse<T>(res: Response, defaultMessage: string): Promise<T> {
    private async handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await res.json()) as Record<string, unknown>;
            } catch {
                // ignore
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'COPILOT_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : defaultMessage,
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'COPILOT_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : fallbackMessage,
                res.status,
                errorBody['details'],
            );
        }
        return await res.json();
    }

    async getStorageModeStatus(merchantId: string, signal?: AbortSignal): Promise<StorageModeStatus> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/status`, {
            method: 'GET',
            headers: this.getHeaders(),
            signal,
        });
        return this.handleResponse(res, 'Failed to get Copilot storage mode status');
    }

    async listSessions(
        merchantId: string,
        options: { cursor?: string; limit?: number } = {},
        signal?: AbortSignal,
    ): Promise<ListSessionsResult> {
        const params = new URLSearchParams();
        if (options.cursor) params.set('cursor', options.cursor);
        if (options.limit) params.set('limit', String(options.limit));

        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions?${params.toString()}`, {
            method: 'GET',
            headers: this.getHeaders(),
            signal,
        });
        return this.handleResponse(res, 'Failed to list Copilot sessions');
    }

    async createSession(merchantId: string, title?: string, signal?: AbortSignal): Promise<CopilotSession> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ title }),
            signal,
        });
        return this.handleResponse(res, 'Failed to create Copilot session');
    }

    async getSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}`, {
            method: 'GET',
            headers: this.getHeaders(),
            signal,
        });
        return this.handleResponse(res, 'Failed to get Copilot session');
    }

    async renameSession(merchantId: string, sessionId: string, title: string, signal?: AbortSignal): Promise<CopilotSession> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify({ title }),
            signal,
        });
        return this.handleResponse(res, 'Failed to rename Copilot session');
    }

    async archiveSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}/archive`, {
            method: 'POST',
            headers: this.getHeaders(),
            signal,
        });
        return this.handleResponse(res, 'Failed to archive Copilot session');
    }

    async unarchiveSession(merchantId: string, sessionId: string, signal?: AbortSignal): Promise<CopilotSession> {
        const res = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}/unarchive`, {
            method: 'POST',
            headers: this.getHeaders(),
            signal,
        });
        return this.handleResponse(res, 'Failed to unarchive Copilot session');
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        options: { cursor?: string; limit?: number } = {},
        signal?: AbortSignal,
    ): Promise<ListMessagesResult> {
        const params = new URLSearchParams();
        if (options.cursor) params.set('cursor', options.cursor);
        if (options.limit) params.set('limit', String(options.limit));

        const res = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}/messages?${params.toString()}`,
            {
                method: 'GET',
                headers: this.getHeaders(),
                signal,
            },
        );
        return this.handleResponse(res, 'Failed to list messages');
    }

    async sendMessage(
        merchantId: string,
        sessionId: string,
        content: string,
        signal?: AbortSignal,
    ): Promise<{ userMessage: CopilotMessage; assistantMessage: CopilotMessage }> {
        const res = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/copilot/sessions/${sessionId}/messages`,
            {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ content }),
                signal,
            },
        );
        return this.handleResponse(res, 'Failed to send Copilot message');
    }

    async resolveEvidence(merchantId: string, type: string, id: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
        const res = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/copilot/evidence/${type}/${id}`,
            {
                method: 'GET',
                headers: this.getHeaders(),
                signal,
            },
        );
        return this.handleResponse(res, 'Failed to resolve evidence');
    }
}

export class MockCopilotApiClient implements CopilotApiClient {
    private sessions: CopilotSession[] = [
        {
            id: 'mock-session-001',
            merchantId: '00000000-0000-0000-0000-000000000001',
            userId: 'operator-sarah',
            title: 'Fee Variance Root Cause Triage',
            status: 'ACTIVE',
            storageMode: 'in-memory',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            updatedAt: new Date(Date.now() - 1800000).toISOString(),
            lastMessageAt: new Date(Date.now() - 1800000).toISOString(),
        },
    ];

    private messages: Record<string, CopilotMessage[]> = {
        'mock-session-001': [
            {
                id: 'msg-001',
                sessionId: 'mock-session-001',
                merchantId: '00000000-0000-0000-0000-000000000001',
                role: 'user',
                content: 'Can you explain the recurring fee variance across our USD PayPal transactions?',
                createdAt: new Date(Date.now() - 3600000).toISOString(),
            },
            {
                id: 'msg-002',
                sessionId: 'mock-session-001',
                merchantId: '00000000-0000-0000-0000-000000000001',
                role: 'assistant',
                content: 'The fee variance is caused by unmodeled PayPal standard partner fees ($0.30 fixed fee). The expected merchant order books gross amount while PayPal reports net of processing fee.',
                answerPayload: {
                    facts: [
                        'Merchant order gross amount is $100.00 (10000 minor units).',
                        'PayPal captured amount is $100.00 with $2.90 processing fee.',
                        'Reconciliation rule requires fee matching tolerance.',
                    ],
                    interpretation: 'Discrepancy is an operational fee variance rather than financial fraud or missing funds.',
                    unknowns: [],
                    evidenceRefs: [
                        { type: 'exc', id: 'mock-exc-001', label: 'Break AMOUNT_MISMATCH' },
                    ],
                },
                createdAt: new Date(Date.now() - 3590000).toISOString(),
            },
        ],
    };

    async getStorageModeStatus(): Promise<StorageModeStatus> {
        return {
            mode: 'in-memory',
            isDurable: false,
            warning: 'In-Memory Demo Mode active. Conversations are ephemeral.',
            engine: 'Frontend Mock',
        };
    }

    async listSessions(): Promise<ListSessionsResult> {
        return { sessions: this.sessions, nextCursor: null, hasMore: false };
    }

    async createSession(merchantId: string, title?: string): Promise<CopilotSession> {
        const now = new Date().toISOString();
        const s: CopilotSession = {
            id: `mock-session-${Date.now()}`,
            merchantId,
            userId: 'operator-sarah',
            title: title || 'New Copilot Investigation',
            status: 'ACTIVE',
            storageMode: 'in-memory',
            createdAt: now,
            updatedAt: now,
            lastMessageAt: now,
        };
        this.sessions.unshift(s);
        this.messages[s.id] = [];
        return s;
    }

    async getSession(_merchantId: string, sessionId: string): Promise<CopilotSession> {
        const s = this.sessions.find((x) => x.id === sessionId);
        if (!s) throw new ApiClientError('NOT_FOUND', 'Session not found', 404);
        return s;
    }

    async renameSession(_merchantId: string, sessionId: string, title: string): Promise<CopilotSession> {
        const s = await this.getSession(_merchantId, sessionId);
        s.title = title;
        return s;
    }

    async archiveSession(_merchantId: string, sessionId: string): Promise<CopilotSession> {
        const s = await this.getSession(_merchantId, sessionId);
        s.status = 'ARCHIVED';
        return s;
    }

    async unarchiveSession(_merchantId: string, sessionId: string): Promise<CopilotSession> {
        const s = await this.getSession(_merchantId, sessionId);
        s.status = 'ACTIVE';
        return s;
    }

    async listMessages(_merchantId: string, sessionId: string): Promise<ListMessagesResult> {
        const list = this.messages[sessionId] || [];
        return { messages: list, nextCursor: null, hasMore: false };
    }

    async sendMessage(
        merchantId: string,
        sessionId: string,
        content: string,
    ): Promise<{ userMessage: CopilotMessage; assistantMessage: CopilotMessage }> {
        const now = new Date().toISOString();
        const userMessage: CopilotMessage = {
            id: `msg-${Date.now()}-u`,
            sessionId,
            merchantId,
            role: 'user',
            content,
            createdAt: now,
        };

        const isRefund = content.toLowerCase().includes('refund');
        const assistantMessage: CopilotMessage = {
            id: `msg-${Date.now()}-a`,
            sessionId,
            merchantId,
            role: 'assistant',
            content: isRefund
                ? 'FlowOps Copilot is strictly read-only and cannot execute refunds. Please use the Operator Actions dialog to resolve exceptions.'
                : `Here is the ledger evidence regarding "${content.slice(0, 30)}...". All active breaks are tracked with deterministic database facts.`,
            answerPayload: {
                facts: ['Active Merchant Context: ' + merchantId, 'Pipeline operating normally.'],
                interpretation: 'Deterministic analysis compiled from simulated ledger.',
                unknowns: [],
                evidenceRefs: [],
                isReadOnlyNotice: isRefund,
            },
            createdAt: new Date().toISOString(),
        };

        if (!this.messages[sessionId]) this.messages[sessionId] = [];
        this.messages[sessionId].push(userMessage, assistantMessage);
        return { userMessage, assistantMessage };
    }

    async resolveEvidence(_merchantId: string, type: string, id: string): Promise<Record<string, unknown>> {
        return {
            type,
            id,
            label: `Mock Evidence ${id}`,
            available: true,
            data: { id, sample: true },
        };
        return (await res.json()) as T;
    }

    async getCapabilities(merchantId: string, signal?: AbortSignal): Promise<CopilotCapabilitiesResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/capabilities`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to fetch copilot capabilities');
    }

    async askQuestion(
        merchantId: string,
        request: CopilotAskRequest,
        signal?: AbortSignal,
    ): Promise<CopilotAskResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/ask`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to answer question');
    }

    async listSessions(
        merchantId: string,
        limit = 20,
        cursor?: string,
        signal?: AbortSignal,
    ): Promise<CopilotSessionListResult> {
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/sessions?${params.toString()}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to list copilot sessions');
    }

    async createSession(
        merchantId: string,
        title?: string,
        signal?: AbortSignal,
    ): Promise<CopilotSession> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/sessions`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(title ? { title } : {}),
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to create copilot session');
    }

    async listMessages(
        merchantId: string,
        sessionId: string,
        limit = 50,
        cursor?: string,
        signal?: AbortSignal,
    ): Promise<CopilotMessageListResult> {
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/sessions/${encodeURIComponent(sessionId)}/messages?${params.toString()}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to list session messages');
    }

    async postSessionMessage(
        merchantId: string,
        sessionId: string,
        request: CopilotAskRequest,
        signal?: AbortSignal,
    ): Promise<PostSessionMessageResponse> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/sessions/${encodeURIComponent(sessionId)}/messages`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to send message');
    }

    async updateSession(
        merchantId: string,
        sessionId: string,
        updates: { title?: string; archivedAt?: string | null },
        signal?: AbortSignal,
    ): Promise<CopilotSession> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/copilot/sessions/${encodeURIComponent(sessionId)}`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
                signal,
            },
        );
        return this.handleResponse(response, 'Failed to update session');
    }
}

export const copilotApiClient = new HttpCopilotApiClient();
