import { useState, useEffect } from 'react';
import { Calendar, RotateCcw, Search, X } from 'lucide-react';
import type { ExceptionStatus, ExceptionType, ListExceptionsFilter } from '@/services/api/types';
import { FintechButton } from '@/components/fintech/FintechButton';

interface ExceptionFiltersProps {
    filters: ListExceptionsFilter;
    onChangeFilters: (newFilters: ListExceptionsFilter) => void;
    onResetFilters: () => void;
    statusCounts?: Record<ExceptionStatus, number>;
}

const STATUS_TABS: Array<{ id: ExceptionStatus | 'ALL'; label: string }> = [
    { id: 'ALL', label: 'All' },
    { id: 'OPEN', label: 'Open' },
    { id: 'INVESTIGATING', label: 'Investigating' },
    { id: 'RESOLVED', label: 'Resolved' },
    { id: 'DISMISSED', label: 'Dismissed' },
];

const EXCEPTION_TYPES: Array<{ value: ExceptionType; label: string }> = [
    { value: 'AMOUNT_MISMATCH', label: 'Amount Mismatch' },
    { value: 'STATUS_DISCREPANCY', label: 'Status Discrepancy' },
    { value: 'MISSING_PROVIDER_COUNTERPART', label: 'Missing Provider Transaction' },
    { value: 'MISSING_MERCHANT_COUNTERPART', label: 'Missing Merchant Order' },
    { value: 'AMBIGUOUS_MATCH', label: 'Ambiguous Match' },
];

export function ExceptionFilters({
    filters,
    onChangeFilters,
    onResetFilters,
    statusCounts,
}: ExceptionFiltersProps) {
    const [searchInput, setSearchInput] = useState(filters.search || '');
    const [showDateRange, setShowDateRange] = useState(Boolean(filters.createdFrom || filters.createdTo));

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchInput !== (filters.search || '')) {
                onChangeFilters({
                    ...filters,
                    search: searchInput.trim() || undefined,
                    cursor: undefined, // Reset cursor on search change
                });
            }
        }, 300);
        return () => clearTimeout(handler);
    }, [searchInput, filters, onChangeFilters]);

    const activeStatus = filters.status || 'ALL';
    const hasActiveFilters = Boolean(
        filters.status || filters.type || filters.search || filters.createdFrom || filters.createdTo,
    );

    return (
        <div className="space-y-3 bg-white p-3.5 sm:p-4 border-b border-slate-200">
            {/* Status Tabs */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1 sm:gap-1.5" role="tablist" aria-label="Exception Status Tabs">
                    {STATUS_TABS.map((tab) => {
                        const isSelected = activeStatus === tab.id;
                        const count =
                            tab.id === 'ALL'
                                ? statusCounts
                                    ? Object.values(statusCounts).reduce((acc, curr) => acc + curr, 0)
                                    : undefined
                                : statusCounts
                                ? statusCounts[tab.id]
                                : undefined;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChangeFilters({
                                        ...filters,
                                        status: tab.id === 'ALL' ? undefined : tab.id,
                                        cursor: undefined,
                                    });
                                }}
                                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                                    isSelected
                                        ? 'bg-fin-brand text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <span>{tab.label}</span>
                                {count !== undefined && (
                                    <span
                                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums ${
                                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={onResetFilters}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 font-medium px-2 py-1 rounded transition-colors"
                        title="Clear all active filters"
                    >
                        <RotateCcw className="size-3" />
                        <span className="hidden sm:inline">Reset</span>
                    </button>
                )}
            </div>

            {/* Filter Bar: Search, Type dropdown, Date toggle */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search ID, Order ref, or Txn..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-fin-brand focus:ring-1 focus:ring-fin-brand focus:outline-none"
                    />
                    {searchInput && (
                        <button
                            type="button"
                            onClick={() => setSearchInput('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                {/* Discrepancy Type Dropdown */}
                <div className="relative">
                    <select
                        value={filters.type || ''}
                        onChange={(e) =>
                            onChangeFilters({
                                ...filters,
                                type: (e.target.value as ExceptionType) || undefined,
                                cursor: undefined,
                            })
                        }
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 focus:border-fin-brand focus:ring-1 focus:ring-fin-brand focus:outline-none cursor-pointer"
                        aria-label="Filter by discrepancy type"
                    >
                        <option value="">All Discrepancy Types</option>
                        {EXCEPTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date range toggle */}
                <FintechButton
                    variant={showDateRange ? 'primary' : 'secondary'}
                    size="sm"
                    icon={<Calendar className="size-3.5" />}
                    onClick={() => setShowDateRange((v) => !v)}
                    className="text-xs"
                >
                    Date
                </FintechButton>
            </div>

            {/* Collapsible Date Range Controls */}
            {showDateRange && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <span className="text-[11px] font-medium text-slate-400">Created between:</span>
                    <input
                        type="date"
                        value={filters.createdFrom?.split('T')[0] || ''}
                        onChange={(e) =>
                            onChangeFilters({
                                ...filters,
                                createdFrom: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                                cursor: undefined,
                            })
                        }
                        className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-fin-brand focus:outline-none bg-white"
                        aria-label="Filter created from date"
                    />
                    <span>to</span>
                    <input
                        type="date"
                        value={filters.createdTo?.split('T')[0] || ''}
                        onChange={(e) =>
                            onChangeFilters({
                                ...filters,
                                createdTo: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                                cursor: undefined,
                            })
                        }
                        className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-fin-brand focus:outline-none bg-white"
                        aria-label="Filter created to date"
                    />
                    {(filters.createdFrom || filters.createdTo) && (
                        <button
                            type="button"
                            onClick={() =>
                                onChangeFilters({
                                    ...filters,
                                    createdFrom: undefined,
                                    createdTo: undefined,
                                    cursor: undefined,
                                })
                            }
                            className="text-xs text-slate-400 hover:text-slate-600 underline ml-1"
                        >
                            Clear dates
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
