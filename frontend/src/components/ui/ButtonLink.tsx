import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'onDark';
type Size = 'md' | 'lg';

const base =
    'group inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600';

const variants: Record<Variant, string> = {
    primary:
        'bg-accent-600 text-white shadow-sm hover:bg-accent-700 hover:shadow-lg hover:shadow-accent-600/30',
    secondary:
        'bg-white text-steel-800 ring-1 ring-inset ring-steel-300 hover:bg-steel-50 hover:ring-steel-400',
    onDark: 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15',
};

const sizes: Record<Size, string> = {
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
};

interface ButtonLinkProps extends ComponentPropsWithoutRef<'a'> {
    variant?: Variant;
    size?: Size;
}

export function ButtonLink({
    variant = 'primary',
    size = 'md',
    className,
    ...props
}: ButtonLinkProps) {
    return <a className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}