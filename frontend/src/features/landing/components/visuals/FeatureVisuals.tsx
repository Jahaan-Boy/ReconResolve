import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { motion, useInView } from 'motion/react';
import { TypedText } from '@/components/motion/TypedText';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';

function Frame({ children }: { children: ReactNode }) {
    return (
        <div
            aria-hidden="true"
            className="relative h-48 overflow-hidden rounded-2xl bg-steel-950/80 p-4 ring-1 ring-white/5 ring-inset"
        >
            {children}
        </div>
    );
}

const WEBHOOK_ROWS = [
    { id: 'evt_01', status: 'stored', tone: 'text-emerald-300' },
    { id: 'evt_01', status: 'duplicate · ignored', tone: 'text-steel-400' },
    { id: 'evt_02', status: 'stored', tone: 'text-emerald-300' },
    { id: 'evt_03', status: 'bad signature · rejected', tone: 'text-rose-300' },
] as const;

export function WebhookVisual() {
    return (
        <Frame>
            <div className="space-y-2">
                {WEBHOOK_ROWS.map((row, index) => (
                    <motion.div
                        key={`${row.id}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md bg-white/5 px-3 py-2 font-mono text-xs"
                        animate={{ opacity: [0.35, 1, 0.35] }}
                        transition={{ duration: 4, repeat: Infinity, delay: index * 0.9, ease: 'easeInOut' }}
                    >
                        <span className="truncate text-steel-300">{row.id} · PAYMENT.CAPTURE</span>
                        <span className={cn('shrink-0', row.tone)}>{row.status}</span>
                    </motion.div>
                ))}
            </div>
        </Frame>
    );
}

const RETRY_BARS = [
    { height: 32, label: '1s' },
    { height: 56, label: '2s' },
    { height: 88, label: '4s' },
    { height: 120, label: 'ok' },
] as const;

export function RetryVisual() {
    return (
        <Frame>
            <div className="flex h-full items-end gap-3">
                {RETRY_BARS.map((bar, index) => (
                    <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                        <motion.div
                            className={cn(
                                'w-full origin-bottom rounded-t-md',
                                index === RETRY_BARS.length - 1 ? 'bg-emerald-400/80' : 'bg-accent-400/60',
                            )}
                            style={{ height: bar.height }}
                            initial={{ scaleY: 0 }}
                            whileInView={{ scaleY: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.15 * index, ease: EASE_OUT }}
                        />
                        <span className="font-mono text-[10px] text-steel-400">{bar.label}</span>
                    </div>
                ))}
            </div>
        </Frame>
    );
}

const LAYERS = [
    { label: 'Exact', value: 100, bar: 'bg-emerald-400', note: 'auto-matched' },
    { label: 'Constrained', value: 87, bar: 'bg-accent-400', note: 'auto-matched' },
    { label: 'Fuzzy', value: 62, bar: 'bg-amber-400', note: 'needs review' },
] as const;

export function MatchingVisual() {
    return (
        <Frame>
            <div className="flex h-full flex-col justify-center gap-4">
                {LAYERS.map((layer, index) => (
                    <div key={layer.label}>
                        <div className="mb-1.5 flex items-center justify-between text-[11px]">
                            <span className="font-medium text-steel-200">{layer.label}</span>
                            <span className="font-mono text-steel-400">
                                {layer.value}% · {layer.note}
                            </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <motion.div
                                className={cn('h-full origin-left rounded-full', layer.bar)}
                                style={{ width: `${layer.value}%` }}
                                initial={{ scaleX: 0 }}
                                whileInView={{ scaleX: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.9, delay: 0.15 * index, ease: EASE_OUT }}
                            />
                        </div>
                    </div>
                ))}
                <p className="text-[10px] text-steel-500">Sample confidence scores</p>
            </div>
        </Frame>
    );
}

const AI_SAMPLE =
    'The $18.00 difference matches a shipping fee added after the order was created. Three supporting records found. Confidence: moderate. Recommend human review.';

export function AiVisual() {
    const ref = useRef<HTMLDivElement>(null);
    const inView = useInView(ref, { once: true, margin: '-40px' });

    return (
        <Frame>
            <div ref={ref} className="flex h-full flex-col">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-steel-400">investigator</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-steel-300">
                        <Lock className="size-3" />
                        read-only tools
                    </span>
                </div>
                <p className="mt-3 flex-1 text-sm leading-6 text-steel-200">
                    {inView ? <TypedText text={AI_SAMPLE} charsPerSecond={50} /> : null}
                </p>
                <div className="flex gap-2 text-[11px]">
                    <span className="rounded-md bg-accent-400/15 px-2 py-1 text-accent-300">3 evidence refs</span>
                    <span className="rounded-md bg-amber-400/15 px-2 py-1 text-amber-300">uncertainty stated</span>
                </div>
            </div>
        </Frame>
    );
}

const QUEUE_ITEMS = [
    { title: 'Amount mismatch', status: 'Open', tone: 'bg-amber-400/15 text-amber-300' },
    { title: 'Missing order', status: 'Investigating', tone: 'bg-accent-400/15 text-accent-300' },
    { title: 'Status discrepancy', status: 'Resolved', tone: 'bg-emerald-400/15 text-emerald-300' },
] as const;

export function QueueVisual() {
    return (
        <Frame>
            <div className="space-y-2.5">
                {QUEUE_ITEMS.map((item, index) => (
                    <motion.div
                        key={item.title}
                        className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-3 ring-1 ring-white/5"
                        initial={{ opacity: 0, x: -16 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.12 * index, ease: EASE_OUT }}
                    >
                        <span className="text-sm text-steel-200">{item.title}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', item.tone)}>
                            {item.status}
                        </span>
                    </motion.div>
                ))}
            </div>
        </Frame>
    );
}

const AUDIT_LINES = [
    '14:02:11  event stored',
    '14:02:12  matched · confidence 0.98',
    '14:05:40  investigation completed',
    '14:07:03  resolved by reviewer',
] as const;

export function AuditVisual() {
    return (
        <Frame>
            <Lock className="absolute top-4 right-4 size-4 text-accent-300" />
            <div className="space-y-2.5 pt-1">
                {AUDIT_LINES.map((line, index) => (
                    <motion.p
                        key={line}
                        className="font-mono text-xs text-steel-300"
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.15 * index, ease: EASE_OUT }}
                    >
                        <span className="mr-2 text-accent-300">›</span>
                        {line}
                    </motion.p>
                ))}
            </div>
        </Frame>
    );
}