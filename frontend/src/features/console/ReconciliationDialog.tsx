import { useState, useEffect, useRef, useCallback } from 'react';
import {
    X,
    PlayCircle,
    RefreshCw,
    CheckCircle2,
    AlertCircle,
    Clock,
    Copy,
    Check,
    ChevronLeft,
    ChevronRight,
    GitCommit,
    ShieldAlert,
    Filter,
    CheckCircle,
    Layers,
    ArrowRight,
} from 'lucide-react';
import { reconciliationApiClient } from '@/services/api/reconciliation-api';
import type {
    InitiateRunInput,
    InitiateRunResult,
    ListMatchesFilter,
    PaginationMetadata,
    ReconciliationMatchSummary,
    ReconciliationRunStatus,
    ReconciliationRunSummary,
} from '@/services/api/types';
import { formatMinorUnits, formatTimestamp, truncateId } from '@/lib/formatters';

interface ReconciliationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    merchantId: string;
    operatorRole: string;
    initialRunId?: string | null;
}

const MAX_POLL_ATTEMPTS = 15; // Bounded polling limit: 15 attempts @ 2.5s = 37.5s max
const POLL_INTERVAL_MS = 2500;

function generateIdempotencyKey(merchantId: string): string {
    const shortMerchant = merchantId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'merch';
    return `recon-${shortMerchant}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

export function ReconciliationDialog({
    isOpen,
    onClose,
    merchantId,
    operatorRole,
    initialRunId,
}: ReconciliationDialogProps) {
    const isAuthorizedToInitiate =
        operatorRole.toUpperCase() === 'OWNER' || operatorRole.toUpperCase() === 'ADMIN';

    const [activeTab, setActiveTab] = useState<'history' | 'initiate'>('history');

    // Merchant isolation & request generation tracking
    const runsRequestIdRef = useRef(0);
    const matchesRequestIdRef = useRef(0);
    const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Runs list state
    const [runs, setRuns] = useState<ReconciliationRunSummary[]>([]);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [runsError, setRunsError] = useState<string | null>(null);
    const [runsPagination, setRunsPagination] = useState<PaginationMetadata>({
        limit: 10,
        nextCursor: null,
        hasMore: false,
    });
    const [runsCursorHistory, setRunsCursorHistory] = useState<string[]>([]);
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<ReconciliationRunStatus | ''>('');

    // Selected run detail & matches state
    const [selectedRunId, setSelectedRunId] = useState<string | null>(initialRunId || null);
    const [selectedRun, setSelectedRun] = useState<ReconciliationRunSummary | null>(null);

    // Matches state
    const [matches, setMatches] = useState<ReconciliationMatchSummary[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [matchesError, setMatchesError] = useState<string | null>(null);
    const [matchesPagination, setMatchesPagination] = useState<PaginationMetadata>({
        limit: 25,
        nextCursor: null,
        hasMore: false,
    });
    const [matchesCursorHistory, setMatchesCursorHistory] = useState<string[]>([]);
    const [selectedRuleFilter, setSelectedRuleFilter] = useState<string>('');

    // Polling state
    const [pollAttemptCount, setPollAttemptCount] = useState(0);
    const [isPolling, setIsPolling] = useState(false);

    // Run Initiation Form State
    const [fromTime, setFromTime] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 16);
    });
    const [toTime, setToTime] = useState(() => new Date().toISOString().slice(0, 16));
    const [rulesetVersion, setRulesetVersion] = useState('v1');
    const [batchSize, setBatchSize] = useState('50');
    const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey(merchantId));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [initiateResult, setInitiateResult] = useState<InitiateRunResult | null>(null);
    const [initiateError, setInitiateError] = useState<string | null>(null);

    // Clipboard copy state
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = (id: string) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    // Clean up polling timer
    const stopPolling = useCallback(() => {
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
        setIsPolling(false);
    }, []);

    // -------------------------------------------------------------------------
    // Load Runs List
    // -------------------------------------------------------------------------
    const loadRuns = useCallback(
        async (cursor?: string) => {
            const reqId = ++runsRequestIdRef.current;
            setLoadingRuns(true);
            setRunsError(null);

            try {
                const res = await reconciliationApiClient.listRuns(merchantId, {
                    limit: 10,
                    cursor,
                    status: selectedStatusFilter ? selectedStatusFilter : undefined,
                });

                if (reqId !== runsRequestIdRef.current) return;

                setRuns(res.items);
                setRunsPagination(res.pagination);

                // Auto-select first run if none selected, or preserve valid selection
                if (res.items.length > 0) {
                    setSelectedRunId((prev) => {
                        if (prev && res.items.some((r) => r.id === prev)) {
                            return prev;
                        }
                        return res.items[0].id;
                    });
                } else {
                    setSelectedRunId(null);
                    setSelectedRun(null);
                    setMatches([]);
                }
            } catch (err: unknown) {
                if (reqId !== runsRequestIdRef.current) return;
                const message = err instanceof Error ? err.message : 'Failed to load reconciliation runs';
                setRunsError(message);
            } finally {
                if (reqId === runsRequestIdRef.current) {
                    setLoadingRuns(false);
                }
            }
        },
        [merchantId, selectedStatusFilter],
    );

    // -------------------------------------------------------------------------
    // Load Selected Run Detail
    // -------------------------------------------------------------------------
    const loadRunDetail = useCallback(
        async (runId: string) => {
            try {
                const data = await reconciliationApiClient.getRun(merchantId, runId);
                setSelectedRun(data);
                // Also update in runs array if present
                setRuns((prev) => prev.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
                return data;
            } catch (err) {
                console.error('[ReconciliationDialog] Failed to fetch run detail:', err);
                return null;
            }
        },
        [merchantId],
    );

    // -------------------------------------------------------------------------
    // Load Matches for Selected Run
    // -------------------------------------------------------------------------
    const loadMatches = useCallback(
        async (runId: string, cursor?: string) => {
            const reqId = ++matchesRequestIdRef.current;
            setLoadingMatches(true);
            setMatchesError(null);

            try {
                const filter: ListMatchesFilter = {
                    limit: 25,
                    cursor,
                    ruleCode: selectedRuleFilter ? selectedRuleFilter : undefined,
                };
                const res = await reconciliationApiClient.listMatches(merchantId, runId, filter);

                if (reqId !== matchesRequestIdRef.current) return;

                setMatches(res.items);
                setMatchesPagination(res.pagination);
            } catch (err: unknown) {
                if (reqId !== matchesRequestIdRef.current) return;
                const message = err instanceof Error ? err.message : 'Failed to load matches for run';
                setMatchesError(message);
            } finally {
                if (reqId === matchesRequestIdRef.current) {
                    setLoadingMatches(false);
                }
            }
        },
        [merchantId, selectedRuleFilter],
    );

    // -------------------------------------------------------------------------
    // Bounded Polling for In-Progress Runs
    // -------------------------------------------------------------------------
    const startPolling = useCallback(
        (runId: string) => {
            stopPolling();
            setIsPolling(true);
            setPollAttemptCount(1);

            const pollNext = async (attempt: number) => {
                if (attempt > MAX_POLL_ATTEMPTS) {
                    stopPolling();
                    return;
                }

                const updated = await loadRunDetail(runId);
                if (updated && (updated.status === 'COMPLETED' || updated.status === 'FAILED')) {
                    stopPolling();
                    loadMatches(runId);
                    return;
                }

                setPollAttemptCount(attempt);
                pollTimeoutRef.current = setTimeout(() => {
                    pollNext(attempt + 1);
                }, POLL_INTERVAL_MS);
            };

            pollTimeoutRef.current = setTimeout(() => {
                pollNext(2);
            }, POLL_INTERVAL_MS);
        },
        [loadRunDetail, loadMatches, stopPolling],
    );

    // Reset and reload when dialog opens or merchant changes
    useEffect(() => {
        if (!isOpen) {
            stopPolling();
            return;
        }

        // Invalidate in-flight generation requests
        runsRequestIdRef.current++;
        matchesRequestIdRef.current++;
        stopPolling();

        // Fresh state
        setRuns([]);
        setSelectedRun(null);
        setMatches([]);
        setRunsCursorHistory([]);
        setMatchesCursorHistory([]);
        setIdempotencyKey(generateIdempotencyKey(merchantId));
        setInitiateResult(null);
        setInitiateError(null);

        if (initialRunId) {
            setSelectedRunId(initialRunId);
        }

        loadRuns();

        return () => {
            stopPolling();
        };
    }, [isOpen, merchantId, initialRunId, loadRuns, stopPolling]);

    // When selected run changes, load detail and matches
    useEffect(() => {
        if (!isOpen || !selectedRunId) return;

        loadRunDetail(selectedRunId).then((run) => {
            if (run && (run.status === 'RUNNING' || run.status === 'PENDING')) {
                startPolling(selectedRunId);
            } else {
                stopPolling();
                loadMatches(selectedRunId);
            }
        });
    }, [isOpen, selectedRunId, loadRunDetail, loadMatches, startPolling, stopPolling]);

    // Handle pagination forward/backward for runs
    const handleNextRunsPage = () => {
        if (!runsPagination.nextCursor || !runsPagination.hasMore) return;
        setRunsCursorHistory((prev) => [...prev, runsPagination.nextCursor!]);
        loadRuns(runsPagination.nextCursor);
    };

    const handlePrevRunsPage = () => {
        if (runsCursorHistory.length <= 1) {
            setRunsCursorHistory([]);
            loadRuns(undefined);
            return;
        }
        const updated = runsCursorHistory.slice(0, -1);
        setRunsCursorHistory(updated);
        loadRuns(updated[updated.length - 1]);
    };

    // Handle pagination forward/backward for matches
    const handleNextMatchesPage = () => {
        if (!selectedRunId || !matchesPagination.nextCursor || !matchesPagination.hasMore) return;
        setMatchesCursorHistory((prev) => [...prev, matchesPagination.nextCursor!]);
        loadMatches(selectedRunId, matchesPagination.nextCursor);
    };

    const handlePrevMatchesPage = () => {
        if (!selectedRunId) return;
        if (matchesCursorHistory.length <= 1) {
            setMatchesCursorHistory([]);
            loadMatches(selectedRunId, undefined);
            return;
        }
        const updated = matchesCursorHistory.slice(0, -1);
        setMatchesCursorHistory(updated);
        loadMatches(selectedRunId, updated[updated.length - 1]);
    };

    // Handle initiation form submit
    const handleInitiateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthorizedToInitiate) return;

        setIsSubmitting(true);
        setInitiateError(null);
        setInitiateResult(null);

        try {
            const input: InitiateRunInput = {
                idempotencyKey: idempotencyKey.trim(),
                from: new Date(fromTime).toISOString(),
                to: new Date(toTime).toISOString(),
                rulesetVersion: rulesetVersion.trim() || 'v1',
                batchSize: parseInt(batchSize, 10) || 50,
            };

            const result = await reconciliationApiClient.initiateRun(merchantId, input);
            setInitiateResult(result);

            // Transition to history tab, select newly initiated run, and trigger polling if running
            setSelectedRunId(result.run.id);
            setActiveTab('history');
            loadRuns();

            if (result.run.status === 'RUNNING' || result.run.status === 'PENDING') {
                startPolling(result.run.id);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to initiate reconciliation run';
            setInitiateError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetInitiationForm = () => {
        setIdempotencyKey(generateIdempotencyKey(merchantId));
        setInitiateResult(null);
        setInitiateError(null);
    };

    if (!isOpen) return null;

    const renderStatusBadge = (status: ReconciliationRunStatus) => {
        switch (status) {
            case 'RUNNING':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Running
                    </span>
                );
            case 'COMPLETED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="size-3 text-emerald-600" />
                        Completed
                    </span>
                );
            case 'FAILED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="size-3 text-rose-600" />
                        Failed
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <Clock className="size-3 text-slate-400" />
                        Pending
                    </span>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-6xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-fin-brand/10 text-fin-brand border border-fin-brand/20 rounded-xl">
                            <GitCommit className="size-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-semibold text-slate-900">Reconciliation Hub</h2>
                                <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md">
                                    Merchant {truncateId(merchantId, 6, 4)}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Run history, deterministic match evidence, and run execution
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                loadRuns();
                                if (selectedRunId) loadRunDetail(selectedRunId);
                            }}
                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                            title="Refresh Runs"
                        >
                            <RefreshCw className={`size-4 ${loadingRuns ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                            title="Close"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-6 shrink-0">
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors ${
                                activeTab === 'history'
                                    ? 'border-fin-brand text-fin-brand'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Layers className="size-4" />
                            <span>Run History & Matches</span>
                            {runs.length > 0 && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-medium">
                                    {runs.length}
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('initiate')}
                            className={`flex items-center gap-2 py-3 text-xs font-semibold border-b-2 transition-colors ${
                                activeTab === 'initiate'
                                    ? 'border-fin-brand text-fin-brand'
                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <PlayCircle className="size-4" />
                            <span>Run Reconciliation</span>
                            {!isAuthorizedToInitiate && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-normal">
                                    Read-Only
                                </span>
                            )}
                        </button>
                    </div>

                    {isPolling && (
                        <div className="flex items-center gap-2 text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                            <span>Checking run status ({pollAttemptCount}/{MAX_POLL_ATTEMPTS})</span>
                            <button
                                type="button"
                                onClick={stopPolling}
                                className="text-[11px] underline text-amber-800 hover:text-amber-950 ml-1 font-semibold"
                            >
                                Stop
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeTab === 'history' ? (
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-full">
                            {/* Left Master: Run History List (5 cols) */}
                            <div className="lg:col-span-5 border-r border-slate-200 flex flex-col h-full bg-slate-50/50 overflow-hidden">
                                {/* Run Status Filter */}
                                <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-white">
                                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                                        <Filter className="size-3.5 text-slate-400" />
                                        <span>Status Filter:</span>
                                    </div>
                                    <select
                                        value={selectedStatusFilter}
                                        onChange={(e) => {
                                            setSelectedStatusFilter(e.target.value as ReconciliationRunStatus | '');
                                            setRunsCursorHistory([]);
                                        }}
                                        className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30"
                                    >
                                        <option value="">All Statuses</option>
                                        <option value="COMPLETED">Completed</option>
                                        <option value="RUNNING">Running</option>
                                        <option value="FAILED">Failed</option>
                                    </select>
                                </div>

                                {/* Runs List Items */}
                                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                                    {loadingRuns && runs.length === 0 ? (
                                        <div className="p-6 text-center text-xs text-slate-500 space-y-2">
                                            <RefreshCw className="size-5 animate-spin mx-auto text-fin-brand" />
                                            <div>Loading reconciliation runs...</div>
                                        </div>
                                    ) : runsError ? (
                                        <div className="p-6 text-center text-xs text-rose-600 space-y-2">
                                            <AlertCircle className="size-5 mx-auto text-rose-600" />
                                            <div>{runsError}</div>
                                            <button
                                                type="button"
                                                onClick={() => loadRuns()}
                                                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 shadow-2xs"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : runs.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-slate-500 space-y-3">
                                            <GitCommit className="size-8 mx-auto text-slate-300" />
                                            <div className="font-semibold text-slate-700">No reconciliation runs found</div>
                                            <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                                                Initiate a run to deterministically match PayPal captures against merchant orders.
                                            </p>
                                            {isAuthorizedToInitiate && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveTab('initiate')}
                                                    className="px-3 py-1.5 bg-fin-brand hover:bg-fin-brand-hover text-white rounded-lg text-xs font-semibold shadow-2xs"
                                                >
                                                    Start First Run
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        runs.map((r) => {
                                            const isSelected = r.id === selectedRunId;
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => setSelectedRunId(r.id)}
                                                    className={`w-full p-4 text-left transition-colors flex flex-col gap-2 ${
                                                        isSelected
                                                            ? 'bg-fin-brand/5 border-l-4 border-fin-brand pl-3'
                                                            : 'hover:bg-slate-100/70'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-xs font-semibold text-slate-900">
                                                                {truncateId(r.id, 8, 4)}
                                                            </span>
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded">
                                                                {r.rulesetVersion}
                                                            </span>
                                                        </div>
                                                        {renderStatusBadge(r.status)}
                                                    </div>

                                                    <div className="grid grid-cols-4 gap-1 text-[11px] font-mono text-center bg-white p-1.5 rounded-lg border border-slate-200/90 shadow-2xs">
                                                        <div>
                                                            <div className="text-[9px] text-slate-400 font-sans font-medium">MATCH</div>
                                                            <div className="text-emerald-700 font-semibold">{r.matchedCount}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[9px] text-slate-400 font-sans font-medium">UNMATCH</div>
                                                            <div className="text-amber-700 font-semibold">{r.unmatchedCount}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[9px] text-slate-400 font-sans font-medium">AMBIG</div>
                                                            <div className="text-purple-700 font-semibold">{r.ambiguousCount}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-[9px] text-slate-400 font-sans font-medium">TOTAL</div>
                                                            <div className="text-slate-800 font-semibold">{r.totalConsidered}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                                                        <span>{formatTimestamp(r.createdAt)}</span>
                                                        {r.completedAt && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Completed
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Pagination Footer for Runs */}
                                <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600">
                                    <div className="text-[11px]">
                                        Page {runsCursorHistory.length + 1}
                                        {runsPagination.totalCount !== undefined && ` of ${Math.ceil(runsPagination.totalCount / runsPagination.limit)}`}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={runsCursorHistory.length === 0 || loadingRuns}
                                            onClick={handlePrevRunsPage}
                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft className="size-4" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!runsPagination.hasMore || loadingRuns}
                                            onClick={handleNextRunsPage}
                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <ChevronRight className="size-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Detail & Matches (7 cols) */}
                            <div className="lg:col-span-7 flex flex-col h-full bg-white overflow-hidden">
                                {selectedRun ? (
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        {/* Run Banner / Overview Card */}
                                        <div className="p-5 border-b border-slate-200 bg-slate-50/50 space-y-3 shrink-0">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500 font-medium">Run ID:</span>
                                                    <span className="font-mono text-xs text-slate-900 font-semibold">
                                                        {selectedRun.id}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(selectedRun.id)}
                                                        className="text-slate-400 hover:text-slate-700 transition"
                                                        title="Copy Run ID"
                                                    >
                                                        {copiedId === selectedRun.id ? (
                                                            <Check className="size-3.5 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="size-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                                {renderStatusBadge(selectedRun.status)}
                                            </div>

                                            {/* Window & Timestamps */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                                                    <div className="text-[10px] text-slate-400 font-medium">Window Start</div>
                                                    <div className="font-mono text-[11px] text-slate-800 mt-0.5">
                                                        {formatTimestamp(selectedRun.windowStart)}
                                                    </div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                                                    <div className="text-[10px] text-slate-400 font-medium">Window End</div>
                                                    <div className="font-mono text-[11px] text-slate-800 mt-0.5">
                                                        {formatTimestamp(selectedRun.windowEnd)}
                                                    </div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                                                    <div className="text-[10px] text-slate-400 font-medium">Started At</div>
                                                    <div className="font-mono text-[11px] text-slate-800 mt-0.5">
                                                        {selectedRun.startedAt ? formatTimestamp(selectedRun.startedAt) : '—'}
                                                    </div>
                                                </div>
                                                <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                                                    <div className="text-[10px] text-slate-400 font-medium">Completed At</div>
                                                    <div className="font-mono text-[11px] text-slate-800 mt-0.5">
                                                        {selectedRun.completedAt ? formatTimestamp(selectedRun.completedAt) : 'In progress'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Outcome Banner */}
                                            {selectedRun.status === 'RUNNING' && (
                                                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs flex items-center justify-between text-amber-800">
                                                    <div className="flex items-center gap-2">
                                                        <span className="size-2 rounded-full bg-amber-500 animate-ping" />
                                                        <span>Reconciliation engine is actively executing. Refreshing status automatically...</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => loadRunDetail(selectedRun.id)}
                                                        className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-[11px]"
                                                    >
                                                        Refresh Now
                                                    </button>
                                                </div>
                                            )}

                                            {selectedRun.status === 'FAILED' && (
                                                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                                                    <div className="font-semibold flex items-center gap-1.5">
                                                        <AlertCircle className="size-4 text-rose-600" />
                                                        <span>Run Failed</span>
                                                    </div>
                                                    <p className="text-[11px] text-rose-700 font-mono">
                                                        {selectedRun.failureReason || 'An error occurred during run execution.'}
                                                    </p>
                                                </div>
                                            )}

                                            {selectedRun.status === 'COMPLETED' && selectedRun.matchedCount === 0 && (
                                                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                                                    <div className="font-semibold flex items-center gap-1.5">
                                                        <CheckCircle2 className="size-4 text-blue-600" />
                                                        <span>Completed with Zero Exact Matches</span>
                                                    </div>
                                                    <p className="text-[11px] text-blue-700">
                                                        The engine evaluated {selectedRun.totalConsidered} transactions. Unmatched and ambiguous records have been recorded as discrepancies in the Exceptions Queue.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Matches Section */}
                                        <div className="flex-1 flex flex-col overflow-hidden">
                                            <div className="p-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-slate-900">Exact Matches</span>
                                                    <span className="text-xs text-slate-500 font-mono">({selectedRun.matchedCount})</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Filter rule code..."
                                                        value={selectedRuleFilter}
                                                        onChange={(e) => {
                                                            setSelectedRuleFilter(e.target.value);
                                                            setMatchesCursorHistory([]);
                                                            loadMatches(selectedRun.id);
                                                        }}
                                                        className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30"
                                                    />
                                                </div>
                                            </div>

                                            {/* Matches Table */}
                                            <div className="flex-1 overflow-y-auto">
                                                {loadingMatches && matches.length === 0 ? (
                                                    <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                                                        <RefreshCw className="size-5 animate-spin mx-auto text-fin-brand" />
                                                        <div>Loading matches...</div>
                                                    </div>
                                                ) : matchesError ? (
                                                    <div className="p-8 text-center text-xs text-rose-600 space-y-2">
                                                        <AlertCircle className="size-5 mx-auto text-rose-600" />
                                                        <div>{matchesError}</div>
                                                    </div>
                                                ) : matches.length === 0 ? (
                                                    <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                                                        <div className="font-semibold text-slate-700">No matches for this run view</div>
                                                        <p className="text-[11px] text-slate-500">
                                                            {selectedRun.matchedCount === 0
                                                                ? 'No exact matches found.'
                                                                : 'No matches matched the rule filter.'}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {matches.map((m) => (
                                                            <div key={m.id} className="p-4 hover:bg-slate-50/80 transition-colors space-y-2">
                                                                <div className="flex items-center justify-between text-xs">
                                                                    <span className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                                                                        {m.ruleCode}
                                                                    </span>
                                                                    <span className="font-mono text-[11px] text-slate-500">
                                                                        Match ID: {truncateId(m.id, 6, 4)}
                                                                    </span>
                                                                </div>

                                                                {/* Matched Pair Grid */}
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                                                                    {/* Provider Transaction */}
                                                                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                                                        <div className="text-[10px] text-slate-500 uppercase font-semibold font-sans">
                                                                            PayPal Capture
                                                                        </div>
                                                                        <div className="text-slate-900 font-semibold mt-1">
                                                                            {formatMinorUnits(m.providerTransaction.amountMinor, m.providerTransaction.currency)} {m.providerTransaction.currency}
                                                                        </div>
                                                                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                                                            TX: {m.providerTransaction.providerTxnId}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-400 mt-1">
                                                                            {formatTimestamp(m.providerTransaction.occurredAt)}
                                                                        </div>
                                                                    </div>

                                                                    {/* Merchant Order */}
                                                                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                                                                        <div className="text-[10px] text-slate-500 uppercase font-semibold font-sans">
                                                                            Merchant Order
                                                                        </div>
                                                                        <div className="text-slate-900 font-semibold mt-1">
                                                                            {formatMinorUnits(m.merchantOrder.amountMinor, m.merchantOrder.currency)} {m.merchantOrder.currency}
                                                                        </div>
                                                                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                                                                            Order: {m.merchantOrder.externalOrderId}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-400 mt-1">
                                                                            {formatTimestamp(m.merchantOrder.orderedAt)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Matches Pagination Footer */}
                                            {matches.length > 0 && (
                                                <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600 shrink-0">
                                                    <span className="text-[11px]">
                                                        Page {matchesCursorHistory.length + 1}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            disabled={matchesCursorHistory.length === 0 || loadingMatches}
                                                            onClick={handlePrevMatchesPage}
                                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <ChevronLeft className="size-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={!matchesPagination.hasMore || loadingMatches}
                                                            onClick={handleNextMatchesPage}
                                                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <ChevronRight className="size-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-slate-500">
                                        Select a reconciliation run from the list to inspect outcome metrics and exact matches.
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Initiate Tab */
                        <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full bg-white">
                            {!isAuthorizedToInitiate ? (
                                <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-2 text-xs">
                                    <div className="flex items-center gap-2 font-semibold text-sm">
                                        <ShieldAlert className="size-5 text-amber-600" />
                                        <span>Permission Required</span>
                                    </div>
                                    <p>
                                        Your current role (<span className="font-bold">{operatorRole}</span>) is read-only. Initiating new reconciliation runs requires <span className="font-bold">OWNER</span> or <span className="font-bold">ADMIN</span> capabilities.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleInitiateSubmit} className="space-y-5">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-semibold text-slate-900">Initiate Reconciliation Run</h3>
                                        <p className="text-xs text-slate-500">
                                            Trigger deterministic matching between PayPal captured transactions and merchant orders.
                                        </p>
                                    </div>

                                    {/* Idempotency Key Notice */}
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                                        <div className="text-slate-600 font-semibold text-[11px]">Idempotency Protection</div>
                                        <div className="font-mono text-slate-800 text-[11px] break-all">
                                            {idempotencyKey}
                                        </div>
                                        <p className="text-[10px] text-slate-500">
                                            Key is locked to this session to safely prevent accidental double-execution or replay.
                                        </p>
                                    </div>

                                    {/* Date Range Inputs */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Window Start (From)
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={fromTime}
                                                onChange={(e) => setFromTime(e.target.value)}
                                                required
                                                className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg p-2.5 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30 font-mono shadow-2xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Window End (To)
                                            </label>
                                            <input
                                                type="datetime-local"
                                                value={toTime}
                                                onChange={(e) => setToTime(e.target.value)}
                                                required
                                                className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg p-2.5 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30 font-mono shadow-2xs"
                                            />
                                        </div>
                                    </div>

                                    {/* Advanced Configuration */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Ruleset Version
                                            </label>
                                            <input
                                                type="text"
                                                value={rulesetVersion}
                                                onChange={(e) => setRulesetVersion(e.target.value)}
                                                placeholder="v1"
                                                className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg p-2.5 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30 font-mono shadow-2xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                Batch Processing Size
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="200"
                                                value={batchSize}
                                                onChange={(e) => setBatchSize(e.target.value)}
                                                className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-lg p-2.5 focus:outline-none focus:border-fin-brand focus:ring-1 focus:ring-fin-brand/30 font-mono shadow-2xs"
                                            />
                                        </div>
                                    </div>

                                    {initiateError && (
                                        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                                            <AlertCircle className="size-4 shrink-0 text-rose-600" />
                                            <span>{initiateError}</span>
                                        </div>
                                    )}

                                    {initiateResult && (
                                        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                                            <div className="flex items-center gap-2 font-semibold">
                                                <CheckCircle2 className="size-4 text-emerald-600" />
                                                <span>
                                                    Run {initiateResult.outcome === 'reused' ? 'Reused (Idempotent)' : 'Initiated Successfully'}
                                                </span>
                                            </div>
                                            <div className="font-mono text-[11px] text-slate-700">
                                                Run ID: {initiateResult.run.id}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedRunId(initiateResult.run.id);
                                                    setActiveTab('history');
                                                }}
                                                className="inline-flex items-center gap-1.5 text-fin-brand hover:underline font-semibold"
                                            >
                                                <span>View in Run History</span>
                                                <ArrowRight className="size-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    <div className="pt-2 flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={resetInitiationForm}
                                            className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 transition"
                                        >
                                            Reset Form & Key
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-fin-brand hover:bg-fin-brand-hover text-white rounded-xl text-xs font-semibold shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <RefreshCw className="size-4 animate-spin" />
                                                    <span>Initiating Run...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <PlayCircle className="size-4" />
                                                    <span>Execute Reconciliation</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
