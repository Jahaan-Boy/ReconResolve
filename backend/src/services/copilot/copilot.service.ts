import type {
    CopilotAskRequest,
    CopilotAskResult,
    CopilotCapabilitiesResult,
    CopilotEvidenceRef,
    CopilotIntent,
    CopilotSession,
    CopilotMessage,
} from './types';
import { routeQuestionIntent } from './copilot-intent-router';
import { formatMinorAmount } from '../intelligence/portfolio-intelligence.service';
import { CopilotError } from './errors';
import {
    type CopilotSessionRepository,
    getCopilotSessionRepository,
} from './session-repository';

export interface CopilotServiceDb {
    reconciliationException: {
        findMany(args: any): Promise<any[]>;
        findFirst?(args: any): Promise<any>;
        count(args: any): Promise<number>;
    };
    reconciliationRun: {
        findMany(args: any): Promise<any[]>;
        findFirst(args: any): Promise<any>;
        count(args: any): Promise<number>;
    };
    providerTransaction: {
        findMany(args: any): Promise<any[]>;
        findFirst?(args: any): Promise<any>;
    };
    merchantOrder: {
        findMany(args: any): Promise<any[]>;
        findFirst?(args: any): Promise<any>;
    };
}

export interface CopilotServiceDeps {
    db: any;
    repository?: CopilotSessionRepository;
}

export class CopilotService {
    private readonly db: any;
    private readonly repository: CopilotSessionRepository;

    constructor(deps: CopilotServiceDeps) {
        this.db = deps.db;
        this.repository = deps.repository ?? getCopilotSessionRepository(deps.db);
    }

    async createSession(merchantId: string, userId: string, title?: string): Promise<CopilotSession> {
        if (title && title.length > 128) {
            throw CopilotError.validationFailed('Session title cannot exceed 128 characters');
        }
        return this.repository.createSession({ merchantId, userId, title });
    }

