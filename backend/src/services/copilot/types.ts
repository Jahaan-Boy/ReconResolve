export type CopilotIntent =
    | 'largest_unresolved_exceptions'
    | 'exception_breakdown'
    | 'run_comparison'
    | 'recent_run_summary'
    | 'duplicate_candidates'
    | 'missing_order_exceptions'
    | 'general_reconciliation_summary'
    | 'unsupported';

export interface CopilotEvidenceRef {
    readonly id: string;
    readonly type: 'exception' | 'run' | 'transaction' | 'order';
    readonly label: string;
    readonly details?: string;
}

export interface CopilotAskRequest {
    readonly question: string;
    readonly context?: {
        readonly runId?: string;
        readonly exceptionId?: string;
        readonly window?: '24h' | '7d' | '30d' | 'all';
    };
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
}

export interface CopilotCapabilitiesResult {
    readonly supportedIntents: Array<{
        readonly intent: CopilotIntent;
        readonly label: string;
        readonly description: string;
        readonly exampleQuestions: string[];
    }>;
}
