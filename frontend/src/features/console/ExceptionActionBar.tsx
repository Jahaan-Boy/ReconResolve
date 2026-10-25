import { CheckCircle2, RotateCcw, Search, XCircle } from 'lucide-react';
import type { ExceptionStatus, ExceptionAction } from '@/services/api/types';
import { FintechButton } from '@/components/fintech/FintechButton';

interface ExceptionActionBarProps {
    status: ExceptionStatus;
    disabled?: boolean;
    onTriggerAction: (action: ExceptionAction) => void;
}

export function ExceptionActionBar({
    status,
    disabled = false,
    onTriggerAction,
}: ExceptionActionBarProps) {
    const canInvestigate = status === 'OPEN';
    const canResolve = status === 'OPEN' || status === 'INVESTIGATING';
    const canDismiss = status === 'OPEN' || status === 'INVESTIGATING';
    const canReopen = status === 'INVESTIGATING' || status === 'RESOLVED' || status === 'DISMISSED';

    return (
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Exception lifecycle actions">
            {canInvestigate && (
                <FintechButton
                    variant="primary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onTriggerAction('INVESTIGATE')}
                    icon={<Search className="size-3.5" />}
                    title="Mark this exception as under active investigation"
                >
                    Investigate
                </FintechButton>
            )}

            {canResolve && (
                <FintechButton
                    variant="success"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onTriggerAction('RESOLVE')}
                    icon={<CheckCircle2 className="size-3.5" />}
                    title="Approve auditable reconciliation resolution"
                >
                    Resolve
                </FintechButton>
            )}

            {canDismiss && (
                <FintechButton
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onTriggerAction('DISMISS')}
                    icon={<XCircle className="size-3.5 text-slate-500" />}
                    className="hover:text-rose-700 hover:border-rose-300"
                    title="Dismiss discrepancy with recorded justification"
                >
                    Dismiss
                </FintechButton>
            )}

            {canReopen && (
                <FintechButton
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onTriggerAction('REOPEN')}
                    icon={<RotateCcw className="size-3.5" />}
                    title="Reopen exception back to OPEN status"
                >
                    Reopen
                </FintechButton>
            )}
        </div>
    );
}