    async sendMessage(options: {
        merchantId: string;
        sessionId: string;
        userId: string;
        content: string;
        requestId?: string;
    }): Promise<{
        userMessage: CopilotMessage;
        assistantMessage: CopilotMessage;
        result: CopilotAskResult | any;
    }> {
        const { merchantId, sessionId, userId, content, requestId } = options;
        if (!content || content.trim().length === 0) {
            throw CopilotError.validationFailed('Message content cannot be empty');
        }
        if (content.length > 4000) {
            throw CopilotError.validationFailed('Message content cannot exceed 4,000 characters');
        }

        // 1. Strict read-only money movement interception
        const lowerContent = content.toLowerCase();
        const moneyMovementKeywords = ['refund', 'capture', 'payout', 'move money', 'transfer funds', 'chargeback'];
        const isMoneyMovement = moneyMovementKeywords.some((kw) => lowerContent.includes(kw));

        if (isMoneyMovement) {
            const userMessage = await this.repository.appendMessage({
                merchantId,
                sessionId,
                role: 'user',
                content,
                requestId,
            });

            const assistantContent =
                'ReconResolve Copilot is strictly read-only and cannot execute refunds, captures, payouts, or financial adjustments. Please perform this action in your provider portal or operational console.';

            const answerPayload = {
                question: content,
                intent: 'guardrail_blocked' as CopilotIntent,
                answer: assistantContent,
                summary: 'Read-only guardrail enforced: money movement blocked.',
                facts: [
                    'Direct money movement (refunds, captures, payouts, account adjustments) is disabled at the policy boundary.',
                ],
                observedFacts: [
                    'Direct money movement (refunds, captures, payouts, account adjustments) is disabled at the policy boundary.',
                ],
                interpretations: ['User prompt contained instructions requesting monetary movement actions.'],
                unknowns: [],
                evidenceRefs: [],
                suggestedActions: [
                    'Navigate to your PayPal business portal to issue authorized customer refunds.',
                    'Use the Exception Management console to review break evidence in read-only mode.',
                ],
                isReadOnlyNotice: true,
                isAiGenerated: false,
                generatedAt: new Date().toISOString(),
                queryWindow: 'none',
            };

            const assistantMessage = await this.repository.appendMessage({
                merchantId,
                sessionId,
                role: 'assistant',
                content: assistantContent,
                answerPayload,
                requestId,
            });

            return {
                userMessage,
                assistantMessage,
                result: answerPayload,
            };
        }

        // 2. Append user message
        const userMessage = await this.repository.appendMessage({
            merchantId,
            sessionId,
            role: 'user',
            content,
            requestId,
        });

        // 3. Check for specific exception inquiry
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const matchedUuid = content.match(uuidRegex);

        if (matchedUuid && this.db.reconciliationException) {
            const excId = matchedUuid[0];
            const [exc, openCount] = await Promise.all([
                this.db.reconciliationException.findFirst
                    ? this.db.reconciliationException.findFirst({
                          where: { id: excId, merchantId },
                          include: {
                              providerTransaction: true,
                              merchantOrder: true,
                              auditEvents: true,
                          },
                      })
                    : null,
                this.db.reconciliationException.count({
                    where: { merchantId, status: 'OPEN' },
                }),
            ]);

            if (exc) {
                const evidenceRefs: CopilotEvidenceRef[] = [
                    {
                        id: exc.id,
                        type: 'exception',
                        label: `Exception ${exc.id.slice(0, 8)} (${exc.type})`,
                        details: `Status: ${exc.status}`,
                    },
                ];

                const facts: string[] = [
                    `Open breaks: ${openCount}`,
                    `Break type: ${exc.type}`,
                    `Lifecycle status: ${exc.status} (version ${exc.version})`,
                ];

                if (exc.providerTransaction) {
                    facts.push(
                        `Provider Txn ${exc.providerTransaction.providerTxnId} [${exc.providerTransaction.currency} ${formatMinorAmount(exc.providerTransaction.amountMinor, exc.providerTransaction.currency)}]`,
                    );
                    evidenceRefs.push({
                        id: exc.providerTransaction.id,
                        type: 'transaction',
                        label: `Provider Txn ${exc.providerTransaction.providerTxnId}`,
                        details: `Amount: ${exc.providerTransaction.currency} ${formatMinorAmount(exc.providerTransaction.amountMinor, exc.providerTransaction.currency)}`,
                    });
                }

                if (exc.merchantOrder) {
                    facts.push(
                        `Merchant Order ${exc.merchantOrder.externalOrderId} [${exc.merchantOrder.currency} ${formatMinorAmount(exc.merchantOrder.amountMinor, exc.merchantOrder.currency)}]`,
                    );
                    evidenceRefs.push({
                        id: exc.merchantOrder.id,
                        type: 'order',
                        label: `Order ${exc.merchantOrder.externalOrderId}`,
                        details: `Amount: ${exc.merchantOrder.currency} ${formatMinorAmount(exc.merchantOrder.amountMinor, exc.merchantOrder.currency)}`,
                    });
                }

                const assistantContent = `Exception ${exc.id} is currently ${exc.status} due to ${exc.type}. The system currently has ${openCount} open breaks requiring triage.`;

                const answerPayload = {
                    question: content,
                    intent: 'exception_breakdown' as CopilotIntent,
                    answer: assistantContent,
                    summary: `Exception ${exc.id.slice(0, 8)} status: ${exc.status} (${exc.type}).`,
                    facts,
                    observedFacts: facts,
                    interpretations: [
                        'Discrepancy identified between recorded provider transactions and internal merchant orders.',
                    ],
                    unknowns: [],
                    evidenceRefs,
                    suggestedActions: [
                        'Inspect recent audit events for operator updates.',
                        'Verify transaction settlement status in payment provider dashboard.',
                    ],
                    isAiGenerated: false,
                    generatedAt: new Date().toISOString(),
                    queryWindow: 'all',
                };

                const assistantMessage = await this.repository.appendMessage({
                    merchantId,
                    sessionId,
                    role: 'assistant',
                    content: assistantContent,
                    answerPayload,
                    requestId,
                });

                return {
                    userMessage,
                    assistantMessage,
                    result: answerPayload,
                };
            }
        }

        // 4. Default: answer grounded in DB facts with bounded context (max 6 messages)
        const recentTurns = await this.repository.getRecentTurnWindow(merchantId, sessionId, 6);
        const result = await this.answerQuestion(merchantId, {
            question: content,
            recentTurns,
        });

        const payloadWithFacts = {
            ...result,
            facts: result.facts || result.observedFacts,
        };

        const assistantMessage = await this.repository.appendMessage({
            merchantId,
            sessionId,
            role: 'assistant',
            content: result.answer,
            answerPayload: payloadWithFacts,
            requestId,
        });

        return {
            userMessage,
            assistantMessage,
            result: payloadWithFacts,
        };
    }

