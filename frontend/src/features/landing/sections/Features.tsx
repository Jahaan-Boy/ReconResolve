import type { ComponentType } from 'react';
import { Section } from '@/components/layout/Section';
import { Reveal } from '@/components/motion/Reveal';
import { SpotlightCard } from '@/components/motion/SpotlightCard';
import { IconTile } from '@/components/ui/IconTile';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Stats } from '@/features/landing/components/Stats';
import {
    AiVisual,
    AuditVisual,
    MatchingVisual,
    QueueVisual,
    RetryVisual,
    WebhookVisual,
} from '@/features/landing/components/visuals/FeatureVisuals';
import { FEATURES } from '@/features/landing/content';
import type { FeatureId } from '@/features/landing/content';

const LAYOUT: Record<FeatureId, { span: string; Visual: ComponentType }> = {
    webhooks: { span: 'lg:col-span-4', Visual: WebhookVisual },
    processing: { span: 'lg:col-span-2', Visual: RetryVisual },
    matching: { span: 'lg:col-span-2', Visual: MatchingVisual },
    ai: { span: 'lg:col-span-4', Visual: AiVisual },
    queue: { span: 'lg:col-span-3', Visual: QueueVisual },
    audit: { span: 'lg:col-span-3', Visual: AuditVisual },
};

export function Features() {
    return (
        <Section id="features" tone="dark" className="overflow-hidden" aria-labelledby="features-title">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-linear-to-b from-accent-900/40 to-transparent"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-40 bottom-0 -z-10 size-128 animate-blob rounded-full bg-accent-600/15 blur-3xl motion-reduce:animate-none"
            />

            <SectionHeading
                id="features-title"
                eyebrow="Capabilities"
                title="Built like *infrastructure*, not a spreadsheet"
                description="The unglamorous parts are done properly, so the insights on top are ones you can rely on."
                align="center"
                tone="dark"
            />

            <ul className="mt-16 grid gap-5 lg:grid-cols-6">
                {FEATURES.map((feature, index) => {
                    const { span, Visual } = LAYOUT[feature.id];
                    return (
                        <li key={feature.id} className={span}>
                            <Reveal delay={(index % 2) * 0.1} className="h-full">
                                <SpotlightCard tone="dark" className="h-full p-3">
                                    <Visual />
                                    <div className="p-4 pt-5">
                                        <IconTile icon={feature.icon} tone="dark" />
                                        <h3 className="mt-4 text-lg font-semibold text-white">{feature.title}</h3>
                                        <p className="mt-2 text-sm leading-6 text-steel-400">{feature.description}</p>
                                    </div>
                                </SpotlightCard>
                            </Reveal>
                        </li>
                    );
                })}
            </ul>

            <Stats />
        </Section>
    );
}