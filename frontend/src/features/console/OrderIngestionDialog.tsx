import { useState, useEffect } from 'react';
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

    useEffect(() => {
        if (isOpen && mode === 'list') {
            loadRecentOrders();
        }
    }, [isOpen, mode, merchantId]);

    const loadRecentOrders = async () => {
        setLoadingList(true);
        try {
            const res = await ordersApiClient.listOrders(merchantId, { limit: 20 });
            setOrdersList(res.items);
        } catch (err: any) {
            console.error('Failed to load orders:', err);
        } finally {
            setLoadingList(false);
        }
    };

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
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to ingest order');
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
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to ingest batch orders');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                            <Package className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Merchant Order Ingestion</h2>
                            <p className="text-xs text-zinc-400">
                                Tenant-scoped, idempotent expected order ingestion for reconciliation
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-6 pt-2">
                    <button
                        onClick={() => {
                            setMode('single');
                            setErrorMessage(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                            mode === 'single'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-zinc-400 hover:text-zinc-200'
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
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                            mode === 'batch'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-zinc-400 hover:text-zinc-200'
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
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                            mode === 'list'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        <RefreshCw className="w-4 h-4" />
                        View Ingested Orders
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {errorMessage && (
                        <div className="flex items-start gap-3 p-3.5 bg-red-950/40 border border-red-800/50 rounded-lg text-sm text-red-200">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
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
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        External Order ID *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={externalOrderId}
                                        onChange={(e) => setExternalOrderId(e.target.value)}
                                        placeholder="e.g. ord-shopify-90214"
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        Currency (ISO 4217) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        maxLength={3}
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                                        placeholder="USD"
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        Amount *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="25.00"
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value as MerchantOrderStatus)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="OPEN">OPEN</option>
                                        <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
                                        <option value="PAID">PAID</option>
                                        <option value="CANCELLED">CANCELLED</option>
                                        <option value="REFUNDED">REFUNDED</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        Ordered At (ISO 8601) *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={orderedAt}
                                        onChange={(e) => setOrderedAt(e.target.value)}
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                                        Metadata (JSON)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={metadataJson}
                                        onChange={(e) => setMetadataJson(e.target.value)}
                                        placeholder='{"providerOrderId": "PAYPAL-ORDER-123"}'
                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition shadow-lg shadow-indigo-600/20"
                                >
                                    {loading ? 'Ingesting Order...' : 'Ingest Order'}
                                </button>
                            </div>

                            {/* Outcome display */}
                            {singleResult && (
                                <div className={`p-4 rounded-lg border ${
                                    singleResult.outcome === 'created'
                                        ? 'bg-emerald-950/40 border-emerald-800/50'
                                        : 'bg-amber-950/40 border-amber-800/50'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className={`w-5 h-5 ${
                                            singleResult.outcome === 'created' ? 'text-emerald-400' : 'text-amber-400'
                                        }`} />
                                        <span className={`text-sm font-semibold capitalize ${
                                            singleResult.outcome === 'created' ? 'text-emerald-300' : 'text-amber-300'
                                        }`}>
                                            Order {singleResult.outcome === 'created' ? 'Successfully Created' : 'Duplicate Detected (Idempotent)'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 font-mono">
                                        <div><span className="text-zinc-500">Order ID:</span> {singleResult.order.id}</div>
                                        <div><span className="text-zinc-500">Ext Reference:</span> {singleResult.order.externalOrderId}</div>
                                        <div><span className="text-zinc-500">Amount:</span> {singleResult.order.amountMinor} {singleResult.order.currency}</div>
                                        <div><span className="text-zinc-500">Status:</span> {singleResult.order.status}</div>
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
                                    <label className="text-xs font-medium text-zinc-300">
                                        Batch Order Array (JSON, Max 100 records)
                                    </label>
                                    <span className="text-xs text-zinc-500 font-mono">
                                        Bounded batch
                                    </span>
                                </div>
                                <textarea
                                    rows={10}
                                    value={batchJson}
                                    onChange={(e) => setBatchJson(e.target.value)}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition shadow-lg shadow-indigo-600/20"
                                >
                                    {loading ? 'Processing Batch...' : 'Submit Batch Ingestion'}
                                </button>
                            </div>

                            {/* Batch Result Summary */}
                            {batchResult && (
                                <div className="space-y-3 pt-2">
                                    <div className="grid grid-cols-4 gap-2 text-center">
                                        <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700">
                                            <div className="text-xs text-zinc-400">Received</div>
                                            <div className="text-lg font-bold text-white">{batchResult.summary.received}</div>
                                        </div>
                                        <div className="p-3 bg-emerald-950/30 rounded-lg border border-emerald-800/40">
                                            <div className="text-xs text-emerald-400">Created</div>
                                            <div className="text-lg font-bold text-emerald-300">{batchResult.summary.created}</div>
                                        </div>
                                        <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-800/40">
                                            <div className="text-xs text-amber-400">Duplicates</div>
                                            <div className="text-lg font-bold text-amber-300">{batchResult.summary.duplicates}</div>
                                        </div>
                                        <div className="p-3 bg-red-950/30 rounded-lg border border-red-800/40">
                                            <div className="text-xs text-red-400">Rejected</div>
                                            <div className="text-lg font-bold text-red-300">{batchResult.summary.rejected}</div>
                                        </div>
                                    </div>

                                    {/* Per-record outcome table */}
                                    <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-zinc-800/80 text-zinc-400 uppercase tracking-wider sticky top-0">
                                                <tr>
                                                    <th className="py-2 px-3">#</th>
                                                    <th className="py-2 px-3">External ID</th>
                                                    <th className="py-2 px-3">Status</th>
                                                    <th className="py-2 px-3">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800 font-mono">
                                                {batchResult.results.map((r) => (
                                                    <tr key={r.index} className="hover:bg-zinc-800/40">
                                                        <td className="py-2 px-3 text-zinc-500">{r.index}</td>
                                                        <td className="py-2 px-3 text-zinc-200">{r.externalOrderId}</td>
                                                        <td className="py-2 px-3">
                                                            <span
                                                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                                                    r.status === 'created'
                                                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                                                        : r.status === 'duplicate'
                                                                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                                                        : 'bg-red-950 text-red-300 border border-red-800'
                                                                }`}
                                                            >
                                                                {r.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 text-zinc-400">
                                                            {r.orderId && <span className="text-zinc-500">ID: {r.orderId.slice(0, 8)}...</span>}
                                                            {r.error && <span className="text-red-400">{r.error.code}: {r.error.message}</span>}
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
                                <span className="text-xs text-zinc-400 font-mono">
                                    Total loaded: {ordersList.length} orders
                                </span>
                                <button
                                    onClick={loadRecentOrders}
                                    disabled={loadingList}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 rounded-lg transition"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
                                    Refresh
                                </button>
                            </div>

                            {ordersList.length === 0 ? (
                                <div className="text-center py-10 text-zinc-500 text-sm">
                                    No orders found for this merchant. Ingest orders above to review them here.
                                </div>
                            ) : (
                                <div className="border border-zinc-800 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-zinc-800/80 text-zinc-400 uppercase tracking-wider sticky top-0">
                                            <tr>
                                                <th className="py-2 px-3">External ID</th>
                                                <th className="py-2 px-3">Amount</th>
                                                <th className="py-2 px-3">Status</th>
                                                <th className="py-2 px-3">Ordered At</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800 font-mono">
                                            {ordersList.map((ord) => (
                                                <tr key={ord.id} className="hover:bg-zinc-800/40">
                                                    <td className="py-2 px-3 text-indigo-400 font-medium">
                                                        {ord.externalOrderId}
                                                    </td>
                                                    <td className="py-2 px-3 text-zinc-200">
                                                        {ord.amountMinor} {ord.currency}
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-zinc-800 text-zinc-300">
                                                            {ord.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-zinc-500">
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
