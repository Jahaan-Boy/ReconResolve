import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    RefreshCw,
    X,
} from 'lucide-react';
import { ConsoleAppHeader } from './ConsoleAppHeader';
import { ExceptionQueue } from './ExceptionQueue';
import { ExceptionInspector } from './ExceptionInspector';
import { ExceptionActionDialog } from './ExceptionActionDialog';
import { OrderIngestionDialog } from './OrderIngestionDialog';
import { AuthModal } from '@/features/auth/AuthModal';
import { adaptiveApiClient, type ApiSource } from '@/services/api/api-client';
import {
    authApiClient,
    subscribeUnauthorized,
    type UserProfile,
    type PermittedMerchant,
    type AuthSessionData,
} from '@/services/api/auth-api';
import { DEFAULT_MERCHANT_ID, SEEDED_MERCHANTS } from '@/services/api/mock-exceptions-api';
import {
    ApiClientError,
    ConcurrencyConflictError,
    type ExceptionAction,
    type ExceptionDetail,
    type ExceptionStatus,
    type ExceptionSummary,
    type ListExceptionsFilter,
    type OperatorContext,
    type PaginationMetadata,
} from '@/services/api/types';

interface OperatorConsolePageProps {
    onNavigateLanding: () => void;
}

interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

export function OperatorConsolePage({ onNavigateLanding }: OperatorConsolePageProps) {
    // Current merchant context
    const [merchantId, setMerchantId] = useState<string>(DEFAULT_MERCHANT_ID);

    // Generation/Request tracking to prevent cross-tenant async race conditions
    const queueRequestIdRef = useRef(0);
    const countsRequestIdRef = useRef(0);
    const detailRequestIdRef = useRef(0);

    // Operator identity
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
    const [permittedMerchants, setPermittedMerchants] = useState<PermittedMerchant[]>([]);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

    const [operatorContext, setOperatorContext] = useState<OperatorContext>({
        operatorId: 'operator-sarah',
        role: 'OWNER',
        authorizedMerchants: [DEFAULT_MERCHANT_ID],
    });

    // API Source tracking
    const [apiSource, setApiSource] = useState<ApiSource>(adaptiveApiClient.source);

    // Filter and pagination state
    const [filters, setFilters] = useState<ListExceptionsFilter>({
        limit: 20,
    });
    const [cursorHistory, setCursorHistory] = useState<string[]>([]);

    // Queue state
    const [items, setItems] = useState<ExceptionSummary[]>([]);
    const [pagination, setPagination] = useState<PaginationMetadata>({
        limit: 20,
        nextCursor: null,
        hasMore: false,
    });
    const [loadingQueue, setLoadingQueue] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);

    // Selected detail state
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ExceptionDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Mobile workbench toggle
    const [showMobileDetail, setShowMobileDetail] = useState(false);

    // Action dialog state
    const [activeAction, setActiveAction] = useState<ExceptionAction | null>(null);
    const [isSubmittingAction, setIsSubmittingAction] = useState(false);
    const [conflictWarning, setConflictWarning] = useState<string | null>(null);

    // Status counts for tabs
    const [statusCounts, setStatusCounts] = useState<Record<ExceptionStatus, number> | undefined>(undefined);

    // Toast notifications
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((type: ToastMessage['type'], message: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    // Listen to API source changes
    useEffect(() => {
        return adaptiveApiClient.subscribe((src) => {
            setApiSource(src);
        });
    }, []);

    // Initial session bootstrap on mount
    useEffect(() => {
        let isMounted = true;
        authApiClient.fetchMe().then((data) => {
            if (!isMounted) return;
            if (data) {
                setCurrentUser(data.user);
                setPermittedMerchants(data.merchants);
                if (data.activeMerchant) {
                    setMerchantId(data.activeMerchant.id);
                    setOperatorContext({
                        operatorId: data.user.id,
                        role: data.activeMerchant.role,
                        authorizedMerchants: [data.activeMerchant.id],
                    });
                }
            }
        });
        return () => {
            isMounted = false;
        };
    }, []);

    // Listen to 401 unauthorized notifications
    useEffect(() => {
        return subscribeUnauthorized(() => {
            setCurrentUser(null);
            setIsAuthModalOpen(true);
            addToast('warning', 'Session expired or unauthenticated. Please sign in.');
        });
    }, [addToast]);

    const handleLoginSuccess = (session: AuthSessionData) => {
        setCurrentUser(session.user);
        setPermittedMerchants(session.merchants);
        const active = session.activeMerchant || session.merchants[0];
        if (active) {
            setMerchantId(active.id);
            setOperatorContext({
                operatorId: session.user.id,
                role: active.role,
                authorizedMerchants: [active.id],
            });
        }
        // Flush previous caches and reload
        setSelectedId(null);
        setDetail(null);
        setCursorHistory([]);
        setFilters({ limit: 20 });
        setIsAuthModalOpen(false);
        addToast('success', `Signed in as ${session.user.fullName} (${active?.role || 'OPERATOR'})`);
    };

    const handleLogout = async () => {
        // Invalidate in-flight requests
        queueRequestIdRef.current++;
        countsRequestIdRef.current++;
        detailRequestIdRef.current++;

        await authApiClient.logout();
        setCurrentUser(null);
        setPermittedMerchants([]);
        setItems([]);
        setStatusCounts(undefined);
        setDetail(null);
        setSelectedId(null);
        setIsAuthModalOpen(true);
        addToast('info', 'Logged out successfully');
    };

    // Fetch global status counts across all exceptions for current merchant
    const loadStatusCounts = useCallback(
        async (targetMerchantId: string) => {
            const reqId = ++countsRequestIdRef.current;
            try {
                const res = await adaptiveApiClient.listExceptions(targetMerchantId, { limit: 100 });
                if (reqId !== countsRequestIdRef.current) return;
                const counts: Record<ExceptionStatus, number> = {
                    OPEN: 0,
                    INVESTIGATING: 0,
                    RESOLVED: 0,
                    DISMISSED: 0,
                };
                res.items.forEach((item) => {
                    if (counts[item.status] !== undefined) {
                        counts[item.status]++;
                    }
                });
                setStatusCounts(counts);
            } catch {
                // Ignore background counts load errors
            }
        },
        [],
    );

    // Fetch queue exceptions
    const loadExceptions = useCallback(
        async (targetMerchantId: string, activeFilters: ListExceptionsFilter) => {
            const reqId = ++queueRequestIdRef.current;
            setLoadingQueue(true);
            setQueueError(null);
            try {
                const res = await adaptiveApiClient.listExceptions(targetMerchantId, activeFilters);
                if (reqId !== queueRequestIdRef.current) return;
                setItems(res.items);
                setPagination(res.pagination);

                // Only update status counts from result set if we are viewing ALL items without other filters
                const isUnfiltered = !activeFilters.status && !activeFilters.type && !activeFilters.search && !activeFilters.createdFrom && !activeFilters.createdTo;
                if (isUnfiltered) {
                    const counts: Record<ExceptionStatus, number> = {
                        OPEN: 0,
                        INVESTIGATING: 0,
                        RESOLVED: 0,
                        DISMISSED: 0,
                    };
                    res.items.forEach((item) => {
                        if (counts[item.status] !== undefined) {
                            counts[item.status]++;
                        }
                    });
                    setStatusCounts(counts);
                }

                // If nothing is selected, or current selection is not in list, pick the first
                if (res.items.length > 0) {
                    setSelectedId((prev) => {
                        const exists = res.items.some((i) => i.id === prev);
                        return exists ? prev : res.items[0].id;
                    });
                } else {
                    setSelectedId(null);
                    setDetail(null);
                }
            } catch (err: unknown) {
                if (reqId !== queueRequestIdRef.current) return;
                const message = err instanceof Error ? err.message : 'Failed to load exceptions queue from server';
                setQueueError(message);
                addToast('error', `Error loading queue: ${message}`);
            } finally {
                if (reqId === queueRequestIdRef.current) {
                    setLoadingQueue(false);
                }
            }
        },
        [addToast],
    );

    // Fetch single exception detail
    const loadDetail = useCallback(
        async (targetMerchantId: string, exceptionId: string) => {
            const reqId = ++detailRequestIdRef.current;
            setLoadingDetail(true);
            try {
                const data = await adaptiveApiClient.getException(targetMerchantId, exceptionId);
                if (reqId !== detailRequestIdRef.current) return;
                setDetail(data);
            } catch (err: unknown) {
                if (reqId !== detailRequestIdRef.current) return;
                const message = err instanceof Error ? err.message : 'Failed to load details';
                addToast('error', `Failed to load details for ${exceptionId}: ${message}`);
            } finally {
                if (reqId === detailRequestIdRef.current) {
                    setLoadingDetail(false);
                }
            }
        },
        [addToast],
    );

    // Fetch global status counts whenever merchant changes
    useEffect(() => {
        let isMounted = true;
        Promise.resolve().then(() => {
            if (isMounted) {
                loadStatusCounts(merchantId);
            }
        });
        return () => {
            isMounted = false;
        };
    }, [merchantId, loadStatusCounts]);

    // Fetch queue when merchant or filters change
    useEffect(() => {
        let isMounted = true;
        Promise.resolve().then(() => {
            if (isMounted) {
                loadExceptions(merchantId, filters);
            }
        });
        return () => {
            isMounted = false;
        };
    }, [merchantId, filters, loadExceptions]);

    // Fetch detail when selectedId changes
    useEffect(() => {
        if (!selectedId) return;
        let isMounted = true;
        Promise.resolve().then(() => {
            if (isMounted) {
                loadDetail(merchantId, selectedId);
            }
        });
        return () => {
            isMounted = false;
        };
    }, [selectedId, merchantId, loadDetail]);

    // Merchant Switch Handler: clears selections and resets pagination
    const handleSelectMerchant = (newMerchantId: string) => {
        if (newMerchantId === merchantId) return;
        // Invalidate in-flight requests from the previous tenant context
        queueRequestIdRef.current++;
        countsRequestIdRef.current++;
        detailRequestIdRef.current++;

        // Immediately isolate tenant state by clearing UI items and selection
        setMerchantId(newMerchantId);
        setItems([]);
        setStatusCounts(undefined);
        setSelectedId(null);
        setDetail(null);
        setCursorHistory([]);
        setFilters((prev) => ({
            ...prev,
            cursor: undefined,
        }));
        setShowMobileDetail(false);

        const found = permittedMerchants.find((m) => m.id === newMerchantId);
        if (found) {
            setOperatorContext((prev) => ({
                ...prev,
                role: found.role,
                authorizedMerchants: [found.id],
            }));
        }

        addToast('info', `Switched active tenant to ${found?.name || newMerchantId}`);
        loadStatusCounts(newMerchantId);
    };

    // Filter Change Handler: resets pagination
    const handleChangeFilters = (newFilters: ListExceptionsFilter) => {
        setCursorHistory([]);
        setFilters({
            ...newFilters,
            cursor: undefined,
        });
    };

    const handleResetFilters = () => {
        setCursorHistory([]);
        setFilters({ limit: 20 });
    };

    // Pagination: Next page
    const handleNextPage = () => {
        if (!pagination.nextCursor) return;
        setCursorHistory((prev) => [...prev, filters.cursor || '']);
        setFilters((prev) => ({
            ...prev,
            cursor: pagination.nextCursor || undefined,
        }));
    };

    // Pagination: Previous page
    const handlePrevPage = () => {
        if (cursorHistory.length === 0) return;
        const newHistory = [...cursorHistory];
        const previousCursor = newHistory.pop() || '';
        setCursorHistory(newHistory);
        setFilters((prev) => ({
            ...prev,
            cursor: previousCursor || undefined,
        }));
    };

    // Open Action Modal
    const handleTriggerAction = (action: ExceptionAction) => {
        setConflictWarning(null);
        setActiveAction(action);
    };

    // Submit Action Mutation
    const handleSubmitAction = async (action: ExceptionAction, noteText: string) => {
        if (!detail) return;
        setIsSubmittingAction(true);
        setConflictWarning(null);

        const currentVersion = detail.version;

        try {
            let updatedDetail: ExceptionDetail;

            if (action === 'RESOLVE') {
                updatedDetail = await adaptiveApiClient.resolve(
                    merchantId,
                    detail.id,
                    { resolutionNote: noteText, expectedVersion: currentVersion },
                    operatorContext,
                );
            } else if (action === 'DISMISS') {
                updatedDetail = await adaptiveApiClient.dismiss(
                    merchantId,
                    detail.id,
                    { dismissReason: noteText, expectedVersion: currentVersion },
                    operatorContext,
                );
            } else if (action === 'REOPEN') {
                updatedDetail = await adaptiveApiClient.reopen(
                    merchantId,
                    detail.id,
                    { reopenReason: noteText, expectedVersion: currentVersion },
                    operatorContext,
                );
            } else {
                updatedDetail = await adaptiveApiClient.investigate(
                    merchantId,
                    detail.id,
                    { note: noteText || undefined, expectedVersion: currentVersion },
                    operatorContext,
                );
            }

            // Success update
            setDetail(updatedDetail);
            setItems((prev) =>
                prev.map((item) => (item.id === updatedDetail.id ? { ...item, ...updatedDetail } : item)),
            );

            // Update status counts accurately
            const oldStatus = detail.status;
            const newStatus = updatedDetail.status;
            if (oldStatus !== newStatus) {
                setStatusCounts((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        [oldStatus]: Math.max(0, (prev[oldStatus] || 0) - 1),
                        [newStatus]: (prev[newStatus] || 0) + 1,
                    };
                });
            }
            loadStatusCounts(merchantId);

            addToast(
                'success',
                `Exception transitioned to ${updatedDetail.status} (v${updatedDetail.version})`,
            );
            setActiveAction(null);
        } catch (err: unknown) {
            const isConflict =
                err instanceof ConcurrencyConflictError ||
                (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'CONCURRENCY_CONFLICT') ||
                (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 409);

            if (isConflict) {
                // HTTP 409 Concurrency conflict flow
                setConflictWarning('Record updated by another operator. Reloading latest state...');
                addToast('warning', 'Concurrency Conflict (409): Refreshing latest record state...');

                // Automatically fetch latest detail without auto-resubmitting
                try {
                    const freshData = await adaptiveApiClient.getException(merchantId, detail.id);
                    setDetail(freshData);
                    setItems((prev) =>
                        prev.map((item) => (item.id === freshData.id ? { ...item, ...freshData } : item)),
                    );
                } catch {
                    addToast('error', 'Failed to reload latest record state after conflict.');
                }
            } else {
                const isForbidden =
                    (err instanceof ApiClientError && err.statusCode === 403) ||
                    (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403) ||
                    (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 403);
                if (isForbidden) {
                    addToast('error', 'Permission Denied: Read-only viewers cannot modify exception state');
                    setActiveAction(null);
                    return;
                }
                const message = err instanceof Error ? err.message : 'Failed to complete action';
                addToast('error', message);
            }
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const handleSelectRow = (id: string) => {
        setSelectedId(id);
        setShowMobileDetail(true);
    };

    const currentMerchantSlug =
        // permittedMerchants.find((m) => m.id === merchantId)?.slug ||
        SEEDED_MERCHANTS.find((m) => m.id === merchantId)?.slug ||
        'merchant';

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-100 font-sans text-slate-900">
            {/* Top Shared Header */}
            <ConsoleAppHeader
                currentMerchantId={merchantId}
                onSelectMerchant={handleSelectMerchant}
                operatorContext={operatorContext}
                onUpdateOperatorContext={setOperatorContext}
                currentUser={currentUser}
                permittedMerchants={permittedMerchants}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onLogout={handleLogout}
                apiSource={apiSource}
                onToggleApiSource={(src) => adaptiveApiClient.setSource(src)}
                onNavigateLanding={onNavigateLanding}
                onOpenOrderIngestion={() => setIsOrderModalOpen(true)}
            />

            {/* Workbench Body */}
            <main className="flex-1 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
                    {/* Left Pane: Queue & Filters (40% width / 5 cols) */}
                    <div
                        className={`h-full lg:col-span-5 flex flex-col border-r border-slate-200 overflow-hidden ${
                            showMobileDetail ? 'hidden lg:flex' : 'flex'
                        }`}
                    >
                        <ExceptionQueue
                            items={items}
                            pagination={pagination}
                            selectedId={selectedId}
                            onSelectException={handleSelectRow}
                            filters={filters}
                            onChangeFilters={handleChangeFilters}
                            onResetFilters={handleResetFilters}
                            loading={loadingQueue}
                            error={queueError}
                            onRetry={() => loadExceptions(merchantId, filters)}
                            onNextPage={handleNextPage}
                            onPrevPage={handlePrevPage}
                            hasPrevPage={cursorHistory.length > 0}
                            statusCounts={statusCounts}
                            merchantSlug={currentMerchantSlug}
                            onExportSuccess={(count) =>
                                addToast('success', `Exported ${count} exceptions to CSV`)
                            }
                        />
                    </div>

                    {/* Right Pane: Inspector Workbench (60% width / 7 cols) */}
                    <div
                        className={`h-full lg:col-span-7 overflow-hidden ${
                            !showMobileDetail ? 'hidden lg:block' : 'block'
                        }`}
                    >
                        <ExceptionInspector
                            exception={detail}
                            loading={loadingDetail}
                            onTriggerAction={handleTriggerAction}
                            actionInProgress={isSubmittingAction}
                            onCloseInspector={() => setShowMobileDetail(false)}
                        />
                    </div>
                </div>
            </main>

            {/* Action Dialog Modal */}
            <ExceptionActionDialog
                action={activeAction}
                exception={detail}
                isOpen={Boolean(activeAction)}
                onClose={() => setActiveAction(null)}
                onSubmit={handleSubmitAction}
                isSubmitting={isSubmittingAction}
                conflictMessage={conflictWarning}
                onReloadConflict={
                    detail ? () => loadDetail(merchantId, detail.id) : undefined
                }
            />

            {/* Order Ingestion Modal */}
            <OrderIngestionDialog
                isOpen={isOrderModalOpen}
                onClose={() => setIsOrderModalOpen(false)}
                merchantId={merchantId}
                onOrderIngested={() => addToast('success', 'Order ingestion completed')}
            />

            {/* Authentication Modal */}
            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onLoginSuccess={handleLoginSuccess}
            />

            {/* Toast Container */}
            <div
                className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
                aria-live="polite"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl border shadow-lg text-xs animate-in slide-in-from-bottom-2 duration-200 ${
                            toast.type === 'success'
                                ? 'bg-emerald-900 text-white border-emerald-700'
                                : toast.type === 'error'
                                ? 'bg-rose-900 text-white border-rose-700'
                                : toast.type === 'warning'
                                ? 'bg-amber-900 text-white border-amber-700'
                                : 'bg-slate-900 text-white border-slate-700'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            {toast.type === 'success' && <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />}
                            {toast.type === 'error' && <AlertTriangle className="size-4 text-rose-400 shrink-0" />}
                            {toast.type === 'warning' && <AlertTriangle className="size-4 text-amber-400 shrink-0" />}
                            {toast.type === 'info' && <RefreshCw className="size-4 text-blue-400 shrink-0" />}
                            <span className="font-medium">{toast.message}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                            className="text-white/60 hover:text-white"
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
