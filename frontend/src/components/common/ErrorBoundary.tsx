import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallbackTitle?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-[160px] w-full flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                        <AlertTriangle className="size-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-rose-900">
                        {this.props.fallbackTitle || 'Component Encountered an Issue'}
                    </h3>
                    <p className="mt-1 max-w-md text-xs text-rose-700">
                        {this.state.error?.message || 'An unexpected rendering error occurred.'}
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={this.handleReset}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-2xs hover:bg-rose-50 transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            type="button"
                            onClick={this.handleReload}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-rose-700 transition-colors"
                        >
                            <RefreshCw className="size-3" />
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

