import { useEffect, useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';

export function HeroBackdrop() {
    const ref = useRef<HTMLDivElement>(null);
    const x = useMotionValue(-1000);
    const y = useMotionValue(-1000);
    const spotlight = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgba(51, 128, 245, 0.14), transparent 70%)`;

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const onMove = (event: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            x.set(event.clientX - rect.left);
            y.set(event.clientY - rect.top);
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        return () => window.removeEventListener('pointermove', onMove);
    }, [x, y]);

    return (
        <div ref={ref} aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-b from-steel-100 via-steel-50 to-steel-50" />
            <div className="bg-dot-grid absolute inset-0 opacity-60" />
            <motion.div className="absolute inset-0" style={{ background: spotlight }} />
            <div className="absolute -top-40 -right-20 size-160 animate-blob rounded-full bg-accent-300/35 blur-3xl motion-reduce:animate-none" />
            <div className="absolute top-40 -left-40 size-128 animate-blob-slow rounded-full bg-steel-300/50 blur-3xl motion-reduce:animate-none" />
            <div className="bg-grain absolute inset-0 opacity-[0.06] mix-blend-multiply" />
        </div>
    );
}