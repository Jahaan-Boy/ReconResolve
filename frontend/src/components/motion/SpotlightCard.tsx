import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { cn } from '@/lib/cn';

type Tone = 'light' | 'dark';

const TONES: Record<Tone, { base: string; glow: string }> = {
    light: { base: 'bg-white shadow-xs ring-1 ring-steel-200', glow: 'rgba(51, 128, 245, 0.10)' },
    dark: { base: 'bg-steel-900/70 ring-1 ring-white/10', glow: 'rgba(89, 163, 255, 0.16)' },
};

interface SpotlightCardProps {
    children: ReactNode;
    tone?: Tone;
    className?: string;
}

export function SpotlightCard({ children, tone = 'light', className }: SpotlightCardProps) {
    const x = useMotionValue(-300);
    const y = useMotionValue(-300);
    const { base, glow } = TONES[tone];
    const background = useMotionTemplate`radial-gradient(340px circle at ${x}px ${y}px, ${glow}, transparent 70%)`;

    function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left);
        y.set(event.clientY - rect.top);
    }

    return (
        <div
            onPointerMove={handleMove}
            className={cn('group relative overflow-hidden rounded-3xl', base, className)}
        >
            <motion.div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background }}
            />
            <div className="relative">{children}</div>
        </div>
    );
}