import { useState } from 'react';
import {
    ArrowLeft,
    Building2,
    ChevronDown,
    User,
    Check,
    LogOut,
    LogIn,
    Sparkles,
    Package,
    GitCommit,
    LayoutDashboard,
    ShieldAlert,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { SEEDED_MERCHANTS } from '@/services/api/mock-exceptions-api';
import type { OperatorContext } from '@/services/api/types';
import type { ApiSource } from '@/services/api/api-client';
import type { UserProfile, PermittedMerchant } from '@/services/api/auth-api';

export type ConsoleView = 'dashboard' | 'workbench';

interface ConsoleAppHeaderProps {
    currentMerchantId: string;
    onSelectMerchant: (merchantId: string) => void;
    operatorContext: OperatorContext;
    onUpdateOperatorContext?: (ctx: OperatorContext) => void;
    currentUser: UserProfile | null;
    permittedMerchants: PermittedMerchant[];
    onOpenAuthModal: () => void;
    onLogout: () => void;
    apiSource: ApiSource;
    onToggleApiSource: (source: ApiSource) => void;
    onNavigateLanding: () => void;
    onOpenOrderIngestion?: () => void;
    onOpenReconciliation?: () => void;
    activeView?: ConsoleView;
    onChangeView?: (view: ConsoleView) => void;
}

export function ConsoleAppHeader({
    currentMerchantId,
    onSelectMerchant,
    operatorContext,
    currentUser,
    permittedMerchants,
    onOpenAuthModal,
    onLogout,
    apiSource,
    onToggleApiSource,
    onNavigateLanding,
    onOpenOrderIngestion,
    onOpenReconciliation,
    activeView = 'workbench',
    onChangeView,
}: ConsoleAppHeaderProps) {
    const [merchantMenuOpen, setMerchantMenuOpen] = useState(false);
    const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
    const [customMerchantInput, setCustomMerchantInput] = useState('');

    // Active merchant resolution (from permitted list, seeded fallback, or custom ID)
    const currentMerchant =
        permittedMerchants.find((m) => m.id === currentMerchantId) ||
        SEEDED_MERCHANTS.find((m) => m.id === currentMerchantId) || {
            id: currentMerchantId,
            name: 'Custom Tenant',
            slug: 'custom',
            role: operatorContext.role,
        };

    const roleColor = (role: string) => {
        switch (role.toUpperCase()) {
            case 'OWNER':
            case 'ADMIN':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'ANALYST':
            case 'OPERATOR':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'VIEWER':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            default:
                return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
            <div className="flex h-15 items-center justify-between px-4 sm:px-6">
                {/* Left: Brand + Navigation Back */}
                <div className="flex items-center gap-4 sm:gap-6">
                    <button
                        type="button"
                        onClick={onNavigateLanding}
                        className="group flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                        title="Return to Public Landing Page"
                    >
                        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
                        <span className="hidden sm:inline">Landing Page</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200" aria-hidden="true" />

                    <div className="flex items-center gap-3">
                        <Logo />
                        <span className="hidden md:inline-flex items-center gap-1 rounded-md bg-fin-brand/10 px-2 py-0.5 text-xs font-semibold text-fin-brand">
                            Operator Console
                        </span>
                    </div>
                </div>

                {/* Center: View Switcher Tabs (Overview vs Exceptions Workbench) */}
                {onChangeView && (
                    <nav
                        className="hidden md:flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 shadow-2xs"
                        role="tablist"
                        aria-label="Console Navigation"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeView === 'dashboard'}
                            onClick={() => onChangeView('dashboard')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                activeView === 'dashboard'
                                    ? 'bg-white text-fin-brand shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <LayoutDashboard className="size-3.5" />
                            <span>Overview</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeView === 'workbench'}
                            onClick={() => onChangeView('workbench')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                activeView === 'workbench'
                                    ? 'bg-white text-fin-brand shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <ShieldAlert className="size-3.5" />
                            <span>Exceptions Queue</span>
                        </button>
                    </nav>
                )}

                {/* Right: Merchant Selector + Operator Badge + Backend Status */}
                <div className="flex items-center gap-2.5 sm:gap-3.5">
                    {/* API Connection Indicator */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => onToggleApiSource(apiSource === 'live' ? 'mock' : 'live')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                            title="Click to toggle between Live Backend and Sandbox Mock"
                        >
                            <span
                                className={`size-2 rounded-full shrink-0 ${
                                    apiSource === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'
                                }`}
                            />
                            <span className="hidden lg:inline">
                                {apiSource === 'live' ? 'Backend API: Live' : 'Sandbox Adapter'}
                            </span>
                        </button>
                    </div>

                    {/* Order Ingestion Trigger */}
                    {onOpenOrderIngestion && (
                        <button
                            type="button"
                            onClick={onOpenOrderIngestion}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors shadow-2xs"
                            title="Ingest and inspect merchant orders"
                        >
                            <Package className="size-3.5" />
                            <span>Orders</span>
                        </button>
                    )}

                    {/* Reconciliation Hub Trigger */}
                    {onOpenReconciliation && (
                        <button
                            type="button"
                            onClick={onOpenReconciliation}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors shadow-2xs"
                            title="Inspect reconciliation runs and execute matching"
                        >
                            <GitCommit className="size-3.5" />
                            <span>Reconciliation</span>
                        </button>
                    )}

                    {/* Merchant Tenant Selector */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setMerchantMenuOpen((prev) => !prev)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                            aria-expanded={merchantMenuOpen}
                        >
                            <Building2 className="size-3.5 text-slate-400 shrink-0" />
                            <span className="max-w-[130px] truncate">{currentMerchant.name}</span>
                            <ChevronDown className="size-3 text-slate-400 shrink-0" />
                        </button>

                        {merchantMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setMerchantMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-1.5 w-76 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50 text-xs">
                                    <div className="px-2 py-1 font-semibold text-slate-500 uppercase tracking-wider text-[10px] flex items-center justify-between">
                                        <span>Authorized Merchant Tenants</span>
                                        <span className="text-[10px] text-emerald-600 font-normal">
                                            {permittedMerchants.length > 0 ? `${permittedMerchants.length} active` : 'all'}
                                        </span>
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                        {(permittedMerchants.length > 0 ? permittedMerchants : SEEDED_MERCHANTS).map((m: { id: string; name: string; role?: string; slug?: string }) => (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => {
                                                    onSelectMerchant(m.id);
                                                    setMerchantMenuOpen(false);
                                                }}
                                                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                                                    m.id === currentMerchantId
                                                        ? 'bg-fin-brand/10 font-semibold text-fin-brand'
                                                        : 'text-slate-700 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="min-w-0 pr-2">
                                                    <div className="font-medium truncate">{m.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono truncate">
                                                        {m.slug} {m.role ? `• ${m.role}` : ''}
                                                    </div>
                                                </div>
                                                {m.id === currentMerchantId && (
                                                    <Check className="size-4 text-fin-brand shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Tenant Isolation Test Input */}
                                    <div className="mt-2 border-t border-slate-100 pt-2 px-1">
                                        <div className="text-[10px] text-slate-500 font-medium mb-1">
                                            Test Cross-Tenant Isolation (UUID):
                                        </div>
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                placeholder="e.g. 22222222-2222-..."
                                                value={customMerchantInput}
                                                onChange={(e) => setCustomMerchantInput(e.target.value)}
                                                className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] font-mono focus:border-fin-brand focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (customMerchantInput.trim()) {
                                                        onSelectMerchant(customMerchantInput.trim());
                                                        setMerchantMenuOpen(false);
                                                        setCustomMerchantInput('');
                                                    }
                                                }}
                                                className="rounded bg-slate-800 px-2.5 py-1 text-white text-[11px] font-medium hover:bg-slate-700 shrink-0"
                                            >
                                                Scope
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                                            Switching to an unauthorized merchant ID server-enforces 404 access denial.
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Operator Identity Badge / Auth Dropdown */}
                    <div className="relative">
                        {currentUser ? (
                            <button
                                type="button"
                                onClick={() => setOperatorMenuOpen((prev) => !prev)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors"
                                aria-expanded={operatorMenuOpen}
                            >
                                <div className="size-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                                    <User className="size-3" />
                                </div>
                                <div className="text-left hidden sm:block">
                                    <div className="font-medium text-slate-900 leading-none">
                                        {currentUser.fullName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">
                                        {operatorContext.role}
                                    </div>
                                </div>
                                <ChevronDown className="size-3 text-slate-400 shrink-0" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onOpenAuthModal}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-fin-brand px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-fin-brand/90 transition-colors"
                            >
                                <LogIn className="size-3.5" />
                                <span>Sign In</span>
                            </button>
                        )}

                        {currentUser && operatorMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setOperatorMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg z-50 text-xs">
                                    <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                                        <div className="size-8 rounded-full bg-fin-brand/10 text-fin-brand flex items-center justify-center font-semibold text-xs">
                                            {currentUser.fullName.charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-semibold text-slate-900 truncate">
                                                {currentUser.fullName}
                                            </div>
                                            <div className="text-[11px] text-slate-400 font-mono truncate">
                                                {currentUser.email}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="py-2.5 border-b border-slate-100 space-y-1.5">
                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>Active Role:</span>
                                            <span
                                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleColor(
                                                    operatorContext.role,
                                                )}`}
                                            >
                                                {operatorContext.role}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-slate-600">
                                            <span>Authorized Tenants:</span>
                                            <span className="font-mono text-slate-800">
                                                {permittedMerchants.length}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="pt-2 flex flex-col gap-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOperatorMenuOpen(false);
                                                onOpenAuthModal();
                                            }}
                                            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                        >
                                            <Sparkles className="size-3.5 text-fin-brand shrink-0" />
                                            <span>Switch Operator Account…</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOperatorMenuOpen(false);
                                                onLogout();
                                            }}
                                            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-red-600 hover:bg-red-50 transition-colors text-left"
                                        >
                                            <LogOut className="size-3.5 shrink-0" />
                                            <span>Sign Out</span>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
