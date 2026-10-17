import { CountUp } from '@/components/motion/CountUp';
import { Reveal } from '@/components/motion/Reveal';
import { STATS } from '@/features/landing/content';

export function Stats() {
    return (
        <Reveal className="mt-16">
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-white/10 ring-1 ring-white/10 lg:grid-cols-4">
                {STATS.map(({ value, label, detail }) => (
                    <li key={label} className="bg-steel-950 p-6 sm:p-8">
                        <p className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                            <CountUp to={value} />
                        </p>
                        <p className="mt-3 text-sm font-medium text-steel-200">{label}</p>
                        <p className="mt-1 text-xs leading-5 text-steel-400">{detail}</p>
                    </li>
                ))}
            </ul>
        </Reveal>
    );
}