import { useEffect, useState, useCallback, useRef } from 'react';
import {
    AlertTriangle,
    ArrowRight,
    ArrowUpRight,
    BrainCircuit,
    CheckCircle2,
    Clock,
    DollarSign,
    Filter,
    Layers,
    LineChart,
    RefreshCw,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import {
    intelligenceApiClient,
    type PortfolioIntelligenceResult,
    type PortfolioTrendsResult,
    type PortfolioWindow,
    type TrendWindow,
    type OperationalPriority,
    type PrioritizedException,
    type PatternGroup,
    type RecurringPatternTrend,
} from '@/services/api/intelligence-api';

export interface PortfolioIntelligencePageProps {
    merchantId: string;
    onNavigateToException?: (exceptionId: string) => void;
    onFilterQueueByType?: (type: string) => void;
}

type IntelligenceViewTab = 'snapshot' | 'trends';

export function PortfolioIntelligencePage({
    merchantId,
    onNavigateToException,
    onFilterQueueByType,
}: PortfolioIntelligencePageProps) {
    const [activeTab, setActiveTab] = useState<IntelligenceViewTab>('snapshot');
    const [window, setWindow] = useState<PortfolioWindow>('30d');
    const [trendWindow, setTrendWindow] = useState<TrendWindow>('30d');

    // Data state
    const [snapshotData, setSnapshotData] = useState<PortfolioIntelligenceResult | null>(null);
    const [trendsData, setTrendsData] = useState<PortfolioTrendsResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Prevent cross-tenant async race conditions
    const requestIdRef = useRef(0);

    const loadSnapshot = useCallback(
        async (targetMerchantId: string, targetWindow: PortfolioWindow) => {
            const currentReqId = ++requestIdRef.current;
            setLoading(true);
            setError(null);

            try {
                const res = await intelligenceApiClient.getPortfolioAnalysis(targetMerchantId, targetWindow);
                if (currentReqId === requestIdRef.current) {
                    setSnapshotData(res);
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

    const loadTrends = useCallback(
        async (targetMerchantId: string, targetTrendWindow: TrendWindow) => {
            const currentReqId = ++requestIdRef.current;
            setLoading(true);
            setError(null);

            try {
                const res = await intelligenceApiClient.getPortfolioTrends(targetMerchantId, targetTrendWindow);
                if (currentReqId === requestIdRef.current) {
                    setTrendsData(res);
                }
            } catch (err: unknown) {
                if (currentReqId === requestIdRef.current) {
                    setError(err instanceof Error ? err.message : 'Failed to load portfolio trend data');
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
        if (activeTab === 'snapshot') {
            loadSnapshot(merchantId, window);
        } else {
            loadTrends(merchantId, trendWindow);
        }
    }, [merchantId, activeTab, window, trendWindow, loadSnapshot, loadTrends]);

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
            {/* Header & View Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                            <BrainCircuit className="size-4.5" />
                        </div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Portfolio Intelligence</h1>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                            Multi-Run Analysis Engine
                        </span>
                    </div>
                    <p className="text-xs text-slate-500">
                        Tracks match rate variation across runs, currency exposure movement, and persistent recurring discrepancy cohorts.
                    </p>
                </div>

                {/* Sub-tab navigation */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/80 text-xs font-medium">
                        <button
                            type="button"
                            onClick={() => setActiveTab('snapshot')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                                activeTab === 'snapshot'
                                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Layers className="size-3.5" />
                            <span>Cohort Snapshot</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('trends')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                                activeTab === 'trends'
                                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <LineChart className="size-3.5" />
                            <span>Multi-Run Trends</span>
                        </button>
                    </div>

                    {/* Window selector */}
                    {activeTab === 'snapshot' ? (
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
                    ) : (
                        <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 text-xs font-medium">
                            {(['7d', '30d', '90d'] as TrendWindow[]).map((w) => (
                                <button
                                    key={w}
                                    type="button"
                                    onClick={() => setTrendWindow(w)}
                                    className={`px-2.5 py-1 rounded-md transition-all ${
                                        trendWindow === w
                                            ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {w}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            activeTab === 'snapshot'
                                ? loadSnapshot(merchantId, window)
                                : loadTrends(merchantId, trendWindow)
                        }
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

            {/* ----------------- TAB 1: SNAPSHOT OVERVIEW ----------------- */}
            {activeTab === 'snapshot' && (
                <div className="space-y-6">
                    {/* Currency Exposure Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {snapshotData && Object.keys(snapshotData.totalExposureByCurrency).length > 0 ? (
                            Object.values(snapshotData.totalExposureByCurrency).map((exp) => (
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
                                <div className="mt-2 text-xl font-bold font-mono text-slate-900">$0.00</div>
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
                                {snapshotData?.unresolvedCount ?? 0}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">Pending manual operator triage</div>
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
                                {snapshotData?.patterns.filter((p) => p.exceptionCount > 0).length ?? 0}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">Recurring discrepancy clusters</div>
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
                        ) : snapshotData && snapshotData.patterns.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {snapshotData.patterns.map((group: PatternGroup) => (
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
                                Formula: {snapshotData?.priorityFormulaVersion ?? 'v1.0'}
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-xs text-slate-400">Computing priority rankings...</div>
                        ) : snapshotData && snapshotData.topPrioritizedExceptions.length > 0 ? (
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
                                        {snapshotData.topPrioritizedExceptions.map((item: PrioritizedException) => (
                                            <tr key={item.exceptionId} className="hover:bg-slate-50/80 transition-colors">
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
                                                <td className="py-3 px-3 font-medium text-slate-800">{item.type}</td>
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
                </div>
            )}

            {/* ----------------- TAB 2: MULTI-RUN TRENDS ----------------- */}
            {activeTab === 'trends' && (
                <div className="space-y-6">
                    {/* Match-Rate Trajectory & Inflow/Outflow Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Match Rate Movement Card */}
                        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                    <span>Match-Rate Movement</span>
                                    {trendsData?.matchRateDelta.direction === 'improving' ? (
                                        <div className="size-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                            <TrendingUp className="size-3.5" />
                                        </div>
                                    ) : trendsData?.matchRateDelta.direction === 'worsening' ? (
                                        <div className="size-6 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center">
                                            <TrendingDown className="size-3.5" />
                                        </div>
                                    ) : (
                                        <div className="size-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center">
                                            <Clock className="size-3.5" />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                                    {trendsData?.matchRateDelta.currentMatchRate !== null
                                        ? `${trendsData?.matchRateDelta.currentMatchRate}%`
                                        : '—'}
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                <span className="text-slate-400">Trajectory:</span>
                                <span
                                    className={`font-semibold font-mono px-2 py-0.5 rounded text-[11px] ${
                                        trendsData?.matchRateDelta.direction === 'improving'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : trendsData?.matchRateDelta.direction === 'worsening'
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    {trendsData?.matchRateDelta.delta !== null && trendsData?.matchRateDelta.delta !== undefined
                                        ? `${trendsData.matchRateDelta.delta > 0 ? '+' : ''}${trendsData.matchRateDelta.delta}% (${trendsData.matchRateDelta.direction})`
                                        : 'Insufficient History'}
                                </span>
                            </div>
                        </div>

                        {/* Inflow / Outflow Summary */}
                        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                    <span>Exception Movement</span>
                                    <div className="size-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                                        <Layers className="size-3.5" />
                                    </div>
                                </div>
                                <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                                    {trendsData?.exceptionMovement.netChange !== undefined
                                        ? `${trendsData.exceptionMovement.netChange > 0 ? '+' : ''}${trendsData.exceptionMovement.netChange}`
                                        : '0'}
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                                <span>Inflow: {trendsData?.exceptionMovement.newInflowCount ?? 0}</span>
                                <span>Outflow: {trendsData?.exceptionMovement.resolvedOutflowCount ?? 0} resolved</span>
                            </div>
                        </div>

                        {/* Oldest Unresolved Exception */}
                        <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                    <span>Oldest Unresolved Aging</span>
                                    <div className="size-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <Clock className="size-3.5" />
                                    </div>
                                </div>
                                <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
                                    {trendsData?.agingBuckets.oldestUnresolved
                                        ? `${trendsData.agingBuckets.oldestUnresolved.ageDays}d`
                                        : '0d'}
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                {trendsData?.agingBuckets.oldestUnresolved && onNavigateToException ? (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateToException(trendsData.agingBuckets.oldestUnresolved!.id)}
                                        className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                                    >
                                        <span>Inspect {trendsData.agingBuckets.oldestUnresolved.id.slice(0, 8)}...</span>
                                        <ArrowUpRight className="size-3" />
                                    </button>
                                ) : (
                                    <span className="text-slate-400">Queue up-to-date</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Run Series Trajectory Chart & Table */}
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="size-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <LineChart className="size-4" />
                                </div>
                                <h2 className="text-sm font-semibold text-slate-900">Match-Rate Movement Across Runs</h2>
                            </div>
                            <span className="text-xs text-slate-400">
                                {trendsData?.runSeries.length ?? 0} reconciliation run(s) recorded
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-xs text-slate-400">
                                Loading historical run trajectory...
                            </div>
                        ) : trendsData && trendsData.runSeries.length > 0 ? (
                            <div className="space-y-4">
                                {/* Accessible Visual Trajectory Bar/Line representation */}
                                <div className="h-32 w-full flex items-end gap-3 px-4 py-3 bg-slate-50/70 border border-slate-200/80 rounded-xl overflow-x-auto">
                                    {trendsData.runSeries.map((r, i) => {
                                        const heightPercent = Math.max(8, Math.min(100, r.matchRate));
                                        return (
                                            <div key={r.id} className="flex-1 min-w-16 flex flex-col items-center gap-1.5 h-full justify-end">
                                                <span className="text-[10px] font-mono font-bold text-slate-700">
                                                    {r.matchRate}%
                                                </span>
                                                <div
                                                    style={{ height: `${heightPercent}%` }}
                                                    className="w-full rounded-t-md bg-indigo-500 hover:bg-indigo-600 transition-all cursor-default"
                                                    title={`Run ${r.id.slice(0, 8)}: ${r.matchRate}% match rate (${r.matchedCount}/${r.totalConsidered})`}
                                                />
                                                <span className="text-[9px] font-mono text-slate-400 truncate w-full text-center">
                                                    #{i + 1}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Accessible Run Series Table alternative */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs text-slate-700">
                                        <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 bg-slate-50/80">
                                            <tr>
                                                <th className="py-2.5 px-3">Run ID</th>
                                                <th className="py-2.5 px-3">Executed At</th>
                                                <th className="py-2.5 px-3">Total Considered</th>
                                                <th className="py-2.5 px-3">Matched</th>
                                                <th className="py-2.5 px-3">Breaks / Unmatched</th>
                                                <th className="py-2.5 px-3">Match Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-sans">
                                            {trendsData.runSeries.map((r) => (
                                                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-2.5 px-3 font-mono font-semibold text-fin-brand">
                                                        {r.id.slice(0, 8)}...
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-500">
                                                        {new Date(r.createdAt).toLocaleString([], {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono">{r.totalConsidered}</td>
                                                    <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">
                                                        {r.matchedCount}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono text-rose-700">
                                                        {r.unmatchedCount + r.ambiguousCount}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                                        {r.matchRate}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="py-10 text-center text-xs text-slate-400">
                                No historical runs recorded in this window. Trigger a reconciliation run to generate trend data.
                            </div>
                        )}
                    </div>

                    {/* Recurring Discrepancy Fingerprints Across Runs */}
                    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="size-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                    <Layers className="size-4" />
                                </div>
                                <h2 className="text-sm font-semibold text-slate-900">Recurring Discrepancy Fingerprints</h2>
                            </div>
                            <span className="text-xs text-slate-400">Identifies persistence across multiple runs</span>
                        </div>

                        {trendsData && trendsData.recurringPatterns.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {trendsData.recurringPatterns.map((pat: RecurringPatternTrend) => (
                                    <div
                                        key={pat.groupKey}
                                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4.5 flex flex-col justify-between gap-3 shadow-2xs"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-xs font-semibold text-slate-900">{pat.label}</h3>
                                                <span
                                                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                                                        pat.status === 'RECURRING'
                                                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                            : 'bg-blue-50 text-blue-800 border-blue-200'
                                                    }`}
                                                >
                                                    {pat.status} ({pat.recurrenceCount} events)
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">{pat.description}</p>
                                        </div>

                                        <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                                            <div className="font-mono text-emerald-700 font-semibold">
                                                {Object.values(pat.exposureByCurrency).length > 0
                                                    ? Object.values(pat.exposureByCurrency)
                                                          .map((e) => e.formatted)
                                                          .join(' + ')
                                                    : 'No financial record'}
                                            </div>

                                            {onFilterQueueByType && (
                                                <button
                                                    type="button"
                                                    onClick={() => onFilterQueueByType(pat.filterType)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                                                >
                                                    <Filter className="size-3 text-slate-400" />
                                                    <span>View Queue</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-xs text-slate-400">
                                No recurring patterns detected across runs in this timeframe.
                            </div>
                        )}
                    </div>

                    {/* Data Limitations and Methodological Notes */}
                    {trendsData && trendsData.dataLimitations.length > 0 && (
                        <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4 text-xs text-slate-500 space-y-1.5 shadow-2xs">
                            <div className="font-semibold text-slate-700 text-xs">Data Limitations & Guarantees:</div>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-500 text-[11px]">
                                {trendsData.dataLimitations.map((lim, idx) => (
                                    <li key={idx}>{lim}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
