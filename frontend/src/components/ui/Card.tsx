import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            className={cn('rounded-2xl bg-white p-6 shadow-xs ring-1 ring-steel-200', className)}
            {...props}
        />
    );
}