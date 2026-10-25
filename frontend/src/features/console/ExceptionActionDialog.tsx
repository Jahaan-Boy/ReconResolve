import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, RotateCcw, Search, X, XCircle } from 'lucide-react';
import type { ExceptionAction, ExceptionDetail } from '@/services/api/types';
import { FintechButton } from '@/components/fintech/FintechButton';

interface ExceptionActionDialogProps {
    action: ExceptionAction | null;
    exception: ExceptionDetail | null;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (action: ExceptionAction, text: string) => Promise<void>;
    isSubmitting: boolean;
    conflictMessage?: string | null;
    onReloadConflict?: () => Promise<void>;
}

export function ExceptionActionDialog({
    action,
    exception,
    isOpen,
    onClose,
    onSubmit,
    isSubmitting,
    conflictMessage,
    onReloadConflict,
}: ExceptionActionDialogProps) {
    const [note, setNote] = useState('');
    const [touched, setTouched] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Focus textarea on open
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                textareaRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    // Close on Escape unless submitting
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen || !action || !exception) {
        return null;
    }

    const currentStatus = exception.status;
    const isActionStillValid =
        (action === 'INVESTIGATE' && currentStatus === 'OPEN') ||
        (action === 'RESOLVE' && (currentStatus === 'OPEN' || currentStatus === 'INVESTIGATING')) ||
        (action === 'DISMISS' && (currentStatus === 'OPEN' || currentStatus === 'INVESTIGATING')) ||
        (action === 'REOPEN' && (currentStatus === 'INVESTIGATING' || currentStatus === 'RESOLVED' || currentStatus === 'DISMISSED'));

    const isNoteRequired = action !== 'INVESTIGATE';
    const trimmedLength = note.trim().length;
    const isTooShort = isNoteRequired && trimmedLength < 10;
    const isTooLong = trimmedLength > 1000;
    const isValid = (!isNoteRequired || !isTooShort) && !isTooLong;

    const actionConfig = {
        INVESTIGATE: {
            title: 'Investigate Exception',
            description:
                'Move this exception to INVESTIGATING status. You may record an optional investigation hypothesis or triage note.',
            label: 'Investigation note (Optional)',
            placeholder: 'Note any initial observations, suspected causes, or pending provider inquiries...',
            buttonText: 'Confirm Investigation',
            buttonVariant: 'primary' as const,
            icon: <Search className="size-4" />,
        },
        RESOLVE: {
            title: 'Resolve Exception',
            description:
                'Approve this discrepancy as resolved. Provide a detailed, auditable justification explaining why this break is reconciled or accounted for.',
            label: 'Resolution Note (Required)',
            placeholder: 'State the resolution basis (e.g. verified manual bank credit, fees written off, ledger adjustment ref #)...',
            buttonText: 'Confirm Resolution',
            buttonVariant: 'success' as const,
            icon: <CheckCircle2 className="size-4" />,
        },
        DISMISS: {
            title: 'Dismiss Exception',
            description:
                'Dismiss this exception from active workflow. The discrepancy will remain archived with this justification recorded in the immutable audit trail.',
            label: 'Dismissal Reason (Required)',
            placeholder: 'Explain why this discrepancy does not require financial action or is a duplicate/known benign variance...',
            buttonText: 'Confirm Dismissal',
            buttonVariant: 'danger' as const,
            icon: <XCircle className="size-4" />,
        },
        REOPEN: {
            title: 'Reopen Exception',
            description:
                'Reopen this exception back to OPEN status for further investigation. A mandatory justification must be recorded for audit compliance.',
            label: 'Reopen Reason (Required)',
            placeholder: 'Explain why previous resolution or dismissal is no longer valid (e.g. new chargeback received, clawback reversed)...',
            buttonText: 'Confirm Reopen',
            buttonVariant: 'primary' as const,
            icon: <RotateCcw className="size-4" />,
        },
    }[action];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!isValid || isSubmitting || !isActionStillValid) return;
        await onSubmit(action, note.trim());
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
        >
            {/* Backdrop click dismiss */}
            <div
                className="fixed inset-0"
                onClick={() => {
                    if (!isSubmitting) onClose();
                }}
            />

            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 z-10 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                            {actionConfig.icon}
                        </div>
                        <div>
                            <h3 id="dialog-title" className="text-base font-semibold text-slate-900">
                                {actionConfig.title}
                            </h3>
                            <p className="text-xs text-slate-500 font-mono">
                                Exception v{exception.version} • Current status: {exception.status}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                        aria-label="Close dialog"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Concurrency Conflict Alert */}
                {conflictMessage && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-2">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold">{conflictMessage}</p>
                                <p className="text-[11px] text-amber-800 mt-0.5">
                                    Your draft note below has been preserved. Review the updated record state before deciding whether to proceed.
                                </p>
                            </div>
                        </div>
                        {onReloadConflict && (
                            <div className="pt-1">
                                <FintechButton
                                    size="sm"
                                    variant="outline"
                                    onClick={onReloadConflict}
                                    className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 text-xs"
                                >
                                    Reload Latest State
                                </FintechButton>
                            </div>
                        )}
                    </div>
                )}

                {/* State invalid warning */}
                {!isActionStillValid && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
                        <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-semibold">Action no longer permitted: </span>
                            The exception is now <span className="font-mono font-bold">{currentStatus}</span>. Cannot execute {action} from this state.
                        </div>
                    </div>
                )}

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed">
                    {actionConfig.description}
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1.5 text-xs">
                            <label htmlFor="action-note-input" className="font-medium text-slate-700">
                                {actionConfig.label}
                            </label>
                            <span
                                className={`text-[11px] tabular-nums font-mono ${
                                    isTooLong ? 'text-rose-600 font-bold' : 'text-slate-400'
                                }`}
                            >
                                {trimmedLength} / 1000
                            </span>
                        </div>

                        <textarea
                            id="action-note-input"
                            ref={textareaRef}
                            rows={4}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onBlur={() => setTouched(true)}
                            placeholder={actionConfig.placeholder}
                            disabled={isSubmitting}
                            className={`w-full rounded-xl border p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors ${
                                touched && isTooShort
                                    ? 'border-rose-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500'
                                    : 'border-slate-200 focus:border-fin-brand focus:ring-1 focus:ring-fin-brand'
                            }`}
                        />

                        {/* Inline validation messages */}
                        {touched && isTooShort && (
                            <p className="mt-1 text-[11px] text-rose-600 font-medium">
                                Justification must be at least 10 characters (currently {trimmedLength}).
                            </p>
                        )}
                        {isTooLong && (
                            <p className="mt-1 text-[11px] text-rose-600 font-medium">
                                Exceeded maximum length of 1000 characters.
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <FintechButton
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={isSubmitting}
                            onClick={onClose}
                        >
                            Cancel
                        </FintechButton>

                        <FintechButton
                            type="submit"
                            variant={actionConfig.buttonVariant}
                            size="md"
                            loading={isSubmitting}
                            disabled={!isValid || !isActionStillValid || isSubmitting}
                            icon={actionConfig.icon}
                        >
                            {actionConfig.buttonText}
                        </FintechButton>
                    </div>
                </form>
            </div>
        </div>
    );
}
