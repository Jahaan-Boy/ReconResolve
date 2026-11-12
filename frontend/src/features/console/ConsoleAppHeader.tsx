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
    BrainCircuit,
    Activity,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { KNOWN_MERCHANTS } from '@/config/merchants';
import type { OperatorContext } from '@/services/api/types';
import type { ApiSource } from '@/services/api/api-client';
import type { UserProfile, PermittedMerchant } from '@/services/api/auth-api';

export type ConsoleView = 'dashboard' | 'workbench' | 'copilot' | 'intelligence' | 'operations';

interface ConsoleAppHeaderProps {
    currentMerchantId: string;
    onSelectMerchant: (merchantId: string) => void;
    operatorContext: OperatorContext;
    onUpdateOperatorContext?: (ctx: OperatorContext) => void;
    currentUser: UserProfile | null;
    permittedMerchants: PermittedMerchant[];
    onOpenAuthModal: () => void;
    onLogout: () => void;
    apiSource?: ApiSource;
    onToggleApiSource?: (source: ApiSource) => void;
    onNavigateLanding: () => void;
    onOpenOrderIngestion?: () => void;
    onOpenReconciliation?: () => void;
    onSyncPayPal?: () => void;
    isSyncingPayPal?: boolean;
    activeView?: ConsoleView;
    onChangeView?: (view: ConsoleView) => void;
    onPrefetchView?: (view: ConsoleView) => void;
}

const NAV_TABS = [
    { id: 'dashboard' as const, label: 'Overview', icon: LayoutDashboard },
    { id: 'workbench' as const, label: 'Exceptions', icon: ShieldAlert },
    { id: 'copilot' as const, label: 'Copilot', icon: Sparkles, iconColor: 'text-indigo-500' },
    {
        id: 'intelligence' as const,
        label: 'Intelligence',
        icon: BrainCircuit,
        iconColor: 'text-emerald-500',
    },
    { id: 'operations' as const, label: 'Operations', icon: Activity, iconColor: 'text-sky-500' },
];

