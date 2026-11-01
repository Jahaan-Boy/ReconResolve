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
    readonly type: 'exception' | 'run' | 'transaction' | 'order';
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

export interface CopilotAskResult {
    readonly question: string;
    readonly intent: CopilotIntent;
    readonly answer: string;
    readonly summary: string;
    readonly observedFacts: string[];
    readonly interpretations: string[];
    readonly unknowns: string[];
    readonly evidenceRefs: CopilotEvidenceRef[];
    readonly suggestedActions: string[];
    readonly isAiGenerated: boolean;
    readonly generatedAt: string;
    readonly queryWindow: string;
    readonly storageMode?: 'durable_postgres' | 'tenant_session_store';
}

export interface CopilotCapabilitiesResult {
    readonly supportedIntents: Array<{
        readonly intent: CopilotIntent;
        readonly label: string;
        readonly description: string;
        readonly exampleQuestions: string[];
    }>;
}

export interface CopilotSession {
    readonly id: string;
    readonly merchantId: string;
    readonly createdByUserId: string;
    readonly title: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly lastMessageAt: string;
    readonly archivedAt: string | null;
    readonly version: number;
}

export interface CopilotMessage {
    readonly id: string;
    readonly sessionId: string;
    readonly merchantId: string;
    readonly role: 'user' | 'assistant';
    readonly content: string;
    readonly answerPayload?: CopilotAskResult;
    readonly createdAt: string;
    readonly requestId?: string;
}

export interface CopilotSessionListResult {
    readonly items: CopilotSession[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
    readonly storageMode: string;
}

export interface CopilotMessageListResult {
    readonly items: CopilotMessage[];
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
    readonly storageMode: string;
}
