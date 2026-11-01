import { ApiClientError } from './types';

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

    private async handleResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
        if (!res.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await res.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'COPILOT_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : fallbackMessage,
                res.status,
                errorBody['details'],
            );
        }
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
