import {
    Activity,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Clock,
    FileSpreadsheet,
    Percent,
    PlayCircle,
    RefreshCw,
    ShieldAlert,
    TrendingUp,
} from 'lucide-react';
import type {
    DashboardLatestRunSummary,
    DashboardMetricsSummary,
    ReconciliationRunStatus,
} from '@/services/api/types';
import { formatTimestamp } from '@/lib/formatters';

export interface DashboardSummaryCardsProps {
    latestRun: DashboardLatestRunSummary | null;
    summary: DashboardMetricsSummary;
    onViewExceptions?: () => void;
    onViewRuns?: () => void;
}

function RunStatusBadge({ status }: { status: ReconciliationRunStatus }) {
    switch (status) {
        case 'COMPLETED':
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="size-3.5" />
                    <span>Completed</span>
                </span>
            );
        case 'RUNNING':
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>Running</span>
                </span>
            );
        case 'FAILED':
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                    <AlertTriangle className="size-3.5" />
                    <span>Failed</span>
                </span>
            );
        case 'PENDING':
        default:
            return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                    <Clock className="size-3.5" />
                    <span>Pending</span>
                </span>
            );
    }
}

export function DashboardSummaryCards({
    latestRun,
    summary,
    onViewExceptions,
    onViewRuns,
}: DashboardSummaryCardsProps) {
    const hasLatestRun = Boolean(latestRun);
    const breakCount = (latestRun?.unmatchedCount ?? 0) + (latestRun?.ambiguousCount ?? 0);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Latest Run Status */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                        Latest Run
                    </span>
                    <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Activity className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Run Outcome</div>
                    <div className="mt-1.5 flex items-center gap-2">
                        {hasLatestRun && latestRun ? (
                            <RunStatusBadge status={latestRun.status} />
                        ) : (
                            <span className="text-sm font-semibold text-slate-400">No runs yet</span>
                        )}
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between">
                    <span>
                        {hasLatestRun && latestRun?.completedAt
                            ? formatTimestamp(latestRun.completedAt)
                            : 'Awaiting first run'}
                    </span>
                    {latestRun?.durationMs !== null && latestRun?.durationMs !== undefined && (
                        <span className="font-mono text-slate-400 text-[11px]">
                            {(latestRun.durationMs / 1000).toFixed(1)}s
                        </span>
                    )}
                </div>
            </div>

            {/* 2. Reconciliation Match Rate */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                        Latest Run
                    </span>
                    <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Percent className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Match Rate</div>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                            {latestRun?.matchRatePercentage !== null &&
                            latestRun?.matchRatePercentage !== undefined
                                ? `${latestRun.matchRatePercentage}%`
                                : '—'}
                        </span>
                        {latestRun?.matchRatePercentage !== null &&
                            latestRun?.matchRatePercentage !== undefined && (
                                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-0.5">
                                    <TrendingUp className="size-3.5" />
                                    deterministic
                                </span>
                            )}
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    {hasLatestRun && latestRun
                        ? `${latestRun.matchedCount} of ${latestRun.eligibleConsidered} eligible matched`
                        : 'No eligible records processed'}
                </div>
            </div>

            {/* 3. Records Considered */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                        Latest Run
                    </span>
                    <div className="size-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <FileSpreadsheet className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Records Considered</div>
                    <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900 font-mono">
                        {latestRun?.totalConsidered ?? 0}
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between">
                    <span>{latestRun?.matchedCount ?? 0} matched</span>
                    <span className="text-slate-400">{latestRun?.excludedCount ?? 0} excluded</span>
                </div>
            </div>

            {/* 4. Discrepancies & Breaks */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                        Latest Run
                    </span>
                    <div className="size-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <AlertCircle className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Breaks & Discrepancies</div>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span
                            className={`text-2xl font-bold tracking-tight font-mono ${
                                breakCount > 0 ? 'text-amber-600' : 'text-slate-400'
                            }`}
                        >
                            {breakCount}
                        </span>
                        <span className="text-xs text-slate-400">items</span>
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between">
                    <span>{latestRun?.unmatchedCount ?? 0} unmatched</span>
                    <span>{latestRun?.ambiguousCount ?? 0} ambiguous</span>
                </div>
            </div>

            {/* 5. Unresolved Exceptions (All Open) */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">
                        Current Open Items
                    </span>
                    <div className="size-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                        <ShieldAlert className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Unresolved Exceptions</div>
                    <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                            {summary.openExceptionCount}
                        </span>
                        {onViewExceptions && (
                            <button
                                type="button"
                                onClick={onViewExceptions}
                                className="text-xs font-semibold text-fin-brand hover:text-fin-brand-hover transition-colors"
                            >
                                View Queue →
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    Requires operator review or automated resolution
                </div>
            </div>

            {/* 6. Period Execution Health */}
            <div className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-600 uppercase">
                        Selected Period
                    </span>
                    <div className="size-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <PlayCircle className="size-4" />
                    </div>
                </div>
                <div className="my-3">
                    <div className="text-xs text-slate-500 font-medium">Runs Executed</div>
                    <div className="mt-1 flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-slate-900 font-mono">
                                {summary.runCount}
                            </span>
                            <span className="text-xs text-slate-400">runs</span>
                        </div>
                        {onViewRuns && (
                            <button
                                type="button"
                                onClick={onViewRuns}
                                className="text-xs font-semibold text-fin-brand hover:text-fin-brand-hover transition-colors"
                            >
                                All Runs →
                            </button>
                        )}
                    </div>
                </div>
                <div className="text-xs text-slate-500 border-t border-slate-100 pt-2.5 flex items-center justify-between">
                    <span className="text-emerald-700 font-medium">
                        {summary.completedRunCount} completed
                    </span>
                    {summary.failedRunCount > 0 ? (
                        <span className="text-rose-600 font-medium">
                            {summary.failedRunCount} failed
                        </span>
                    ) : (
                        <span className="text-slate-400">0 failures</span>
                    )}
                </div>
            </div>
        </div>
    );
}
