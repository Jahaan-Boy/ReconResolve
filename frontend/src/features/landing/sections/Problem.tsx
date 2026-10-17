import type { ComponentType } from 'react';
import { Section } from '@/components/layout/Section';
import { Reveal } from '@/components/motion/Reveal';
import { SpotlightCard } from '@/components/motion/SpotlightCard';
import { SectionHeading } from '@/components/ui/SectionHeading';
import {
    DuplicateVisual,
    LogVisual,
    MismatchVisual,
} from '@/features/landing/components/visuals/ProblemVisuals';
import { PROBLEMS } from '@/features/landing/content';
import type { ProblemId } from '@/features/landing/content';

const VISUALS: Record<ProblemId, ComponentType> = {
    duplicates: DuplicateVisual,
    mismatch: MismatchVisual,
    manual: LogVisual,
};

export function Problem() {
    return (
        <Section id="problem" aria-labelledby="problem-title">
            <SectionHeading
                id="problem-title"
                eyebrow="The problem"
                title="Payment data is noisy. Your team shouldn't be the *filter*."
                description="Payment providers report what happened. They don't tell you whether it matches your books, or what to do when it doesn't."
            />
            <ul className="mt-14 grid gap-6 md:grid-cols-3">
                {PROBLEMS.map((problem, index) => {
                    const Visual = VISUALS[problem.id];
                    return (
                        <li key={problem.id}>
                            <Reveal delay={index * 0.1} className="h-full">
                                <SpotlightCard
                                    tone="light"
                                    className="h-full p-3 transition-transform duration-300 hover:-translate-y-1"
                                >
                                    <div className="h-44 overflow-hidden rounded-2xl bg-steel-100/80 ring-1 ring-steel-200/70 ring-inset">
                                        <Visual />
                                    </div>
                                    <div className="p-4 pt-5">
                                        <h3 className="text-lg font-semibold text-steel-900">{problem.title}</h3>
                                        <p className="mt-2 text-sm leading-6 text-steel-600">{problem.description}</p>
                                    </div>
                                </SpotlightCard>
                            </Reveal>
                        </li>
                    );
                })}
            </ul>
        </Section>
    );
}