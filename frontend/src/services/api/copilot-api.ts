import { ApiClientError } from './types';

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
}

export interface CopilotCapabilitiesResult {
    supportedIntents: Array<{
        intent: CopilotIntent;
        label: string;
        description: string;
        exampleQuestions: string[];
    }>;
}

export interface CopilotApiClient {
    getCapabilities(merchantId: string, signal?: AbortSignal): Promise<CopilotCapabilitiesResult>;
    askQuestion(
        merchantId: string,
        request: CopilotAskRequest,
        signal?: AbortSignal,
    ): Promise<CopilotAskResult>;
}

export class HttpCopilotApiClient implements CopilotApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
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

        if (!response.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'COPILOT_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch copilot capabilities',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
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

        if (!response.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'COPILOT_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to answer question',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }
}

export class MockCopilotApiClient implements CopilotApiClient {
    async getCapabilities(_merchantId: string): Promise<CopilotCapabilitiesResult> {
        return {
            supportedIntents: [
                {
                    intent: 'largest_unresolved_exceptions',
                    label: 'Largest Discrepancies',
                    description: 'Identifies the highest-value unresolved reconciliation exceptions ranked by exposure.',
                    exampleQuestions: [
                        'What are the three largest unresolved discrepancies?',
                        'Show me the highest value open exceptions.',
                    ],
                },
                {
                    intent: 'exception_breakdown',
                    label: 'Exception Breakdown',
                    description: 'Analyzes the distribution and financial exposure across all exception categories.',
                    exampleQuestions: [
                        'Which exception types account for the most unresolved value?',
                        'Show me a breakdown of all open exceptions.',
                    ],
                },
                {
                    intent: 'run_comparison',
                    label: 'Run Comparison',
                    description: 'Compares the last two runs to analyze match rate variations and new discrepancies.',
                    exampleQuestions: [
                        'Compare the last two reconciliation runs.',
                        'Why did our match rate fall in the most recent run?',
                    ],
                },
                {
                    intent: 'duplicate_candidates',
                    label: 'Duplicate Candidates',
                    description: 'Detects provider transactions with identical order IDs or recurring amount signatures.',
                    exampleQuestions: [
                        'Show duplicate-payment candidates from the last seven days.',
                    ],
                },
                {
                    intent: 'missing_order_exceptions',
                    label: 'Missing Orders',
                    description: 'Highlights captured PayPal funds that lack corresponding internal order counterparts.',
                    exampleQuestions: [
                        'Which exceptions have missing merchant orders?',
                    ],
                },
            ],
        };
    }

    async askQuestion(
        _merchantId: string,
        request: CopilotAskRequest,
    ): Promise<CopilotAskResult> {
        return {
            question: request.question,
            intent: 'largest_unresolved_exceptions',
            answer: 'The three largest unresolved discrepancies account for the bulk of pending financial exposure in your queue.',
            summary: 'Identified top unresolved exceptions by financial exposure.',
            observedFacts: [
                '#1: Exception ex-mock-001 (MISSING_MERCHANT_COUNTERPART) with exposure of USD 1,200.00 [Status: OPEN]',
                '#2: Exception ex-mock-004 (AMBIGUOUS_MATCH) with exposure of USD 500.00 [Status: OPEN]',
                '#3: Exception ex-mock-003 (AMOUNT_MISMATCH) with exposure of USD 495.00 [Status: OPEN]',
            ],
            interpretations: [
                'Unresolved captured payments with missing orders carry high operational risk of customer fulfillment delay or chargebacks.',
            ],
            unknowns: [
                'Root cause of order creation delay unknown until merchant ERP audit logs are inspected.',
            ],
            evidenceRefs: [
                { id: 'ex-mock-001', type: 'exception', label: 'Exception ex-mock-001 (USD 1,200.00)', details: 'Captured without order' },
                { id: 'ex-mock-004', type: 'exception', label: 'Exception ex-mock-004 (USD 500.00)', details: 'Ambiguous counterpart' },
            ],
            suggestedActions: [
                'Open each exception in the Exceptions Queue to inspect provider transaction audit events.',
            ],
            isAiGenerated: false,
            generatedAt: new Date().toISOString(),
            queryWindow: '30d',
        };
    }
}

export const copilotApiClient = new HttpCopilotApiClient();
