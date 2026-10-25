import type { ExceptionType } from '@/services/api/types';
import { cn } from '@/lib/cn';
import { ArrowLeftRight, HelpCircle, AlertOctagon, FileMinus, Search } from 'lucide-react';

interface ExceptionTypeBadgeProps {
    type: ExceptionType;
    className?: string;
    showIcon?: boolean;
}

const TYPE_CONFIG: Record<
    ExceptionType,
    { label: string; icon: typeof ArrowLeftRight; bg: string; text: string; border: string }
> = {
    AMOUNT_MISMATCH: {
        label: 'Amount Mismatch',
        icon: ArrowLeftRight,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
    },
    STATUS_DISCREPANCY: {
        label: 'Status Discrepancy',
        icon: AlertOctagon,
        bg: 'bg-orange-50',
        text: 'text-orange-800',
        border: 'border-orange-200',
    },
    MISSING_PROVIDER_COUNTERPART: {
        label: 'Missing Provider Capture',
        icon: FileMinus,
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
    },
    MISSING_MERCHANT_COUNTERPART: {
        label: 'Missing Merchant Order',
        icon: HelpCircle,
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-200',
    },
    AMBIGUOUS_MATCH: {
        label: 'Ambiguous Match',
        icon: Search,
        bg: 'bg-sky-50',
        text: 'text-sky-800',
        border: 'border-sky-200',
    },
};

export function ExceptionTypeBadge({ type, className, showIcon = true }: ExceptionTypeBadgeProps) {
    const config = TYPE_CONFIG[type] ?? {
        label: type,
        icon: AlertOctagon,
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
    };
    const Icon = config.icon;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border tabular-nums',
                config.bg,
                config.text,
                config.border,
                className,
            )}
            title={config.label}
        >
            {showIcon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
            <span className="truncate">{config.label}</span>
        </span>
    );
}
