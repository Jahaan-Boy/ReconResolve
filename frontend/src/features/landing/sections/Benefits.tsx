import { ArrowUpRight, Check, ShieldCheck } from 'lucide-react';
import { Section } from '@/components/layout/Section';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BENEFITS, GUARANTEES } from '@/features/landing/content';
import type { TextItem } from '@/features/landing/content';

function BenefitRow({ item, index }: { item: TextItem; index: number }) {
    return (
        <li>
            <Reveal delay={index * 0.06} y={16}>
                <div className="group flex items-start gap-5 p-6 transition-colors hover:bg-steel-50">
                    <span className="pt-1 font-mono text-xs text-steel-400">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1">
                        <h3 className="text-base font-semibold text-steel-900">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-steel-600">{item.description}</p>
                    </div>
                    <ArrowUpRight
                        className="mt-1 size-5 shrink-0 text-steel-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-600"
                        aria-hidden="true"
                    />
                </div>
            </Reveal>
        </li>
    );
}

export function Benefits() {
    return (
        <Section id="benefits" tone="muted" aria-labelledby="benefits-title">
            <div className="grid gap-12 lg:grid-cols-5 lg:gap-16">
                <div className="lg:col-span-2">
                    <SectionHeading
                        id="benefits-title"
                        eyebrow="Why FlowOps"
                        title="Fewer surprises. Faster answers. *Full* control."
                        description="Reconciliation should give your team confidence, not another dashboard to babysit."
                    />

                    <Reveal delay={0.2} className="mt-10">
                        <div className="relative isolate overflow-hidden rounded-2xl bg-steel-900 p-7 text-steel-200 shadow-lg shadow-steel-900/10">
                            <div
                                aria-hidden="true"
                                className="absolute -top-16 -right-16 -z-10 size-56 animate-blob rounded-full bg-accent-600/30 blur-3xl motion-reduce:animate-none"
                            />
                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                <ShieldCheck className="size-5 text-accent-300" aria-hidden="true" />
                                Safe by design
                            </div>
                            <ul className="mt-5 space-y-3 text-sm leading-6">
                                {GUARANTEES.map((item) => (
                                    <li key={item} className="flex gap-3">
                                        <Check className="mt-0.5 size-4 shrink-0 text-accent-300" aria-hidden="true" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </Reveal>
                </div>

                <ul className="divide-y divide-steel-200 self-start overflow-hidden rounded-2xl bg-white ring-1 ring-steel-200 lg:col-span-3">
                    {BENEFITS.map((item, index) => (
                        <BenefitRow key={item.title} item={item} index={index} />
                    ))}
                </ul>
            </div>
        </Section>
    );
}