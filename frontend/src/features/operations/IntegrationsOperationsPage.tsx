import { useEffect, useState, useCallback, useRef } from 'react';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Cpu,
    GitCommit,
    HelpCircle,
    Info,
    Lock,
    Network,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Webhook,
    X,
} from 'lucide-react';
import { operationsApiClient } from '@/services/api/operations-api';
import { connectionsApiClient } from '@/services/api/connections-api';
import {
    ApiClientError,
    type ProviderConnectionSummary as ConnectionItem,
    type OperationsSummary,
    type DeadLetterRecord as OutboxEventSummary,
    type WebhookEventRecord as WebhookEventItem,
    type EventTimelineResult,
} from '@/services/api/types';

export interface IntegrationsOperationsPageProps {
    merchantId: string;
}

interface ReplayFeedback {
    type: 'success' | 'info' | 'error';
    title: string;
    message: string;
}

export function IntegrationsOperationsPage({ merchantId }: IntegrationsOperationsPageProps) {
    const [connections, setConnections] = useState<ConnectionItem[]>([]);
    const [loadingConn, setLoadingConn] = useState(true);
    const [connError, setConnError] = useState<string | null>(null);

    const [operationsSummary, setOperationsSummary] = useState<OperationsSummary | null>(null);
    const [loadingOps, setLoadingOps] = useState(true);
    const [opsError, setOpsError] = useState<string | null>(null);

    const [webhooks, setWebhooks] = useState<WebhookEventItem[]>([]);
    const [loadingWebhooks, setLoadingWebhooks] = useState(true);
    const [webhooksError, setWebhooksError] = useState<string | null>(null);

    const [replayingEventId, setReplayingEventId] = useState<string | null>(null);
    const [replayConfirmItem, setReplayConfirmItem] = useState<OutboxEventSummary | null>(null);
    const [replayFeedback, setReplayFeedback] = useState<ReplayFeedback | null>(null);

    // Event Timeline Drawer State
    const [selectedTimelineEventId, setSelectedTimelineEventId] = useState<string | null>(null);
    const [timelineData, setTimelineData] = useState<EventTimelineResult | null>(null);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [timelineError, setTimelineError] = useState<string | null>(null);

    const reqIdRef = useRef(0);

    const loadConnections = useCallback(async (mId: string) => {
        setLoadingConn(true);
        setConnError(null);
        try {
            const res = await connectionsApiClient.listConnections(mId);
            setConnections(res.items || []);
        } catch (err: unknown) {
            setConnError(err instanceof Error ? err.message : 'Failed to load connections');
        } finally {
            setLoadingConn(false);
        }
    }, []);

    const loadOperationsSummary = useCallback(async (mId: string) => {
        setLoadingOps(true);
        setOpsError(null);
        try {
            const res = await operationsApiClient.getOperationsSummary(mId);
            setOperationsSummary(res);
        } catch (err: unknown) {
            setOpsError(err instanceof Error ? err.message : 'Failed to load operations summary');
        } finally {
            setLoadingOps(false);
        }
    }, []);

    const loadWebhooks = useCallback(async (mId: string) => {
        setLoadingWebhooks(true);
        setWebhooksError(null);
        try {
            const res = await operationsApiClient.getRecentWebhooks(mId);
            setWebhooks(res.items || []);
        } catch (err: unknown) {
            setWebhooksError(err instanceof Error ? err.message : 'Failed to load recent webhook events');
        } finally {
            setLoadingWebhooks(false);
        }
    }, []);

    const loadAll = useCallback(
        (mId: string) => {
            reqIdRef.current++;
            loadConnections(mId);
            loadOperationsSummary(mId);
            loadWebhooks(mId);
        },
        [loadConnections, loadOperationsSummary, loadWebhooks],
    );

    useEffect(() => {
        // Clear previous state on merchant switch
        setReplayFeedback(null);
        setSelectedTimelineEventId(null);
        setTimelineData(null);
        loadAll(merchantId);
    }, [merchantId, loadAll]);

    const handleExecuteReplay = async () => {
        if (!replayConfirmItem) return;
        setReplayingEventId(replayConfirmItem.id);
        try {
            const res = await operationsApiClient.replayOutboxEvent(merchantId, replayConfirmItem.id);
            if (res.outcome === 'replayed') {
                setReplayFeedback({
                    type: 'success',
                    title: 'Outbox Event Queued for Replay',
                    message: `Event ${res.eventId.slice(0, 8)} transitioned to ${res.status}. Worker pool will retry dispatch.`,
                });
            } else if (res.outcome === 'already_queued') {
                setReplayFeedback({
                    type: 'info',
                    title: 'Replay Already In Flight',
                    message: res.reason || `Event ${res.eventId.slice(0, 8)} is already in ${res.status} state. No duplicate action needed.`,
                });
            } else {
                setReplayFeedback({
                    type: 'error',
                    title: 'Replay Rejected',
                    message: res.reason || 'The event is ineligible for replay based on server-side criteria.',
                });
            }
        } catch (err: unknown) {
            const isConflict =
                (err instanceof ApiClientError && err.statusCode === 409) ||
                (typeof err === 'object' && err !== null && 'statusCode' in err && (err as any).statusCode === 409);
            const isNotFound =
                (err instanceof ApiClientError && err.statusCode === 404) ||
                (typeof err === 'object' && err !== null && 'statusCode' in err && (err as any).statusCode === 404);

            if (isConflict) {
                setReplayFeedback({
                    type: 'info',
                    title: 'Replay Conflict (409) — Already In Flight or Limit Reached',
                    message: err instanceof Error ? err.message : 'The event was concurrently replayed, is already processing, or reached the maximum attempt ceiling (5 attempts).',
                });
            } else if (isNotFound) {
                setReplayFeedback({
                    type: 'error',
                    title: 'Event Not Found (404)',
                    message: err instanceof Error ? err.message : 'Outbox event was not found or access was denied for this merchant.',
                });
            } else {
                setReplayFeedback({
                    type: 'error',
                    title: 'Replay Request Failed',
                    message: err instanceof Error ? err.message : 'Unexpected network or authorization error',
                });
            }
        } finally {
            setReplayingEventId(null);
            setReplayConfirmItem(null);
            loadOperationsSummary(merchantId);
        }
    };

    const handleOpenTimeline = async (eventId: string) => {
        setSelectedTimelineEventId(eventId);
        setLoadingTimeline(true);
        setTimelineError(null);
        setTimelineData(null);
        try {
            const res = await operationsApiClient.getEventTimeline(merchantId, eventId);
            setTimelineData(res);
        } catch (err: unknown) {
            setTimelineError(err instanceof Error ? err.message : 'Failed to load event timeline');
        } finally {
            setLoadingTimeline(false);
        }
    };

    return (
        <div className="flex-1 h-full min-h-0 overflow-y-auto bg-slate-50/70 p-4 sm:p-6 pb-16 space-y-6 text-slate-900 font-sans">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
                            <Activity className="size-4.5" />
                        </div>
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Operations Command Center</h1>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                            Pipeline & Gateway Operations
                        </span>
                    </div>
                    <p className="text-xs text-slate-500">
                        Live connection states, webhook intake telemetry, transactional outbox recovery, and end-to-end event lineage.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => loadAll(merchantId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                    >
                        <RefreshCw className="size-3.5 text-slate-500" />
                        <span>Refresh All Panels</span>
                    </button>
                </div>
            </div>

            {/* Replay Outcome Banner */}
            {replayFeedback && (
                <div
                    className={`rounded-xl border p-4 text-xs shadow-2xs flex items-start justify-between gap-3 ${
                        replayFeedback.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : replayFeedback.type === 'info'
                              ? 'border-sky-200 bg-sky-50 text-sky-900'
                              : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                >
                    <div className="flex items-start gap-2.5">
                        {replayFeedback.type === 'success' ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 mt-0.5" />
                        ) : replayFeedback.type === 'info' ? (
                            <Info className="size-4 shrink-0 text-sky-600 mt-0.5" />
                        ) : (
                            <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                            <span className="font-semibold block">{replayFeedback.title}</span>
                            <span className="text-[11px] opacity-90">{replayFeedback.message}</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setReplayFeedback(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                        title="Dismiss notification"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            )}

            {/* Panel 1: PayPal Provider Connection Health */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                            <Network className="size-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900">PayPal Connection Configuration</h2>
                    </div>
                    <span className="text-xs text-slate-400">
                        Server-enforced OAuth & Account Scoping
                    </span>
                </div>

                {loadingConn ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                        Querying provider connection status...
                    </div>
                ) : connError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between shadow-2xs">
                        <span>{connError}</span>
                        <button
                            type="button"
                            onClick={() => loadConnections(merchantId)}
                            className="underline ml-2 font-semibold"
                        >
                            Retry
                        </button>
                    </div>
                ) : connections.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {connections.map((conn) => (
                            <div
                                key={conn.id}
                                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4.5 space-y-3 shadow-2xs hover:border-slate-300 transition-all"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-xs font-semibold text-slate-900">
                                            {conn.provider} Gateway
                                        </span>
                                    </div>
                                    <span
                                        className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                            conn.status === 'ACTIVE'
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : conn.status === 'NEEDS_REAUTH'
                                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        {conn.status}
                                    </span>
                                </div>

                                <div className="space-y-1.5 text-xs text-slate-600">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Connection Key:</span>
                                        <span className="font-mono text-slate-800 font-semibold">{conn.connectionKey}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Provider Account ID:</span>
                                        <span className="font-mono text-slate-800 font-semibold">
                                            {conn.providerAccountId || 'Configured via .env'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Webhook Listener ID:</span>
                                        <span className="font-mono text-slate-800">
                                            {conn.webhookId ? `${conn.webhookId.slice(0, 12)}...` : 'Active'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Environment:</span>
                                        <span className="font-mono text-fin-brand font-semibold">Sandbox Adapter</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-200 flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <Lock className="size-3 text-slate-400" />
                                    <span>Client secrets securely held in backend runtime environment</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                        No provider connections configured for this merchant.
                    </div>
                )}
            </div>

            {/* Panel 2: Webhook Intake Activity */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                            <Webhook className="size-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900">Recent Webhook Deliveries</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => loadWebhooks(merchantId)}
                        disabled={loadingWebhooks}
                        className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1 transition-colors"
                    >
                        <RefreshCw className={`size-3 text-slate-400 ${loadingWebhooks ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                </div>

                {loadingWebhooks ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                        Loading webhook events...
                    </div>
                ) : webhooksError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 shadow-2xs">
                        {webhooksError}
                    </div>
                ) : webhooks.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-700">
                            <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 bg-slate-50/80">
                                <tr>
                                    <th className="py-2.5 px-3">Status</th>
                                    <th className="py-2.5 px-3">Event Type</th>
                                    <th className="py-2.5 px-3">Event ID</th>
                                    <th className="py-2.5 px-3">Transmission ID</th>
                                    <th className="py-2.5 px-3">Received Time</th>
                                    <th className="py-2.5 px-3">Verification</th>
                                    <th className="py-2.5 px-3 text-right">Lineage</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {webhooks.map((wh) => (
                                    <tr key={wh.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-2.5 px-3">
                                            <span
                                                className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                                    wh.processingStatus === 'PROCESSED'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : wh.processingStatus === 'PROCESSING'
                                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                          : 'bg-slate-100 text-slate-700 border-slate-200'
                                                }`}
                                            >
                                                {wh.processingStatus}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                                            {wh.eventType}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-500">
                                            {wh.providerEventId}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-400">
                                            {wh.transmissionId ? wh.transmissionId.slice(0, 16) : '—'}
                                        </td>
                                        <td className="py-2.5 px-3 text-slate-600">
                                            {new Date(wh.receivedAt).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit',
                                            })}
                                        </td>
                                        <td className="py-2.5 px-3 text-emerald-700 font-medium">
                                            <span className="flex items-center gap-1">
                                                <ShieldCheck className="size-3.5 text-emerald-600" />
                                                <span>Verified</span>
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenTimeline(wh.providerEventId)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                                                title="View End-to-End Pipeline Timeline"
                                            >
                                                <GitCommit className="size-3 text-sky-600" />
                                                <span>Trace</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                        No webhook deliveries recorded yet for this merchant.
                    </div>
                )}
            </div>

            {/* Panel 3: Processing Pipeline Health & Outbox */}
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Cpu className="size-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900">Outbox Pipeline Recovery & Dead Letter Queue</h2>
                    </div>
                    {operationsSummary && (
                        <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                                operationsSummary.pipelineHealth === 'HEALTHY'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                        >
                            Pipeline: {operationsSummary.pipelineHealth}
                        </span>
                    )}
                </div>

                {loadingOps ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                        Loading outbox pipeline metrics...
                    </div>
                ) : opsError ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 shadow-2xs">
                        {opsError}
                    </div>
                ) : operationsSummary ? (
                    <div className="space-y-4">
                        {/* Outbox Metrics Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs">
                                <span className="text-slate-400 text-[11px] font-medium">Dispatched Events</span>
                                <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                                    {operationsSummary.outbox.dispatchedCount}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs">
                                <span className="text-slate-400 text-[11px] font-medium">Pending Queue</span>
                                <div className="text-xl font-bold font-mono text-slate-800 mt-1">
                                    {operationsSummary.outbox.pendingCount}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs">
                                <span className="text-slate-400 text-[11px] font-medium">Processing / In-Flight</span>
                                <div className="text-xl font-bold font-mono text-blue-700 mt-1">
                                    {operationsSummary.outbox.processingCount}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 shadow-2xs">
                                <span className="text-slate-400 text-[11px] font-medium">Dead Letter Failures</span>
                                <div
                                    className={`text-xl font-bold font-mono mt-1 ${
                                        operationsSummary.outbox.deadLetterCount > 0
                                            ? 'text-rose-600'
                                            : 'text-slate-400'
                                    }`}
                                >
                                    {operationsSummary.outbox.deadLetterCount}
                                </div>
                            </div>
                        </div>

                        {/* Extended Pipeline Stage Metrics */}
                        {operationsSummary.webhooks && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-1.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-slate-800">Stage 1: Webhook Intake</span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                            {operationsSummary.webhooks.totalReceivedCount} Total
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 space-y-0.5">
                                        <div className="flex justify-between">
                                            <span>Processed:</span>
                                            <span className="font-mono text-emerald-700 font-semibold">{operationsSummary.webhooks.processedCount}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Pending Ingestion:</span>
                                            <span className="font-mono text-slate-700">{operationsSummary.webhooks.receivedPendingCount}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60" title={operationsSummary.webhooks.verificationFailures.reason}>
                                            <span>Verification Failures:</span>
                                            <span className="font-mono font-medium text-slate-500">Rejected at Edge</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-1.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-slate-800">Stage 2: Outbox Retries</span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                                            Ceiling: 5 Attempts
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 space-y-0.5">
                                        <div className="flex justify-between">
                                            <span>Retried in Flight:</span>
                                            <span className="font-mono text-amber-700 font-semibold">{operationsSummary.outbox.retriedCount ?? 0}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Terminally Failed (DLQ):</span>
                                            <span className="font-mono text-rose-700 font-semibold">{operationsSummary.outbox.terminallyFailedCount ?? operationsSummary.outbox.deadLetterCount}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                                            <span>Oldest Pending Age:</span>
                                            <span className="font-mono text-slate-600 font-medium">
                                                {operationsSummary.outbox.oldestPendingAgeMs > 0 ? `${Math.round(operationsSummary.outbox.oldestPendingAgeMs / 1000)}s` : '0s'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 space-y-1.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-slate-800">Stage 3: Reconciliation Breaks</span>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                            {operationsSummary.reconciliation.totalRunsCount ?? 0} Runs
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-500 space-y-0.5">
                                        <div className="flex justify-between">
                                            <span>Missing Counterparts:</span>
                                            <span className="font-mono text-amber-700 font-semibold">{operationsSummary.reconciliation.breakBreakdown?.unmatchedCount ?? 0}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Ambiguous Matches:</span>
                                            <span className="font-mono text-orange-700 font-semibold">{operationsSummary.reconciliation.breakBreakdown?.ambiguousCount ?? operationsSummary.reconciliation.recentAmbiguousCount}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                                            <span>Amount/Status Breaks:</span>
                                            <span className="font-mono text-slate-600 font-medium">{operationsSummary.reconciliation.breakBreakdown?.discrepancyCount ?? 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dead Letter Queue Table */}
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-800">
                                    Dead Letter Queue (DLQ) Items
                                </span>
                                <span className="text-[11px] text-slate-400">
                                    Operator Replay with Strict Server-Side Eligibility Enforcement
                                </span>
                            </div>

                            {operationsSummary.deadLetterQueue.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs text-slate-700">
                                        <thead className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 bg-slate-50/80">
                                            <tr>
                                                <th className="py-2.5 px-3">Event ID</th>
                                                <th className="py-2.5 px-3">Aggregate Type</th>
                                                <th className="py-2.5 px-3">Event Type</th>
                                                <th className="py-2.5 px-3">Attempts</th>
                                                <th className="py-2.5 px-3">Error Category</th>
                                                <th className="py-2.5 px-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {operationsSummary.deadLetterQueue.map((dlq) => (
                                                <tr key={dlq.id} className="hover:bg-slate-50/80 transition-colors">
                                                    <td className="py-2.5 px-3 font-mono text-fin-brand font-semibold">
                                                        {dlq.id.slice(0, 8)}...
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-800 font-medium">
                                                        {dlq.aggregateType}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono text-slate-600">
                                                        {dlq.eventType}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono">
                                                        <span className={dlq.attemptCount >= 5 ? 'text-rose-600 font-bold' : 'text-amber-700 font-semibold'}>
                                                            {dlq.attemptCount} / 5
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-rose-700 font-mono text-[11px] font-semibold">
                                                        {dlq.lastErrorCategory || 'PROCESSING_FAILURE'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenTimeline(dlq.id)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors"
                                                                title="Trace Pipeline Lineage"
                                                            >
                                                                <GitCommit className="size-3 text-sky-600" />
                                                                <span>Trace</span>
                                                            </button>

                                                            {dlq.replayEligible ? (
                                                                <button
                                                                    type="button"
                                                                    disabled={replayingEventId === dlq.id}
                                                                    onClick={() => setReplayConfirmItem(dlq)}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold shadow-2xs transition-colors"
                                                                >
                                                                    <RotateCcw className="size-3 text-emerald-600" />
                                                                    <span>Replay</span>
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 text-xs font-medium cursor-not-allowed"
                                                                    title={dlq.attemptCount >= 10 ? 'Retry limit exceeded (max 10 attempts)' : 'Ineligible for automated replay'}
                                                                >
                                                                    <RotateCcw className="size-3 text-slate-300" />
                                                                    <span>Ineligible</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
                                    <CheckCircle2 className="size-4 text-emerald-600" />
                                    <span>Dead letter queue clear — no terminal processing failures.</span>
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Event Timeline Drawer / Slide-Over Modal */}
            {selectedTimelineEventId && (
                <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs p-0 sm:p-4">
                    <div className="w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[90vh] bg-white sm:rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-slate-900">
                        {/* Drawer Header */}
                        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <GitCommit className="size-4 text-sky-600" />
                                    <h3 className="text-sm font-bold text-slate-900">Pipeline Event Timeline</h3>
                                </div>
                                <p className="text-xs text-slate-500 font-mono">
                                    Trace Target: {selectedTimelineEventId}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTimelineEventId(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* Drawer Body */}
                        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                            {loadingTimeline ? (
                                <div className="py-16 text-center text-xs text-slate-400 space-y-2">
                                    <RefreshCw className="size-5 animate-spin mx-auto text-sky-500" />
                                    <div>Correlating pipeline evidence across ledger tables...</div>
                                </div>
                            ) : timelineError ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 space-y-2">
                                    <div className="font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="size-4 text-rose-600" />
                                        <span>Timeline Query Failed</span>
                                    </div>
                                    <p>{timelineError}</p>
                                </div>
                            ) : timelineData ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
                                        <span>Lineage Path: {timelineData.steps.length} checkpoints</span>
                                        <span>Generated: {new Date(timelineData.generatedAt).toLocaleTimeString()}</span>
                                    </div>

                                    {/* Vertical Steps */}
                                    <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 before:z-0">
                                        {timelineData.steps.map((step, idx) => {
                                            const isComplete = step.status === 'success';
                                            const isFailed = step.status === 'failed';
                                            const isPending = step.status === 'pending';
                                            const isMissing = step.status === 'missing' || step.status === 'not_applicable';

                                            return (
                                                <div key={idx} className="relative z-10 flex items-start gap-3.5 text-xs">
                                                    <div
                                                        className={`size-7 rounded-full flex items-center justify-center shrink-0 border text-[11px] font-bold ${
                                                            isComplete
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                                                : isFailed
                                                                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                                                                  : isPending
                                                                    ? 'bg-sky-50 text-sky-700 border-sky-300'
                                                                    : 'bg-slate-100 text-slate-400 border-slate-200'
                                                        }`}
                                                    >
                                                        {idx + 1}
                                                    </div>

                                                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-semibold text-slate-900">{step.title}</span>
                                                            <span
                                                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                                                                    isComplete
                                                                        ? 'bg-emerald-100 text-emerald-800'
                                                                        : isFailed
                                                                          ? 'bg-rose-100 text-rose-800'
                                                                          : isPending
                                                                            ? 'bg-sky-100 text-sky-800'
                                                                            : 'bg-slate-200 text-slate-600'
                                                                }`}
                                                            >
                                                                {step.status}
                                                            </span>
                                                        </div>

                                                        {step.timestamp && (
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-400">
                                                                <Clock className="size-3" />
                                                                <span>{new Date(step.timestamp).toLocaleString()}</span>
                                                            </div>
                                                        )}

                                                        {step.error && (
                                                            <div className="rounded bg-rose-50 border border-rose-200 p-2 text-rose-800 text-[11px] font-mono">
                                                                {step.error}
                                                            </div>
                                                        )}

                                                        {step.summary && (
                                                            <div className="text-[11px] text-slate-600">
                                                                {step.summary}
                                                            </div>
                                                        )}

                                                        {step.details && (
                                                            <div className="bg-white rounded border border-slate-200 p-2 text-[11px] font-mono text-slate-600 space-y-1">
                                                                {Object.entries(step.details).map(([key, value]) => (
                                                                    <div key={key} className="flex justify-between gap-2 overflow-hidden text-ellipsis">
                                                                        <span className="text-slate-400 font-sans">{key}:</span>
                                                                        <span className="text-slate-800 font-semibold truncate max-w-[220px]">
                                                                            {String(value)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {isMissing && (
                                                            <p className="text-[11px] text-slate-400 italic">
                                                                Checkpoint not reached or unlinked in this processing run.
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Drawer Footer */}
                        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedTimelineEventId(null)}
                                className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                            >
                                Close Lineage
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Replay Confirmation Modal */}
            {replayConfirmItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl text-slate-900">
                        <div className="flex items-center gap-2.5 text-amber-600">
                            <AlertTriangle className="size-5" />
                            <h3 className="text-sm font-semibold text-slate-900">Confirm Outbox Event Replay</h3>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Are you sure you want to replay outbox event{' '}
                            <span className="font-mono text-slate-900 font-semibold">{replayConfirmItem.id}</span>?
                            This will transition status to <span className="font-mono text-fin-brand font-semibold">PENDING</span> for safe retry by the worker pool.
                        </p>

                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5 font-mono text-slate-600">
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-sans">Aggregate:</span>
                                <span>{replayConfirmItem.aggregateType} ({replayConfirmItem.aggregateId.slice(0, 8)}...)</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-sans">Event Type:</span>
                                <span>{replayConfirmItem.eventType}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-sans">Attempt History:</span>
                                <span className="font-semibold text-amber-700">{replayConfirmItem.attemptCount} of 10 max</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-sans">Server Eligibility:</span>
                                <span className="text-emerald-700 font-sans font-semibold">Verified Failed State</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-sky-50 border border-sky-200 rounded-lg p-2.5">
                            <HelpCircle className="size-3.5 text-sky-600 shrink-0" />
                            <span>Replay is idempotent. Server verifies row locks and tenant ownership prior to dispatch.</span>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setReplayConfirmItem(null)}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleExecuteReplay}
                                disabled={replayingEventId !== null}
                                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white shadow-2xs transition-colors"
                            >
                                {replayingEventId ? 'Replaying...' : 'Confirm Replay'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
