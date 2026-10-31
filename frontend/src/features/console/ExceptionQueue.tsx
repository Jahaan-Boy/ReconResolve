import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AgGridReact, AllCommunityModule, ModuleRegistry } from '@/components/grid/AgGridWrapper';
import type { ColDef, CustomCellRendererProps, GetRowIdParams } from '@/components/grid/AgGridWrapper';
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

// Register AG Grid Community modules
ModuleRegistry.registerModules([AllCommunityModule]);

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
    const gridRef = useRef<AgGridReact<ExceptionSummary>>(null);

    const handleCopy = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    }, []);

    const handleExportCsv = useCallback(() => {
        if (items.length === 0) return;
        exportExceptionsToCsv(items, merchantSlug);
        onExportSuccess?.(items.length);
    }, [items, merchantSlug, onExportSuccess]);

    // Keep grid row selection in sync when selectedId prop updates
    useEffect(() => {
        const api = gridRef.current?.api;
        if (!api) return;

        if (selectedId) {
            const node = api.getRowNode(selectedId);
            if (node) {
                if (!node.isSelected()) {
                    node.setSelected(true, true);
                    api.ensureNodeVisible(node, 'middle');
                }
            }
        } else {
            api.deselectAll();
        }
    }, [selectedId, items]);

    // Stable row identifier
    const getRowId = useCallback((params: GetRowIdParams<ExceptionSummary>) => {
        return params.data.id;
    }, []);

    // Stable column definitions
    const columnDefs = useMemo<ColDef<ExceptionSummary>[]>(() => {
        return [
            {
                headerName: 'ID / Type',
                field: 'id',
                minWidth: 175,
                flex: 1.2,
                sortable: true,
                valueGetter: (params) => params.data?.id || '',
                cellRenderer: (params: CustomCellRendererProps<ExceptionSummary>) => {
                    const item = params.data;
                    if (!item) return null;
                    const isCopied = copiedId === item.id;

                    return (
                        <div className="flex flex-col justify-center gap-1 leading-tight py-1">
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                <span className="font-semibold text-slate-800 tracking-tight" title={item.id}>
                                    {truncateId(item.id, 6, 4)}
                                </span>
                                <button
                                    type="button"
                                    onClick={(e) => handleCopy(item.id, e)}
                                    className="p-0.5 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
                                    title="Copy full UUID"
                                    aria-label={`Copy exception ID ${item.id}`}
                                >
                                    {isCopied ? (
                                        <Check className="size-3 text-emerald-600" aria-hidden="true" />
                                    ) : (
                                        <Copy className="size-3" aria-hidden="true" />
                                    )}
                                </button>
                                <span className="rounded bg-slate-100 px-1 py-0.2 text-[10px] text-slate-500 font-sans font-medium">
                                    v{item.version}
                                </span>
                            </div>
                            <div className="flex items-center">
                                <ExceptionTypeBadge type={item.type} />
                            </div>
                        </div>
                    );
                },
            },
            {
                headerName: 'Status',
                field: 'status',
                width: 130,
                minWidth: 120,
                maxWidth: 145,
                sortable: true,
                valueGetter: (params) => params.data?.status || '',
                cellRenderer: (params: CustomCellRendererProps<ExceptionSummary>) => {
                    const item = params.data;
                    if (!item) return null;
                    return (
                        <div className="flex items-center h-full">
                            <StatusBadge status={item.status} size="sm" />
                        </div>
                    );
                },
            },
            {
                headerName: 'Break Evidence',
                colId: 'breakEvidence',
                minWidth: 170,
                flex: 1.4,
                sortable: true,
                valueGetter: (params) => (params.data ? getDiscrepancySummary(params.data) : ''),
                cellRenderer: (params: CustomCellRendererProps<ExceptionSummary>) => {
                    const item = params.data;
                    if (!item) return null;
                    const discrepancyText = getDiscrepancySummary(item);

                    return (
                        <div className="flex flex-col justify-center gap-0.5 leading-tight py-1">
                            <div
                                className={`text-xs font-semibold tabular-nums ${
                                    item.type === 'AMOUNT_MISMATCH'
                                        ? 'text-rose-700'
                                        : item.type === 'STATUS_DISCREPANCY'
                                        ? 'text-orange-700'
                                        : 'text-slate-800'
                                }`}
                            >
                                {discrepancyText}
                            </div>
                            {item.resolutionNote ? (
                                <div
                                    className="text-[11px] text-slate-500 truncate max-w-[200px]"
                                    title={item.resolutionNote}
                                >
                                    Note: {item.resolutionNote}
                                </div>
                            ) : (
                                <div className="text-[10px] text-slate-400 font-medium">
                                    {item.type.replace(/_/g, ' ')}
                                </div>
                            )}
                        </div>
                    );
                },
            },
            {
                headerName: 'Order / Txn',
                colId: 'orderTxn',
                minWidth: 140,
                flex: 1,
                sortable: true,
                valueGetter: (params) => `${params.data?.merchantOrderId || ''} ${params.data?.providerTransactionId || ''}`,
                cellRenderer: (params: CustomCellRendererProps<ExceptionSummary>) => {
                    const item = params.data;
                    if (!item) return null;

                    return (
                        <div className="flex flex-col justify-center gap-0.5 leading-tight py-1 text-[11px] font-mono">
                            <div>
                                {item.merchantOrderId ? (
                                    <span className="text-slate-800 font-medium">
                                        <span className="text-slate-400 font-sans mr-1 text-[10px] uppercase font-bold">Ord</span>
                                        {truncateId(item.merchantOrderId, 6, 2)}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic font-sans text-xs">No Order</span>
                                )}
                            </div>
                            <div>
                                {item.providerTransactionId ? (
                                    <span className="text-slate-600">
                                        <span className="text-slate-400 font-sans mr-1 text-[10px] uppercase font-bold">Txn</span>
                                        {truncateId(item.providerTransactionId, 6, 2)}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic font-sans text-xs">No Capture</span>
                                )}
                            </div>
                        </div>
                    );
                },
            },
            {
                headerName: 'Age',
                field: 'createdAt',
                width: 105,
                minWidth: 95,
                maxWidth: 120,
                sortable: true,
                comparator: (valueA, valueB) => {
                    const timeA = valueA ? new Date(valueA).getTime() : 0;
                    const timeB = valueB ? new Date(valueB).getTime() : 0;
                    const validA = Number.isFinite(timeA) ? timeA : 0;
                    const validB = Number.isFinite(timeB) ? timeB : 0;
                    return validA - validB;
                },
                cellRenderer: (params: CustomCellRendererProps<ExceptionSummary>) => {
                    const item = params.data;
                    if (!item) return null;
                    return (
                        <div className="flex items-center justify-end h-full text-[11px] text-slate-500 tabular-nums">
                            {formatShortDate(item.createdAt)}
                        </div>
                    );
                },
            },
        ];
    }, [copiedId, handleCopy]);

    // Check if any filter is active
    const hasActiveFilters = Boolean(
        filters.status || filters.type || filters.search || filters.createdFrom || filters.createdTo,
    );

    return (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Filter Section */}
            <ExceptionFilters
                filters={filters}
                onChangeFilters={onChangeFilters}
                onResetFilters={onResetFilters}
                statusCounts={statusCounts}
            />

            {/* Queue Table Body */}
            <div className="flex-1 overflow-hidden relative">
                {error ? (
                    <div className="p-4 overflow-y-auto h-full">
                        <ErrorState message={error} onRetry={onRetry} />
                    </div>
                ) : loading && items.length === 0 ? (
                    <div className="p-4 space-y-2 overflow-y-auto h-full">
                        <table className="w-full text-left border-collapse text-xs">
                            <tbody className="divide-y divide-slate-100">
                                <TableRowSkeleton />
                                <TableRowSkeleton />
                                <TableRowSkeleton />
                                <TableRowSkeleton />
                                <TableRowSkeleton />
                            </tbody>
                        </table>
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-8 h-full flex items-center justify-center">
                        <EmptyState
                            title={hasActiveFilters ? 'No matching exceptions' : 'No exceptions found'}
                            description={
                                hasActiveFilters
                                    ? 'No discrepancies match your selected status or filter parameters.'
                                    : 'All transactions and orders for this tenant are currently reconciled.'
                            }
                            action={
                                hasActiveFilters ? (
                                    <FintechButton
                                        size="sm"
                                        variant="secondary"
                                        onClick={onResetFilters}
                                        icon={<Filter className="size-3.5" />}
                                    >
                                        Clear Filters
                                    </FintechButton>
                                ) : undefined
                            }
                        />
                    </div>
                ) : (
                    <div className="ag-theme-quartz flowops-grid h-full w-full">
                        <AgGridReact<ExceptionSummary>
                            ref={gridRef}
                            rowData={items}
                            columnDefs={columnDefs}
                            getRowId={getRowId}
                            rowSelection={{
                                mode: 'singleRow',
                                enableClickSelection: true,
                                checkboxes: false,
                            }}
                            rowHeight={64}
                            headerHeight={38}
                            loading={loading}
                            rowClassRules={{
                                'flowops-row-selected': (params) => params.data?.id === selectedId,
                            }}
                            onRowClicked={(event) => {
                                if (event.data?.id && event.data.id !== selectedId) {
                                    onSelectException(event.data.id);
                                }
                            }}
                            onCellKeyDown={(event) => {
                                const kbEvent = event.event as KeyboardEvent | null | undefined;
                                if ((kbEvent?.key === 'Enter' || kbEvent?.key === ' ') && event.data?.id && event.data.id !== selectedId) {
                                    onSelectException(event.data.id);
                                }
                            }}
                            onSelectionChanged={(event) => {
                                const selectedNodes = event.api.getSelectedNodes();
                                if (selectedNodes.length > 0 && selectedNodes[0].data?.id) {
                                    const newId = selectedNodes[0].data.id;
                                    if (newId !== selectedId) {
                                        onSelectException(newId);
                                    }
                                }
                            }}
                            suppressCellFocus={false}
                            domLayout="normal"
                        />
                    </div>
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
                            <Download className="size-3 text-slate-500" aria-hidden="true" />
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
