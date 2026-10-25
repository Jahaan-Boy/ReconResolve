import type { ExceptionStatus } from '@/services/api/types';
import { cn } from '@/lib/cn';
import { AlertCircle, CheckCircle2, Clock, EyeOff } from 'lucide-react';

interface StatusBadgeProps {
    status: ExceptionStatus;
    className?: string;
    size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
    ExceptionStatus,
    { label: string; bg: string; text: string; border: string; icon: typeof AlertCircle }
> = {
    OPEN: {
        label: 'Open',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        border: 'border-amber-300/80',
        icon: AlertCircle,
    },
    INVESTIGATING: {
        label: 'Investigating',
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-300/80',
        icon: Clock,
    },
    RESOLVED: {
        label: 'Resolved',
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        border: 'border-emerald-300/80',
        icon: CheckCircle2,
    },
    DISMISSED: {
        label: 'Dismissed',
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        border: 'border-slate-300/80',
        icon: EyeOff,
    },
};

export function StatusBadge({ status, className, size = 'sm' }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
    const Icon = config.icon;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 font-medium rounded-full border',
                config.bg,
                config.text,
                config.border,
                size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
                className,
            )}
        >
            <Icon className={cn(size === 'sm' ? 'size-3' : 'size-3.5', 'shrink-0')} aria-hidden="true" />
            <span>{config.label}</span>
        </span>
    );
}
