import { useState, useRef, useEffect, useCallback } from 'react';
import {
    ArrowUpRight,
    BrainCircuit,
    CheckCircle2,
    HelpCircle,
    Lightbulb,
    RotateCcw,
    Send,
    Shield,
    Sparkles,
    AlertCircle,
} from 'lucide-react';
import {
    copilotApiClient,
    type CopilotAskResult,
    type CopilotEvidenceRef,
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
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageCounterRef = useRef(0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, loading]);

    // Reset conversation on merchant switch to avoid multi-tenant context bleeding
    useEffect(() => {
        setMessages([]);
    }, [merchantId]);

    const handleSubmitQuestion = useCallback(
        async (questionText: string) => {
            const trimmed = questionText.trim();
            if (!trimmed || loading) return;

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
                const result = await copilotApiClient.askQuestion(merchantId, {
                    question: trimmed,
                });

                messageCounterRef.current += 1;
                const copSeq = messageCounterRef.current;
                const copilotMsg: ChatMessage = {
                    id: `cop-${copSeq}-${Date.now()}`,
                    sender: 'copilot',
                    result,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setMessages((prev) => [...prev, copilotMsg]);
            } catch (err: unknown) {
                messageCounterRef.current += 1;
                const errSeq = messageCounterRef.current;
                const errorMsg: ChatMessage = {
                    id: `err-${errSeq}-${Date.now()}`,
                    sender: 'copilot',
                    isError: true,
                    errorMessage: err instanceof Error ? err.message : 'Failed to query Copilot analytics engine',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setMessages((prev) => [...prev, errorMsg]);
            } finally {
                setLoading(false);
            }
        },
        [merchantId, loading],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmitQuestion(inputValue);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50/70 text-slate-900 font-sans">
            {/* Copilot Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                        <Sparkles className="size-4.5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-bold text-slate-900 tracking-tight">FlowOps Copilot</h1>
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                                Read-Only Analytics Assistant
                            </span>
                        </div>
                        <p className="text-xs text-slate-500">
                            Grounds answers strictly in merchant database records. Cannot perform financial actions.
                        </p>
                    </div>
                </div>

                {messages.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setMessages([])}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors"
                        title="Clear current in-memory chat session"
                    >
                        <RotateCcw className="size-3 text-slate-400" />
                        <span>Clear Transcript</span>
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
                                    {msg.sender === 'user' ? 'You' : 'FlowOps Copilot'} • {msg.timestamp}
                                </span>

                                {msg.sender === 'user' ? (
                                    <div className="rounded-2xl rounded-tr-sm bg-fin-brand px-4 py-2.5 text-xs text-white font-medium max-w-lg shadow-xs">
                                        {msg.text}
                                    </div>
                                ) : msg.isError ? (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2.5 max-w-lg shadow-2xs">
                                        <AlertCircle className="size-4 shrink-0 text-rose-600" />
                                        <span>{msg.errorMessage}</span>
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

                                        {/* Section: Evidence References */}
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
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono transition-colors shadow-2xs"
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
                                <span>Grounding question in database records...</span>
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
                        placeholder="Ask a question about exceptions, runs, match rates, or duplicate candidates..."
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
                    <span>Read-only assistant • Currency figures never combined</span>
                </div>
            </div>
        </div>
    );
}
