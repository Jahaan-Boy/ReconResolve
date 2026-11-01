import { useState, useEffect, useCallback } from 'react';
import {
    X,
    PlusCircle,
    ListPlus,
    CheckCircle2,
    AlertCircle,
    RefreshCw,
    Package,
} from 'lucide-react';
import { ordersApiClient } from '@/services/api/orders-api';
import type {
    BatchIngestResult,
    IngestOrderInput,
    MerchantOrderStatus,
    MerchantOrderSummary,
    SingleIngestResult,
} from '@/services/api/types';

interface OrderIngestionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    merchantId: string;
    onOrderIngested?: () => void;
}

export function OrderIngestionDialog({
    isOpen,
    onClose,
    merchantId,
    onOrderIngested,
}: OrderIngestionDialogProps) {
    const [mode, setMode] = useState<'single' | 'batch' | 'list'>('single');

    // Single order form state
    const [externalOrderId, setExternalOrderId] = useState('');
    const [amount, setAmount] = useState('25.00');
    const [currency, setCurrency] = useState('USD');
    const [status, setStatus] = useState<MerchantOrderStatus>('OPEN');
    const [orderedAt, setOrderedAt] = useState(() => new Date().toISOString());
    const [metadataJson, setMetadataJson] = useState('{}');

    // Batch form state
    const [batchJson, setBatchJson] = useState(() =>
        JSON.stringify(
            [
                {
                    externalOrderId: `ord-${Date.now()}-1`,
                    amount: '19.99',
                    currency: 'USD',
                    status: 'OPEN',
                    orderedAt: new Date().toISOString(),
                },
                {
                    externalOrderId: `ord-${Date.now()}-2`,
                    amount: '45.50',
                    currency: 'USD',
                    status: 'PAID',
                    orderedAt: new Date().toISOString(),
                },
            ],
            null,
            2,
        ),
    );

    // Results & status
    const [loading, setLoading] = useState(false);
    const [singleResult, setSingleResult] = useState<SingleIngestResult | null>(null);
    const [batchResult, setBatchResult] = useState<BatchIngestResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // List view state
    const [ordersList, setOrdersList] = useState<MerchantOrderSummary[]>([]);
    const [loadingList, setLoadingList] = useState(false);

    const loadRecentOrders = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await ordersApiClient.listOrders(merchantId, { limit: 20 });
            setOrdersList(res.items);
        } catch (err: unknown) {
            console.error('Failed to load orders:', err);
        } finally {
            setLoadingList(false);
        }
    }, [merchantId]);

    useEffect(() => {
        if (isOpen && mode === 'list') {
            loadRecentOrders();
        }
    }, [isOpen, mode, loadRecentOrders]);

    if (!isOpen) return null;

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        setSingleResult(null);

        try {
            let parsedMeta: Record<string, unknown> | null = null;
            if (metadataJson.trim()) {
                parsedMeta = JSON.parse(metadataJson);
            }

            const input: IngestOrderInput = {
                externalOrderId: externalOrderId.trim(),
                amount: amount.trim(),
                currency: currency.trim().toUpperCase(),
                status,
                orderedAt,
                metadata: parsedMeta,
            };

            const result = await ordersApiClient.ingestSingleOrder(merchantId, input);
            setSingleResult(result);
            if (onOrderIngested) onOrderIngested();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to ingest order';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleBatchSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);
        setBatchResult(null);

        try {
            const parsed = JSON.parse(batchJson);
            if (!Array.isArray(parsed)) {
                throw new Error('Batch JSON must be an array of order objects');
            }

            const result = await ordersApiClient.ingestBatchOrders(merchantId, parsed);
            setBatchResult(result);
            if (onOrderIngested) onOrderIngested();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to ingest batch orders';
            setErrorMessage(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
            <div className="relative w-full max-w-3xl bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 border border-indigo-200/70 text-indigo-600 rounded-xl">
                            <Package className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">Merchant Order Ingestion</h2>
                            <p className="text-xs text-slate-500">
                                Tenant-scoped, idempotent expected order ingestion for reconciliation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Close modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 pt-2">
                    <button
                        onClick={() => {
                            setMode('single');
                            setErrorMessage(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                            mode === 'single'
                                ? 'border-fin-brand text-fin-brand'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <PlusCircle className="w-4 h-4" />
                        Single Order
                    </button>
                    <button
                        onClick={() => {
                            setMode('batch');
                            setErrorMessage(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                            mode === 'batch'
                                ? 'border-fin-brand text-fin-brand'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <ListPlus className="w-4 h-4" />
                        Batch JSON Ingest
                    </button>
                    <button
                        onClick={() => {
                            setMode('list');
                            setErrorMessage(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                            mode === 'list'
                                ? 'border-fin-brand text-fin-brand'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <RefreshCw className="w-4 h-4" />
                        View Ingested Orders
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {errorMessage && (
                        <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 shadow-2xs">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-semibold">Ingestion Error: </span>
                                {errorMessage}
                            </div>
                        </div>
                    )}

                    {/* MODE 1: Single Order */}
                    {mode === 'single' && (
                        <form onSubmit={handleSingleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        External Order ID *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={externalOrderId}
                                        onChange={(e) => setExternalOrderId(e.target.value)}
                                        placeholder="e.g. ord-shopify-90214"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Currency (ISO 4217) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={3}
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                                        placeholder="USD"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Amount *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="25.00"
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as MerchantOrderStatus)}
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs"
                                    >
                                        <option value="OPEN">OPEN</option>
                                        <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
                                        <option value="PAID">PAID</option>
                                        <option value="CANCELLED">CANCELLED</option>
                                        <option value="REFUNDED">REFUNDED</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Ordered At (ISO 8601) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={orderedAt}
                                        onChange={(e) => setOrderedAt(e.target.value)}
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs font-mono"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Metadata (JSON)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={metadataJson}
                                        onChange={(e) => setMetadataJson(e.target.value)}
                                        placeholder='{"providerOrderId": "PAYPAL-ORDER-123"}'
                                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-fin-brand hover:bg-fin-brand-hover text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition shadow-2xs"
                                >
                                    {loading ? 'Ingesting Order...' : 'Ingest Order'}
                                </button>
                            </div>

                            {/* Outcome display */}
                            {singleResult && (
                                <div className={`p-4 rounded-xl border shadow-2xs ${
                                    singleResult.outcome === 'created'
                                        ? 'bg-emerald-50 border-emerald-200'
                                        : 'bg-amber-50 border-amber-200'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className={`w-4 h-4 ${
                                            singleResult.outcome === 'created' ? 'text-emerald-600' : 'text-amber-600'
                                        }`} />
                                        <span className={`text-xs font-semibold capitalize ${
                                            singleResult.outcome === 'created' ? 'text-emerald-800' : 'text-amber-800'
                                        }`}>
                                            Order {singleResult.outcome === 'created' ? 'Successfully Created' : 'Duplicate Detected (Idempotent)'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-mono">
                                        <div><span className="text-slate-400">Order ID:</span> {singleResult.order.id}</div>
                                        <div><span className="text-slate-400">Ext Reference:</span> {singleResult.order.externalOrderId}</div>
                                        <div><span className="text-slate-400">Amount:</span> {singleResult.order.amountMinor} {singleResult.order.currency}</div>
                                        <div><span className="text-slate-400">Status:</span> {singleResult.order.status}</div>
                                    </div>
                                </div>
                            )}
                        </form>
                    )}

                    {/* MODE 2: Batch JSON */}
                    {mode === 'batch' && (
                        <form onSubmit={handleBatchSubmit} className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-semibold text-slate-700">
                                        Batch Order Array (JSON, Max 100 records)
                                    </label>
                                    <span className="text-xs text-slate-400 font-mono">
                                        Bounded batch
                                    </span>
                                </div>
                                <textarea
                                    rows={10}
                                    value={batchJson}
                                    onChange={(e) => setBatchJson(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 font-mono focus:outline-hidden focus:border-fin-brand focus:ring-2 focus:ring-fin-brand/10 shadow-2xs"
                                />
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-fin-brand hover:bg-fin-brand-hover text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition shadow-2xs"
                                >
                                    {loading ? 'Processing Batch...' : 'Submit Batch Ingestion'}
                                </button>
                            </div>

                            {/* Batch Result Summary */}
                            {batchResult && (
                                <div className="space-y-3 pt-2">
                                    <div className="grid grid-cols-4 gap-2 text-center">
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                            <div className="text-xs text-slate-500 font-medium">Received</div>
                                            <div className="text-lg font-bold text-slate-900 font-mono">{batchResult.summary.received}</div>
                                        </div>
                                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                                            <div className="text-xs text-emerald-700 font-medium">Created</div>
                                            <div className="text-lg font-bold text-emerald-800 font-mono">{batchResult.summary.created}</div>
                                        </div>
                                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                                            <div className="text-xs text-amber-700 font-medium">Duplicates</div>
                                            <div className="text-lg font-bold text-amber-800 font-mono">{batchResult.summary.duplicates}</div>
                                        </div>
                                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                                            <div className="text-xs text-rose-700 font-medium">Rejected</div>
                                            <div className="text-lg font-bold text-rose-800 font-mono">{batchResult.summary.rejected}</div>
                                        </div>
                                    </div>

                                    {/* Per-record outcome table */}
                                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider sticky top-0 border-b border-slate-200 text-[10px]">
                                                <tr>
                                                    <th className="py-2 px-3">#</th>
                                                    <th className="py-2 px-3">External ID</th>
                                                    <th className="py-2 px-3">Status</th>
                                                    <th className="py-2 px-3">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                                                {batchResult.results.map((r) => (
                                                    <tr key={r.index} className="hover:bg-slate-50">
                                                        <td className="py-2 px-3 text-slate-400">{r.index}</td>
                                                        <td className="py-2 px-3 text-slate-900 font-semibold">{r.externalOrderId}</td>
                                                        <td className="py-2 px-3 font-sans">
                                                            <span
                                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                                                    r.status === 'created'
                                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                        : r.status === 'duplicate'
                                                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                                }`}
                                                            >
                                                                {r.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 text-slate-500">
                                                            {r.orderId && <span>ID: {r.orderId.slice(0, 8)}...</span>}
                                                            {r.error && <span className="text-rose-600">{r.error.code}: {r.error.message}</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </form>
                    )}

                    {/* MODE 3: List Ingested Orders */}
                    {mode === 'list' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-slate-500 font-mono">
                                    Total loaded: {ordersList.length} orders
                                </span>
                                <button
                                    onClick={loadRecentOrders}
                                    disabled={loadingList}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 rounded-lg shadow-2xs transition-colors"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin text-fin-brand' : ''}`} />
                                    Refresh
                                </button>
                            </div>

                            {ordersList.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-xs">
                                    No orders found for this merchant. Ingest orders above to review them here.
                                </div>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 text-[11px]">
                                            <tr>
                                                <th className="py-2 px-3">External ID</th>
                                                <th className="py-2 px-3">Amount</th>
                                                <th className="py-2 px-3">Status</th>
                                                <th className="py-2 px-3">Ordered At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                                            {ordersList.map((ord) => (
                                                <tr key={ord.id} className="hover:bg-slate-50">
                                                    <td className="py-2 px-3 text-fin-brand font-semibold">
                                                        {ord.externalOrderId}
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-900 font-medium">
                                                        {ord.amountMinor} {ord.currency}
                                                    </td>
                                                    <td className="py-2 px-3 font-sans">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                                                            {ord.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-slate-500 font-sans">
                                                        {new Date(ord.orderedAt).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
