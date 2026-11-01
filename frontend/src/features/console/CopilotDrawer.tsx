import { useState, useEffect, useRef } from 'react';
import {
    Bot,
    Send,
    X,
    Archive,
    Plus,
    AlertCircle,
    ExternalLink,
    Shield,
    Database,
    Cpu,
    RefreshCw,
} from 'lucide-react';
import {
    copilotApiClient,
    type CopilotMessage,
    type CopilotSession,
    type StorageModeStatus,
} from '@/services/api/copilot-api';

export interface CopilotDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    merchantId: string;
    onSelectEvidence?: (type: string, id: string) => void;
    activeExceptionId?: string | null;
}

export function CopilotDrawer({
    isOpen,
    onClose,
    merchantId,
    onSelectEvidence,
    activeExceptionId,
}: CopilotDrawerProps) {
    const [storageStatus, setStorageStatus] = useState<StorageModeStatus | null>(null);
    const [sessions, setSessions] = useState<CopilotSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<CopilotMessage[]>([]);
    const [inputPrompt, setInputPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Load storage mode status & sessions on merchant change
    useEffect(() => {
        if (!isOpen || !merchantId) return;

        let active = true;
        const loadInitial = async () => {
            setLoading(true);
            setError(null);
            try {
                const [status, sessionList] = await Promise.all([
                    copilotApiClient.getStorageModeStatus(merchantId),
                    copilotApiClient.listSessions(merchantId, { limit: 10 }),
                ]);

                if (!active) return;
                setStorageStatus(status);
                setSessions(sessionList.sessions);

                if (sessionList.sessions.length > 0) {
                    setActiveSessionId(sessionList.sessions[0].id);
                } else {
                    // Create first session automatically
                    const newSession = await copilotApiClient.createSession(
                        merchantId,
                        'Initial Investigation',
                    );
                    if (!active) return;
                    setSessions([newSession]);
                    setActiveSessionId(newSession.id);
                }
            } catch (err: unknown) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Failed to initialize Copilot sessions');
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        loadInitial();
        return () => {
            active = false;
        };
    }, [isOpen, merchantId]);

    // Load messages when active session changes
    useEffect(() => {
        if (!activeSessionId || !merchantId) {
            setMessages([]);
            return;
        }

        let active = true;
        const loadTranscript = async () => {
            try {
                const res = await copilotApiClient.listMessages(merchantId, activeSessionId);
                if (active) {
                    setMessages(res.messages);
                    setTimeout(scrollToBottom, 50);
                }
            } catch (err: unknown) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Failed to load conversation history');
                }
            }
        };

        loadTranscript();
        return () => {
            active = false;
        };
    }, [activeSessionId, merchantId]);

    const handleCreateSession = async () => {
        try {
            setLoading(true);
            const newSession = await copilotApiClient.createSession(merchantId, 'New Investigation');
            setSessions((prev) => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            setMessages([]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not create new session');
        } finally {
            setLoading(false);
        }
    };

    const handleArchiveSession = async () => {
        if (!activeSessionId) return;
        try {
            const updated = await copilotApiClient.archiveSession(merchantId, activeSessionId);
            setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not archive session');
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = inputPrompt.trim();
        if (!text || !activeSessionId || sending) return;

        setInputPrompt('');
        setSending(true);
        setError(null);

        try {
            const { userMessage, assistantMessage } = await copilotApiClient.sendMessage(
                merchantId,
                activeSessionId,
                text,
            );

            setMessages((prev) => [...prev, userMessage, assistantMessage]);
            setTimeout(scrollToBottom, 50);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate response');
        } finally {
            setSending(false);
        }
    };

    const handleQuickExplainException = () => {
        if (!activeExceptionId) return;
        setInputPrompt(`Please explain exception break ${activeExceptionId} and verify both ledger sides.`);
    };

    if (!isOpen) return null;

    const currentSession = sessions.find((s) => s.id === activeSessionId);
    const isArchived = currentSession?.status === 'ARCHIVED';

    return (
        <aside
            className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out text-slate-100"
            role="dialog"
            aria-label="FlowOps Copilot"
        >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                        <Bot className="size-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-white">FlowOps Copilot</h2>
                            {storageStatus && (
                                <span
                                    className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                        storageStatus.mode === 'postgres'
                                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                            : 'bg-amber-950/60 text-amber-300 border-amber-800'
                                    }`}
                                    title={storageStatus.warning || 'Storage durability mode'}
                                >
                                    {storageStatus.mode === 'postgres' ? (
                                        <Database className="size-2.5" />
                                    ) : (
                                        <Cpu className="size-2.5" />
                                    )}
                                    {storageStatus.mode === 'postgres' ? 'PostgreSQL' : 'In-Memory (Ephemeral)'}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400">Read-Only Financial Assistant</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handleCreateSession}
                        disabled={loading}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="New Session"
                        aria-label="New Session"
                    >
                        <Plus className="size-4" />
                    </button>
                    {currentSession && !isArchived && (
                        <button
                            type="button"
                            onClick={handleArchiveSession}
                            disabled={loading}
                            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Archive Session"
                            aria-label="Archive Session"
                        >
                            <Archive className="size-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Close Drawer"
                        aria-label="Close Drawer"
                    >
                        <X className="size-4" />
                    </button>
                </div>
            </div>

            {/* Session Selector Bar */}
            {sessions.length > 1 && (
                <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-2 overflow-x-auto text-xs">
                    <span className="text-[10px] uppercase font-mono text-slate-500">Sessions:</span>
                    {sessions.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setActiveSessionId(s.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                                s.id === activeSessionId
                                    ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40'
                                    : 'text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            {s.title}
                            {s.status === 'ARCHIVED' && (
                                <span className="ml-1 text-[9px] text-amber-400 font-mono">[ARCHIVED]</span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Storage Mode Notice Banner (when in Memory mode) */}
            {storageStatus?.mode === 'in-memory' && (
                <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-start gap-2 text-xs text-amber-200">
                    <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold">Runtime In-Memory Storage Active:</span> Conversations are not persisted across server restarts.
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="mx-4 mt-3 p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 flex items-center justify-between text-xs text-rose-200">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 text-rose-400" />
                        <span>{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setError(null)}
                        className="text-rose-400 hover:text-white"
                    >
                        <X className="size-3" />
                    </button>
                </div>
            )}

            {/* Quick Context Action */}
            {activeExceptionId && !isArchived && (
                <div className="px-4 pt-3">
                    <button
                        type="button"
                        onClick={handleQuickExplainException}
                        className="w-full py-1.5 px-3 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/60 border border-indigo-800/60 text-xs text-indigo-300 font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                        <Bot className="size-3.5" />
                        <span>Explain active break ({activeExceptionId.slice(0, 8)}...)</span>
                    </button>
                </div>
            )}

            {/* Message Transcript */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
                {messages.length === 0 && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                        <Bot className="size-8 text-slate-600 mb-2" />
                        <p className="font-semibold text-slate-400">Ask Copilot About Payment Exceptions</p>
                        <p className="text-[11px] mt-1 max-w-xs">
                            Inquire about break root causes, fee discrepancies, run status, or settlement counterparts.
                        </p>
                    </div>
                )}

                {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    const payload = msg.answerPayload;

                    return (
                        <div
                            key={msg.id}
                            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                        >
                            <div
                                className={`max-w-[90%] rounded-xl p-3.5 shadow-xs leading-relaxed ${
                                    isUser
                                        ? 'bg-indigo-600 text-white rounded-br-xs'
                                        : 'bg-slate-800/90 border border-slate-700/80 text-slate-200 rounded-bl-xs'
                                }`}
                            >
                                <div className="whitespace-pre-wrap">{msg.content}</div>

                                {/* Structured Facts & Evidence (Assistant only) */}
                                {payload && (
                                    <div className="mt-3 pt-2.5 border-t border-slate-700/60 space-y-2 text-[11px]">
                                        {/* Evidence References */}
                                        {payload.evidenceRefs && payload.evidenceRefs.length > 0 && (
                                            <div>
                                                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                                                    Verified Evidence:
                                                </span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {payload.evidenceRefs.map((ref, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => onSelectEvidence?.(ref.type, ref.id)}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300 hover:text-white hover:border-indigo-500 transition-colors"
                                                            title={`View ${ref.type}:${ref.id}`}
                                                        >
                                                            <ExternalLink className="size-2.5" />
                                                            <span className="font-mono text-[10px]">{ref.label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Read-Only Notice Badge */}
                                        {payload.isReadOnlyNotice && (
                                            <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-medium bg-amber-950/30 p-1.5 rounded border border-amber-900/40">
                                                <Shield className="size-3" />
                                                <span>Read-only policy enforced: no money movement allowed.</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <span className="text-[10px] font-mono text-slate-500 mt-1 px-1">
                                {new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                            </span>
                        </div>
                    );
                })}

                {sending && (
                    <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                        <RefreshCw className="size-3.5 animate-spin text-indigo-400" />
                        <span>Copilot analyzing ledger records...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/80">
                {isArchived ? (
                    <div className="p-2 text-center text-xs text-slate-400 bg-slate-900 rounded-lg border border-slate-800">
                        This session is archived. Create a new session to ask questions.
                    </div>
                ) : (
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={inputPrompt}
                            onChange={(e) => setInputPrompt(e.target.value)}
                            placeholder="Ask Copilot about exceptions, runs, or breaks..."
                            disabled={sending}
                            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:outline-none focus:border-indigo-500 text-xs text-white placeholder-slate-500"
                        />
                        <button
                            type="submit"
                            disabled={!inputPrompt.trim() || sending}
                            className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:pointer-events-none transition-colors"
                            title="Send prompt"
                            aria-label="Send prompt"
                        >
                            <Send className="size-3.5" />
                        </button>
                    </form>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
                    <span>Press Enter to send</span>
                    <span className="flex items-center gap-1">
                        <Shield className="size-2.5 text-slate-400" />
                        Read-only • No funds mutation
                    </span>
                </div>
            </div>
        </aside>
    );
}