export function ConsoleAppHeader({
    currentMerchantId,
    onSelectMerchant,
    operatorContext,
    onUpdateOperatorContext,
    currentUser,
    permittedMerchants,
    onOpenAuthModal,
    onLogout,
    apiSource: _apiSource,
    onToggleApiSource: _onToggleApiSource,
    onNavigateLanding,
    onOpenOrderIngestion,
    onOpenReconciliation,
    onSyncPayPal,
    isSyncingPayPal = false,
    activeView = 'workbench',
    onChangeView,
    onPrefetchView,
}: ConsoleAppHeaderProps) {
    const [merchantMenuOpen, setMerchantMenuOpen] = useState(false);
    const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [customMerchantInput, setCustomMerchantInput] = useState('');

    // Active merchant resolution (from permitted list, seeded fallback, or custom ID)
    const currentMerchant =
        permittedMerchants.find((m) => m.id === currentMerchantId) ||
        KNOWN_MERCHANTS.find((m) => m.id === currentMerchantId) || {
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
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md w-full">
            <div className="flex h-14 items-center justify-between px-2.5 sm:px-4 lg:px-6 gap-2 w-full max-w-full">
                {/* Left: Brand + Navigation Back */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onNavigateLanding}
                        className="group inline-flex items-center gap-1 rounded-lg border border-slate-200/70 bg-slate-50/70 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
                        title="Return to Public Landing Page"
                    >
                        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5 text-slate-500 group-hover:text-slate-800" />
                        <span className="hidden xl:inline">Landing</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Logo />
                    </div>
                </div>

                {/* Center: View Switcher Tabs (Compact segmented pill on lg+ screens, Dropdown below lg) */}
                {onChangeView && (
                    <>
                        <nav
                            className="hidden lg:flex items-center rounded-lg bg-slate-100/90 p-0.5 border border-slate-200/80 shadow-2xs shrink-0"
                            role="tablist"
                            aria-label="Console Navigation"
                        >
                            {NAV_TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeView === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={isActive}
                                        onClick={() => onChangeView(tab.id)}
                                        onMouseEnter={() => onPrefetchView?.(tab.id)}
                                        className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all duration-150 shrink-0 ${
                                            isActive
                                                ? 'bg-white text-fin-brand shadow-xs border border-slate-200/60'
                                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                                        }`}
                                    >
                                        <Icon
                                            className={`size-3.5 shrink-0 transition-colors ${
                                                isActive
                                                    ? 'text-fin-brand'
                                                    : 'iconColor' in tab && tab.iconColor
                                                      ? tab.iconColor
                                                      : 'text-slate-500 group-hover:text-slate-800'
                                            }`}
                                        />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Compact View Switcher for screens below lg (< 1024px) */}
                        <div className="relative lg:hidden shrink-0">
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen((prev) => !prev)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors shrink-0"
                                aria-expanded={mobileNavOpen}
                            >
                                {(() => {
                                    const currentTab = NAV_TABS.find((t) => t.id === activeView) || NAV_TABS[0];
                                    const TabIcon = currentTab.icon;
                                    return (
                                        <>
                                            <TabIcon className="size-3.5 text-fin-brand shrink-0" />
                                            <span>{currentTab.label}</span>
                                            <ChevronDown className="size-3 text-slate-400 shrink-0" />
                                        </>
                                    );
                                })()}
                            </button>

                            {mobileNavOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setMobileNavOpen(false)}
                                    />
                                    <div className="absolute left-1/2 -translate-x-1/2 mt-1.5 w-48 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-50 text-xs">
                                        {NAV_TABS.map((tab) => {
                                            const TabIcon = tab.icon;
                                            const isCurrent = activeView === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => {
                                                        onChangeView(tab.id);
                                                        setMobileNavOpen(false);
                                                    }}
                                                    onMouseEnter={() => onPrefetchView?.(tab.id)}
                                                    className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors ${
                                                        isCurrent
                                                            ? 'bg-fin-brand/10 font-semibold text-fin-brand'
                                                            : 'text-slate-700 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <TabIcon
                                                            className={`size-3.5 shrink-0 ${
                                                                'iconColor' in tab && tab.iconColor ? tab.iconColor : 'text-slate-500'
                                                            }`}
                                                        />
                                                        <span>{tab.label}</span>
                                                    </div>
                                                    {isCurrent && <Check className="size-3.5 text-fin-brand shrink-0" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </>
                )}

                {/* Right: Actions, API Status, Tenant, Operator Role Switcher */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    {/* Live System Indicator */}
                    <div className="relative shrink-0">
                        <div
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1.5 text-xs font-medium text-emerald-800 shadow-2xs whitespace-nowrap shrink-0"
                            title="Connected to PostgreSQL & PayPal Live APIs"
                        >
                            <span className="relative flex size-2 shrink-0">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-emerald-700">
                                Live API
                            </span>
                        </div>
                    </div>

                    {/* Quick Action Triggers */}
                    {Boolean(onOpenOrderIngestion || onOpenReconciliation || onSyncPayPal) && (
                        <div className="flex items-center gap-1 shrink-0">
                            {/* PayPal Live Sync Trigger */}
                            {Boolean(onSyncPayPal) && (
                                <button
                                    type="button"
                                    onClick={onSyncPayPal}
                                    disabled={isSyncingPayPal}
                                    className="inline-flex items-center gap-1 rounded-lg border border-sky-200/80 bg-sky-50/70 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100/90 hover:border-sky-300 transition-colors shadow-2xs whitespace-nowrap shrink-0 disabled:opacity-50"
                                    title="Fetch latest transactions from PayPal Transaction Search API"
                                >
                                    <Activity className={`size-3.5 shrink-0 text-sky-600 ${isSyncingPayPal ? 'animate-spin' : ''}`} />
                                    <span className="hidden md:inline">{isSyncingPayPal ? 'Syncing...' : 'Sync PayPal'}</span>
                                </button>
                            )}

                            {/* Order Ingestion Trigger */}
                            {Boolean(onOpenOrderIngestion) && (
                                <button
                                    type="button"
                                    onClick={onOpenOrderIngestion}
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/90 hover:border-indigo-300 transition-colors shadow-2xs whitespace-nowrap shrink-0"
                                    title="Ingest and inspect merchant orders"
                                >
                                    <Package className="size-3.5 shrink-0 text-indigo-600" />
                                    <span className="hidden md:inline">Orders</span>
                                </button>
                            )}

                            {/* Reconciliation Hub Trigger */}
                            {Boolean(onOpenReconciliation) && (
                                <button
                                    type="button"
                                    onClick={onOpenReconciliation}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100/90 hover:border-emerald-300 transition-colors shadow-2xs whitespace-nowrap shrink-0"
                                    title="Inspect reconciliation runs and execute matching"
                                >
                                    <GitCommit className="size-3.5 shrink-0 text-emerald-600" />
                                    <span className="hidden md:inline">Recon</span>
                                </button>
                            )}
                        </div>
                    )}

                    <div className="h-4 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

                    {/* Merchant Tenant Selector */}
                    <div className="relative shrink-0">
                        <button
                            type="button"
                            onClick={() => setMerchantMenuOpen((prev) => !prev)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors whitespace-nowrap shrink-0"
                            aria-expanded={merchantMenuOpen}
                            title={`Active Tenant: ${currentMerchant.name}`}
                        >
                            <Building2 className="size-3.5 text-slate-400 shrink-0" />
                            <span className="max-w-[70px] sm:max-w-[90px] xl:max-w-[120px] truncate font-medium">
                                {currentMerchant.name}
                            </span>
                            <ChevronDown className="size-3 text-slate-400 shrink-0" />
                        </button>

                        {merchantMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setMerchantMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-1.5 w-76 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50 text-xs">
                                    <div className="px-2 py-1 font-semibold text-slate-500 uppercase tracking-wider text-[10px] flex items-center justify-between">
                                        <span>Authorized Merchant Tenants</span>
                                        <span className="text-[10px] text-emerald-600 font-normal">
                                            {permittedMerchants.length > 0 ? `${permittedMerchants.length} active` : 'all'}
                                        </span>
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                        {(permittedMerchants.length > 0 ? permittedMerchants : KNOWN_MERCHANTS).map((m: { id: string; name: string; role?: string; slug?: string }) => (
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

                    {/* Operator Identity Badge & Interactive Role Switcher Dropdown */}
                    <div className="relative shrink-0">
                        {currentUser ? (
                            <button
                                type="button"
                                onClick={() => setOperatorMenuOpen((prev) => !prev)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors shrink-0"
                                aria-expanded={operatorMenuOpen}
                                title={`Operator: ${currentUser.fullName} (${operatorContext.role}). Click to switch role or account.`}
                            >
                                <div className="size-5 rounded-full bg-fin-brand/10 text-fin-brand flex items-center justify-center font-bold text-[10px] shrink-0">
                                    {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : <User className="size-3" />}
                                </div>
                                <div className="text-left hidden sm:block">
                                    <div className="font-semibold text-slate-900 leading-none text-[11px] truncate max-w-[65px] lg:max-w-[85px] xl:max-w-[110px]">
                                        {currentUser.fullName.split(' ')[0]}
                                    </div>
                                    <div className="text-[9px] font-mono leading-none mt-0.5 font-bold text-fin-brand uppercase">
                                        {operatorContext.role}
                                    </div>
                                </div>
                                <ChevronDown className="size-3 text-slate-400 shrink-0" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onOpenAuthModal}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-fin-brand px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-fin-brand-hover transition-colors whitespace-nowrap shrink-0"
                            >
                                <LogIn className="size-3.5 shrink-0" />
                                <span>Sign In</span>
                            </button>
                        )}

                        {currentUser && operatorMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setOperatorMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-1.5 w-76 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl z-50 text-xs">
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

                                    {/* Direct Role Switcher Section */}
                                    <div className="py-2.5 border-b border-slate-100 space-y-2">
                                        <div className="flex items-center justify-between text-slate-600">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                Switch Operator Role
                                            </span>
                                            <span
                                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${roleColor(
                                                    operatorContext.role,
                                                )}`}
                                            >
                                                Active: {operatorContext.role}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5">
                                            {(['OWNER', 'ADMIN', 'ANALYST', 'VIEWER'] as const).map((r) => {
                                                const isSelected = operatorContext.role.toUpperCase() === r;
                                                return (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => {
                                                            if (onUpdateOperatorContext) {
                                                                onUpdateOperatorContext({
                                                                    ...operatorContext,
                                                                    role: r,
                                                                });
                                                            }
                                                        }}
                                                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                                            isSelected
                                                                ? 'bg-fin-brand text-white border-fin-brand shadow-xs'
                                                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                                        }`}
                                                        title={`Switch role to ${r}`}
                                                    >
                                                        <span>{r}</span>
                                                        {isSelected && <Check className="size-3 text-white shrink-0 ml-1" />}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                                            <span>Authorized Tenants:</span>
                                            <span className="font-mono text-slate-800 font-semibold">
                                                {permittedMerchants.length > 0 ? permittedMerchants.length : 'All (Sandbox)'}
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
