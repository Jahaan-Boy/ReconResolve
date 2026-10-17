import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';
import { Container } from '@/components/layout/Container';

type Tone = 'default' | 'muted' | 'dark';

const TONES: Record<Tone, string> = {
    default: '',
    muted: 'bg-steel-100/70',
    dark: 'bg-steel-950 text-steel-200',
};

interface SectionProps extends ComponentPropsWithoutRef<'section'> {
    tone?: Tone;
}

export function Section({ tone = 'default', className, children, ...props }: SectionProps) {
    return (
        <section
            className={cn('relative isolate scroll-mt-16 py-20 sm:py-28', TONES[tone], className)}
            {...props}
        >
            <Container>{children}</Container>
        </section>
    );
}