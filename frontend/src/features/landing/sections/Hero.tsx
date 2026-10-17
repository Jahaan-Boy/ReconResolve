import { useRef } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Container } from '@/components/layout/Container';
import { Magnetic } from '@/components/motion/Magnetic';
import { Reveal } from '@/components/motion/Reveal';
import { SplitWords } from '@/components/motion/SplitWords';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { HeroBackdrop } from '@/features/landing/components/HeroBackdrop';
import { HeroConsole } from '@/features/landing/components/HeroConsole';

const HIGHLIGHTS = [
    'Verified, deduplicated PayPal events',
    'Evidence-backed AI investigations',
    'People approve every resolution',
] as const;

export function Hero() {
    const ref = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
    const textY = useTransform(scrollYProgress, [0, 1], [0, 90]);
    const consoleY = useTransform(scrollYProgress, [0, 1], [0, 40]);

    return (
        <section ref={ref} id="top" className="relative isolate overflow-hidden">
            <HeroBackdrop />

            <Container className="grid items-center gap-16 pt-16 pb-24 sm:pt-24 lg:grid-cols-2 lg:gap-12 lg:pt-28 lg:pb-32">
                <motion.div style={{ y: textY }}>
                    <Reveal y={12}>
                        <Badge>
                            <Sparkles className="size-3.5 text-accent-600" aria-hidden="true" />
                            AI-assisted payment reconciliation
                        </Badge>
                    </Reveal>

                    <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-tight text-balance text-steel-900 sm:text-6xl lg:text-7xl">
                        <SplitWords
                            text="Catch payment mismatches *before* they become financial surprises."
                            delay={0.2}
                        />
                    </h1>

                    <Reveal delay={0.9}>
                        <p className="mt-6 max-w-xl text-lg leading-8 text-steel-600">
                            FlowOps ingests your PayPal events, matches them against your orders, and turns every
                            discrepancy into an investigation with evidence, so your team can resolve it fast.
                        </p>
                    </Reveal>

                    <Reveal delay={1.05}>
                        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                            <Magnetic>
                                <ButtonLink href="#how-it-works" size="lg">
                                    See how it works
                                    <ArrowRight
                                        className="size-4 transition-transform group-hover:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </ButtonLink>
                            </Magnetic>
                            <Magnetic>
                                <ButtonLink href="#benefits" variant="secondary" size="lg">
                                    Explore the benefits
                                </ButtonLink>
                            </Magnetic>
                        </div>
                    </Reveal>

                    <Reveal delay={1.2}>
                        <ul className="mt-10 space-y-3 text-sm text-steel-700">
                            {HIGHLIGHTS.map((item) => (
                                <li key={item} className="flex items-center gap-3">
                                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                                        <Check className="size-3.5" aria-hidden="true" />
                                    </span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                </motion.div>

                <motion.div style={{ y: consoleY }}>
                    <Reveal delay={0.5} y={40}>
                        <HeroConsole />
                    </Reveal>
                </motion.div>
            </Container>
        </section>
    );
}