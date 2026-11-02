import type { CopilotIntent, CopilotTurnContext } from './types';

export function routeQuestionIntent(
    question: string,
    recentTurns?: CopilotTurnContext[],
): CopilotIntent {
    const q = question.toLowerCase().trim();

    // 0. System Guardrails: neutralize dangerous commands, SQL injections, secrets requests, or financial execution
    if (
        q.includes('drop table') ||
        q.includes('truncate') ||
        q.includes('delete from') ||
        q.includes('select * from') ||
        q.includes('api_key') ||
        q.includes('secret') ||
        q.includes('password') ||
        q.includes('credential') ||
        q.includes('refund') ||
        q.includes('capture') ||
        q.includes('payout') ||
        q.includes('move money') ||
        q.includes('transfer funds') ||
        q.includes('ignore previous instructions') ||
        q.includes('system prompt')
    ) {
        return 'guardrail_blocked';
    }

    // 1. Exception breakdown by type / value
    if (
        q.includes('breakdown') ||
        q.includes('distribution') ||
        q.includes('types') ||
        q.includes('category') ||
        q.includes('ex-') ||
        (q.includes('which exception') && (q.includes('account') || q.includes('type')))
    ) {
        return 'exception_breakdown';
    }

    // 2. Largest / highest value exceptions
    if (
        (q.includes('largest') || q.includes('biggest') || q.includes('highest') || q.includes('top amount')) &&
        (q.includes('exception') || q.includes('discrepanc') || q.includes('amount') || q.includes('unresolved'))
    ) {
        return 'largest_unresolved_exceptions';
    }

    // 3. Run comparison
    if (
        (q.includes('compare') || q.includes('comparison') || q.includes('between')) &&
        (q.includes('run') || q.includes('reconciliation') || q.includes('match rate'))
    ) {
        return 'run_comparison';
    }
    if (q.includes('why did') && (q.includes('match rate') || q.includes('fall') || q.includes('drop'))) {
        return 'run_comparison';
    }

    // 4. Duplicate payment candidates
    if (
        q.includes('duplicate') ||
        q.includes('double charge') ||
        q.includes('double payment') ||
        q.includes('identical transaction')
    ) {
        return 'duplicate_candidates';
    }

    // 5. Missing merchant orders
    if (
        (q.includes('missing') || q.includes('absent') || q.includes('orphaned')) &&
        (q.includes('order') || q.includes('merchant counterpart'))
    ) {
        return 'missing_order_exceptions';
    }

    // 6. Recent run summary
    if (
        (q.includes('latest run') || q.includes('most recent run') || q.includes('last run') || q.includes('recent run')) ||
        (q.includes('latest') && q.includes('reconciliation')) ||
        (q.includes('latest run') && q.includes('recurring'))
    ) {
        return 'recent_run_summary';
    }

    // 7. General reconciliation summary / health
    if (
        q.includes('summarize') ||
        q.includes('summary') ||
        q.includes('overview') ||
        q.includes('how many') ||
        q.includes('health') ||
        q.includes('reconciliation status')
    ) {
        return 'general_reconciliation_summary';
    }

    // 8. Follow-up context resolution using bounded recent turns (at most 6 messages)
    if (recentTurns && recentTurns.length > 0) {
        // Find the most recent non-clarification intent from recent context
        const priorTurn = [...recentTurns].reverse().find(
            (t) => t.intent && t.intent !== 'ambiguous_clarification' && t.intent !== 'unsupported' && t.intent !== 'guardrail_blocked',
        );

        if (priorTurn?.intent) {
            // Check for unambiguous follow-up references
            if (
                q.includes('compare that') ||
                q.includes('compare with last') ||
                q.includes('what about last week') ||
                q.includes('how does that compare')
            ) {
                return 'run_comparison';
            }
            if (
                q.includes('more details') ||
                q.includes('tell me more about those') ||
                q.includes('which ones') ||
                q.includes('show those') ||
                q.includes('details on that')
            ) {
                if (priorTurn.intent) {
                    return priorTurn.intent;
                }
            }
        }
    }

    // 9. Ambiguous short question detection
    if (
        !q.includes('ex-') && !q.includes('run-') && !q.includes('order-') &&
        (q === 'why?' ||
         q === 'why did that happen?' ||
         q.includes('why did that happen') ||
         q.includes('explain that') ||
         q.includes('explain that one') ||
         q.includes('tell me more') ||
         q.includes('what about that') ||
         q.includes('how about that') ||
         q.startsWith('what about') ||
         q.startsWith('how about'))
    ) {
        return 'ambiguous_clarification';
    }

    return 'unsupported';
}
