import { useState } from 'react';
import { Building2, Check, Copy, CreditCard, FileX2 } from 'lucide-react';
import type { LinkedMerchantOrderSummary, LinkedProviderTransactionSummary } from '@/services/api/types';
import { formatMinorUnits, formatTimestamp } from '@/lib/formatters';

interface EvidenceComparisonProps {
    order?: LinkedMerchantOrderSummary | null;
    providerTxn?: LinkedProviderTransactionSummary | null;
}

export function EvidenceComparison({ order, providerTxn }: EvidenceComparisonProps) {
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const copyToClipboard = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 1500);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Merchant Order Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                <Building2 className="size-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-slate-900">Merchant Order Record</h4>
                                <p className="text-[10px] text-slate-400">Internal Order System</p>
                            </div>
                        </div>
                        {order && (
                            <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {order.status}
                            </span>
                        )}
                    </div>

                    {order ? (
                        <dl className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">External Order ID</dt>
                                <dd className="font-mono font-medium text-slate-900 flex items-center gap-1.5">
                                    <span>{order.externalOrderId}</span>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(order.externalOrderId, 'ord')}
                                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                        title="Copy Order ID"
                                    >
                                        {copiedField === 'ord' ? (
                                            <Check className="size-3 text-emerald-600" />
                                        ) : (
                                            <Copy className="size-3" />
                                        )}
                                    </button>
                                </dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Expected Amount</dt>
                                <dd className="font-semibold text-slate-900 text-sm tabular-nums">
                                    {formatMinorUnits(order.amountMinor, order.currency)}
                                </dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Currency</dt>
                                <dd className="font-mono font-medium text-slate-700">{order.currency}</dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Created At</dt>
                                <dd className="text-slate-600 tabular-nums text-[11px]">
                                    {formatTimestamp(order.orderedAt)}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <div className="py-8 flex flex-col items-center justify-center text-center">
                            <FileX2 className="size-8 text-slate-300 mb-2" />
                            <p className="text-xs font-medium text-slate-700">No Merchant Order Found</p>
                            <p className="text-[11px] text-slate-400 max-w-[200px] mt-0.5">
                                This transaction occurred without a recorded internal order.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Provider Transaction Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div className="flex items-center gap-2">
                            <div className="size-7 rounded-lg bg-blue-50 flex items-center justify-center text-fin-brand">
                                <CreditCard className="size-4" />
                            </div>
                            <div>
                                <h4 className="text-xs font-semibold text-slate-900">Provider Settlement</h4>
                                <p className="text-[10px] text-slate-400">PayPal Gateway</p>
                            </div>
                        </div>
                        {providerTxn && (
                            <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {providerTxn.status}
                            </span>
                        )}
                    </div>

                    {providerTxn ? (
                        <dl className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Provider Txn ID</dt>
                                <dd className="font-mono font-medium text-slate-900 flex items-center gap-1.5">
                                    <span className="max-w-[130px] truncate" title={providerTxn.providerTxnId}>
                                        {providerTxn.providerTxnId}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(providerTxn.providerTxnId, 'txn')}
                                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                                        title="Copy Provider Txn ID"
                                    >
                                        {copiedField === 'txn' ? (
                                            <Check className="size-3 text-emerald-600" />
                                        ) : (
                                            <Copy className="size-3" />
                                        )}
                                    </button>
                                </dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Captured Amount</dt>
                                <dd className="font-semibold text-slate-900 text-sm tabular-nums">
                                    {formatMinorUnits(providerTxn.amountMinor, providerTxn.currency)}
                                </dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Currency</dt>
                                <dd className="font-mono font-medium text-slate-700">{providerTxn.currency}</dd>
                            </div>

                            <div className="flex items-center justify-between">
                                <dt className="text-slate-500 text-[11px]">Occurred At</dt>
                                <dd className="text-slate-600 tabular-nums text-[11px]">
                                    {formatTimestamp(providerTxn.occurredAt)}
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <div className="py-8 flex flex-col items-center justify-center text-center">
                            <FileX2 className="size-8 text-slate-300 mb-2" />
                            <p className="text-xs font-medium text-slate-700">No Provider Capture</p>
                            <p className="text-[11px] text-slate-400 max-w-[200px] mt-0.5">
                                No capture or settlement record was reported by the provider.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
