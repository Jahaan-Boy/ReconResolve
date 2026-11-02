import { useState, useRef, useEffect, useCallback } from 'react';
import {
    ArrowUpRight,
    BrainCircuit,
    CheckCircle2,
    HelpCircle,
    Lightbulb,
    MessageSquare,
    Plus,
    RotateCcw,
    Send,
    Shield,
    Sparkles,
    AlertCircle,
    Clock,
    Database,
} from 'lucide-react';
import {
    copilotApiClient,
    type CopilotAskResult,
    type CopilotEvidenceRef,
    type CopilotSession,
} from '@/services/api/copilot-api';

export interface ReconciliationCopilotPageProps {
    merchantId: string;
    onNavigateToException?: (exceptionId: string) => void;
    onNavigateToRun?: (runId: string) => void;
}

interface ChatMessage {
    id: string;
    sender: 'user' | 'copilot';
    text?: string;
    result?: CopilotAskResult;
    isError?: boolean;
    errorMessage?: string;
    timestamp: string;
}

const DEFAULT_SUGGESTIONS = [
    'What are the largest open discrepancies by exposure?',
    'Why did the most recent reconciliation run produce breaks?',
    'Summarize exceptions involving duplicate candidates or split authorizations',
    'How many reconciliation runs have been performed historically?',
];

