import { useState } from 'react';
import {
    ArrowLeft,
    Building2,
    ChevronDown,
    Shield,
    User,
    Check,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { SEEDED_MERCHANTS } from '@/services/api/mock-exceptions-api';
import type { OperatorContext } from '@/services/api/types';
import type { ApiSource } from '@/services/api/api-client';

interface ConsoleAppHeaderProps {
    currentMerchantId: string;
    onSelectMerchant: (merchantId: string) => void;
    operatorContext: OperatorContext;
    onUpdateOperatorContext: (ctx: OperatorContext) => void;
    apiSource: ApiSource;
    onToggleApiSource: (source: ApiSource) => void;
    onNavigateLanding: () => void;
}

export function ConsoleAppHeader({
    currentMerchantId,
    onSelectMerchant,
    operatorContext,
    onUpdateOperatorContext,
    apiSource,
    onToggleApiSource,
    onNavigateLanding,
}: ConsoleAppHeaderProps) {
    const [merchantMenuOpen, setMerchantMenuOpen] = useState(false);
    const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
    const [customMerchantInput, setCustomMerchantInput] = useState('');

    const currentMerchant = SEEDED_MERCHANTS.find((m) => m.id === currentMerchantId) || {
        id: currentMerchantId,
        name: 'Custom Tenant',
        slug: 'custom',
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
                                <div className="absolute right-0 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50 text-xs">
                                    <div className="px-2 py-1 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                                        Select Merchant Tenant
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                        {SEEDED_MERCHANTS.map((m) => (
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
                                                <div>
                                                    <div className="font-medium">{m.name}</div>
                                                    <div className="text-[11px] text-slate-400 font-mono">
                                                        slug: {m.slug}
                                                    </div>
                                                </div>
                                                {m.id === currentMerchantId && (
                                                    <Check className="size-4 text-fin-brand shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="mt-2 border-t border-slate-100 pt-2 px-1">
                                        <div className="text-[10px] text-slate-400 font-medium mb-1">
                                            Custom Merchant UUID:
                                        </div>
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                placeholder="e.g. 11111111-..."
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
                                                className="rounded bg-slate-800 px-2 py-1 text-white text-[11px] font-medium hover:bg-slate-700"
                                            >
                                                Apply
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Operator Identity Badge */}
                    <div className="relative">
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
                                    {operatorContext.operatorId}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">
                                    {operatorContext.role}
                                </div>
                            </div>
                            <ChevronDown className="size-3 text-slate-400 shrink-0" />
                        </button>

                        {operatorMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setOperatorMenuOpen(false)}
                                />
                                <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg z-50 text-xs">
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                                        <Shield className="size-4 text-fin-brand" />
                                        <span className="font-semibold text-slate-800">Operator Identity</span>
                                    </div>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-[11px] text-slate-500 font-medium block mb-1">
                                                Operator ID:
                                            </label>
                                            <input
                                                type="text"
                                                value={operatorContext.operatorId}
                                                onChange={(e) =>
                                                    onUpdateOperatorContext({
                                                        ...operatorContext,
                                                        operatorId: e.target.value,
                                                    })
                                                }
                                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-fin-brand focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] text-slate-500 font-medium block mb-1">
                                                Role:
                                            </label>
                                            <select
                                                value={operatorContext.role}
                                                onChange={(e) =>
                                                    onUpdateOperatorContext({
                                                        ...operatorContext,
                                                        role: e.target.value,
                                                    })
                                                }
                                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-fin-brand focus:outline-none bg-white"
                                            >
                                                <option value="OPERATOR">OPERATOR</option>
                                                <option value="ADMIN">ADMIN</option>
                                                <option value="VIEWER">VIEWER (Read-only)</option>
                                            </select>
                                        </div>
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
