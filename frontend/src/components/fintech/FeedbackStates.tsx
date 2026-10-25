import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { FintechButton } from './FintechButton';

interface EmptyStateProps {
    title: string;
    description: string;
    action?: ReactNode;
    icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="size-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                {icon || <Inbox className="size-6" aria-hidden="true" />}
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4">{description}</p>
            {action}
        </div>
    );
}

interface ErrorStateProps {
    title?: string;
    message: string;
    onRetry?: () => void;
}

export function ErrorState({
    title = 'Failed to load exceptions',
    message,
    onRetry,
}: ErrorStateProps) {
    return (
        <div className="p-6 rounded-xl border border-rose-200 bg-rose-50/60 flex flex-col items-center text-center">
            <AlertCircle className="size-8 text-rose-600 mb-2" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-rose-900 mb-1">{title}</h3>
            <p className="text-xs text-rose-700 max-w-md mb-4">{message}</p>
            {onRetry && (
                <FintechButton
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    icon={<RefreshCw className="size-3.5" />}
                    className="bg-white border-rose-300 text-rose-800 hover:bg-rose-50"
                >
                    Retry Request
                </FintechButton>
            )}
        </div>
    );
}
