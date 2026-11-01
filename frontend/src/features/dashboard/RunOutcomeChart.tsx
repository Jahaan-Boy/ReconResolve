import { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import type { DashboardTrendPoint } from '@/services/api/types';

export interface RunOutcomeChartProps {
    trend: DashboardTrendPoint[];
}

export function RunOutcomeChart({ trend }: RunOutcomeChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    if (!trend || trend.length < 2) {
        return (
            <div
                className="flex flex-col items-center justify-center rounded-xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs"
                role="region"
                aria-label="Reconciliation Outcomes Trend"
            >
                <div className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3">
                    <BarChart3 className="size-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">
                    Insufficient History for Trend
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    At least two reconciliation runs are required to compute outcome trajectories for the selected period.
                </p>
            </div>
        );
    }

    const maxTotal = Math.max(...trend.map((t) => t.totalConsidered), 10);
    const chartHeight = 160;
    const barWidth = Math.max(14, Math.min(36, Math.floor(600 / trend.length) - 8));
    const gap = 12;
    const totalSvgWidth = trend.length * (barWidth + gap) + 40;

    const activePoint = hoveredIndex !== null ? trend[hoveredIndex] : null;

    return (
        <div
            className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-5 shadow-2xs"
            role="region"
            aria-label="Reconciliation Outcomes Trend"
        >
            {/* Header: Title + Legend */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <BarChart3 className="size-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-900">
                        Run Outcomes Trend
                    </h2>
                    <span className="text-xs text-slate-400">
                        ({trend.length} runs in window)
                    </span>
                </div>

                {/* Legend */}
                <div
                    className="flex flex-wrap items-center gap-3.5 text-xs font-medium"
                    role="note"
                    aria-label="Outcome color legend"
                >
                    <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-xs bg-emerald-500" />
                        <span className="text-slate-600">Matched</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-xs bg-amber-500" />
                        <span className="text-slate-600">Ambiguous</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-xs bg-rose-500" />
                        <span className="text-slate-600">Unmatched</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-xs bg-slate-400" />
                        <span className="text-slate-600">Excluded</span>
                    </div>
                </div>
            </div>

            {/* Tooltip / Active Point Summary */}
            <div className="h-9 my-2 flex items-center justify-between text-xs">
                {activePoint ? (
                    <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 shadow-2xs">
                        <span className="font-semibold text-slate-900 font-mono">{activePoint.date}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-emerald-700 font-semibold">
                            {activePoint.matchedCount} matched ({activePoint.matchRatePercentage ?? 0}%)
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-amber-700 font-semibold">
                            {activePoint.ambiguousCount} ambiguous
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-rose-700 font-semibold">
                            {activePoint.unmatchedCount} unmatched
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">
                            {activePoint.excludedCount} excluded
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Info className="size-3.5 text-slate-400" />
                        <span>Hover or focus on any column to inspect exact record counts and rates</span>
                    </div>
                )}
            </div>

            {/* SVG Visualizer */}
            <div className="w-full overflow-x-auto pb-2">
                <svg
                    viewBox={`0 0 ${totalSvgWidth} ${chartHeight + 35}`}
                    className="w-full min-w-[480px] h-48 overflow-visible"
                    role="img"
                    aria-label={`Stacked bar chart of reconciliation outcomes over ${trend.length} runs`}
                >
                    {/* Horizontal Baseline */}
                    <line
                        x1="20"
                        y1={chartHeight}
                        x2={totalSvgWidth - 10}
                        y2={chartHeight}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                    />

                    {trend.map((point, idx) => {
                        const x = 25 + idx * (barWidth + gap);
                        const total = point.totalConsidered;

                        // Calculate stacked segment heights
                        const scale = (val: number) =>
                            total > 0 ? (val / maxTotal) * (chartHeight - 20) : 0;

                        const hMatched = scale(point.matchedCount);
                        const hAmbiguous = scale(point.ambiguousCount);
                        const hUnmatched = scale(point.unmatchedCount);
                        const hExcluded = scale(point.excludedCount);

                        // Stack positions (from baseline upwards)
                        const yMatched = chartHeight - hMatched;
                        const yAmbiguous = yMatched - hAmbiguous;
                        const yUnmatched = yAmbiguous - hUnmatched;
                        const yExcluded = yUnmatched - hExcluded;

                        const isHovered = hoveredIndex === idx;

                        return (
                            <g
                                key={point.runId || idx}
                                tabIndex={0}
                                role="button"
                                aria-label={`Run on ${point.date}: ${point.matchedCount} matched, ${point.unmatchedCount} unmatched, ${point.ambiguousCount} ambiguous`}
                                onMouseEnter={() => setHoveredIndex(idx)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                onFocus={() => setHoveredIndex(idx)}
                                onBlur={() => setHoveredIndex(null)}
                                className="cursor-pointer focus:outline-none"
                            >
                                {/* Column focus/hover background pill */}
                                <rect
                                    x={x - 4}
                                    y={0}
                                    width={barWidth + 8}
                                    height={chartHeight + 30}
                                    fill={isHovered ? 'rgba(241, 245, 249, 0.9)' : 'transparent'}
                                    rx={4}
                                />

                                {/* Stack Segment 1: Matched (Emerald) */}
                                {hMatched > 0 && (
                                    <rect
                                        x={x}
                                        y={yMatched}
                                        width={barWidth}
                                        height={hMatched}
                                        fill="#10b981"
                                        rx={2}
                                    />
                                )}

                                {/* Stack Segment 2: Ambiguous (Amber) */}
                                {hAmbiguous > 0 && (
                                    <rect
                                        x={x}
                                        y={yAmbiguous}
                                        width={barWidth}
                                        height={hAmbiguous}
                                        fill="#f59e0b"
                                        rx={2}
                                    />
                                )}

                                {/* Stack Segment 3: Unmatched (Rose) */}
                                {hUnmatched > 0 && (
                                    <rect
                                        x={x}
                                        y={yUnmatched}
                                        width={barWidth}
                                        height={hUnmatched}
                                        fill="#f43f5e"
                                        rx={2}
                                    />
                                )}

                                {/* Stack Segment 4: Excluded (Slate) */}
                                {hExcluded > 0 && (
                                    <rect
                                        x={x}
                                        y={yExcluded}
                                        width={barWidth}
                                        height={hExcluded}
                                        fill="#94a3b8"
                                        rx={2}
                                    />
                                )}

                                {/* Empty column indicator if total == 0 */}
                                {total === 0 && (
                                    <rect
                                        x={x}
                                        y={chartHeight - 4}
                                        width={barWidth}
                                        height={4}
                                        fill="#cbd5e1"
                                        rx={1}
                                    />
                                )}

                                {/* Date Label */}
                                <text
                                    x={x + barWidth / 2}
                                    y={chartHeight + 16}
                                    textAnchor="middle"
                                    fill={isHovered ? '#0f172a' : '#64748b'}
                                    fontSize="10"
                                    fontFamily="monospace"
                                    fontWeight={isHovered ? '600' : '400'}
                                >
                                    {point.date.slice(5)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Accessible Screen-Reader Summary Table */}
            <table className="sr-only">
                <caption>Reconciliation run outcomes trend data</caption>
                <thead>
                    <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Matched</th>
                        <th scope="col">Ambiguous</th>
                        <th scope="col">Unmatched</th>
                        <th scope="col">Excluded</th>
                        <th scope="col">Match Rate</th>
                    </tr>
                </thead>
                <tbody>
                    {trend.map((point) => (
                        <tr key={point.runId}>
                            <td>{point.date}</td>
                            <td>{point.matchedCount}</td>
                            <td>{point.ambiguousCount}</td>
                            <td>{point.unmatchedCount}</td>
                            <td>{point.excludedCount}</td>
                            <td>
                                {point.matchRatePercentage !== null
                                    ? `${point.matchRatePercentage}%`
                                    : 'N/A'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
