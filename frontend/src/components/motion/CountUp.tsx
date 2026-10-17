import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '@/lib/motion';

interface CountUpProps {
    to: number;
    duration?: number;
}

export function CountUp({ to, duration = 1.6 }: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: '-60px' });
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        const node = ref.current;
        if (!inView || !node) return;
        if (reduceMotion) {
            node.textContent = String(to);
            return;
        }
        const controls = animate(0, to, {
            duration,
            ease: EASE_OUT,
            onUpdate: (value) => {
                node.textContent = String(Math.round(value));
            },
        });
        return () => controls.stop();
    }, [inView, to, duration, reduceMotion]);

    return (
        <span ref={ref} className="tabular-nums">
            0
        </span>
    );
}