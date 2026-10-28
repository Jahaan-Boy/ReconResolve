import { useState } from 'react';
import { ArrowLeft, Check, Copy, FileSpreadsheet } from 'lucide-react';
import type { ExceptionAction, ExceptionDetail } from '@/services/api/types';
import { StatusBadge } from '@/components/fintech/StatusBadge';
import { ExceptionTypeBadge } from '@/components/fintech/ExceptionTypeBadge';
import { EmptyState } from '@/components/fintech/FeedbackStates';
import { InspectorSkeleton } from '@/components/fintech/Skeleton';
import { DiscrepancySummary } from './DiscrepancySummary';
import { EvidenceComparison } from './EvidenceComparison';
import { RunMetadata } from './RunMetadata';
import { AuditTimeline } from './AuditTimeline';
import { ExceptionActionBar } from './ExceptionActionBar';
import { formatTimestamp, truncateId } from '@/lib/formatters';

interface ExceptionInspectorProps {
    exception: ExceptionDetail | null;
    loading: boolean;
    onTriggerAction: (action: ExceptionAction) => void;
    actionInProgress: boolean;
    onCloseInspector?: () => void;
    onInspectRun?: (runId: string) => void;
}

export function ExceptionInspector({
    exception,
    loading,
    onTriggerAction,
    actionInProgress,
    onCloseInspector,
    onInspectRun,
}: ExceptionInspectorProps) {
    const [copied, setCopied] = useState(false);

    if (loading && !exception) {
        return (
            <div className="h-full overflow-y-auto bg-slate-50/50">
                <InspectorSkeleton />
            </div>
        );
    }

    if (!exception) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/40 p-8">
                <EmptyState
                    title="No exception selected"
                    description="Select any discrepancy from the queue on the left to examine order and provider evidence, compare amounts, and execute auditable state transitions."
                    icon={<FileSpreadsheet className="size-8 text-slate-300" />}
                />
            </div>
        );
    }

    const copyId = () => {
        navigator.clipboard.writeText(exception.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 p-4 sm:p-6 space-y-6">
            {/* Mobile Back / Close Button */}
            {onCloseInspector && (
                <div className="lg:hidden pb-1">
                    <button
                        type="button"
                        onClick={onCloseInspector}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg shadow-2xs"
                    >
                        <ArrowLeft className="size-3.5" />
                        <span>Back to Queue</span>
                    </button>
                </div>
            )}

            {/* Inspector Header & Actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-slate-900 tracking-tight">
                                {exception.id}
                            </span>
                            <button
                                type="button"
                                onClick={copyId}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"
                                title="Copy Exception UUID"
                            >
                                {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Version <strong className="font-mono font-semibold text-slate-700">v{exception.version}</strong></span>
                            <span>•</span>
                            <span>Created {formatTimestamp(exception.createdAt)}</span>
                            {exception.reconciliationRunId && (
                                <>
                                    <span>•</span>
                                    <span className="font-mono text-[11px] text-slate-400">
                                        Run: {truncateId(exception.reconciliationRunId, 6, 2)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <StatusBadge status={exception.status} size="md" />
                        <ExceptionTypeBadge type={exception.type} />
                    </div>
                </div>

                {/* State Machine Action Bar */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-medium text-slate-500">
                        Operational Actions:
                    </span>
                    <ExceptionActionBar
                        status={exception.status}
                        disabled={actionInProgress}
                        onTriggerAction={onTriggerAction}
                    />
                </div>
            </div>

            {/* Discrepancy Callout Banner */}
            <DiscrepancySummary exception={exception} />

            {/* Side-by-Side Evidence Comparison */}
            <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                    Dual-Sided Financial Evidence
                </h4>
                <EvidenceComparison
                    order={exception.linkedMerchantOrder}
                    providerTxn={exception.linkedProviderTransaction}
                />
            </div>

            {/* Reconciliation Run Context */}
            <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                    Reconciliation Batch Context
                </h4>
                <RunMetadata run={exception.reconciliationRun} onInspectRun={onInspectRun} />
            </div>

            {/* Immutable Audit Timeline */}
            <div>
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2.5">
                    Audit Trail & Operator Logs
                </h4>
                <AuditTimeline events={exception.auditEvents} />
            </div>
        </div>
    );
}
