import { useEffect, useState, lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

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
    const [visitedViews, setVisitedViews] = useState<Set<AppView>>(() => new Set([getInitialView()]));

    useEffect(() => {
        const handleLocationChange = () => {
            const next = getInitialView();
            setView(next);
            setVisitedViews((prev) => {
                if (prev.has(next)) return prev;
                const updated = new Set(prev);
                updated.add(next);
                return updated;
            });
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
        setVisitedViews((prev) => {
            if (prev.has(nextView)) return prev;
            const updated = new Set(prev);
            updated.add(nextView);
            return updated;
        });
        if (nextView === 'console') {
            window.history.pushState({}, '', '/console');
        } else {
            window.history.pushState({}, '', '/');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Idle prefetching for OperatorConsolePage when on Landing Page
    useEffect(() => {
        if (!visitedViews.has('console')) {
            const prefetchConsole = () => {
                import('@/features/console/OperatorConsolePage');
            };
            if ('requestIdleCallback' in window) {
                const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, opts: { timeout: number }) => number }).requestIdleCallback(
                    prefetchConsole,
                    { timeout: 1500 },
                );
                return () => {
                    (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
                };
            } else {
                const timer = setTimeout(prefetchConsole, 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [visitedViews]);

    return (
        <MotionConfig reducedMotion="user">
            <ErrorBoundary fallbackTitle="Application View">
                <Suspense fallback={<PageFallback />}>
                    <div className={view === 'console' ? 'contents' : 'hidden'}>
                        {visitedViews.has('console') && (
                            <OperatorConsolePage onNavigateLanding={() => navigateTo('landing')} />
                        )}
                    </div>
                    <div className={view === 'landing' ? 'contents' : 'hidden'}>
                        {visitedViews.has('landing') && (
                            <LandingPage onNavigateConsole={() => navigateTo('console')} />
                        )}
                    </div>
                </Suspense>
            </ErrorBoundary>
        </MotionConfig>
    );
}