export function ReconciliationCopilotPage({
    merchantId,
    onNavigateToException,
    onNavigateToRun,
}: ReconciliationCopilotPageProps) {
    // Sessions state
    const [sessions, setSessions] = useState<CopilotSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [sessionsError, setSessionsError] = useState<string | null>(null);
    const [storageMode, setStorageMode] = useState<string>('postgres');

    // Chat messages state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageCounterRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    // Load sessions when merchant changes or on mount
    const loadSessions = useCallback(async (targetMerchantId: string) => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setLoadingSessions(true);
        setSessionsError(null);

        try {
            const res = await copilotApiClient.listSessions(targetMerchantId, 30, undefined, controller.signal);
            setSessions(res.items || []);
            if (res.storageMode) {
                setStorageMode(res.storageMode);
            }
            // If sessions exist and none selected, auto-select the latest
            if (res.items && res.items.length > 0) {
                setActiveSessionId(res.items[0].id);
            } else {
                setActiveSessionId(null);
                setMessages([]);
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return;
            setSessionsError(err instanceof Error ? err.message : 'Failed to load conversations');
        } finally {
            setLoadingSessions(false);
        }
    }, []);

    // Reset and reload when merchantId changes (strict multi-tenant isolation)
    useEffect(() => {
        setMessages([]);
        setActiveSessionId(null);
        setInputValue('');
        setLastFailedQuestion(null);
        loadSessions(merchantId);

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [merchantId, loadSessions]);

    // Load messages when activeSessionId changes
    const loadSessionMessages = useCallback(
        async (targetMerchantId: string, sessionId: string) => {
            setLoading(true);
            try {
                const res = await copilotApiClient.listMessages(targetMerchantId, sessionId, 50);
                const restored: ChatMessage[] = res.items.map((m) => {
                    const time = new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    if (m.role === 'user') {
                        return {
                            id: m.id,
                            sender: 'user',
                            text: m.content,
                            timestamp: time,
                        };
                    }
                    return {
                        id: m.id,
                        sender: 'copilot',
                        result: m.answerPayload,
                        timestamp: time,
                    };
                });
                setMessages(restored);
            } catch (err: unknown) {
                console.warn('[Copilot] Could not restore session transcript:', err);
            } finally {
                setLoading(false);
            }
        },
        [],
    );

    useEffect(() => {
        if (activeSessionId) {
            loadSessionMessages(merchantId, activeSessionId);
        } else {
            setMessages([]);
        }
    }, [activeSessionId, merchantId, loadSessionMessages]);

    // Create a new conversation
    const handleNewConversation = async () => {
        try {
            const newSession = await copilotApiClient.createSession(merchantId, 'New Conversation');
            setSessions((prev) => [newSession, ...prev]);
            setActiveSessionId(newSession.id);
            setMessages([]);
        } catch (err: unknown) {
            console.error('[Copilot] Failed to create session:', err);
        }
    };

    const handleSubmitQuestion = useCallback(
        async (questionText: string) => {
            const trimmed = questionText.trim();
            if (!trimmed || loading) return;

            setLastFailedQuestion(null);

            // Ensure an active session exists
            let currentSessionId = activeSessionId;
            if (!currentSessionId) {
                try {
                    const initialTitle = trimmed.slice(0, 40);
                    const newSession = await copilotApiClient.createSession(merchantId, initialTitle);
                    setSessions((prev) => [newSession, ...prev]);
                    currentSessionId = newSession.id;
                    setActiveSessionId(newSession.id);
                } catch {
                    // Fall back to stateless if session creation fails
                }
            }

            messageCounterRef.current += 1;
            const seq = messageCounterRef.current;
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const userMsg: ChatMessage = {
                id: `usr-${seq}-${now.getTime()}`,
                sender: 'user',
                text: trimmed,
                timestamp: timeStr,
            };

            setMessages((prev) => [...prev, userMsg]);
            setInputValue('');
            setLoading(true);

            try {
                if (currentSessionId) {
                    const res = await copilotApiClient.postSessionMessage(merchantId, currentSessionId, {
                        question: trimmed,
                    });

                    messageCounterRef.current += 1;
                    const copilotMsg: ChatMessage = {
                        id: res.assistantMessage.id,
                        sender: 'copilot',
                        result: res.result,
                        timestamp: new Date(res.assistantMessage.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                    };
                    setMessages((prev) => [...prev, copilotMsg]);

                    // Update session title in sidebar if it was updated
                    setSessions((prev) =>
                        prev.map((s) =>
                            s.id === currentSessionId
                                ? { ...s, title: s.title === 'New Conversation' ? trimmed.slice(0, 40) : s.title, lastMessageAt: new Date().toISOString() }
                                : s,
                        ),
                    );
                } else {
                    // Legacy fallback
                    const result = await copilotApiClient.askQuestion(merchantId, { question: trimmed });
                    const copilotMsg: ChatMessage = {
                        id: `cop-${Date.now()}`,
                        sender: 'copilot',
                        result,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    };
                    setMessages((prev) => [...prev, copilotMsg]);
                }
            } catch (err: unknown) {
                setLastFailedQuestion(trimmed);
                messageCounterRef.current += 1;
                const errSeq = messageCounterRef.current;
                const errorMsg: ChatMessage = {
                    id: `err-${errSeq}-${Date.now()}`,
                    sender: 'copilot',
                    isError: true,
                    errorMessage:
                        err instanceof Error ? err.message : 'Failed to query Copilot analytics engine',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setMessages((prev) => [...prev, errorMsg]);
            } finally {
                setLoading(false);
            }
        },
        [merchantId, activeSessionId, loading],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmitQuestion(inputValue);
        }
    };

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    return (
        <div className="flex h-full min-h-0 bg-slate-50/70 text-slate-900 font-sans overflow-hidden">
            {/* Left Sidebar: Durable Conversations */}
            <aside className="w-64 border-r border-slate-200/90 bg-white/90 flex flex-col shrink-0">
                <div className="p-3 border-b border-slate-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="size-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-900 tracking-tight">Conversations</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleNewConversation}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold border border-indigo-200 transition-colors shadow-2xs"
                        title="Start a new conversation"
                    >
                        <Plus className="size-3" />
                        <span>New</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {loadingSessions ? (
                        <div className="flex items-center justify-center p-6 text-xs text-slate-400 gap-2">
                            <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <span>Loading sessions...</span>
                        </div>
                    ) : sessionsError ? (
                        <div className="p-3 text-center space-y-2">
                            <p className="text-[11px] text-rose-600">{sessionsError}</p>
                            <button
                                type="button"
                                onClick={() => loadSessions(merchantId)}
                                className="text-[11px] font-semibold text-indigo-600 hover:underline"
                            >
                                Retry
                            </button>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center p-6 space-y-1 text-slate-400">
                            <Clock className="size-5 mx-auto text-slate-300" />
                            <p className="text-xs font-medium">No previous sessions</p>
                            <p className="text-[10px]">Start your first conversation</p>
                        </div>
                    ) : (
                        sessions.map((s) => {
                            const isSelected = s.id === activeSessionId;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setActiveSessionId(s.id)}
                                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex flex-col gap-0.5 border ${
                                        isSelected
                                            ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-semibold shadow-2xs'
                                            : 'border-transparent hover:bg-slate-100/70 text-slate-700 hover:text-slate-900'
                                    }`}
                                >
                                    <span className="truncate">{s.title || 'Conversation'}</span>
                                    <span className="text-[10px] text-slate-400 font-mono font-normal">
                                        {new Date(s.lastMessageAt || s.createdAt).toLocaleDateString([], {
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="p-2.5 border-t border-slate-200/80 bg-slate-50/50 flex flex-col gap-1 text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-500">
                        <Database className="size-3 text-slate-400 shrink-0" />
                        <span className="font-medium">Persistence:</span>
                        {storageMode === 'postgres' || storageMode === 'postgresql' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono font-medium border border-emerald-200">
                                PostgreSQL (Durable)
                            </span>
                        ) : (
                            <span
                                className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono font-medium border border-amber-200"
                                title="In-memory session storage active — data is runtime-only and will be lost on backend restart."
                            >
                                In-Memory (Runtime Only)
                            </span>
                        )}
                    </div>
                    {storageMode !== 'postgres' && storageMode !== 'postgresql' && (
                        <span className="text-[9px] text-amber-600 leading-tight">
                            Transcripts are memory-backed and will reset on server restart.
                        </span>
                    )}
                </div>
            </aside>

            {/* Right Main Chat Area */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Copilot Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                            <Sparkles className="size-4.5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                                    {activeSession?.title || 'FlowOps Copilot'}
                                </h1>
                                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                                    Bounded Bounded Turn Engine
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Grounds answers strictly in fresh merchant database records. Maintains 6-turn bounded follow-up context.
                            </p>
                        </div>
                    </div>

                    {messages.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setMessages([])}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors"
                            title="Clear current view"
                        >
                            <RotateCcw className="size-3 text-slate-400" />
                            <span>Clear View</span>
                        </button>
                    )}
                </div>

                {/* Conversation Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                    {messages.length === 0 ? (
                        <div className="max-w-2xl mx-auto py-12 flex flex-col items-center text-center space-y-6">
                            <div className="size-14 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-sm">
                                <BrainCircuit className="size-7" />
                            </div>
                            <div className="space-y-1.5">
                                <h2 className="text-base font-semibold text-slate-900">
                                    Ask Questions About Your Reconciliation Dataset
                                </h2>
                                <p className="text-xs text-slate-500 max-w-md">
                                    Inquire about largest discrepancies, run variations, missing counterpart records, and pattern distributions. Answers separate facts, interpretations, and unknowns.
                                </p>
                            </div>

                            {/* Suggested Chips */}
                            <div className="w-full space-y-2.5">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Suggested questions
                                </span>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {DEFAULT_SUGGESTIONS.map((suggestion, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSubmitQuestion(suggestion)}
                                            className="text-left text-xs bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl transition-all shadow-2xs flex items-center gap-2 group"
                                        >
                                            <span>{suggestion}</span>
                                            <ArrowUpRight className="size-3 text-slate-400 group-hover:text-indigo-600 shrink-0 transition-colors" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col ${
                                        msg.sender === 'user' ? 'items-end' : 'items-start'
                                    }`}
                                >
                                    <span className="text-[10px] text-slate-400 font-mono mb-1 px-1">
                                        {msg.sender === 'user' ? 'You' : 'FlowOps Copilot'} â€¢ {msg.timestamp}
                                    </span>

                                    {msg.sender === 'user' ? (
                                        <div className="rounded-2xl rounded-tr-sm bg-fin-brand px-4 py-2.5 text-xs text-white font-medium max-w-lg shadow-xs">
                                            {msg.text}
                                        </div>
                                    ) : msg.isError ? (
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between gap-3 max-w-lg shadow-2xs">
                                            <div className="flex items-center gap-2.5">
                                                <AlertCircle className="size-4 shrink-0 text-rose-600" />
                                                <span>{msg.errorMessage}</span>
                                            </div>
                                            {lastFailedQuestion && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSubmitQuestion(lastFailedQuestion)}
                                                    className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-900 text-[11px] font-semibold transition-colors shrink-0"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    ) : msg.result ? (
                                        <div className="w-full rounded-2xl rounded-tl-sm border border-slate-200/90 bg-white p-5 space-y-4 shadow-2xs text-xs text-slate-800">
                                            {/* Main Answer Header */}
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                                        {msg.result.intent}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        Window: {msg.result.queryWindow}
                                                    </span>
                                                    {msg.result.storageMode && (
                                                        <span className="text-[9px] text-slate-400 font-mono">
                                                            [{msg.result.storageMode}]
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-900 font-semibold leading-relaxed">
                                                    {msg.result.summary}
                                                </p>
                                                <p className="text-xs text-slate-600 leading-normal">
                                                    {msg.result.answer}
                                                </p>
                                            </div>

                                            {/* Section: Observed Facts */}
                                            {msg.result.observedFacts.length > 0 && (
                                                <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 p-3.5 space-y-2">
                                                    <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs">
                                                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                                                        <span>Observed Facts (Database Grounded)</span>
                                                    </div>
                                                    <ul className="space-y-1 text-xs text-slate-700">
                                                        {msg.result.observedFacts.map((fact: string, idx: number) => (
                                                            <li key={idx} className="flex items-start gap-2">
                                                                <span className="size-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                                                                <span>{fact}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Section: Interpretations */}
                                            {msg.result.interpretations.length > 0 && (
                                                <div className="rounded-xl bg-amber-50/50 border border-amber-100 p-3.5 space-y-2">
                                                    <div className="flex items-center gap-1.5 text-amber-800 font-semibold text-xs">
                                                        <Lightbulb className="size-3.5 text-amber-600" />
                                                        <span>Interpretations & Advisory Analysis</span>
                                                    </div>
                                                    <ul className="space-y-1 text-xs text-slate-700">
                                                        {msg.result.interpretations.map((interp: string, idx: number) => (
                                                            <li key={idx} className="flex items-start gap-2">
                                                                <span className="size-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                                                                <span>{interp}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Section: Unknowns */}
                                            {msg.result.unknowns.length > 0 && (
                                                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
                                                    <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                                                        <HelpCircle className="size-3.5 text-slate-500" />
                                                        <span>Information Gaps & Unknowns</span>
                                                    </div>
                                                    <ul className="space-y-1 text-xs text-slate-600">
                                                        {msg.result.unknowns.map((unknownItem: string, idx: number) => (
                                                            <li key={idx} className="flex items-start gap-2">
                                                                <span className="size-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                                                                <span>{unknownItem}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Section: Evidence References with cross-surface deep links */}
                                            {msg.result.evidenceRefs.length > 0 && (
                                                <div className="space-y-1.5 pt-1">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                        Evidence Grounding Links:
                                                    </span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {msg.result.evidenceRefs.map((ref: CopilotEvidenceRef) => (
                                                            <button
                                                                key={ref.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (ref.type === 'exception' && onNavigateToException) {
                                                                        onNavigateToException(ref.id);
                                                                    } else if (ref.type === 'run' && onNavigateToRun) {
                                                                        onNavigateToRun(ref.id);
                                                                    }
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-900 text-xs font-mono transition-colors shadow-2xs"
                                                                title={ref.details || ref.label}
                                                            >
                                                                <span>{ref.label}</span>
                                                                <ArrowUpRight className="size-3 text-fin-brand" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Section: Suggested Actions */}
                                            {msg.result.suggestedActions.length > 0 && (
                                                <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
                                                    <Shield className="size-3.5 text-indigo-600 shrink-0" />
                                                    <span>
                                                        Recommended Next Step: {msg.result.suggestedActions[0]}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ))}

                            {loading && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 p-2">
                                    <div className="w-4 h-4 border-2 border-fin-brand border-t-transparent rounded-full animate-spin" />
                                    <span>Grounding question in fresh database records...</span>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Question Composer */}
                <div className="p-4 border-t border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0">
                    <div className="max-w-3xl mx-auto flex items-center gap-2 bg-white border border-slate-300 rounded-xl px-3.5 py-2 focus-within:border-fin-brand focus-within:ring-2 focus-within:ring-fin-brand/10 transition-all shadow-2xs">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask a question about exceptions, runs, match rates, or follow up on prior answers..."
                            disabled={loading}
                            className="flex-1 bg-transparent text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onClick={() => handleSubmitQuestion(inputValue)}
                            disabled={!inputValue.trim() || loading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fin-brand hover:bg-fin-brand-hover text-xs font-semibold text-white transition-colors disabled:opacity-40 shadow-2xs"
                        >
                            <span>Ask</span>
                            <Send className="size-3" />
                        </button>
                    </div>
                    <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between text-[10px] text-slate-400 px-1">
                        <span>Press Enter to ask</span>
                        <span>Read-only assistant â€¢ Context bounded to 6 recent turns</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
