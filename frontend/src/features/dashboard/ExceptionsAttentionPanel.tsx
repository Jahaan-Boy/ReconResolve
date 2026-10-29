import { ArrowRight, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import type { ExceptionSummary } from '@/services/api/types';
import { ExceptionTypeBadge } from '@/components/fintech/ExceptionTypeBadge';
import { formatTimestamp, truncateId } from '@/lib/formatters';

export interface ExceptionsAttentionPanelProps {
    exceptions: ExceptionSummary[];
    loading?: boolean;
    onSelectException: (exceptionId: string) => void;
    onViewAllOpenExceptions: () => void;
}

export function ExceptionsAttentionPanel({
    exceptions,
    loading = false,
    onSelectException,
    onViewAllOpenExceptions,
}: ExceptionsAttentionPanelProps) {
    const openItems = exceptions
        .filter((e) => e.status === 'OPEN' || e.status === 'INVESTIGATING')
        .slice(0, 5);

    return (
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-sm backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-white">
                        Exceptions Requiring Attention
                    </h2>
                    <span className="text-xs text-slate-500">
                        (Top {openItems.length} open items)
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onViewAllOpenExceptions}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                    <span>Exceptions Workbench</span>
                    <ArrowRight className="size-3" />
                </button>
            </div>

            {/* List or Empty State */}
            {loading ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                    Loading unresolved exceptions…
                </div>
            ) : openItems.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <CheckCircle2 className="size-6 text-emerald-500/60" />
                    <span className="text-xs font-medium text-slate-400">
                        Queue clear — no unresolved exceptions pending attention
                    </span>
                </div>
            ) : (
                <div className="divide-y divide-slate-800/60">
                    {openItems.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => onSelectException(item.id)}
                            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 hover:bg-slate-800/40 rounded-lg px-2 -mx-2 cursor-pointer transition-colors"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 min-w-0">
                                <ExceptionTypeBadge type={item.type} />
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="font-mono font-medium text-slate-300">
                                        {truncateId(item.id, 8, 4)}
                                    </span>
                                    {item.status === 'INVESTIGATING' && (
                                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                                            <Clock className="size-2.5" />
                                            <span>Investigating</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400">
                                <span className="text-[11px]">
                                    {formatTimestamp(item.createdAt)}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectException(item.id);
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] font-medium text-slate-200 group-hover:border-emerald-500/40 group-hover:text-emerald-300 transition-colors"
                                >
                                    <span>Triage</span>
                                    <ArrowRight className="size-3" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer CTA */}
            {openItems.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 text-center">
                    <button
                        type="button"
                        onClick={onViewAllOpenExceptions}
                        className="w-full rounded-lg bg-slate-800/60 hover:bg-slate-800 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                        View & Triage All Unresolved Exceptions →
                    </button>
                </div>
            )}
        </div>
    );
}

