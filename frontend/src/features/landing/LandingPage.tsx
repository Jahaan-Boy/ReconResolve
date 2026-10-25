import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { Marquee } from '@/features/landing/components/Marquee';
import { MARQUEE_ITEMS, NAV_LINKS } from '@/features/landing/content';
import { Benefits } from '@/features/landing/sections/Benefits';
import { CallToAction } from '@/features/landing/sections/CallToAction';
import { Features } from '@/features/landing/sections/Features';
import { Hero } from '@/features/landing/sections/Hero';
import { HowItWorks } from '@/features/landing/sections/HowItWorks';
import { Problem } from '@/features/landing/sections/Problem';

interface LandingPageProps {
    onNavigateConsole?: () => void;
}

export function LandingPage({ onNavigateConsole }: LandingPageProps = {}) {
    return (
        <>
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-steel-900 focus:shadow-lg"
            >
                Skip to content
            </a>
            <Header links={NAV_LINKS} onNavigateConsole={onNavigateConsole} />
            <main id="main">
                <Hero />
                <Marquee items={MARQUEE_ITEMS} />
                <Problem />
                <HowItWorks />
                <Features />
                <Benefits />
                <CallToAction />
            </main>
            <Footer links={NAV_LINKS} />
        </>
    );
}