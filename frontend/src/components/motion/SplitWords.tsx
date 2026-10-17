import { Fragment } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { EASE_OUT } from '@/lib/motion';

interface SplitWordsProps {
    text: string;
    delay?: number;
    stagger?: number;
    /** Animate when scrolled into view instead of on mount. */
    inView?: boolean;
    accentClassName?: string;
}

export function SplitWords({
    text,
    delay = 0,
    stagger = 0.055,
    inView = false,
    accentClassName = 'text-accent-600',
}: SplitWordsProps) {
    const trigger = inView
        ? { whileInView: { y: '0%' }, viewport: { once: true, margin: '-10% 0px' } }
        : { animate: { y: '0%' } };

    return (
        <>
            {text.split(' ').map((raw, index) => {
                const match = /^\*(.+)\*(\W*)$/.exec(raw);
                const isAccent = match !== null;
                const label = match ? `${match[1] ?? ''}${match[2] ?? ''}` : raw;

                return (
                    <Fragment key={`${raw}-${index}`}>
                        <span className="-mb-[0.18em] inline-block overflow-hidden pb-[0.18em] align-bottom">
                            <motion.span
                                className={cn(
                                    'inline-block',
                                    isAccent && `font-display text-[1.1em] font-normal italic ${accentClassName}`,
                                )}
                                initial={{ y: '110%' }}
                                {...trigger}
                                transition={{ duration: 0.85, delay: delay + index * stagger, ease: EASE_OUT }}
                            >
                                {label}
                            </motion.span>
                        </span>{' '}
                    </Fragment>
                );
            })}
        </>
    );
}