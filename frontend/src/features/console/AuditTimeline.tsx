import { ArrowRight, History, User } from 'lucide-react';
import type { ExceptionAuditEventSummary } from '@/services/api/types';
import { formatTimestamp } from '@/lib/formatters';

interface AuditTimelineProps {
    events: ExceptionAuditEventSummary[];
}

export function AuditTimeline({ events }: AuditTimelineProps) {
    if (!events || events.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                <History className="size-6 text-slate-300 mx-auto mb-2" />
                <p className="font-medium text-slate-700">No Audit Events Logged</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                    Audit trail will be recorded as actions are taken on this break.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
                <History className="size-4 text-slate-500" />
                <h4 className="text-xs font-semibold text-slate-900">
                    Immutable Audit Trail ({events.length})
                </h4>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                {events.map((ev, index) => {
                    const isLatest = index === events.length - 1;

                    return (
                        <div key={ev.id || index} className="relative text-xs">
                            {/* Dot indicator */}
                            <div
                                className={`absolute -left-6 top-1 size-2.5 rounded-full ring-4 ring-white ${
                                    isLatest ? 'bg-fin-brand' : 'bg-slate-400'
                                }`}
                                aria-hidden="true"
                            />

                            {/* Header: Action & Transition */}
                            <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-900 font-mono uppercase tracking-wider text-[11px]">
                                        {ev.action}
                                    </span>
                                    <span className="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                        <span>{ev.fromStatus}</span>
                                        <ArrowRight className="size-2.5 text-slate-400" />
                                        <span className="font-semibold text-slate-800">{ev.toStatus}</span>
                                    </span>
                                </div>
                                <span className="text-[11px] text-slate-400 tabular-nums">
                                    {formatTimestamp(ev.createdAt)}
                                </span>
                            </div>

                            {/* Actor */}
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-1.5">
                                <User className="size-3 text-slate-400" />
                                <span className="font-mono">{ev.actorId}</span>
                                <span className="text-slate-300">•</span>
                                <span className="text-[10px] uppercase tracking-wide">{ev.actorType}</span>
                            </div>

                            {/* Reason / Justification note */}
                            {ev.reason && (
                                <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 p-2.5 text-slate-700 leading-relaxed text-[11px] break-words">
                                    <span className="font-medium text-slate-500">Justification: </span>
                                    {ev.reason}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
