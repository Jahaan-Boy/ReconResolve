import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export function Badge({ className, ...props }: ComponentPropsWithoutRef<'span'>) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-steel-700 ring-1 ring-inset ring-steel-200',
                className,
            )}
            {...props}
        />
    );
}