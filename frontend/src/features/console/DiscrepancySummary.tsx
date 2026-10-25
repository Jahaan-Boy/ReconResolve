import { AlertTriangle, ArrowRight, DollarSign, FileWarning, HelpCircle, Split } from 'lucide-react';
import type { ExceptionDetail } from '@/services/api/types';
import { formatMinorDifference, formatMinorUnits } from '@/lib/formatters';

interface DiscrepancySummaryProps {
    exception: ExceptionDetail;
}

export function DiscrepancySummary({ exception }: DiscrepancySummaryProps) {
    const { type, linkedMerchantOrder, linkedProviderTransaction, details } = exception;

    if (type === 'AMOUNT_MISMATCH') {
        const orderAmount = linkedMerchantOrder?.amountMinor;
        const providerAmount = linkedProviderTransaction?.amountMinor;
        const currency = linkedMerchantOrder?.currency || linkedProviderTransaction?.currency || 'USD';
        const diff = formatMinorDifference(orderAmount, providerAmount, currency);

        return (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-center gap-2 text-rose-800 font-semibold text-xs tracking-wide uppercase mb-3">
                    <DollarSign className="size-4 text-rose-600" />
                    <span>Financial Discrepancy Detected: Amount Mismatch</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-white p-3.5 rounded-lg border border-rose-100 shadow-2xs">
                    <div>
                        <div className="text-[11px] font-medium text-slate-500">Merchant Order Total</div>
                        <div className="text-base font-semibold text-slate-900 tabular-nums">
                            {formatMinorUnits(orderAmount, currency)}
                        </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-center gap-2 text-slate-400">
                        <ArrowRight className="size-4 hidden sm:block text-slate-300" />
                        <div className="text-center">
                            <div className="text-[10px] font-medium uppercase text-rose-600 tracking-wider">
                                Net Difference
                            </div>
                            <div className="text-sm font-bold text-rose-700 tabular-nums">
                                {diff.formatted}
                            </div>
                        </div>
                        <ArrowRight className="size-4 hidden sm:block text-slate-300" />
                    </div>

                    <div className="sm:text-right">
                        <div className="text-[11px] font-medium text-slate-500">Provider Captured Total</div>
                        <div className="text-base font-semibold text-slate-900 tabular-nums">
                            {formatMinorUnits(providerAmount, currency)}
                        </div>
                    </div>
                </div>

                <p className="mt-2.5 text-xs text-rose-900/80 leading-relaxed">
                    Provider charged customer <strong className="font-semibold text-rose-950">{formatMinorUnits(providerAmount, currency)}</strong>, but internal order expects <strong className="font-semibold text-rose-950">{formatMinorUnits(orderAmount, currency)}</strong>. An unexplained variance of <strong className="font-semibold text-rose-950">{diff.formatted}</strong> requires operator reconciliation.
                </p>
            </div>
        );
    }

    if (type === 'STATUS_DISCREPANCY') {
        const orderStatus = linkedMerchantOrder?.status || 'UNKNOWN';
        const providerStatus = linkedProviderTransaction?.status || 'UNKNOWN';

        return (
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                <div className="flex items-center gap-2 text-orange-900 font-semibold text-xs tracking-wide uppercase mb-3">
                    <AlertTriangle className="size-4 text-orange-600" />
                    <span>State Inconsistency: Conflicting Lifecycle Statuses</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3.5 rounded-lg border border-orange-100 shadow-2xs">
                    <div>
                        <div className="text-[11px] font-medium text-slate-500">Merchant Order Status</div>
                        <div className="text-sm font-bold text-rose-600 font-mono mt-0.5">
                            {orderStatus}
                        </div>
                    </div>

                    <div className="text-xs text-slate-400 font-medium">CONFLICTS WITH</div>

                    <div>
                        <div className="text-[11px] font-medium text-slate-500">Provider Settlement Status</div>
                        <div className="text-sm font-bold text-emerald-600 font-mono mt-0.5">
                            {providerStatus}
                        </div>
                    </div>
                </div>

                <p className="mt-2.5 text-xs text-orange-900/80 leading-relaxed">
                    Funds were captured by PayPal even though the order record is marked <strong className="font-semibold text-orange-950">{orderStatus}</strong>. Potential refund omission, void failure, or post-cancellation webhook race.
                </p>
            </div>
        );
    }

    if (type === 'MISSING_PROVIDER_COUNTERPART') {
        return (
            <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
                <div className="flex items-center gap-2 text-purple-900 font-semibold text-xs tracking-wide uppercase mb-2">
                    <FileWarning className="size-4 text-purple-600" />
                    <span>Missing Provider Counterpart</span>
                </div>
                <p className="text-xs text-purple-900/90 leading-relaxed">
                    Merchant order was recorded with expected payment provider, but no corresponding settlement, authorization, or capture event was found in the provider records during the reconciliation window.
                </p>
            </div>
        );
    }

    if (type === 'MISSING_MERCHANT_COUNTERPART') {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs tracking-wide uppercase mb-2">
                    <HelpCircle className="size-4 text-amber-600" />
                    <span>Unmatched Provider Transaction (Ghost Capture)</span>
                </div>
                <p className="text-xs text-amber-900/90 leading-relaxed">
                    PayPal successfully captured customer funds, but no matching merchant order exists in the internal database. This may be a direct invoice charge or an un-persisted checkout session.
                </p>
            </div>
        );
    }

    if (type === 'AMBIGUOUS_MATCH') {
        const candidateCount =
            typeof details === 'object' &&
            details !== null &&
            'candidateCount' in details &&
            typeof (details as Record<string, unknown>).candidateCount === 'number'
                ? ((details as Record<string, unknown>).candidateCount as number)
                : 2;
        return (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex items-center gap-2 text-sky-900 font-semibold text-xs tracking-wide uppercase mb-2">
                    <Split className="size-4 text-sky-600" />
                    <span>Ambiguous Multiple Candidates ({candidateCount})</span>
                </div>
                <p className="text-xs text-sky-900/90 leading-relaxed">
                    Multiple eligible merchant orders match the provider transaction amount and currency within the 24-hour time window. ReconResolve strictly refuses to guess fuzzy pairings to maintain audit integrity.
                </p>
            </div>
        );
    }

    return null;
}
