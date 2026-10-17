import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'dark';

const TONES: Record<Tone, string> = {
    neutral: 'bg-steel-100 text-steel-700',
    accent: 'bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100',
    dark: 'bg-white/5 text-accent-300 ring-1 ring-inset ring-white/10',
};

interface IconTileProps {
    icon: LucideIcon;
    tone?: Tone;
    className?: string;
}

export function IconTile({ icon: Icon, tone = 'neutral', className }: IconTileProps) {
    return (
        <span
            className={cn(
                'inline-flex size-10 items-center justify-center rounded-lg',
                TONES[tone],
                className,
            )}
        >
            <Icon className="size-5" aria-hidden="true" />
        </span>
    );
}