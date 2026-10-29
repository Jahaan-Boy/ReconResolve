import { useState, useEffect } from 'react';
import {
    RefreshCw,
    PlayCircle,
    Calendar,
    Building2,
    Clock,
} from 'lucide-react';

export type DashboardDatePreset = '24h' | '7d' | '30d' | 'all';

export interface DashboardHeaderProps {
    merchantName: string;
    merchantSlug: string;
    selectedPreset: DashboardDatePreset;
    onSelectPreset: (preset: DashboardDatePreset) => void;
    onRefresh: () => void;
    isRefreshing: boolean;
    lastUpdated: Date | null;
    canTriggerRun: boolean;
    onTriggerRun: () => void;
}

export function DashboardHeader({
    merchantName,
    merchantSlug,
    selectedPreset,
    onSelectPreset,
    onRefresh,
    isRefreshing,
    lastUpdated,
    canTriggerRun,
    onTriggerRun,
}: DashboardHeaderProps) {
    const [timeAgo, setTimeAgo] = useState<string>('Just now');

    useEffect(() => {
        if (!lastUpdated) {
            setTimeAgo('Never');
            return;
        }

        const updateTimeAgo = () => {
            const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
            if (seconds < 10) {
                setTimeAgo('Just now');
            } else if (seconds < 60) {
                setTimeAgo(`${seconds}s ago`);
            } else if (seconds < 3600) {
                const mins = Math.floor(seconds / 60);
                setTimeAgo(`${mins}m ago`);
            } else {
                const hours = Math.floor(seconds / 3600);
                setTimeAgo(`${hours}h ago`);
            }
        };

        updateTimeAgo();
        const interval = setInterval(updateTimeAgo, 5000);
        return () => clearInterval(interval);
    }, [lastUpdated]);

    const presets: Array<{ id: DashboardDatePreset; label: string }> = [
        { id: '24h', label: 'Last 24h' },
        { id: '7d', label: 'Last 7d' },
        { id: '30d', label: 'Last 30d' },
        { id: 'all', label: 'All Time' },
    ];

    return (
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 bg-white/70 px-4 sm:px-6 py-4 backdrop-blur-md">
            {/* Left: Title & Merchant Identity */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                        Reconciliation Overview
                    </h1>
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 shadow-2xs">
                        <Building2 className="size-3 text-slate-400" />
                        <span>{merchantName}</span>
                        <span className="text-slate-400">({merchantSlug})</span>
                    </span>
                </div>
                <p className="text-xs text-slate-500">
                    Real-time operational health, automated matching outcomes, and discrepancy trends.
                </p>
            </div>

            {/* Right: Controls (Date Range Presets + Refresh + Run CTA) */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                {/* Date Presets */}
                <div
                    className="flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5"
                    role="group"
                    aria-label="Filter overview by date window"
                >
                    <Calendar className="ml-2 mr-1 size-3.5 text-slate-400" />
                    {presets.map((p) => {
                        const isActive = selectedPreset === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onSelectPreset(p.id)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                                    isActive
                                        ? 'bg-white text-slate-900 shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                                aria-pressed={isActive}
                            >
                                {p.label}
                            </button>
                        );
                    })}
                </div>

                {/* Refresh Affordance */}
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
                    title={`Last updated ${timeAgo}`}
                >
                    <RefreshCw
                        className={`size-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-fin-brand' : ''}`}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                    <span className="text-[11px] text-slate-400 inline-flex items-center gap-0.5">
                        <Clock className="size-2.5" />
                        {timeAgo}
                    </span>
                </button>

                {/* Permitted Primary Action */}
                {canTriggerRun ? (
                    <button
                        type="button"
                        onClick={onTriggerRun}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 active:bg-emerald-700 transition-colors"
                    >
                        <PlayCircle className="size-4" />
                        <span>Run Reconciliation</span>
                    </button>
                ) : (
                    <div
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-400 cursor-not-allowed"
                        title="Read-only viewers cannot initiate reconciliation runs"
                    >
                        <PlayCircle className="size-3.5 opacity-50" />
                        <span>Run (Read Only)</span>
                    </div>
                )}
            </div>
        </header>
    );
}

