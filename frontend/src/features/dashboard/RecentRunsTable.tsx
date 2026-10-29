import { useState } from 'react';
import {
    ArrowRight,
    Check,
    CheckCircle2,
    Clock,
    Copy,
    GitCommit,
    RefreshCw,
    AlertTriangle,
} from 'lucide-react';
import type {
    ReconciliationRunStatus,
    ReconciliationRunSummary,
} from '@/services/api/types';
import { formatTimestamp, truncateId } from '@/lib/formatters';

export interface RecentRunsTableProps {
    runs: ReconciliationRunSummary[];
    loading?: boolean;
    onInspectRun: (runId: string) => void;
    onViewAllRuns?: () => void;
}

function RunStatusBadge({ status }: { status: ReconciliationRunStatus }) {
    switch (status) {
        case 'COMPLETED':
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    <span>Completed</span>
                </span>
            );
        case 'RUNNING':
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                    <RefreshCw className="size-3 animate-spin" />
                    <span>Running</span>
                </span>
            );
        case 'FAILED':
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400">
                    <AlertTriangle className="size-3" />
                    <span>Failed</span>
                </span>
            );
        case 'PENDING':
        default:
            return (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                    <Clock className="size-3" />
                    <span>Pending</span>
                </span>
            );
    }
}

export function RecentRunsTable({
    runs,
    loading = false,
    onInspectRun,
    onViewAllRuns,
}: RecentRunsTableProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <div className="flex items-center gap-2">
                    <GitCommit className="size-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">
                        Recent Reconciliation Runs
                    </h2>
                    <span className="text-xs text-slate-500">
                        ({runs.length} displayed)
                    </span>
                </div>
                {onViewAllRuns && (
                    <button
                        type="button"
                        onClick={onViewAllRuns}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                    >
                        <span>Run History</span>
                        <ArrowRight className="size-3" />
                    </button>
                )}
            </div>

            {/* Table or Empty State */}
            {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <RefreshCw className="size-5 animate-spin text-slate-400" />
                    <span className="text-xs">Loading run history…</span>
                </div>
            ) : runs.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-xs">
                    No reconciliation runs recorded yet for this merchant tenant.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-medium">
                                <th scope="col" className="pb-2.5 font-medium">Run ID</th>
                                <th scope="col" className="pb-2.5 font-medium">Execution Date</th>
                                <th scope="col" className="pb-2.5 font-medium">Status</th>
                                <th scope="col" className="pb-2.5 font-medium text-right">Match Rate</th>
                                <th scope="col" className="pb-2.5 font-medium text-right">Total / Matched</th>
                                <th scope="col" className="pb-2.5 font-medium text-right">Breaks</th>
                                <th scope="col" className="pb-2.5 font-medium text-right">Duration</th>
                                <th scope="col" className="pb-2.5 font-medium text-right pr-2">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                            {runs.map((run) => {
                                const eligible = Math.max(0, run.totalConsidered - run.excludedCount);
                                const matchRate =
                                    eligible > 0
                                        ? ((run.matchedCount / eligible) * 100).toFixed(1)
                                        : null;
                                const breakCount = run.unmatchedCount + run.ambiguousCount;
                                const durationMs =
                                    run.startedAt && run.completedAt
                                        ? Math.max(
                                              0,
                                              new Date(run.completedAt).getTime() -
                                                  new Date(run.startedAt).getTime(),
                                          )
                                        : null;

                                return (
                                    <tr
                                        key={run.id}
                                        onClick={() => onInspectRun(run.id)}
                                        className="group hover:bg-slate-800/50 cursor-pointer transition-colors"
                                    >
                                        {/* Run ID with copy */}
                                        <td className="py-3 text-slate-300">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-semibold">{truncateId(run.id, 8, 4)}</span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopy(run.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 hover:text-white text-slate-500 transition-opacity p-0.5 rounded"
                                                    title="Copy full Run UUID"
                                                >
                                                    {copiedId === run.id ? (
                                                        <Check className="size-3 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="size-3" />
                                                    )}
                                                </button>
                                            </div>
                                        </td>

                                        {/* Execution Date */}
                                        <td className="py-3 text-slate-400 font-sans">
                                            {run.createdAt ? formatTimestamp(run.createdAt) : '—'}
                                        </td>

                                        {/* Status */}
                                        <td className="py-3 font-sans">
                                            <RunStatusBadge status={run.status} />
                                        </td>

                                        {/* Match Rate */}
                                        <td className="py-3 text-right">
                                            {matchRate !== null ? (
                                                <span className="text-emerald-400 font-semibold">
                                                    {matchRate}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-500">—</span>
                                            )}
                                        </td>

                                        {/* Total / Matched */}
                                        <td className="py-3 text-right text-slate-300">
                                            <span>{run.matchedCount}</span>
                                            <span className="text-slate-500"> / {run.totalConsidered}</span>
                                        </td>

                                        {/* Breaks */}
                                        <td className="py-3 text-right">
                                            {breakCount > 0 ? (
                                                <span className="text-amber-400 font-semibold">
                                                    {breakCount}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500">0</span>
                                            )}
                                        </td>

                                        {/* Duration */}
                                        <td className="py-3 text-right text-slate-400">
                                            {durationMs !== null
                                                ? `${(durationMs / 1000).toFixed(1)}s`
                                                : '—'}
                                        </td>

                                        {/* Inspect Action */}
                                        <td className="py-3 text-right pr-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onInspectRun(run.id);
                                                }}
                                                className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-sans font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
                                            >
                                                <span>Inspect</span>
                                                <ArrowRight className="size-3" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
