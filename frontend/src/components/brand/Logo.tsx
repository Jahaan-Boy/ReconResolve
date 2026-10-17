import { cn } from '@/lib/cn';
import { SITE } from '@/config/site';

export function Logo({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2.5', className)}>
            <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
                <rect width="32" height="32" rx="8" className="fill-accent-600" />
                <path
                    d="M8 21c4 0 4-10 8-10s4 10 8 10"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
            <span className="text-lg font-semibold tracking-tight text-steel-900">{SITE.name}</span>
        </span>
    );
}