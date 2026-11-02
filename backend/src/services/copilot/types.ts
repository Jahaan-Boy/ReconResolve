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
    readonly id: string;
    readonly type: 'exception' | 'run' | 'transaction' | 'order' | string;
    readonly label: string;
    readonly details?: string;
}

export interface CopilotTurnContext {
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly intent?: CopilotIntent;
}

export interface CopilotAskRequest {
    readonly question: string;
    readonly context?: {
        readonly runId?: string;
        readonly exceptionId?: string;
        readonly window?: '24h' | '7d' | '30d' | 'all';
    };
    readonly recentTurns?: CopilotTurnContext[];
}

export interface CopilotAnswerPayload {
    readonly facts: string[];
    readonly interpretation?: string;
    readonly interpretations?: string[];
    readonly unknowns: string[];
    readonly evidenceRefs: CopilotEvidenceRef[];
    readonly isReadOnlyNotice?: boolean;
    readonly intent?: string;
    readonly suggestedActions?: string[];
}

export interface CopilotAskResult {
    readonly question: string;
    readonly intent: CopilotIntent;
    readonly answer: string;
    readonly summary: string;
    readonly facts?: string[];
    readonly observedFacts: string[];
    readonly interpretation?: string;
    readonly interpretations: string[];
    readonly unknowns: string[];
    readonly evidenceRefs: CopilotEvidenceRef[];
    readonly suggestedActions: string[];
    readonly isAiGenerated: boolean;
    readonly generatedAt: string;
    readonly queryWindow: string;
    readonly isReadOnlyNotice?: boolean;
    readonly storageMode?: 'durable_postgres' | 'tenant_session_store' | 'postgres' | 'in-memory';
}

export interface CopilotCapabilitiesResult {
    readonly supportedIntents: Array<{
        readonly intent: CopilotIntent;
        readonly label: string;
        readonly description: string;
        readonly exampleQuestions: string[];
    }>;
}

export type CopilotSessionStatus = 'ACTIVE' | 'ARCHIVED';
export type CopilotStorageMode = 'in-memory' | 'postgres';

export interface StorageModeStatus {
    readonly mode: CopilotStorageMode;
    readonly isDurable: boolean;
    readonly warning?: string;
}

export interface CopilotSession {
    readonly id: string;
    readonly merchantId: string;
    readonly createdByUserId: string;
    readonly title: string;
    readonly status: CopilotSessionStatus;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly lastMessageAt: Date;
    readonly archivedAt: Date | null;
    readonly version: number;
}

export interface CopilotMessage {
    readonly id: string;
    readonly sessionId: string;
    readonly merchantId: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly answerPayload?: CopilotAnswerPayload | CopilotAskResult | any;
    readonly createdAt: Date;
    readonly requestId?: string;
}

export interface CopilotSessionListResult {
    readonly sessions: CopilotSession[];
    readonly items: CopilotSession[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
    readonly storageMode: string;
}

export interface CopilotMessageListResult {
    readonly messages: CopilotMessage[];
    readonly items: CopilotMessage[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
    readonly storageMode: string;
}

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
    answerPayload?: any;
    requestId?: string;
}

export interface ListSessionsFilter {
    limit?: number;
    cursor?: string;
}

export interface ListMessagesFilter {
    limit?: number;
    cursor?: string;
}
