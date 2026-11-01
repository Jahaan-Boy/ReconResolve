import { useState, useEffect } from 'react';
import {
    Activity,
    CheckCircle2,
    XCircle,
    Clock,
    AlertTriangle,
    RefreshCw,
    X,
    Shield,
    Zap,
} from 'lucide-react';
import {
    operationsApiClient,
    type OperationsTimelineResponse,
    type OperationsTimelineStage,
} from '@/services/api/operations-api';

export interface OperationsTimelineModalProps {
    isOpen: boolean;
    onClose: () => void;
    merchantId: string;
    identifier: string; // Event ID or Txn ID
    eventId?: string; // Optional Outbox Event ID for replay
    onReplaySuccess?: () => void;
}

export function OperationsTimelineModal({
    isOpen,
    onClose,
    merchantId,
    identifier,
    eventId,
    onReplaySuccess,
}: OperationsTimelineModalProps) {
    const [timeline, setTimeline] = useState<OperationsTimelineResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [replaying, setReplaying] = useState(false);
    const [replayBanner, setReplayBanner] = useState<{
        type: 'success' | 'warning' | 'info' | 'error';
        message: string;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || !merchantId || !identifier) return;

        let active = true;
        const loadTimeline = async () => {
            setLoading(true);
            setError(null);
            setReplayBanner(null);
            try {
                if (operationsApiClient.getEventTimeline) {
                    const data = await operationsApiClient.getEventTimeline(merchantId, identifier);
                    if (active) setTimeline(data);
                }
            } catch (err: unknown) {
                if (active) setError(err instanceof Error ? err.message : 'Could not load operations timeline');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadTimeline();
        return () => {
            active = false;
        };
    }, [isOpen, merchantId, identifier]);

    const handleReplay = async () => {
        const targetId = eventId || identifier;
        if (!targetId || replaying) return;

        setReplaying(true);
        setReplayBanner(null);
        try {
            const res = await operationsApiClient.replayOutboxEvent(merchantId, targetId);

            switch (res.outcome) {
                case 'replayed':
                    setReplayBanner({
                        type: 'success',
                        message: res.message || 'Event successfully queued for processing',
                    });
                    onReplaySuccess?.();
                    break;
                case 'already_queued':
                    setReplayBanner({
                        type: 'warning',
                        message: res.message || 'Event is already enqueued in PENDING/PROCESSING status',
                    });
                    break;
                case 'rejected_due_to_state':
                    setReplayBanner({
                        type: 'info',
                        message: res.message || 'Event was already successfully dispatched and cannot be replayed',
                    });
                    break;
                case 'attempt_ceiling_reached':
                    setReplayBanner({
                        type: 'error',
                        message: res.message || 'Maximum attempt ceiling reached (5 attempts). Manual review required.',
                    });
                    break;
                case 'unavailable':
                default:
                    setReplayBanner({
                        type: 'error',
                        message: res.message || 'Event unavailable or access denied',
                    });
                    break;
            }
        } catch (err: unknown) {
            setReplayBanner({
                type: 'error',
                message: err instanceof Error ? err.message : 'Failed to trigger replay',
            });
        } finally {
            setReplaying(false);
        }
    };

    if (!isOpen) return null;

    const getStageIcon = (status: OperationsTimelineStage['status']) => {
        switch (status) {
            case 'COMPLETED':
                return <CheckCircle2 className="size-4 text-emerald-400" />;
            case 'FAILED':
                return <XCircle className="size-4 text-rose-400" />;
            case 'PROCESSING':
                return <RefreshCw className="size-4 text-indigo-400 animate-spin" />;
            case 'PENDING':
                return <Clock className="size-4 text-amber-400" />;
            case 'NOT_REACHED':
            case 'MISSING':
            default:
                return <div className="size-3.5 rounded-full border border-slate-600 bg-slate-800" />;
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="timeline-title"
        >
            <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col text-slate-100">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                            <Activity className="size-4" />
                        </div>
                        <div>
                            <h3 id="timeline-title" className="text-sm font-semibold text-white">
                                Operations Pipeline Timeline
                            </h3>
                            <p className="text-[11px] font-mono text-slate-400">
                                Identifier: {identifier.slice(0, 16)}...
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                        title="Close"
                        aria-label="Close"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Replay Banner */}
                {replayBanner && (
                    <div
                        className={`mx-5 mt-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
                            replayBanner.type === 'success'
                                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                                : replayBanner.type === 'warning'
                                ? 'bg-amber-950/60 border-amber-800 text-amber-200'
                                : replayBanner.type === 'info'
                                ? 'bg-indigo-950/60 border-indigo-800 text-indigo-200'
                                : 'bg-rose-950/60 border-rose-800 text-rose-200'
                        }`}
                    >
                        {replayBanner.type === 'success' && <CheckCircle2 className="size-4 text-emerald-400" />}
                        {replayBanner.type === 'warning' && <AlertTriangle className="size-4 text-amber-400" />}
                        {replayBanner.type === 'error' && <XCircle className="size-4 text-rose-400" />}
                        <span>{replayBanner.message}</span>
                    </div>
                )}

                {/* Error Banner */}
                {error && (
                    <div className="mx-5 mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                        <AlertTriangle className="size-4 text-rose-400" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Stages Body */}
                <div className="p-5 flex-1 overflow-y-auto max-h-[60vh] space-y-4">
                    {loading && (
                        <div className="flex items-center justify-center py-8 text-slate-400 text-xs gap-2">
                            <RefreshCw className="size-4 animate-spin text-emerald-400" />
                            <span>Tracing webhook-to-outbox pipeline...</span>
                        </div>
                    )}

                    {timeline && !loading && (
                        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                            {timeline.stages.map((stage: OperationsTimelineStage, idx: number) => (
                                <div key={idx} className="relative">
                                    <div className="absolute -left-6 top-0 flex items-center justify-center size-5 bg-slate-900">
                                        {getStageIcon(stage.status)}
                                    </div>
                                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-semibold text-white">
                                                {idx + 1}. {stage.label}
                                            </span>
                                            <span
                                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                                    stage.status === 'COMPLETED'
                                                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                                        : stage.status === 'FAILED'
                                                        ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                                                        : stage.status === 'PROCESSING'
                                                        ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800'
                                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                                }`}
                                            >
                                                {stage.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300 mt-1">{stage.summary}</p>
                                        {stage.timestamp && (
                                            <p className="text-[10px] font-mono text-slate-500 mt-1">
                                                {new Date(stage.timestamp).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Shield className="size-3 text-slate-500" />
                        <span>Strict Tenant & Secrets Redaction Enforced</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReplay}
                            disabled={replaying}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                            {replaying ? (
                                <RefreshCw className="size-3 animate-spin" />
                            ) : (
                                <Zap className="size-3" />
                            )}
                            <span>Replay Event</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
