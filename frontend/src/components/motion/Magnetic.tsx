import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { SPRING_SOFT } from '@/lib/motion';

interface MagneticProps {
    children: ReactNode;
    strength?: number;
}

export function Magnetic({ children, strength = 0.25 }: MagneticProps) {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const springX = useSpring(x, SPRING_SOFT);
    const springY = useSpring(y, SPRING_SOFT);

    function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
        const element = ref.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
    }

    function reset() {
        x.set(0);
        y.set(0);
    }

    return (
        <motion.div
            ref={ref}
            className="inline-block"
            style={{ x: springX, y: springY }}
            onPointerMove={handleMove}
            onPointerLeave={reset}
        >
            {children}
        </motion.div>
    );
}