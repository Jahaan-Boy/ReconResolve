import { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Check, Download, Filter } from 'lucide-react';
import type { ExceptionStatus, ExceptionSummary, ListExceptionsFilter, PaginationMetadata } from '@/services/api/types';
import { StatusBadge } from '@/components/fintech/StatusBadge';
import { ExceptionTypeBadge } from '@/components/fintech/ExceptionTypeBadge';
import { TableRowSkeleton } from '@/components/fintech/Skeleton';
import { EmptyState, ErrorState } from '@/components/fintech/FeedbackStates';
import { FintechButton } from '@/components/fintech/FintechButton';
import { ExceptionFilters } from './ExceptionFilters';
import { formatMinorUnits, formatShortDate, truncateId } from '@/lib/formatters';
import { exportExceptionsToCsv } from '@/lib/csv-export';

interface ExceptionQueueProps {
    items: ExceptionSummary[];
    pagination: PaginationMetadata;
    selectedId: string | null;
    onSelectException: (id: string) => void;
    filters: ListExceptionsFilter;
    onChangeFilters: (filters: ListExceptionsFilter) => void;
    onResetFilters: () => void;
    loading: boolean;
    error: string | null;
    onRetry: () => void;
    onNextPage: () => void;
    onPrevPage: () => void;
    hasPrevPage: boolean;
    statusCounts?: Record<ExceptionStatus, number>;
    merchantSlug?: string;
    onExportSuccess?: (count: number) => void;
}

