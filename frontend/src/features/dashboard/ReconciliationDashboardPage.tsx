import { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { dashboardApiClient } from '@/services/api/dashboard-api';
import { reconciliationApiClient } from '@/services/api/reconciliation-api';
import { adaptiveApiClient } from '@/services/api/api-client';
import type {
    DashboardDateRangeFilter,
    DashboardSummaryResponse,
    ExceptionSummary,
    ReconciliationRunSummary,
} from '@/services/api/types';
import {
    DashboardHeader,
    type DashboardDatePreset,
} from './DashboardHeader';
import { DashboardSummaryCards } from './DashboardSummaryCards';
import { RunOutcomeChart } from './RunOutcomeChart';
import { RecentRunsTable } from './RecentRunsTable';
import { ExceptionsAttentionPanel } from './ExceptionsAttentionPanel';
import { DashboardSkeleton } from './DashboardSkeleton';

export interface ReconciliationDashboardPageProps {
    merchantId: string;
    merchantName: string;
    merchantSlug: string;
    operatorRole: string;
    onTriggerRun: () => void;
    onInspectRun: (runId: string) => void;
    onNavigateToException: (exceptionId: string) => void;
    onNavigateToQueue: () => void;
}

function getDateRangeFromPreset(preset: DashboardDatePreset): DashboardDateRangeFilter {
    const now = new Date();
    switch (preset) {
        case '24h':
            return {
                from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
                to: now.toISOString(),
            };
        case '7d':
            return {
                from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                to: now.toISOString(),
            };
        case '30d':
            return {
                from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                to: now.toISOString(),
            };
        case 'all':
        default:
            return {};
    }
}

export function ReconciliationDashboardPage({
    merchantId,
    merchantName,
    merchantSlug,
    operatorRole,
    onTriggerRun,
    onInspectRun,
    onNavigateToException,
    onNavigateToQueue,
}: ReconciliationDashboardPageProps) {
    const [selectedPreset, setSelectedPreset] = useState<DashboardDatePreset>('7d');
    const [summaryData, setSummaryData] = useState<DashboardSummaryResponse | null>(null);
    const [recentRuns, setRecentRuns] = useState<ReconciliationRunSummary[]>([]);
    const [openExceptions, setOpenExceptions] = useState<ExceptionSummary[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Multi-tenant request isolation tracking & abort controller
    const dashboardRequestIdRef = useRef<number>(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const canTriggerRun =
        operatorRole.toUpperCase() === 'OWNER' || operatorRole.toUpperCase() === 'ADMIN';

    const loadDashboardData = useCallback(
        async (targetMerchantId: string, preset: DashboardDatePreset, isBackgroundRefresh = false) => {
            // 1. Cancel previous in-flight requests
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            const controller = new AbortController();
            abortControllerRef.current = controller;

            // 2. Increment request generation ID for tenant boundary enforcement
            dashboardRequestIdRef.current += 1;
            const currentRequestId = dashboardRequestIdRef.current;

            if (!isBackgroundRefresh) {
                setLoading(true);
            } else {
                setIsRefreshing(true);
            }
            setError(null);

            const filter = getDateRangeFromPreset(preset);

            try {
                // Fetch summary, recent runs, and open exceptions concurrently
                const [summaryResult, runsResult, exceptionsResult] = await Promise.allSettled([
                    dashboardApiClient.getDashboardSummary(
                        targetMerchantId,
                        filter,
                        controller.signal,
                    ),
                    reconciliationApiClient.listRuns(
                        targetMerchantId,
                        { limit: 10 },
                    ),
                    adaptiveApiClient.listExceptions(
                        targetMerchantId,
                        { limit: 10, status: 'OPEN' },
                    ),
                ]);

                // Discard stale responses from older tenant or cancelled requests
                if (currentRequestId !== dashboardRequestIdRef.current) {
                    return;
                }

                if (summaryResult.status === 'fulfilled') {
                    setSummaryData(summaryResult.value);
                    setLastUpdated(new Date());
                    setError(null);
                } else if (!isBackgroundRefresh) {
                    const message =
                        summaryResult.reason instanceof Error
                            ? summaryResult.reason.message
                            : 'Failed to load dashboard overview';
                    setError(message);
                }

                if (runsResult.status === 'fulfilled' && (runsResult.value.items || []).length > 0) {
                    setRecentRuns(runsResult.value.items || []);
                } else if (summaryResult.status === 'fulfilled' && summaryResult.value.latestRun) {
                    const latest = summaryResult.value.latestRun;
                    setRecentRuns([
                        {
                            id: latest.id,
                            merchantId: latest.merchantId,
                            status: latest.status,
                            windowStart: latest.windowStart,
                            windowEnd: latest.windowEnd,
                            rulesetVersion: latest.rulesetVersion,
                            totalConsidered: latest.totalConsidered,
                            matchedCount: latest.matchedCount,
                            unmatchedCount: latest.unmatchedCount,
                            ambiguousCount: latest.ambiguousCount,
                            excludedCount: latest.excludedCount,
                            failureReason: latest.failureReason ?? null,
                            startedAt: latest.startedAt ?? null,
                            completedAt: latest.completedAt ?? null,
                            createdAt: latest.createdAt,
                            updatedAt: latest.completedAt || latest.createdAt,
                        },
                    ]);
                }

                if (exceptionsResult.status === 'fulfilled') {
                    setOpenExceptions(exceptionsResult.value.items || []);
                }
            } catch (err) {
                if (currentRequestId !== dashboardRequestIdRef.current) {
                    return;
                }
                if (err instanceof DOMException && err.name === 'AbortError') {
                    return;
                }
                const msg = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
                setError(msg);
            } finally {
                if (currentRequestId === dashboardRequestIdRef.current) {
                    setLoading(false);
                    setIsRefreshing(false);
                }
            }
        },
        [],
    );

    const prevMerchantRef = useRef(merchantId);

    // Initial load and instant state masking on merchant tenant change
    useEffect(() => {
        const isMerchantChanged = prevMerchantRef.current !== merchantId;
        prevMerchantRef.current = merchantId;

        if (isMerchantChanged) {
            // Strict boundary: immediately wipe prior merchant metrics so they never leak across tenants
            setSummaryData(null);
            setRecentRuns([]);
            setOpenExceptions([]);
            setError(null);
            loadDashboardData(merchantId, selectedPreset, false);
        } else {
            // Preset change within same tenant: SWR refresh without screen-wiping skeleton
            loadDashboardData(merchantId, selectedPreset, summaryData !== null);
        }

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [merchantId, selectedPreset, loadDashboardData, summaryData]);

    const handleRefresh = () => {
        loadDashboardData(merchantId, selectedPreset, true);
    };

    return (
        <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-slate-50/70 text-slate-900 font-sans">
            {/* Top Operational Header */}
            <DashboardHeader
                merchantName={merchantName}
                merchantSlug={merchantSlug}
                selectedPreset={selectedPreset}
                onSelectPreset={setSelectedPreset}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                lastUpdated={lastUpdated}
                canTriggerRun={canTriggerRun}
                onTriggerRun={onTriggerRun}
            />

            {/* Dashboard Content Container */}
            <main className="flex-1 p-4 sm:p-6 pb-16 max-w-7xl w-full mx-auto space-y-6">
                {/* Critical Error Banner (with non-destructive Retry) */}
                {error && !summaryData && (
                    <div
                        className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-2xs"
                        role="alert"
                    >
                        <div className="flex items-center gap-3">
                            <AlertCircle className="size-5 shrink-0 text-rose-600" />
                            <div>
                                <h3 className="text-sm font-semibold text-rose-900">
                                    Unable to load reconciliation metrics
                                </h3>
                                <p className="text-xs text-rose-700 mt-0.5">{error}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => loadDashboardData(merchantId, selectedPreset, false)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 shadow-2xs transition-colors"
                        >
                            <RefreshCw className="size-3.5" />
                            <span>Retry</span>
                        </button>
                    </div>
                )}

                {/* Skeletons or Live Components */}
                {loading && !summaryData ? (
                    <DashboardSkeleton />
                ) : summaryData ? (
                    <>
                        {/* 1. Core Operational KPI Cards */}
                        <DashboardSummaryCards
                            latestRun={summaryData.latestRun}
                            summary={summaryData.summary}
                            onViewExceptions={onNavigateToQueue}
                            onViewRuns={onTriggerRun}
                        />

                        {/* 2. Accessible Run Outcomes Trend Visualizer */}
                        <RunOutcomeChart trend={summaryData.trend} />

                        {/* 3. Lower Split Section: Recent Runs (7 cols) + Exceptions Attention (5 cols) */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-7">
                                <RecentRunsTable
                                    runs={recentRuns}
                                    onInspectRun={onInspectRun}
                                    onViewAllRuns={onTriggerRun}
                                />
                            </div>
                            <div className="lg:col-span-5">
                                <ExceptionsAttentionPanel
                                    exceptions={openExceptions}
                                    onSelectException={onNavigateToException}
                                    onViewAllOpenExceptions={onNavigateToQueue}
                                />
                            </div>
                        </div>
                    </>
                ) : null}
            </main>
        </div>
    );
}

