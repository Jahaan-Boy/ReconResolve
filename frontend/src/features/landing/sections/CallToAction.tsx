import { ArrowRight } from 'lucide-react';
import { SITE } from '@/config/site';
import { Section } from '@/components/layout/Section';
import { Magnetic } from '@/components/motion/Magnetic';
import { Reveal } from '@/components/motion/Reveal';
import { SplitWords } from '@/components/motion/SplitWords';
import { ButtonLink } from '@/components/ui/ButtonLink';

export function CallToAction() {
    return (
        <Section id="get-started" aria-labelledby="cta-title">
            <Reveal y={40}>
                <div className="relative isolate overflow-hidden rounded-[2rem] bg-steel-950 px-6 py-20 text-center sm:px-16 sm:py-28">
                    <div
                        aria-hidden="true"
                        className="absolute -top-32 left-1/4 -z-10 size-128 animate-blob rounded-full bg-accent-600/35 blur-3xl motion-reduce:animate-none"
                    />
                    <div
                        aria-hidden="true"
                        className="absolute -right-24 -bottom-40 -z-10 size-128 animate-blob-slow rounded-full bg-steel-500/25 blur-3xl motion-reduce:animate-none"
                    />
                    <div aria-hidden="true" className="bg-grain absolute inset-0 -z-10 opacity-[0.08] mix-blend-overlay" />

                    <h2
                        id="cta-title"
                        className="mx-auto max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-white sm:text-6xl"
                    >
                        <SplitWords
                            text="Every payment mismatch, with the *context* to resolve it."
                            inView
                            accentClassName="text-accent-300"
                        />
                    </h2>
                    <Reveal delay={0.3} y={16}>
                        <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-steel-300">
                            See how FlowOps turns scattered payment events into a clear, auditable workflow for
                            your team.
                        </p>
                    </Reveal>
                    <Reveal delay={0.45} y={16}>
                        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Magnetic>
                                <ButtonLink href={SITE.contactHref} size="lg">
                                    Request a demo
                                    <ArrowRight
                                        className="size-4 transition-transform group-hover:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </ButtonLink>
                            </Magnetic>
                            <Magnetic>
                                <ButtonLink href="#how-it-works" variant="onDark" size="lg">
                                    Review the workflow
                                </ButtonLink>
                            </Magnetic>
                        </div>
                    </Reveal>
                </div>
            </Reveal>
        </Section>
    );
}