import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

export function useTypewriter(text: string, charsPerSecond = 45): string {
    const reduceMotion = useReducedMotion();
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (reduceMotion) return;
        const controls = animate(0, text.length, {
            duration: text.length / charsPerSecond,
            ease: 'linear',
            onUpdate: (value) => setCount(Math.floor(value)),
        });
        return () => controls.stop();
    }, [text, charsPerSecond, reduceMotion]);

    return reduceMotion ? text : text.slice(0, count);
}