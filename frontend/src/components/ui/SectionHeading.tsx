import { Reveal } from '@/components/motion/Reveal';
import { SplitWords } from '@/components/motion/SplitWords';
import { cn } from '@/lib/cn';

type Tone = 'light' | 'dark';

interface SectionHeadingProps {
    id: string;
    eyebrow: string;
    title: string;
    description?: string;
    align?: 'left' | 'center';
    tone?: Tone;
    className?: string;
}

export function SectionHeading({
    id,
    eyebrow,
    title,
    description,
    align = 'left',
    tone = 'light',
    className,
}: SectionHeadingProps) {
    const dark = tone === 'dark';
    const centered = align === 'center';

    return (
        <div className={cn('max-w-2xl', centered && 'mx-auto text-center', className)}>
            <Reveal y={10}>
                <p
                    className={cn(
                        'flex items-center gap-3 text-sm font-semibold tracking-wider uppercase',
                        centered && 'justify-center',
                        dark ? 'text-accent-300' : 'text-accent-700',
                    )}
                >
                    <span aria-hidden="true" className="h-px w-6 bg-current opacity-60" />
                    {eyebrow}
                </p>
            </Reveal>
            <h2
                id={id}
                className={cn(
                    'mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl',
                    dark ? 'text-white' : 'text-steel-900',
                )}
            >
                <SplitWords
                    text={title}
                    inView
                    accentClassName={dark ? 'text-accent-300' : 'text-accent-600'}
                />
            </h2>
            {description ? (
                <Reveal delay={0.2} y={16}>
                    <p className={cn('mt-5 text-lg leading-8', dark ? 'text-steel-400' : 'text-steel-600')}>
                        {description}
                    </p>
                </Reveal>
            ) : null}
        </div>
    );
}