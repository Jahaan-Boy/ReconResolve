import { useEffect, useState, lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';

const LandingPage = lazy(() =>
    import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const OperatorConsolePage = lazy(() =>
    import('@/features/console/OperatorConsolePage').then((m) => ({ default: m.OperatorConsolePage }))
);

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

function PageFallback() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-fin-brand border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono text-slate-500">Loading FlowOps...</span>
            </div>
        </div>
    );
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
            <Suspense fallback={<PageFallback />}>
                {view === 'console' ? (
                    <OperatorConsolePage onNavigateLanding={() => navigateTo('landing')} />
                ) : (
                    <LandingPage onNavigateConsole={() => navigateTo('console')} />
                )}
            </Suspense>
        </MotionConfig>
    );
}
