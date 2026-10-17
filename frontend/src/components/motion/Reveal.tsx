import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/lib/motion';

interface RevealProps {
    children: ReactNode;
    delay?: number;
    y?: number;
    className?: string;
}

export function Reveal({ children, delay = 0, y = 24, className }: RevealProps) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay, ease: EASE_OUT }}
        >
            {children}
        </motion.div>
    );
}