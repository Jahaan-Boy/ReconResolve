import { motion } from 'motion/react';

export function DuplicateVisual() {
    return (
        <div aria-hidden="true" className="relative flex h-full items-center justify-center">
            <motion.div
                className="absolute w-48 rounded-lg bg-white/70 px-3 py-2 font-mono text-[11px] text-steel-400 ring-1 ring-steel-200"
                animate={{ x: [6, 12, 6], y: [12, 20, 12] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
                evt_8F2K · CAPTURE
            </motion.div>
            <motion.div
                className="relative w-48 rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-steel-600 shadow-sm ring-1 ring-steel-200"
                animate={{ x: [-6, -12, -6], y: [-8, -14, -8] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
                evt_8F2K · CAPTURE
                <span className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                    ×2
                </span>
            </motion.div>
        </div>
    );
}

function Amount({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-white px-4 py-3 text-center shadow-sm ring-1 ring-steel-200">
            <p className="text-[11px] font-medium text-steel-500">{label}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight text-steel-900 tabular-nums">
                {value}
            </p>
        </div>
    );
}

export function MismatchVisual() {
    return (
        <div aria-hidden="true" className="flex h-full items-center justify-center gap-3">
            <Amount label="PayPal" value="$120.00" />
            <motion.span
                className="text-3xl font-light text-amber-500"
                animate={{ rotate: [0, 14, -14, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
                ≠
            </motion.span>
            <Amount label="Orders" value="$102.00" />
        </div>
    );
}

const LOG_LINES = [
    '14:02:11  evt received',
    '14:02:11  evt received',
    '14:02:12  status=PENDING',
    '14:03:40  status=COMPLETED',
    '14:03:41  amount differs ??',
    '14:05:02  grep order A-1043',
    '14:05:19  open spreadsheet',
    '14:08:44  still no idea',
] as const;

export function LogVisual() {
    const lines = [...LOG_LINES, ...LOG_LINES];

    return (
        <div
            aria-hidden="true"
            className="h-full overflow-hidden px-5 [mask-image:linear-gradient(to_bottom,transparent,black_22%,black_78%,transparent)]"
        >
            <div className="animate-scroll-y motion-reduce:animate-none">
                {lines.map((line, index) => (
                    <p key={`${line}-${index}`} className="py-1.5 font-mono text-[11px] text-steel-500">
                        {line}
                    </p>
                ))}
            </div>
        </div>
    );
}