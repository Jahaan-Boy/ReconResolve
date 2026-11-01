import type { CopilotIntent } from './types';

export function routeQuestionIntent(question: string): CopilotIntent {
    const q = question.toLowerCase().trim();

    // 1. Exception breakdown by type / value
    if (
        q.includes('breakdown') ||
        q.includes('distribution') ||
        q.includes('types') ||
        q.includes('category') ||
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

    return 'unsupported';
}
