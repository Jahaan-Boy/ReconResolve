import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { SPRING_SOFT } from '@/lib/motion';

interface TiltProps {
    children: ReactNode;
    /** Maximum rotation in degrees. */
    max?: number;
    className?: string;
}

export function Tilt({ children, max = 5, className }: TiltProps) {
    const rotateXValue = useMotionValue(0);
    const rotateYValue = useMotionValue(0);
    const rotateX = useSpring(rotateXValue, SPRING_SOFT);
    const rotateY = useSpring(rotateYValue, SPRING_SOFT);

    function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        rotateYValue.set(px * max * 2);
        rotateXValue.set(-py * max * 2);
    }

    function reset() {
        rotateXValue.set(0);
        rotateYValue.set(0);
    }

    return (
        <motion.div
            className={className}
            style={{ rotateX, rotateY, transformPerspective: 1100 }}
            onPointerMove={handleMove}
            onPointerLeave={reset}
        >
            {children}
        </motion.div>
    );
}