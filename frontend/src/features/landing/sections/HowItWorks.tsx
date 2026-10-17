import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react';
import { Section } from '@/components/layout/Section';
import { IconTile } from '@/components/ui/IconTile';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { STEPS } from '@/features/landing/content';
import type { Step } from '@/features/landing/content';
import { cn } from '@/lib/cn';

function StepItem({ step, active }: { step: Step; active: boolean }) {
    return (
        <li className="relative">
            <span
                className={cn(
                    'absolute top-6 -left-[46px] grid size-7 place-items-center rounded-full ring-4 ring-steel-100 transition-colors duration-500 sm:-left-[54px]',
                    active ? 'bg-accent-600 text-white' : 'bg-steel-300 text-steel-500',
                )}
            >
                <Check
                    className={cn('size-4 transition-opacity duration-500', active ? 'opacity-100' : 'opacity-0')}
                    aria-hidden="true"
                />
            </span>

            <div
                className={cn(
                    'relative overflow-hidden rounded-2xl bg-white p-6 ring-1 ring-steel-200 transition-all duration-500',
                    active ? 'opacity-100 shadow-lg shadow-steel-900/5' : 'opacity-50',
                )}
            >
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-4 right-4 text-8xl font-semibold text-transparent select-none [-webkit-text-stroke:1px_var(--color-steel-200)]"
                >
                    {step.number}
                </span>
                <IconTile icon={step.icon} tone="accent" />
                <h3 className="mt-5 text-lg font-semibold text-steel-900">{step.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-steel-600">{step.description}</p>
            </div>
        </li>
    );
}

export function HowItWorks() {
    const listRef = useRef<HTMLOListElement>(null);
    const { scrollYProgress } = useScroll({
        target: listRef,
        offset: ['start 75%', 'end 55%'],
    });
    const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
    const [active, setActive] = useState(0);

    useMotionValueEvent(scrollYProgress, 'change', (value) => {
        const index = Math.floor(value * STEPS.length + 0.15);
        setActive(Math.min(STEPS.length - 1, Math.max(0, index)));
    });

    return (
        <Section id="how-it-works" tone="muted" aria-labelledby="how-title">
            <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
                <div className="lg:sticky lg:top-28 lg:col-span-2 lg:self-start">
                    <SectionHeading
                        id="how-title"
                        eyebrow="How it works"
                        title="From raw events to *resolved* exceptions"
                        description="Four stages take every event from arrival to a recorded decision, with nothing lost along the way."
                    />
                </div>

                <ol ref={listRef} className="relative space-y-5 pl-12 sm:pl-16 lg:col-span-3">
                    <span
                        aria-hidden="true"
                        className="absolute top-2 bottom-2 left-4 w-px bg-steel-300 sm:left-6"
                    />
                    <motion.span
                        aria-hidden="true"
                        style={{ scaleY: fill }}
                        className="absolute top-2 bottom-2 left-4 w-px origin-top bg-accent-600 sm:left-6"
                    />
                    {STEPS.map((step, index) => (
                        <StepItem key={step.title} step={step} active={index <= active} />
                    ))}
                </ol>
            </div>
        </Section>
    );
}