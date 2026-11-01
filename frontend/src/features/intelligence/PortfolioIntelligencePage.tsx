import { useEffect, useState, useCallback, useRef } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    BrainCircuit,
    CheckCircle2,
    DollarSign,
    Filter,
    Layers,
    RefreshCw,
    ShieldAlert,
    TrendingUp,
} from 'lucide-react';
import {
    intelligenceApiClient,
    type PortfolioIntelligenceResult,
    type PortfolioWindow,
    type OperationalPriority,
    type PrioritizedException,
    type PatternGroup,
} from '@/services/api/intelligence-api';

export interface PortfolioIntelligencePageProps {
    merchantId: string;
    onNavigateToException?: (exceptionId: string) => void;
    onFilterQueueByType?: (type: string) => void;
}

export function PortfolioIntelligencePage({
    merchantId,
    onNavigateToException,
    onFilterQueueByType,
}: PortfolioIntelligencePageProps) {
    const [window, setWindow] = useState<PortfolioWindow>('30d');
    const [data, setData] = useState<PortfolioIntelligenceResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Prevent cross-tenant async race conditions
    const requestIdRef = useRef(0);

    const loadData = useCallback(
        async (targetMerchantId: string, targetWindow: PortfolioWindow) => {
            const currentReqId = ++requestIdRef.current;
            setLoading(true);
            setError(null);

            try {
                const res = await intelligenceApiClient.getPortfolioAnalysis(targetMerchantId, targetWindow);
                if (currentReqId === requestIdRef.current) {
                    setData(res);
                }
            } catch (err: unknown) {
                if (currentReqId === requestIdRef.current) {
                    setError(err instanceof Error ? err.message : 'Failed to load portfolio intelligence data');
                }
            } finally {
                if (currentReqId === requestIdRef.current) {
                    setLoading(false);
                }
            }
        },
        [],
    );

    useEffect(() => {
        loadData(merchantId, window);
    }, [merchantId, window, loadData]);

    const getPriorityBadgeClass = (priority: OperationalPriority) => {
        switch (priority) {
            case 'CRITICAL':
                return 'bg-rose-50 text-rose-700 border-rose-200';
            case 'HIGH':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'MEDIUM':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'LOW':
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="flex-1 h-full min-h-0 overflow-y-auto bg-slate-50/70 p-4 sm:p-6 pb-16 space-y-6 text-slate-900 font-sans">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                            <BrainCircuit className="size-4.5" />
                        </div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Portfolio Intelligence</h1>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                            Explainable Priority Engine
                        </span>
                    </div>
                    <p className="text-xs text-slate-500">
                        Clusters recurring discrepancy signatures, computes deterministic exposure, and ranks triage priority.
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    {/* Time Window Switcher */}
                    <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-xs font-medium">
                        {(['24h', '7d', '30d', 'all'] as PortfolioWindow[]).map((w) => (
                            <button
                                key={w}
                                type="button"
                                onClick={() => setWindow(w)}
                                className={`px-2.5 py-1 rounded-md transition-all ${
                                    window === w
                                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {w === 'all' ? 'All Time' : w}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={() => loadData(merchantId, window)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`size-3.5 text-slate-500 ${loading ? 'animate-spin text-fin-brand' : ''}`} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-3 shadow-2xs">
                    <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                    <span>{error}</span>
                </div>
            )}

            {/* Currency Exposure Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Exposure by Currency */}
                {data && Object.keys(data.totalExposureByCurrency).length > 0 ? (
                    Object.values(data.totalExposureByCurrency).map((exp) => (
                        <div
                            key={exp.currency}
                            className="rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
                        >
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                <span>Financial Exposure ({exp.currency})</span>
                                <div className="size-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <DollarSign className="size-3.5" />
                                </div>
                            </div>
                            <div className="mt-2 text-xl font-bold font-mono text-slate-900">
                                {exp.formatted}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                                Across {exp.count} unresolved discrepancies
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                            <span>Financial Exposure</span>
                            <div className="size-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <DollarSign className="size-3.5" />
                            </div>
                        </div>
                        <div className="mt-2 text-xl font-bold font-mono text-slate-900">
                            $0.00
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                            No open discrepancies with financial impact
                        </div>
                    </div>
                )}

                {/* Unresolved Queue */}
                <div className="rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                        <span>Unresolved Discrepancies</span>
                        <div className="size-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                            <ShieldAlert className="size-3.5" />
                        </div>
                    </div>
                    <div className="mt-2 text-xl font-bold font-mono text-slate-900">
                        {data?.unresolvedCount ?? 0}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                        Pending manual operator triage
                    </div>
                </div>

                {/* Pattern Signatures */}
                <div className="rounded-xl border border-slate-200/90 bg-white p-4.5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                        <span>Active Pattern Cohorts</span>
                        <div className="size-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Layers className="size-3.5" />
                        </div>
                    </div>
                    <div className="mt-2 text-xl font-bold font-mono text-slate-900">
                        {data?.patterns.filter((p) => p.exceptionCount > 0).length ?? 0}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                        Recurring discrepancy clusters
                    </div>
                </div>
            </div>

            {/* Pattern Groups */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Layers className="size-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900">Recurring Discrepancy Patterns</h2>
                    </div>
                    <span className="text-xs text-slate-400">
                        Grouped by persisted root cause dimensions
                    </span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                        Analyzing exception clusters and exposure...
                    </div>
                ) : data && data.patterns.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.patterns.map((group: PatternGroup) => (
                            <div
                                key={group.groupKey}
                                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4.5 flex flex-col justify-between gap-3 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs"
                            >
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getPriorityBadgeClass(
                                                    group.priority,
                                                )}`}
                                            >
                                                {group.priority}
                                            </span>
                                            <h3 className="text-xs font-semibold text-slate-900">{group.label}</h3>
                                        </div>
                                        <span className="text-xs font-mono font-semibold text-slate-700">
                                            {group.exceptionCount} items
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">
                                        {group.description}
                                    </p>
                                </div>

                                <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs">
                                    <div className="space-y-0.5">
                                        <div className="text-slate-400 text-[10px] font-medium">Financial Exposure</div>
                                        <div className="font-mono text-emerald-700 font-semibold">
                                            {Object.values(group.exposureByCurrency).length > 0
                                                ? Object.values(group.exposureByCurrency)
                                                      .map((e) => e.formatted)
                                                      .join(' + ')
                                                : 'No financial record'}
                                        </div>
                                    </div>

                                    {onFilterQueueByType && group.filterType && (
                                        <button
                                            type="button"
                                            onClick={() => onFilterQueueByType(group.filterType!)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                                        >
                                            <Filter className="size-3 text-slate-400" />
                                            <span>View in Queue</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                        No pattern groups recorded for this merchant window.
                    </div>
                )}
            </div>

            {/* Prioritized Exceptions Table */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                            <TrendingUp className="size-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900">Top Prioritized Exceptions for Triage</h2>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                        Formula: {data?.priorityFormulaVersion ?? 'v1.0'}
                    </span>
                </div>

                {loading ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                        Computing priority rankings...
                    </div>
                ) : data && data.topPrioritizedExceptions.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 bg-slate-50/80">
                                <tr>
                                    <th className="py-2.5 px-3">Priority</th>
                                    <th className="py-2.5 px-3">Exception ID</th>
                                    <th className="py-2.5 px-3">Category</th>
                                    <th className="py-2.5 px-3">Exposure</th>
                                    <th className="py-2.5 px-3">Why This is Prioritized</th>
                                    <th className="py-2.5 px-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans">
                                {data.topPrioritizedExceptions.map((item: PrioritizedException) => (
                                    <tr
                                        key={item.exceptionId}
                                        className="hover:bg-slate-50/80 transition-colors"
                                    >
                                        <td className="py-3 px-3">
                                            <span
                                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${getPriorityBadgeClass(
                                                    item.priority,
                                                )}`}
                                            >
                                                {item.priority} ({item.priorityScore})
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 font-mono font-semibold text-fin-brand">
                                            {item.exceptionId.slice(0, 8)}...
                                        </td>
                                        <td className="py-3 px-3 font-medium text-slate-800">
                                            {item.type}
                                        </td>
                                        <td className="py-3 px-3 font-mono font-semibold text-emerald-700">
                                            {item.formattedExposure || '—'}
                                        </td>
                                        <td className="py-3 px-3">
                                            <div className="space-y-0.5">
                                                {item.priorityReasons.map((reason, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="text-[11px] text-slate-500 flex items-center gap-1.5"
                                                    >
                                                        <span className="size-1 rounded-full bg-slate-400" />
                                                        <span>{reason}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            {onNavigateToException && (
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigateToException(item.exceptionId)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold shadow-2xs transition-colors"
                                                >
                                                    <span>Triage</span>
                                                    <ArrowRight className="size-3 text-slate-400" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <CheckCircle2 className="size-8 text-emerald-600" />
                        <span className="text-xs">No unresolved exceptions require priority triage.</span>
                    </div>
                )}
            </div>

            {/* Quality & Methodology Notes */}
            {data && data.dataQualityNotes.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 text-xs text-slate-500 space-y-1.5 shadow-2xs">
                    <div className="font-semibold text-slate-700 text-xs">
                        Financial Correctness & Aggregation Guarantees:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
                        {data.dataQualityNotes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
