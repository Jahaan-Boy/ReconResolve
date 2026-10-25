import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FintechButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost' | 'outline';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: ReactNode;
}

export const FintechButton = forwardRef<HTMLButtonElement, FintechButtonProps>(
    (
        {
            children,
            className,
            variant = 'secondary',
            size = 'md',
            loading = false,
            disabled,
            icon,
            ...props
        },
        ref,
    ) => {
        const baseStyles =
            'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer';

        const sizeStyles = {
            sm: 'h-8 px-2.5 text-xs gap-1.5',
            md: 'h-9 px-3.5 text-sm gap-2',
            lg: 'h-10 px-4 text-base gap-2',
        }[size];

        const variantStyles = {
            primary:
                'bg-fin-brand hover:bg-fin-brand-hover text-white shadow-xs focus-visible:ring-fin-brand',
            secondary:
                'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-xs focus-visible:ring-slate-400',
            success:
                'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs focus-visible:ring-emerald-600',
            danger:
                'bg-rose-600 hover:bg-rose-700 text-white shadow-xs focus-visible:ring-rose-600',
            ghost:
                'hover:bg-slate-100 text-slate-700 focus-visible:ring-slate-400',
            outline:
                'border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400',
        }[variant];

        return (
            <button
                ref={ref}
                disabled={disabled || loading}
                className={cn(baseStyles, sizeStyles, variantStyles, className)}
                {...props}
            >
                {loading ? <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" /> : icon}
                {children}
            </button>
        );
    },
);

FintechButton.displayName = 'FintechButton';
