import {
    Clock,
    Copy,
    GitMerge,
    Layers,
    Lock,
    RefreshCw,
    ScrollText,
    Search,
    Sparkles,
    Webhook,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { NavItem } from '@/components/layout/Header';

export type ProblemId = 'duplicates' | 'mismatch' | 'manual';
export type FeatureId = 'webhooks' | 'processing' | 'matching' | 'ai' | 'queue' | 'audit';

export interface IconItem {
    icon: LucideIcon;
    title: string;
    description: string;
}

export interface Problem extends IconItem {
    id: ProblemId;
}

export interface Feature extends IconItem {
    id: FeatureId;
}

export interface Step extends IconItem {
    number: string;
}

export interface TextItem {
    title: string;
    description: string;
}

export interface Stat {
    value: number;
    label: string;
    detail: string;
}

export const NAV_LINKS: readonly NavItem[] = [
    { label: 'Problem', href: '#problem' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Benefits', href: '#benefits' },
];

export const MARQUEE_ITEMS: readonly string[] = [
    'Webhook signature verification',
    'Idempotent ingestion',
    'Transactional outbox',
    'Exponential backoff',
    'Exact and fuzzy matching',
    'Evidence-cited AI',
    'Tenant isolation',
    'Audit trail',
];

export const PROBLEMS: readonly Problem[] = [
    {
        id: 'duplicates',
        icon: Copy,
        title: 'Duplicate and delayed events',
        description:
            'Webhooks are retried and can arrive twice or out of order, quietly inflating or corrupting your numbers.',
    },
    {
        id: 'mismatch',
        icon: GitMerge,
        title: "Orders that don't line up",
        description:
            'Amounts, statuses and timestamps drift between PayPal and your own order records, and nobody notices until month-end.',
    },
    {
        id: 'manual',
        icon: Search,
        title: 'Investigations by hand',
        description:
            'Every discrepancy means digging through logs, dashboards and spreadsheets to work out what actually happened.',
    },
];

export const STEPS: readonly Step[] = [
    {
        number: '01',
        icon: Webhook,
        title: 'Ingest',
        description:
            'Verified PayPal events are stored exactly once, then queued for processing through a durable outbox.',
    },
    {
        number: '02',
        icon: GitMerge,
        title: 'Reconcile',
        description:
            'Transactions are matched to your orders: exact matches first, then constrained and fuzzy candidates.',
    },
    {
        number: '03',
        icon: Sparkles,
        title: 'Investigate',
        description:
            'Every mismatch becomes an exception. An AI investigator gathers evidence and explains what likely happened.',
    },
    {
        number: '04',
        icon: ScrollText,
        title: 'Resolve',
        description:
            'Your team reviews the explanation, decides, and records the resolution with a complete audit trail.',
    },
];

export const FEATURES: readonly Feature[] = [
    {
        id: 'webhooks',
        icon: Webhook,
        title: 'Verified, deduplicated webhooks',
        description:
            'Signatures are checked and each event is stored once, so repeated deliveries never double-count a payment.',
    },
    {
        id: 'processing',
        icon: RefreshCw,
        title: 'Reliable processing',
        description:
            'A transactional outbox and queued workers retry with backoff, and processing resumes cleanly after outages.',
    },
    {
        id: 'matching',
        icon: Layers,
        title: 'Layered matching',
        description:
            'Exact matches come first. Looser candidates carry a confidence score, and ambiguous ones go to review.',
    },
    {
        id: 'ai',
        icon: Sparkles,
        title: 'Read-only AI investigator',
        description:
            'Explanations cite their evidence and state their uncertainty. The AI can read data but cannot change it.',
    },
    {
        id: 'queue',
        icon: Clock,
        title: 'Exception queue',
        description:
            'Missing counterparts, amount mismatches and status discrepancies are tracked until someone resolves them.',
    },
    {
        id: 'audit',
        icon: Lock,
        title: 'Tenant isolation and audit trail',
        description:
            "Each merchant's data is scoped end to end, and every decision and resolution is recorded.",
    },
];

export const STATS: readonly Stat[] = [
    { value: 4, label: 'Pipeline stages', detail: 'From raw event to recorded resolution.' },
    { value: 3, label: 'Matching layers', detail: 'Exact, constrained and fuzzy.' },
    { value: 0, label: 'AI-initiated money movements', detail: 'The investigator is read-only.' },
    { value: 1, label: 'Audit trail per exception', detail: 'Every decision is recorded.' },
];

export const BENEFITS: readonly TextItem[] = [
    {
        title: 'Hours back every week',
        description:
            'Stop hunting through logs. Each exception arrives with context and a suggested next step.',
    },
    {
        title: 'Numbers you can trust',
        description:
            'Duplicate deliveries and retries never double-count, so your ledger reflects what really happened.',
    },
    {
        title: 'AI you can supervise',
        description:
            'Explanations point to their evidence and flag uncertainty instead of forcing a guess.',
    },
    {
        title: 'Resilient by design',
        description: 'Workers recover from failures and restarts without corrupting transaction state.',
    },
    {
        title: 'Audit-ready records',
        description:
            'Match decisions, investigations and resolutions are all recorded and traceable.',
    },
];

export const GUARANTEES: readonly string[] = [
    'The AI never initiates refunds or moves money.',
    'People review and record every resolution.',
    'Ambiguous matches are escalated, never forced.',
    'Data access is scoped per merchant.',
];