    getCapabilities(): CopilotCapabilitiesResult {
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
                    label: 'Exception Breakdown by Type',
                    description: 'Analyzes the distribution and financial exposure across all exception categories.',
                    exampleQuestions: [
                        'Which exception types account for the most unresolved value?',
                        'Show me a breakdown of all open exceptions.',
                    ],
                },
                {
                    intent: 'run_comparison',
                    label: 'Reconciliation Run Comparison',
                    description: 'Compares the last two runs to analyze match rate variations and new discrepancies.',
                    exampleQuestions: [
                        'Compare the last two reconciliation runs.',
                        'Why did our match rate fall in the most recent run?',
                    ],
                },
                {
                    intent: 'recent_run_summary',
                    label: 'Latest Run Summary',
                    description: 'Summarizes considered items, match rate, and created exceptions from the latest run.',
                    exampleQuestions: [
                        'Summarize the results of the latest reconciliation run.',
                        'What happened during the most recent run?',
                    ],
                },
                {
                    intent: 'duplicate_candidates',
                    label: 'Duplicate Payment Candidates',
                    description: 'Detects provider transactions with identical order IDs or recurring amount signatures.',
                    exampleQuestions: [
                        'Show duplicate-payment candidates from the last seven days.',
                        'Are there duplicate transaction candidates?',
                    ],
                },
                {
                    intent: 'missing_order_exceptions',
                    label: 'Missing Merchant Orders',
                    description: 'Highlights captured PayPal funds that lack corresponding internal order counterparts.',
                    exampleQuestions: [
                        'Which exceptions have missing merchant orders?',
                        'Show orphaned gateway payments without orders.',
                    ],
                },
                {
                    intent: 'general_reconciliation_summary',
                    label: 'Portfolio Reconciliation Health',
                    description: 'Provides a high-level operational status of overall reconciliation health and queue status.',
                    exampleQuestions: [
                        'Summarize the current reconciliation health.',
                        'How many unresolved exceptions are in our queue?',
                    ],
                },
            ],
        };
    }

    async answerQuestion(
        merchantId: string,
        request: CopilotAskRequest,
    ): Promise<CopilotAskResult> {
        const question = request.question.trim();
        const intent = routeQuestionIntent(question, request.recentTurns);
        const window = request.context?.window || '30d';
        const now = new Date();

        switch (intent) {
            case 'largest_unresolved_exceptions':
                return this.handleLargestExceptions(merchantId, question, window, now);
            case 'exception_breakdown':
                return this.handleExceptionBreakdown(merchantId, question, window, now);
            case 'run_comparison':
                return this.handleRunComparison(merchantId, question, now);
            case 'recent_run_summary':
                return this.handleRecentRunSummary(merchantId, question, now);
            case 'duplicate_candidates':
                return this.handleDuplicateCandidates(merchantId, question, window, now);
            case 'missing_order_exceptions':
                return this.handleMissingOrders(merchantId, question, window, now);
            case 'general_reconciliation_summary':
                return this.handleGeneralSummary(merchantId, question, window, now);
            case 'ambiguous_clarification':
                return this.handleAmbiguousClarification(question, now);
            case 'guardrail_blocked':
                return this.handleGuardrailBlocked(question, now);
            case 'unsupported':
            default:
                return this.handleUnsupported(question, now);
        }
    }

    // 1. Largest Unresolved Exceptions
    private async handleLargestExceptions(
        merchantId: string,
        question: string,
        window: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const exceptions = await this.db.reconciliationException.findMany({
            where: {
                merchantId,
                status: { in: ['OPEN', 'INVESTIGATING'] },
            },
            include: {
                providerTransaction: true,
                merchantOrder: true,
                reconciliationRun: true,
            },
            take: 100,
        });

        // Compute exposure for each and sort
        const itemsWithExposure = exceptions.map((ex: any) => {
            let amountMinor = 0n;
            let currency = 'USD';
            let label = 'Unresolved discrepancy';

            if (ex.providerTransaction) {
                amountMinor = ex.providerTransaction.amountMinor;
                currency = ex.providerTransaction.currency;
                label = `Provider txn: ${ex.providerTransaction.providerTxnId}`;
            } else if (ex.merchantOrder) {
                amountMinor = ex.merchantOrder.amountMinor;
                currency = ex.merchantOrder.currency;
                label = `Merchant order: ${ex.merchantOrder.externalOrderId}`;
            }

            return { ex, amountMinor, currency, label };
        });

        itemsWithExposure.sort((a: any, b: any) => (b.amountMinor > a.amountMinor ? 1 : -1));
        const top3 = itemsWithExposure.slice(0, 3);

        const evidenceRefs: CopilotEvidenceRef[] = [];
        const facts: string[] = [];

        top3.forEach((item: any, idx: number) => {
            const formatted = formatMinorAmount(item.amountMinor, item.currency);
            facts.push(
                `#${idx + 1}: Exception ${item.ex.id.slice(0, 8)}... (${item.ex.type}) with exposure of ${formatted} [Status: ${item.ex.status}]`,
            );
            evidenceRefs.push({
                id: item.ex.id,
                type: 'exception',
                label: `Exception ${item.ex.id.slice(0, 8)} (${formatted})`,
                details: item.label,
            });
            if (item.ex.reconciliationRunId) {
                evidenceRefs.push({
                    id: item.ex.reconciliationRunId,
                    type: 'run',
                    label: `Run ${item.ex.reconciliationRunId.slice(0, 8)}`,
                });
            }
        });

        if (top3.length === 0) {
            return {
                question,
                intent: 'largest_unresolved_exceptions',
                answer: 'There are currently no open or investigating exceptions for this merchant in the database.',
                summary: 'Queue clear: 0 open exceptions requiring financial remediation.',
                observedFacts: ['Total open exceptions in database: 0'],
                interpretations: ['Reconciliation queue is completely cleared for the selected scope.'],
                unknowns: ['No active discrepancy records found.'],
                evidenceRefs: [],
                suggestedActions: ['Trigger a new reconciliation run to check for new discrepancies.'],
                isAiGenerated: false,
                generatedAt: now.toISOString(),
                queryWindow: window,
            };
        }

        return {
            question,
            intent: 'largest_unresolved_exceptions',
            answer: `The three largest unresolved discrepancies account for the bulk of pending financial exposure in your queue. The highest single item is ${facts[0]} followed by ${top3.length > 1 ? facts[1] : 'none'}.`,
            summary: `Identified top ${top3.length} unresolved exceptions by financial exposure.`,
            observedFacts: facts,
            interpretations: [
                'Unresolved captured payments with missing orders carry high operational risk of customer fulfillment delay or chargebacks.',
                'Discrepancies exceeding 100.00 should be prioritized for immediate ledger triage.',
            ],
            unknowns: [
                'Whether the missing internal orders were cancelled during checkout or failed during webhook delivery cannot be verified without merchant ERP logs.',
            ],
            evidenceRefs,
            suggestedActions: [
                'Open each exception in the Exceptions Queue to inspect provider transaction audit events.',
                'Verify whether the corresponding merchant orders exist in your external ecommerce platform.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: window,
        };
    }

    // 2. Exception Breakdown
    private async handleExceptionBreakdown(
        merchantId: string,
        question: string,
        window: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const exceptions = await this.db.reconciliationException.findMany({
            where: { merchantId },
            include: { providerTransaction: true, merchantOrder: true },
            take: 300,
        });

        const typeMap = new Map<string, { open: number; resolved: number; currencies: Map<string, bigint> }>();
        for (const ex of exceptions) {
            if (!typeMap.has(ex.type)) {
                typeMap.set(ex.type, { open: 0, resolved: 0, currencies: new Map() });
            }
            const data = typeMap.get(ex.type)!;
            const isOpen = ex.status === 'OPEN' || ex.status === 'INVESTIGATING';
            if (isOpen) data.open++;
            else data.resolved++;

            const curr = ex.providerTransaction?.currency || ex.merchantOrder?.currency;
            const amt = ex.providerTransaction?.amountMinor || ex.merchantOrder?.amountMinor || 0n;
            if (curr && amt > 0n && isOpen) {
                data.currencies.set(curr, (data.currencies.get(curr) || 0n) + amt);
            }
        }

        const facts: string[] = [];
        const evidenceRefs: CopilotEvidenceRef[] = [];

        for (const [type, data] of typeMap.entries()) {
            const currStrs: string[] = [];
            for (const [curr, amt] of data.currencies.entries()) {
                currStrs.push(formatMinorAmount(amt, curr));
            }
            const exposureStr = currStrs.length > 0 ? ` (Open exposure: ${currStrs.join(', ')})` : '';
            facts.push(`${type}: ${data.open} open, ${data.resolved} resolved${exposureStr}`);
        }

        return {
            question,
            intent: 'exception_breakdown',
            answer: `Your reconciliation dataset contains ${exceptions.length} total exceptions across ${typeMap.size} distinct discrepancy categories. Below is the exact breakdown computed from database records.`,
            summary: `Distribution of ${exceptions.length} exceptions across ${typeMap.size} discrepancy categories.`,
            observedFacts: facts.length > 0 ? facts : ['No exceptions recorded for this merchant.'],
            interpretations: [
                'MISSING_MERCHANT_COUNTERPART typically reflects webhook ingestion drops or orphan PayPal checkout sessions.',
                'AMOUNT_MISMATCH is frequently caused by partial refunds, tax differences, or payment processing fee misallocations.',
            ],
            unknowns: [
                'Currency breakdown excludes exceptions without an attached provider transaction or merchant order record.',
            ],
            evidenceRefs,
            suggestedActions: [
                'Focus operational review on categories with the highest open counts and monetary exposure.',
                'Audit webhook receiver uptime for missing counterpart spikes.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: window,
        };
    }

    // 3. Run Comparison
    private async handleRunComparison(
        merchantId: string,
        question: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const runs = await this.db.reconciliationRun.findMany({
            where: { merchantId },
            orderBy: { createdAt: 'desc' },
            take: 2,
        });

        if (runs.length < 2) {
            return {
                question,
                intent: 'run_comparison',
                answer: `At least two reconciliation runs are required to perform a comparative diff. Only ${runs.length} run(s) currently exist for this merchant.`,
                summary: 'Insufficient historical run count for comparison.',
                observedFacts: [`Completed runs in database: ${runs.length}`],
                interpretations: ['Additional reconciliation runs must be executed before trends can be computed.'],
                unknowns: ['Prior run baseline is not recorded.'],
                evidenceRefs: runs.map((r: any) => ({
                    id: r.id,
                    type: 'run',
                    label: `Run ${r.id.slice(0, 8)} (${r.status})`,
                })),
                suggestedActions: ['Trigger a new reconciliation run via the Reconciliation hub.'],
                isAiGenerated: false,
                generatedAt: now.toISOString(),
                queryWindow: 'all',
            };
        }

        const [latest, previous] = runs;
        const latestRate = latest.totalConsidered > 0
            ? ((latest.matchedCount / latest.totalConsidered) * 100).toFixed(1)
            : '0.0';
        const prevRate = previous.totalConsidered > 0
            ? ((previous.matchedCount / previous.totalConsidered) * 100).toFixed(1)
            : '0.0';
        const rateDiff = (parseFloat(latestRate) - parseFloat(prevRate)).toFixed(1);

        const facts = [
            `Latest Run (${latest.id.slice(0, 8)}): Total ${latest.totalConsidered}, Matched ${latest.matchedCount}, Unmatched ${latest.unmatchedCount}, Match Rate ${latestRate}%`,
            `Previous Run (${previous.id.slice(0, 8)}): Total ${previous.totalConsidered}, Matched ${previous.matchedCount}, Unmatched ${previous.unmatchedCount}, Match Rate ${prevRate}%`,
            `Match rate variation: ${parseFloat(rateDiff) >= 0 ? '+' : ''}${rateDiff}% percentage points between consecutive runs.`,
        ];

        return {
            question,
            intent: 'run_comparison',
            answer: `Comparing the two most recent reconciliation runs reveals a match rate of ${latestRate}% in the latest run versus ${prevRate}% in the previous run (${rateDiff}% change). Unmatched items shifted from ${previous.unmatchedCount} to ${latest.unmatchedCount}.`,
            summary: `Run comparison: latest match rate is ${latestRate}% (${rateDiff}% shift from prior run).`,
            observedFacts: facts,
            interpretations: [
                parseFloat(rateDiff) < 0
                    ? 'A decline in match rate indicates a recent batch of provider transactions or orders lacked counterpart records within the ingestion time window.'
                    : 'Match rate improved or held steady across the consecutive batch windows.',
            ],
            unknowns: [
                'Whether the unmatched records are due to delayed webhook delivery or genuine customer abandonment.',
            ],
            evidenceRefs: [
                { id: latest.id, type: 'run', label: `Latest Run ${latest.id.slice(0, 8)}` },
                { id: previous.id, type: 'run', label: `Previous Run ${previous.id.slice(0, 8)}` },
            ],
            suggestedActions: [
                'Inspect the exceptions queue filtered by the latest run ID to review new discrepancies.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: 'last_2_runs',
        };
    }

    // 4. Recent Run Summary
    private async handleRecentRunSummary(
        merchantId: string,
        question: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const latest = await this.db.reconciliationRun.findFirst({
            where: { merchantId },
            orderBy: { createdAt: 'desc' },
        });

        if (!latest) {
            return {
                question,
                intent: 'recent_run_summary',
                answer: 'No reconciliation runs have been executed for this merchant yet.',
                summary: 'No runs recorded.',
                observedFacts: ['Total reconciliation runs: 0'],
                interpretations: ['A reconciliation run must be initiated to begin matching.'],
                unknowns: ['No execution history available.'],
                evidenceRefs: [],
                suggestedActions: ['Click "Reconciliation" in the top bar to run your first batch match.'],
                isAiGenerated: false,
                generatedAt: now.toISOString(),
                queryWindow: 'all',
            };
        }

        const matchRate = latest.totalConsidered > 0
            ? ((latest.matchedCount / latest.totalConsidered) * 100).toFixed(1)
            : '0.0';

        const facts = [
            `Run ID: ${latest.id}`,
            `Status: ${latest.status}`,
            `Ruleset: ${latest.rulesetVersion}`,
            `Window: ${new Date(latest.windowStart).toLocaleDateString()} to ${new Date(latest.windowEnd).toLocaleDateString()}`,
            `Total Considered: ${latest.totalConsidered} records`,
            `Matched: ${latest.matchedCount} (${matchRate}%)`,
            `Unmatched: ${latest.unmatchedCount}`,
            `Ambiguous: ${latest.ambiguousCount}`,
        ];

        return {
            question,
            intent: 'recent_run_summary',
            answer: `The latest reconciliation run (${latest.id.slice(0, 8)}) finished with status ${latest.status}. It considered ${latest.totalConsidered} records, achieving an automated match rate of ${matchRate}%.`,
            summary: `Latest run ${latest.id.slice(0, 8)} achieved ${matchRate}% match rate (${latest.unmatchedCount} unmatched).`,
            observedFacts: facts,
            interpretations: [
                `Automated matching resolved ${latest.matchedCount} records cleanly.`,
                latest.unmatchedCount > 0
                    ? `${latest.unmatchedCount} records could not be reconciled deterministically and produced exceptions in the queue.`
                    : 'All records in this window matched successfully.',
            ],
            unknowns: [
                latest.failureReason ? `Failure note: ${latest.failureReason}` : 'No processing errors logged for this run.',
            ],
            evidenceRefs: [{ id: latest.id, type: 'run', label: `Run ${latest.id.slice(0, 8)}` }],
            suggestedActions: [
                'Review open exceptions tied to this run in the Exceptions Queue.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: 'latest_run',
        };
    }

    // 5. Duplicate Candidates
    private async handleDuplicateCandidates(
        merchantId: string,
        question: string,
        window: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const txns = await this.db.providerTransaction.findMany({
            where: { merchantId },
            orderBy: { occurredAt: 'desc' },
            take: 200,
        });

        // Group by providerOrderId or same amount + currency
        const orderIdGroups = new Map<string, any[]>();
        for (const t of txns) {
            if (t.providerOrderId) {
                const arr = orderIdGroups.get(t.providerOrderId) || [];
                arr.push(t);
                orderIdGroups.set(t.providerOrderId, arr);
            }
        }

        const duplicateGroups: Array<{ orderId: string; count: number; txns: any[] }> = [];
        for (const [orderId, group] of orderIdGroups.entries()) {
            if (group.length > 1) {
                duplicateGroups.push({ orderId, count: group.length, txns: group });
            }
        }

        const facts: string[] = [];
        const evidenceRefs: CopilotEvidenceRef[] = [];

        duplicateGroups.slice(0, 5).forEach((dg) => {
            const first = dg.txns[0];
            const formatted = formatMinorAmount(first.amountMinor, first.currency);
            facts.push(
                `Order ${dg.orderId}: ${dg.count} provider transactions captured for ${formatted}`,
            );
            dg.txns.forEach((t) => {
                evidenceRefs.push({
                    id: t.id,
                    type: 'transaction',
                    label: `Txn ${t.providerTxnId} (${formatted})`,
                    details: `Order: ${dg.orderId}`,
                });
            });
        });

        if (duplicateGroups.length === 0) {
            return {
                question,
                intent: 'duplicate_candidates',
                answer: 'No duplicate provider transaction candidates were detected among recent transactions.',
                summary: '0 duplicate transaction groups detected.',
                observedFacts: [`Analyzed ${txns.length} recent provider transactions. Found 0 duplicate groups.`],
                interpretations: ['Payment provider capture idempotent keys appear healthy.'],
                unknowns: ['Transactions older than the query batch window were not evaluated.'],
                evidenceRefs: [],
                suggestedActions: ['Continue periodic monitoring of ambiguous matches in the queue.'],
                isAiGenerated: false,
                generatedAt: now.toISOString(),
                queryWindow: window,
            };
        }

        return {
            question,
            intent: 'duplicate_candidates',
            answer: `Found ${duplicateGroups.length} candidate duplicate payment groups where multiple gateway transactions share the same provider order reference.`,
            summary: `${duplicateGroups.length} duplicate payment candidate groups identified.`,
            observedFacts: facts,
            interpretations: [
                'Multiple captures referencing the exact same provider order indicate potential double-click checkout, webhook retries, or partial-reversal loops.',
            ],
            unknowns: [
                'Customer chargeback disputes or refund intent cannot be verified without merchant support ticket records.',
            ],
            evidenceRefs,
            suggestedActions: [
                'Verify with PayPal dashboard whether one of the duplicate transactions was already refunded.',
                'Inspect the corresponding order in the Orders modal to confirm single vs double fulfillment.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: window,
        };
    }

    // 6. Missing Merchant Orders
    private async handleMissingOrders(
        merchantId: string,
        question: string,
        window: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const exceptions = await this.db.reconciliationException.findMany({
            where: {
                merchantId,
                type: 'MISSING_MERCHANT_COUNTERPART',
                status: { in: ['OPEN', 'INVESTIGATING'] },
            },
            include: { providerTransaction: true },
            take: 20,
        });

        const facts: string[] = [];
        const evidenceRefs: CopilotEvidenceRef[] = [];
        const currTotals = new Map<string, bigint>();

        exceptions.slice(0, 5).forEach((ex: any) => {
            const txn = ex.providerTransaction;
            if (txn) {
                const formatted = formatMinorAmount(txn.amountMinor, txn.currency);
                facts.push(`Exception ${ex.id.slice(0, 8)}: Captured ${formatted} (Txn: ${txn.providerTxnId})`);
                evidenceRefs.push({
                    id: ex.id,
                    type: 'exception',
                    label: `Exception ${ex.id.slice(0, 8)} (${formatted})`,
                    details: `Txn: ${txn.providerTxnId}`,
                });
                currTotals.set(txn.currency, (currTotals.get(txn.currency) || 0n) + txn.amountMinor);
            }
        });

        const exposureStrs: string[] = [];
        for (const [curr, amt] of currTotals.entries()) {
            exposureStrs.push(formatMinorAmount(amt, curr));
        }

        return {
            question,
            intent: 'missing_order_exceptions',
            answer: `There are ${exceptions.length} open exceptions where payment was settled by PayPal but no corresponding merchant order exists. Total exposure: ${exposureStrs.length > 0 ? exposureStrs.join(', ') : 'None'}.`,
            summary: `${exceptions.length} orphaned gateway payments pending merchant order counterparts.`,
            observedFacts: facts.length > 0 ? facts : ['0 orphaned provider transactions found.'],
            interpretations: [
                'These usually represent checkout abandonment after successful PayPal authorization, or dropped order ingestion API calls.',
            ],
            unknowns: [
                'Whether the customer received a confirmation email depends on external ecommerce notification services.',
            ],
            evidenceRefs,
            suggestedActions: [
                'Check your ecommerce store admin to verify if an order was created under a guest email.',
                'Use "Ingest Orders" in the console to retroactively import the missing order.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: window,
        };
    }

    // 7. General Summary
    private async handleGeneralSummary(
        merchantId: string,
        question: string,
        window: string,
        now: Date,
    ): Promise<CopilotAskResult> {
        const [totalExceptions, openExceptions, totalRuns] = await Promise.all([
            this.db.reconciliationException.count({ where: { merchantId } }),
            this.db.reconciliationException.count({
                where: { merchantId, status: { in: ['OPEN', 'INVESTIGATING'] } },
            }),
            this.db.reconciliationRun.count({ where: { merchantId } }),
        ]);

        const facts = [
            `Total reconciliation runs recorded: ${totalRuns}`,
            `Total historical exceptions generated: ${totalExceptions}`,
            `Currently unresolved exceptions: ${openExceptions} (${totalExceptions > 0 ? ((openExceptions / totalExceptions) * 100).toFixed(0) : '0'}% of historical volume)`,
        ];

        return {
            question,
            intent: 'general_reconciliation_summary',
            answer: `FlowOps has performed ${totalRuns} reconciliation runs for this merchant. There are currently ${openExceptions} open exceptions requiring operator triage out of ${totalExceptions} total generated historically.`,
            summary: `Portfolio Status: ${openExceptions} open exceptions across ${totalRuns} reconciliation runs.`,
            observedFacts: facts,
            interpretations: [
                openExceptions === 0
                    ? 'Reconciliation pipeline is fully clean and up to date.'
                    : 'Active discrepancies exist. Focus on highest-exposure exceptions in the Portfolio Intelligence tab.',
            ],
            unknowns: ['Real-time unbatched provider events currently in PayPal webhook pipeline are not counted until reconciliation runs.'],
            evidenceRefs: [],
            suggestedActions: [
                'Review the Portfolio Intelligence tab for priority-ranked grouping.',
                'Trigger a new reconciliation run if new transactions have occurred today.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: window,
        };
    }

    // 8. Ambiguous question clarification
    private handleAmbiguousClarification(question: string, now: Date): CopilotAskResult {
        return {
            question,
            intent: 'ambiguous_clarification',
            answer: `Your follow-up question is ambiguous. Rather than guessing, please specify which aspect of the reconciliation portfolio you would like to analyze:
1. "What are the largest open discrepancies?" (ranked by currency exposure)
2. "Compare the last two reconciliation runs" (match rate variation and break counts)
3. "Show duplicate-payment candidates" or "Which exceptions have missing merchant orders?"`,
            summary: 'Clarification needed: follow-up reference is ambiguous.',
            observedFacts: [
                `Received question: "${question}"`,
                'Follow-up reference did not contain unambiguous filters, run identifiers, or exception categories.',
            ],
            interpretations: [
                'Context requires operator clarification to execute an authoritative database query.',
            ],
            unknowns: [
                'Target exception category, reconciliation run ID, or specific currency window.',
            ],
            evidenceRefs: [],
            suggestedActions: [
                'Ask: "What are the largest unresolved discrepancies?"',
                'Ask: "Compare the last two reconciliation runs."',
                'Ask: "Show exceptions with missing merchant orders."',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: 'all',
            storageMode: 'tenant_session_store',
        };
    }

    // 9. Guardrail Blocked (Security / Read-Only / Anti-Hallucination)
    private handleGuardrailBlocked(question: string, now: Date): CopilotAskResult {
        return {
            question,
            intent: 'guardrail_blocked',
            answer: `Action blocked by system safety controls: FlowOps Copilot is an advisory, read-only intelligence tool. It strictly prohibits executing destructive operations, arbitrary SQL queries, credentials retrieval, or automated money movement (refunds/captures/payouts).`,
            summary: 'Operation blocked: Copilot is strictly read-only and cannot execute monetary or destructive actions.',
            observedFacts: [
                'Request triggered safety policy restricting credential disclosure, database mutations, or funds transfers.',
            ],
            interpretations: [
                'Financial corrections must be performed through verified operational channels by authorized administrators.',
            ],
            unknowns: [],
            evidenceRefs: [],
            suggestedActions: [
                'Review discrepancy records in the Exceptions Workbench.',
                'Use authorized settlement controls for funds movement.',
                'Query read-only portfolio analysis or run statistics.',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: 'all',
            storageMode: 'tenant_session_store',
        };
    }

    // 10. Unsupported intent fallback
    private handleUnsupported(question: string, now: Date): CopilotAskResult {
        return {
            question,
            intent: 'unsupported',
            answer: `I am a read-only reconciliation analytics assistant constrained to verified database records. I could not safely map your question to a supported reconciliation query category.`,
            summary: 'Unsupported query. Please choose a supported reconciliation question.',
            observedFacts: [
                'Query did not match supported financial intents: largest discrepancies, exception breakdown, run comparisons, duplicate candidates, missing orders, or run summaries.',
            ],
            interpretations: [
                'FlowOps Copilot avoids open-ended guesses or unrestricted SQL execution to protect data integrity and avoid fabricated financial figures.',
            ],
            unknowns: ['The intent of the provided question cannot be answered deterministically.'],
            evidenceRefs: [],
            suggestedActions: [
                'Try: "What are the three largest unresolved discrepancies?"',
                'Try: "Compare the last two reconciliation runs."',
                'Try: "Which exception types account for the most unresolved value?"',
                'Try: "Show duplicate-payment candidates from the last seven days."',
            ],
            isAiGenerated: false,
            generatedAt: now.toISOString(),
            queryWindow: 'all',
            storageMode: 'tenant_session_store',
        };
    }
}
