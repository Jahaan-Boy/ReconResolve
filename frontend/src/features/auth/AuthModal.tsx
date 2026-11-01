import { useState } from 'react';
import {
    AlertCircle,
    Building2,
    Check,
    Eye,
    EyeOff,
    LogIn,
    Shield,
    Sparkles,
    User,
    X,
} from 'lucide-react';
import { authApiClient, type AuthSessionData } from '@/services/api/auth-api';

interface AuthModalProps {
    isOpen: boolean;
    onClose?: () => void;
    onLoginSuccess: (session: AuthSessionData) => void;
}

interface DemoAccount {
    name: string;
    email: string;
    role: string;
    merchants: string;
    description: string;
    badgeColor: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
    {
        name: 'Sarah Jenkins',
        email: 'admin@reconresolve.com',
        role: 'OWNER / ADMIN',
        merchants: 'Demo Merchant & Sandbox',
        description: 'Full administrative access across 2 merchants. Can resolve, dismiss, and reopen.',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
        name: 'Alex Rivera',
        email: 'analyst@reconresolve.com',
        role: 'ANALYST',
        merchants: 'Demo Merchant',
        description: 'Operational investigator. Authorized to review discrepancies and execute transitions.',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
        name: 'Morgan Lee',
        email: 'viewer@reconresolve.com',
        role: 'VIEWER (Read-Only)',
        merchants: 'Demo Merchant',
        description: 'Auditor profile. Read-only permissions; mutations trigger 403 Forbidden.',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
        name: 'Taylor Cross',
        email: 'isolated@othermerchant.com',
        role: 'ISOLATED TENANT',
        merchants: 'Apex Global Trade only',
        description: 'Multi-tenant isolation proof. Denied with 404 when querying Demo Merchant.',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    },
];

export function AuthModal({ isOpen, onClose, onLoginSuccess }: AuthModalProps) {
    const [selectedEmail, setSelectedEmail] = useState(DEMO_ACCOUNTS[0].email);
    const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
    const [password, setPassword] = useState('Password123!');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSelectDemo = (acc: DemoAccount) => {
        setSelectedEmail(acc.email);
        setEmail(acc.email);
        setPassword('Password123!');
        setErrorMessage(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage(null);

        try {
            const data = await authApiClient.login(email.trim(), password);
            onLoginSuccess(data);
            if (onClose) onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Invalid email or password';
            setErrorMessage(message);
        } finally {
            setLoading(false);
        }
    };

    const currentSelected = DEMO_ACCOUNTS.find((a) => a.email === selectedEmail);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Dialog */}
            <div className="relative w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-2xl z-10 animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-fin-brand/10 text-fin-brand shadow-2xs">
                            <Shield className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-slate-900">
                                ReconResolve Operator Authentication
                            </h2>
                            <p className="text-xs text-slate-500">
                                Verify your identity and select your tenant context
                            </p>
                        </div>
                    </div>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>

                {/* Demo Quick-Select Profiles */}
                <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            Select Test Identity
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fin-brand">
                            <Sparkles className="size-3" />
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {DEMO_ACCOUNTS.map((acc) => {
                            const isSelected = selectedEmail === acc.email;
                            return (
                                <button
                                    key={acc.email}
                                    type="button"
                                    onClick={() => handleSelectDemo(acc)}
                                    className={`relative flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${isSelected
                                            ? 'border-fin-brand bg-fin-brand/5 shadow-2xs ring-1 ring-fin-brand/40'
                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                                        }`}
                                >
                                    <div className="flex w-full items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <User className="size-3.5 text-slate-500" />
                                            <span className="text-xs font-semibold text-slate-800">
                                                {acc.name}
                                            </span>
                                        </div>
                                        <span
                                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${acc.badgeColor}`}
                                        >
                                            {acc.role}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-mono mt-1 truncate max-w-full">
                                        {acc.email}
                                    </span>
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400">
                                        <Building2 className="size-2.5 shrink-0" />
                                        <span className="truncate">{acc.merchants}</span>
                                    </div>
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-fin-brand text-white">
                                            <Check className="size-2.5" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {currentSelected && (
                        <div className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11px] text-slate-600 flex items-start gap-2">
                            <Shield className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-medium text-slate-800">Security Invariant: </span>
                                {currentSelected.description}
                            </div>
                        </div>
                    )}
                </div>

                {/* Form Fields */}
                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    {errorMessage && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/80 p-2.5 text-xs text-red-700">
                            <AlertCircle className="size-4 shrink-0 text-red-500" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Email Identifier
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setSelectedEmail('');
                            }}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-fin-brand focus:outline-none focus:ring-1 focus:ring-fin-brand"
                            placeholder="operator@reconresolve.com"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 pr-10 focus:border-fin-brand focus:outline-none focus:ring-1 focus:ring-fin-brand"
                                placeholder="••••••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showPassword ? (
                                    <EyeOff className="size-3.5" />
                                ) : (
                                    <Eye className="size-3.5" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-fin-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-fin-brand/90 focus:outline-none disabled:opacity-60 transition-all"
                        >
                            {loading ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Verifying credentials…
                                </span>
                            ) : (
                                <>
                                    <LogIn className="size-3.5" />
                                    Sign In & Establish Context
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {/* Footer notes */}
                <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>Server-enforced session with HttpOnly secure cookie</span>
                    <span className="font-mono">Node 22 scrypt + SHA-256</span>
                </div>
            </div>
        </div>
    );
}
