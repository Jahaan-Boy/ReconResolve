export function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-pulse" aria-label="Loading overview metrics" role="status">
            {/* Summary Cards Skeleton (6 cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                        key={i}
                        className="rounded-xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-2xs"
                    >
                        <div className="flex items-center justify-between">
                            <div className="h-3 w-16 bg-slate-200/80 rounded" />
                            <div className="size-4 bg-slate-200/80 rounded-full" />
                        </div>
                        <div className="h-4 w-24 bg-slate-100 rounded" />
                        <div className="h-7 w-20 bg-slate-200 rounded" />
                        <div className="h-3 w-32 bg-slate-100 rounded pt-1" />
                    </div>
                ))}
            </div>

            {/* Run Outcome Trend Chart Skeleton */}
            <div className="rounded-xl border border-slate-200/80 bg-white p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="h-4 w-36 bg-slate-200 rounded" />
                    <div className="flex gap-3">
                        <div className="h-3 w-16 bg-slate-100 rounded" />
                        <div className="h-3 w-16 bg-slate-100 rounded" />
                    </div>
                </div>
                <div className="h-44 w-full bg-slate-50 rounded-lg flex items-end justify-between p-4 gap-2">
                    {[35, 60, 45, 75, 55, 80, 70].map((h, idx) => (
                        <div
                            key={idx}
                            className="bg-slate-200 rounded-t w-10"
                            style={{ height: `${h}%` }}
                        />
                    ))}
                </div>
            </div>

            {/* Split Lower Grid: Recent Runs (7 cols) + Exceptions Attention (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 rounded-xl border border-slate-200/80 bg-white p-5 space-y-3 shadow-2xs">
                    <div className="h-4 w-44 bg-slate-200 rounded mb-3" />
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-10 bg-slate-50 border border-slate-100 rounded w-full" />
                    ))}
                </div>
                <div className="lg:col-span-5 rounded-xl border border-slate-200/80 bg-white p-5 space-y-3 shadow-2xs">
                    <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-12 bg-slate-50 border border-slate-100 rounded w-full" />
                    ))}
                </div>
            </div>
        </div>
    );
}
