import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { LandingPage } from '@/features/landing/LandingPage';
import { OperatorConsolePage } from '@/features/console/OperatorConsolePage';

type AppView = 'landing' | 'console';

function getInitialView(): AppView {
    if (typeof window === 'undefined') return 'landing';
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (path.startsWith('/console') || hash === '#console') {
        return 'console';
    }
    return 'landing';
}

export default function App() {
    const [view, setView] = useState<AppView>(getInitialView);

    useEffect(() => {
        const handleLocationChange = () => {
            setView(getInitialView());
        };

        window.addEventListener('popstate', handleLocationChange);
        window.addEventListener('hashchange', handleLocationChange);
        return () => {
            window.removeEventListener('popstate', handleLocationChange);
            window.removeEventListener('hashchange', handleLocationChange);
        };
    }, []);

    const navigateTo = (nextView: AppView) => {
        setView(nextView);
        if (nextView === 'console') {
            window.history.pushState({}, '', '/console');
        } else {
            window.history.pushState({}, '', '/');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <MotionConfig reducedMotion="user">
            {view === 'console' ? (
                <OperatorConsolePage onNavigateLanding={() => navigateTo('landing')} />
            ) : (
                <LandingPage onNavigateConsole={() => navigateTo('console')} />
            )}
        </MotionConfig>
    );
}