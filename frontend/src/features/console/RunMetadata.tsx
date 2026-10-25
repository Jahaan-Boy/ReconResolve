import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, GitCommit } from 'lucide-react';
import type { LinkedReconciliationRunSummary } from '@/services/api/types';
import { formatTimestamp, truncateId } from '@/lib/formatters';

interface RunMetadataProps {
    run?: LinkedReconciliationRunSummary | null;
}

export function RunMetadata({ run }: RunMetadataProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    if (!run) {
        return (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Reconciliation Run:</span> Ad-hoc or direct break (no linked run record).
            </div>
        );
    }

    const copyRunId = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(run.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/60 hover:bg-slate-100/70 transition-colors text-left"
                aria-expanded={open}
            >
                <div className="flex items-center gap-2">
                    <GitCommit className="size-4 text-slate-500 shrink-0" />
                    <span className="text-xs font-semibold text-slate-800">
                        Reconciliation Run Details
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                        Ruleset {run.rulesetVersion}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-500">
                        {truncateId(run.id, 8, 4)}
                    </span>
                    {open ? (
                        <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                        <ChevronRight className="size-4 text-slate-400" />
                    )}
                </div>
            </button>

            {open && (
                <div className="px-4 py-3 border-t border-slate-100 bg-white text-xs space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Run UUID</span>
                        <div className="flex items-center gap-1.5 font-mono text-slate-800">
                            <span>{run.id}</span>
                            <button
                                type="button"
                                onClick={copyRunId}
                                className="text-slate-400 hover:text-slate-600"
                                title="Copy Run ID"
                            >
                                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Run Window Start</span>
                        <span className="text-slate-800 tabular-nums">{formatTimestamp(run.windowStart)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Run Window End</span>
                        <span className="text-slate-800 tabular-nums">{formatTimestamp(run.windowEnd)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-slate-500">Status</span>
                        <span className="font-semibold text-emerald-700">{run.status}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
