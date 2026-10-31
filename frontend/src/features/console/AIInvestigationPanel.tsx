import { useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    BrainCircuit,
    CheckCircle2,
    Copy,
    HelpCircle,
    Lightbulb,
    RefreshCw,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useAiInvestigation } from '@/hooks/useAiInvestigation';
import type { ConfidenceLevel, ExceptionDetail, OperatorContext } from '@/services/api/types';
import { formatTimestamp } from '@/lib/formatters';

interface AIInvestigationPanelProps {
    exception: ExceptionDetail;
    merchantId: string;
    operatorContext?: OperatorContext;
    onInspectEvidence?: (refId: string) => void;
}

export function AIInvestigationPanel({
    exception,
    merchantId,
    operatorContext,
    onInspectEvidence,
}: AIInvestigationPanelProps) {
    const {
        status,
        investigation,
        error,
        isStale,
        triggerInvestigation,
    } = useAiInvestigation({
        merchantId,
        exceptionId: exception.id,
        exceptionVersion: exception.version,
        exceptionUpdatedAt: exception.updatedAt,
        operatorContext,
    });

    const [copiedRef, setCopiedRef] = useState<string | null>(null);

    const handleCopyRef = (refId: string) => {
        navigator.clipboard.writeText(refId);
        setCopiedRef(refId);
        setTimeout(() => setCopiedRef(null), 1500);
    };

    const getRefMeta = (refId: string) => {
        if (refId.startsWith('ptxn:')) {
            return {
                label: 'Gateway Txn',
                bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                title: 'Persisted Provider Transaction',
            };
        }
        if (refId.startsWith('mord:')) {
            return {
                label: 'Merchant Order',
                bg: 'bg-blue-50 text-blue-800 border-blue-200',
                title: 'Persisted Merchant Order Record',
            };
        }
        if (refId.startsWith('run:')) {
            return {
                label: 'Recon Run',
                bg: 'bg-purple-50 text-purple-800 border-purple-200',
                title: 'Reconciliation Batch Context',
            };
        }
        return {
            label: 'Exception Record',
            bg: 'bg-slate-100 text-slate-800 border-slate-200',
            title: 'Reconciliation Discrepancy Snapshot',
        };
    };

    const getConfidenceBadge = (confidence: ConfidenceLevel) => {
        switch (confidence) {
            case 'high':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        High Confidence
                    </span>
                );
            case 'medium':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="size-3 text-amber-600" />
                        Medium Confidence
                    </span>
                );
            case 'low':
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        <HelpCircle className="size-3 text-slate-500" />
                        Low Confidence
                    </span>
                );
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-indigo-100/80 shadow-2xs overflow-hidden transition-all duration-200">
            {/* Panel Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                            <Sparkles className="size-4.5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                                    <span>AI Investigator Analysis</span>
                                </h3>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                    Advisory
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-300/90 mt-0.5">
                                Grounded causal explanation based strictly on dual-sided persisted ledger evidence.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                            type="button"
                            onClick={() => triggerInvestigation()}
                            disabled={status === 'loading'}
                            aria-label={investigation ? 'Re-run AI Investigation' : 'Run AI Investigation'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            <RefreshCw className={`size-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
                            <span>
                                {status === 'loading'
                                    ? 'Analyzing...'
                                    : investigation
                                    ? 'Re-investigate'
                                    : 'Investigate with AI'}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Stale Warning Banner */}
                {isStale && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center gap-2 text-xs text-amber-200">
                        <AlertTriangle className="size-4 text-amber-300 shrink-0" />
                        <span>
                            Exception state updated (v{exception.version}) since this investigation was run. Click Re-investigate to refresh analysis.
                        </span>
                    </div>
                )}
            </div>

            {/* Panel Body */}
            <div className="p-4 sm:p-5 space-y-5">
                {/* 1. Idle State */}
                {status === 'idle' && (
                    <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                        <div className="size-11 mx-auto rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3">
                            <BrainCircuit className="size-5.5" />
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800">
                            No AI Investigation Generated Yet
                        </h4>
                        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4 leading-relaxed">
                            Analyze this {exception.type.toLowerCase().replace(/_/g, ' ')} exception against authorized gateway records, order notes, settlement windows, and reconciliation rules.
                        </p>
                        <button
                            type="button"
                            onClick={() => triggerInvestigation()}
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
                        >
                            <Sparkles className="size-3.5" />
                            <span>Start Investigation</span>
                        </button>
                    </div>
                )}

                {/* 2. Loading State */}
                {status === 'loading' && (
                    <div className="py-6 space-y-4" role="status" aria-live="polite">
                        <div className="flex items-center justify-center gap-3 text-xs font-medium text-indigo-700 bg-indigo-50/70 p-3 rounded-lg border border-indigo-100">
                            <RefreshCw className="size-4 animate-spin text-indigo-600" />
                            <span>Assembling evidence bundle & querying reasoning model...</span>
                        </div>
                        <div className="space-y-3 animate-pulse">
                            <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                            <div className="h-3 bg-slate-100 rounded w-full"></div>
                            <div className="h-3 bg-slate-100 rounded w-5/6"></div>
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div className="h-16 bg-slate-100 rounded-lg"></div>
                                <div className="h-16 bg-slate-100 rounded-lg"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Error State */}
                {status === 'error' && (
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 space-y-3">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="size-5 text-rose-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <div className="text-xs font-semibold text-rose-900 uppercase tracking-wide">
                                    Investigation Failed ({error?.code || 'ERROR'})
                                </div>
                                <div className="text-xs text-rose-700">
                                    {error?.message || 'The AI investigator encountered an unrecoverable service error.'}
                                </div>
                                <div className="text-[11px] text-rose-600/80">
                                    Authoritative reconciliation data and operator action controls remain completely unaffected.
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => triggerInvestigation()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow-2xs transition-colors cursor-pointer"
                            >
                                <RefreshCw className="size-3.5" />
                                <span>Try Again</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* 4. Insufficient Evidence State */}
                {status === 'insufficient_evidence' && (
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <div className="text-xs font-semibold text-amber-900 uppercase tracking-wide">
                                    Insufficient Persisted Evidence
                                </div>
                                <div className="text-xs text-amber-800">
                                    {investigation?.result.summary ||
                                        'The exception lacks linked counterpart transactions or contextual details necessary to formulate a verified explanation.'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. Success / Stale Populated Findings */}
                {investigation && (status === 'success' || status === 'stale') && (
                    <div className="space-y-5">
                        {/* Summary Callout */}
                        <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-2">
                            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                                <BrainCircuit className="size-4" />
                                <span>Investigator Summary</span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-100 leading-relaxed font-sans">
                                {investigation.result.summary}
                            </p>
                        </div>

                        {/* Verified Facts vs Hypotheses Dual Sections */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Facts Column */}
                            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="size-4 text-emerald-600" />
                                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                            Verified Facts
                                        </h4>
                                    </div>
                                    <span className="text-[10px] font-medium text-slate-500">
                                        Persisted in Ledger
                                    </span>
                                </div>

                                {investigation.result.facts.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">No specific facts established.</p>
                                ) : (
                                    <ul className="space-y-2.5">
                                        {investigation.result.facts.map((fact, idx) => (
                                            <li
                                                key={idx}
                                                className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs space-y-2"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <span className="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                                                    <span className="leading-relaxed">{fact.statement}</span>
                                                </div>
                                                {fact.evidenceRefs.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                                                        <span className="text-[10px] font-medium text-slate-400">Cited:</span>
                                                        {fact.evidenceRefs.map((refId) => {
                                                            const meta = getRefMeta(refId);
                                                            return (
                                                                <button
                                                                    key={refId}
                                                                    type="button"
                                                                    onClick={() => onInspectEvidence ? onInspectEvidence(refId) : handleCopyRef(refId)}
                                                                    title={`${meta.title} (${refId})`}
                                                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${meta.bg} hover:brightness-95 transition-all cursor-pointer`}
                                                                >
                                                                    <span>{meta.label}</span>
                                                                    {copiedRef === refId ? (
                                                                        <CheckCircle2 className="size-2.5 text-emerald-600" />
                                                                    ) : (
                                                                        <Copy className="size-2.5 opacity-60" />
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Hypotheses Column */}
                            <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
                                    <div className="flex items-center gap-2">
                                        <Lightbulb className="size-4 text-indigo-600" />
                                        <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                                            Possible Explanations
                                        </h4>
                                    </div>
                                    <span className="text-[10px] font-medium text-indigo-600/80">
                                        Model Assessment
                                    </span>
                                </div>

                                {investigation.result.likelyCauses.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">No hypotheses formulated.</p>
                                ) : (
                                    <ul className="space-y-2.5">
                                        {investigation.result.likelyCauses.map((cause, idx) => (
                                            <li
                                                key={idx}
                                                className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-2"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-semibold text-slate-900">
                                                        {cause.hypothesis}
                                                    </span>
                                                    {getConfidenceBadge(cause.confidence)}
                                                </div>
                                                <p className="text-slate-600 text-[11px] leading-relaxed">
                                                    {cause.rationale}
                                                </p>
                                                {cause.evidenceRefs.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                                                        <span className="text-[10px] font-medium text-slate-400">Supporting:</span>
                                                        {cause.evidenceRefs.map((refId) => {
                                                            const meta = getRefMeta(refId);
                                                            return (
                                                                <span
                                                                    key={refId}
                                                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${meta.bg}`}
                                                                >
                                                                    {meta.label}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Missing or Conflicting Evidence Notice (if present) */}
                        {investigation.result.missingOrConflictingEvidence.length > 0 && (
                            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                                    <AlertTriangle className="size-4 text-amber-600" />
                                    <span>Uncertainty & Missing Data Points</span>
                                </div>
                                <ul className="list-disc list-inside text-xs text-amber-800 space-y-1 pl-1">
                                    {investigation.result.missingOrConflictingEvidence.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Recommended Next Steps */}
                        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-3">
                            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="size-4.5 text-emerald-600" />
                                    <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                                        Recommended Human Next Steps
                                    </h4>
                                </div>
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                                    Non-Destructive
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {investigation.result.recommendedNextSteps.map((step, idx) => (
                                    <div
                                        key={idx}
                                        className="bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs space-y-1"
                                    >
                                        <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                                            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                                            <span>{step.action}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 leading-relaxed pl-3">
                                            {step.description}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <p className="text-[11px] text-slate-500 italic pt-1">
                                Note: These recommendations are advisory for operator investigation. State transitions must be executed using the operational buttons above.
                            </p>
                        </div>

                        {/* Metadata & Audit Provenance Footer */}
                        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <div className="flex items-center gap-3">
                                <span>Model: <strong className="font-mono text-slate-700">{investigation.modelProvider} ({investigation.modelId})</strong></span>
                                <span>•</span>
                                <span>Prompt: <strong className="font-mono text-slate-700">{investigation.promptVersion}</strong></span>
                                {investigation.durationMs > 0 && (
                                    <>
                                        <span>•</span>
                                        <span>Latency: <strong className="font-mono text-slate-700">{investigation.durationMs}ms</strong></span>
                                    </>
                                )}
                            </div>
                            <div className="flex items-center gap-1 text-slate-400">
                                <span>Generated: {formatTimestamp(investigation.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
