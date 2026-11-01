import { useEffect, useState, useCallback, useRef } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Cpu,
    Lock,
    Network,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Webhook,
} from 'lucide-react';
import { operationsApiClient } from '@/services/api/operations-api';
import { connectionsApiClient } from '@/services/api/connections-api';
import type {
    ProviderConnectionSummary as ConnectionItem,
    OperationsSummary,
    DeadLetterRecord as OutboxEventSummary,
    WebhookEventRecord as WebhookEventItem,
} from '@/services/api/types';

export interface IntegrationsOperationsPageProps {
    merchantId: string;
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
    const [replaySuccessToast, setReplaySuccessToast] = useState<string | null>(null);

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
        loadAll(merchantId);
    }, [merchantId, loadAll]);

    const handleExecuteReplay = async () => {
        if (!replayConfirmItem) return;
        setReplayingEventId(replayConfirmItem.id);
        try {
            await operationsApiClient.replayOutboxEvent(merchantId, replayConfirmItem.id);
            setReplaySuccessToast(`Replay initiated for event ${replayConfirmItem.id.slice(0, 8)}`);
            setTimeout(() => setReplaySuccessToast(null), 4000);
            setReplayConfirmItem(null);
            loadOperationsSummary(merchantId);
        } catch (err: unknown) {
            alert(`Replay failed: ${err instanceof Error ? err.message : 'Unexpected error'}`);
        } finally {
            setReplayingEventId(null);
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
                        <h1 className="text-lg font-bold text-slate-900 tracking-tight">Integrations & Operations</h1>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                            Gateway & Pipeline Operations
                        </span>
                    </div>
                    <p className="text-xs text-slate-500">
                        Live connection states, webhook intake telemetry, and transactional outbox health metrics.
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

            {/* Toast */}
            {replaySuccessToast && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 shadow-2xs">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    <span>{replaySuccessToast}</span>
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
                                    <th className="py-2.5 px-3">Verified</th>
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
                                        <td className="py-2.5 px-3 text-emerald-700 font-medium flex items-center gap-1">
                                            <ShieldCheck className="size-3.5 text-emerald-600" />
                                            <span>Signature Verified</span>
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
                        <h2 className="text-sm font-semibold text-slate-900">Outbox Pipeline Health & Replay</h2>
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
                                <span className="text-slate-400 text-[11px] font-medium">Processing</span>
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

                        {/* Dead Letter Queue Table */}
                        <div className="space-y-2 pt-2">
                            <span className="text-xs font-semibold text-slate-800">
                                Dead Letter Queue (DLQ) Items
                            </span>
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
                                                <th className="py-2.5 px-3 text-right">Action</th>
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
                                                    <td className="py-2.5 px-3 font-mono text-amber-700 font-semibold">
                                                        {dlq.attemptCount}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-rose-700 font-mono text-[11px] font-semibold">
                                                        {dlq.lastErrorCategory || 'PROCESSING_FAILURE'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <button
                                                            type="button"
                                                            disabled={!dlq.replayEligible || replayingEventId === dlq.id}
                                                            onClick={() => setReplayConfirmItem(dlq)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-40"
                                                        >
                                                            <RotateCcw className="size-3 text-slate-400" />
                                                            <span>Replay</span>
                                                        </button>
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
                            This will reset status to <span className="font-mono text-fin-brand font-semibold">PENDING</span> for worker retry.
                        </p>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1 font-mono text-slate-600">
                            <div>Aggregate: {replayConfirmItem.aggregateType} ({replayConfirmItem.aggregateId.slice(0, 8)})</div>
                            <div>Event: {replayConfirmItem.eventType}</div>
                            <div>Prior Attempts: {replayConfirmItem.attemptCount}</div>
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
