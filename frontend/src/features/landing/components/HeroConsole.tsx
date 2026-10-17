import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Tilt } from '@/components/motion/Tilt';
import { TypedText } from '@/components/motion/TypedText';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';

type Outcome = 'matched' | 'duplicate' | 'mismatch';

interface FeedEvent {
    id: string;
    type: string;
    ref: string;
    amount: string;
    outcome: Outcome;
    label: string;
}

const FEED: readonly FeedEvent[] = [
    {
        id: 'e1',
        type: 'PAYMENT.CAPTURE.COMPLETED',
        ref: 'ORD-1041',
        amount: '$84.00',
        outcome: 'matched',
        label: 'Matched',
    },
    {
        id: 'e2',
        type: 'PAYMENT.CAPTURE.COMPLETED',
        ref: 'ORD-1041',
        amount: '$84.00',
        outcome: 'duplicate',
        label: 'Duplicate ignored',
    },
    {
        id: 'e3',
        type: 'PAYMENT.CAPTURE.COMPLETED',
        ref: 'ORD-1043',
        amount: '$120.00',
        outcome: 'mismatch',
        label: 'Mismatch',
    },
];

const OUTCOME: Record<Outcome, { icon: LucideIcon; pill: string }> = {
    matched: { icon: Check, pill: 'bg-emerald-100 text-emerald-700' },
    duplicate: { icon: Copy, pill: 'bg-steel-200 text-steel-600' },
    mismatch: { icon: AlertTriangle, pill: 'bg-amber-100 text-amber-700' },
};

const AI_TEXT =
    'ORD-1043 was recorded at $102.00, but PayPal captured $120.00. The $18.00 gap matches a shipping fee added after checkout. Confidence is moderate, so a person should confirm.';

/** Milliseconds at which phases 1..5 begin, and when the loop restarts. */
const TIMELINE = [600, 1600, 2700, 3700, 8000] as const;
const LOOP_MS = 11500;
const FINAL_PHASE = TIMELINE.length;

function useDemoPhase(): number {
    const reduceMotion = useReducedMotion();
    const [phase, setPhase] = useState(0);

    useEffect(() => {
        if (reduceMotion) return;
        const timers: number[] = [];
        const run = () => {
            TIMELINE.forEach((at, index) => {
                timers.push(window.setTimeout(() => setPhase(index + 1), at));
            });
            timers.push(
                window.setTimeout(() => {
                    setPhase(0);
                    run();
                }, LOOP_MS),
            );
        };
        run();
        return () => timers.forEach((id) => window.clearTimeout(id));
    }, [reduceMotion]);

    return reduceMotion ? FINAL_PHASE : phase;
}

function FloatingChip({
    children,
    icon: Icon,
    className,
    delay = 0,
}: {
    children: ReactNode;
    icon: LucideIcon;
    className?: string;
    delay?: number;
}) {
    return (
        <motion.div
            aria-hidden="true"
            className={cn(
                'absolute z-10 hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-steel-700 shadow-lg ring-1 shadow-steel-900/10 ring-steel-200 sm:flex',
                className,
            )}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}
        >
            <Icon className="size-3.5 text-accent-600" />
            {children}
        </motion.div>
    );
}

export function HeroConsole() {
    const phase = useDemoPhase();
    const visibleEvents = FEED.slice(0, Math.min(phase, FEED.length));

    return (
        <figure>
            <Tilt>
                <div className="relative">
                    <FloatingChip icon={ShieldCheck} className="-top-4 -right-3">
                        Signature verified
                    </FloatingChip>
                    <FloatingChip icon={Zap} className="-bottom-4 -left-4" delay={1.2}>
                        Outbox · 0 pending
                    </FloatingChip>

                    <div
                        aria-hidden="true"
                        className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 shadow-steel-900/15 ring-steel-200"
                    >
                        <div className="flex items-center justify-between border-b border-steel-200 bg-steel-50 px-4 py-3">
                            <div className="flex items-center gap-1.5">
                                <span className="size-2.5 rounded-full bg-steel-300" />
                                <span className="size-2.5 rounded-full bg-steel-300" />
                                <span className="size-2.5 rounded-full bg-steel-300" />
                            </div>
                            <span className="font-mono text-xs text-steel-500">event-stream · sandbox</span>
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                                <span className="relative flex size-2">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                                </span>
                                Live
                            </span>
                        </div>

                        <div className="min-h-104 space-y-4 p-4">
                            <ul className="min-h-36 space-y-2">
                                <AnimatePresence>
                                    {visibleEvents.map((event) => {
                                        const { icon: Icon, pill } = OUTCOME[event.outcome];
                                        return (
                                            <motion.li
                                                key={event.id}
                                                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                                transition={{ duration: 0.45, ease: EASE_OUT }}
                                                className="flex items-center justify-between gap-3 rounded-lg bg-steel-50 px-3 py-2.5 ring-1 ring-steel-200"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate font-mono text-[11px] text-steel-500">
                                                        {event.type}
                                                    </p>
                                                    <p className="text-sm font-medium text-steel-800">
                                                        {event.ref} · <span className="tabular-nums">{event.amount}</span>
                                                    </p>
                                                </div>
                                                <span
                                                    className={cn(
                                                        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                                                        pill,
                                                    )}
                                                >
                                                    <Icon className="size-3" />
                                                    {event.label}
                                                </span>
                                            </motion.li>
                                        );
                                    })}
                                </AnimatePresence>
                            </ul>

                            <AnimatePresence>
                                {phase >= 4 ? (
                                    <motion.div
                                        key="ai"
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                        transition={{ duration: 0.5, ease: EASE_OUT }}
                                        className="rounded-xl bg-steel-900 p-4 text-steel-100"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-accent-300 uppercase">
                                                <Sparkles className="size-3.5" />
                                                AI investigation
                                            </div>
                                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-steel-300">
                                                read-only
                                            </span>
                                        </div>
                                        <p className="mt-3 min-h-28 text-sm leading-6 text-steel-200">
                                            <TypedText text={AI_TEXT} />
                                        </p>
                                        <AnimatePresence>
                                            {phase >= 5 ? (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.4, ease: EASE_OUT }}
                                                    className="flex flex-wrap items-center gap-2"
                                                >
                                                    <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] text-steel-300">
                                                        3 evidence records
                                                    </span>
                                                    <span className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white">
                                                        Mark resolved
                                                    </span>
                                                    <span className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-steel-200">
                                                        Dismiss
                                                    </span>
                                                </motion.div>
                                            ) : null}
                                        </AnimatePresence>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </Tilt>
            <figcaption className="mt-6 text-center text-xs text-steel-500">
                Illustrative simulation with sample data
            </figcaption>
        </figure>
    );
}