export function ExceptionQueue({
    items,
    pagination,
    selectedId,
    onSelectException,
    filters,
    onChangeFilters,
    onResetFilters,
    loading,
    error,
    onRetry,
    onNextPage,
    onPrevPage,
    hasPrevPage,
    statusCounts,
    merchantSlug = 'default',
    onExportSuccess,
}: ExceptionQueueProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleExportCsv = () => {
        if (items.length === 0) return;
        exportExceptionsToCsv(items, merchantSlug);
        onExportSuccess?.(items.length);
    };

    /**
     * Extracts a concise discrepancy snippet from exception details or metadata.
     */
    function getDiscrepancySummary(item: ExceptionSummary): string {
        const det = item.details as {
            evidence?: {
                expectedAmountMinor?: string;
                actualAmountMinor?: string;
                orderStatus?: string;
            };
            reasonCode?: string;
            candidateCount?: number;
        } | null;
        if (item.type === 'AMOUNT_MISMATCH') {
            const exp = det?.evidence?.expectedAmountMinor;
            const act = det?.evidence?.actualAmountMinor;
            if (exp && act) {
                try {
                    const diff = BigInt(act) - BigInt(exp);
                    const formattedDiff = formatMinorUnits(diff < 0n ? (-diff).toString() : diff.toString());
                    return `${diff > 0n ? '+' : '-'}${formattedDiff} delta`;
                } catch {
                    return 'Amount Mismatch';
                }
            }
            return det?.reasonCode || 'Amount Mismatch';
        }
        if (item.type === 'STATUS_DISCREPANCY') {
            return `Order: ${det?.evidence?.orderStatus || 'Conflict'}`;
        }
        if (item.type === 'MISSING_PROVIDER_COUNTERPART') {
            return 'Awaiting Provider Capture';
        }
        if (item.type === 'MISSING_MERCHANT_COUNTERPART') {
            return 'Captured without Order';
        }
        if (item.type === 'AMBIGUOUS_MATCH') {
            return `${det?.candidateCount || 'Multiple'} candidate matches`;
        }
        return 'Discrepancy Break';
    }

    return (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Filter Section */}
            <ExceptionFilters
                filters={filters}
                onChangeFilters={onChangeFilters}
                onResetFilters={onResetFilters}
                statusCounts={statusCounts}
            />

            {/* Queue Table */}
            <div className="flex-1 overflow-auto">
                {error ? (
                    <div className="p-4">
                        <ErrorState message={error} onRetry={onRetry} />
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                                <th className="px-3.5 py-2.5">ID / Type</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5">Break Evidence</th>
                                <th className="px-3 py-2.5">Order / Txn</th>
                                <th className="px-3 py-2.5 text-right">Age</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && items.length === 0 ? (
                                <>
                                    <TableRowSkeleton />
                                    <TableRowSkeleton />
                                    <TableRowSkeleton />
                                    <TableRowSkeleton />
                                    <TableRowSkeleton />
                                </>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8">
                                        <EmptyState
                                            title="No exceptions found"
                                            description="No discrepancies match your selected status or filter parameters."
                                            action={
                                                <FintechButton
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={onResetFilters}
                                                    icon={<Filter className="size-3.5" />}
                                                >
                                                    Clear Filters
                                                </FintechButton>
                                            }
                                        />
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => {
                                    const isSelected = item.id === selectedId;
                                    const discrepancyText = getDiscrepancySummary(item);

                                    return (
                                        <tr
                                            key={item.id}
                                            onClick={() => onSelectException(item.id)}
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    onSelectException(item.id);
                                                }
                                            }}
                                            className={`group cursor-pointer transition-colors outline-none ${
                                                isSelected
                                                    ? 'bg-blue-50/70 border-l-3 border-l-fin-brand font-medium text-slate-900'
                                                    : 'hover:bg-slate-50/80 text-slate-700'
                                            }`}
                                        >
                                            {/* ID & Type */}
                                            <td className="px-3.5 py-3 align-top">
                                                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500">
                                                    <span>{truncateId(item.id, 6, 4)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCopy(item.id, e)}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-900"
                                                        title="Copy full UUID"
                                                    >
                                                        {copiedId === item.id ? (
                                                            <Check className="size-3 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="size-3" />
                                                        )}
                                                    </button>
                                                    <span className="text-[10px] text-slate-400 font-sans">
                                                        v{item.version}
                                                    </span>
                                                </div>
                                                <div className="mt-1">
                                                    <ExceptionTypeBadge type={item.type} />
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="px-3 py-3 align-top whitespace-nowrap">
                                                <StatusBadge status={item.status} size="sm" />
                                            </td>

                                            {/* Break Evidence Summary */}
                                            <td className="px-3 py-3 align-top">
                                                <div
                                                    className={`text-xs font-medium tabular-nums ${
                                                        item.type === 'AMOUNT_MISMATCH'
                                                            ? 'text-rose-700 font-semibold'
                                                            : item.type === 'STATUS_DISCREPANCY'
                                                            ? 'text-orange-700'
                                                            : 'text-slate-700'
                                                    }`}
                                                >
                                                    {discrepancyText}
                                                </div>
                                                {item.resolutionNote && (
                                                    <div className="mt-0.5 text-[11px] text-slate-400 truncate max-w-[170px]" title={item.resolutionNote}>
                                                        Note: {item.resolutionNote}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Order / Txn Ref */}
                                            <td className="px-3 py-3 align-top text-[11px] font-mono text-slate-500">
                                                <div>
                                                    {item.merchantOrderId ? (
                                                        <span className="text-slate-700">Ord: {truncateId(item.merchantOrderId, 6, 2)}</span>
                                                    ) : (
                                                        <span className="text-slate-400 italic">No Order</span>
                                                    )}
                                                </div>
                                                <div className="mt-0.5">
                                                    {item.providerTransactionId ? (
                                                        <span className="text-slate-600">Txn: {truncateId(item.providerTransactionId, 6, 2)}</span>
                                                    ) : (
                                                        <span className="text-slate-400 italic">No Capture</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Timestamp */}
                                            <td className="px-3 py-3 align-top text-right text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                                                {formatShortDate(item.createdAt)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 bg-slate-50/60 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                    <span className="tabular-nums">
                        Showing <span className="font-medium text-slate-900">{items.length}</span> exceptions
                        {pagination.totalCount !== undefined ? ` of ${pagination.totalCount}` : ''}
                    </span>
                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={handleExportCsv}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors ml-2 cursor-pointer shadow-2xs"
                            title={`Export ${items.length} exceptions as CSV`}
                        >
                            <Download className="size-3 text-slate-500" />
                            <span>Export CSV</span>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <FintechButton
                        size="sm"
                        variant="secondary"
                        disabled={!hasPrevPage || loading}
                        onClick={onPrevPage}
                        icon={<ChevronLeft className="size-3.5" />}
                    >
                        Prev
                    </FintechButton>
                    <FintechButton
                        size="sm"
                        variant="secondary"
                        disabled={!pagination.hasMore || loading}
                        onClick={onNextPage}
                        icon={<ChevronRight className="size-3.5" />}
                    >
                        Next
                    </FintechButton>
                </div>
            </div>
        </div>
    );
}
