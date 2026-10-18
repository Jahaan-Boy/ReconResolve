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
export type FeatureId =
    | 'webhooks'
    | 'processing'
    | 'matching'
    | 'ai'
    | 'queue'
    | 'audit';

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

export const HERO_CONTENT = {
    eyebrow: 'PAYMENT RECONCILIATION, BUILT FOR OPERATIONS TEAMS',
    title: 'Know where every payment stands.',
    description:
        'FlowOps brings provider transactions and merchant orders into one reconciliation workflow—surfacing discrepancies, organizing evidence, and helping your team resolve exceptions with confidence.',
    primaryCta: 'See how it works',
    primaryHref: '#how-it-works',
    secondaryCta: 'Explore capabilities',
    secondaryHref: '#features',
    supportingNote:
        'PayPal-first workflow · Evidence-backed AI · Human-owned decisions',
} as const;

export const NAV_LINKS: readonly NavItem[] = [
    { label: 'The problem', href: '#problem' },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Capabilities', href: '#features' },
    { label: 'Why FlowOps', href: '#benefits' },
];

export const MARQUEE_ITEMS: readonly string[] = [
    'Verified webhook intake',
    'Idempotent event handling',
    'Durable background processing',
    'Retry and recovery',
    'Layered transaction matching',
    'Evidence-grounded AI',
    'Merchant-scoped access',
    'Traceable resolution history',
];

export const PROBLEMS: readonly Problem[] = [
    {
        id: 'duplicates',
        icon: Copy,
        title: 'When payment events arrive twice',
        description:
            'Retries and out-of-order webhooks can create confusing records. Idempotent ingestion is designed to prevent repeated deliveries from becoming duplicate transactions.',
    },
    {
        id: 'mismatch',
        icon: GitMerge,
        title: 'When your numbers stop lining up',
        description:
            'A provider payment and an internal order can disagree on amount, status, or timing. FlowOps is designed to surface those differences instead of leaving them buried in reports.',
    },
    {
        id: 'manual',
        icon: Search,
        title: 'When every investigation starts from zero',
        description:
            'Jumping between logs, provider dashboards, and spreadsheets wastes time. Bring the relevant records, evidence, and resolution history together around each exception.',
    },
];

export const STEPS: readonly Step[] = [
    {
        number: '01',
        icon: Webhook,
        title: 'Ingest',
        description:
            'Validate incoming PayPal events, record them durably, and deduplicate repeated deliveries before downstream processing.',
    },
    {
        number: '02',
        icon: GitMerge,
        title: 'Reconcile',
        description:
            'Compare provider transactions with merchant orders. Check exact matches first, then surface constrained and fuzzy candidates for review.',
    },
    {
        number: '03',
        icon: Sparkles,
        title: 'Investigate',
        description:
            'Turn discrepancies into structured exceptions with relevant records, evidence-linked explanations, and clearly stated uncertainty.',
    },
    {
        number: '04',
        icon: ScrollText,
        title: 'Resolve',
        description:
            'Give your team the context to make a decision, record the outcome, and preserve a traceable history of what happened.',
    },
];

export const FEATURES: readonly Feature[] = [
    {
        id: 'webhooks',
        icon: Webhook,
        title: 'Verified event ingestion',
        description:
            'Validate webhook signatures and use durable event identities to help prevent repeated deliveries from creating duplicate records.',
    },
    {
        id: 'processing',
        icon: RefreshCw,
        title: 'Processing built for recovery',
        description:
            'Durable work records, retry policies, and backoff are designed to recover from transient failures without silently losing processing state.',
    },
    {
        id: 'matching',
        icon: Layers,
        title: 'Matching with a clear trail',
        description:
            'Prioritize exact matches, evaluate constrained candidates, and use fuzzy matching to surface possibilities that need human review.',
    },
    {
        id: 'ai',
        icon: Sparkles,
        title: 'An AI investigator you can supervise',
        description:
            'Get evidence-linked explanations that distinguish known facts from likely causes. The investigator is designed to remain read-only.',
    },
    {
        id: 'queue',
        icon: Clock,
        title: 'One place for unresolved exceptions',
        description:
            'Track missing counterparts, amount mismatches, and status discrepancies through investigation and human resolution.',
    },
    {
        id: 'audit',
        icon: Lock,
        title: 'Isolation and accountability',
        description:
            'Keep merchant data scoped to its owner and preserve a traceable record of investigation decisions and resolution activity.',
    },
];

export const STATS: readonly Stat[] = [
    {
        value: 4,
        label: 'Workflow stages',
        detail: 'A consistent path from event intake to recorded resolution.',
    },
    {
        value: 3,
        label: 'Matching passes',
        detail: 'Exact matches, constrained candidates, then fuzzy suggestions.',
    },
    {
        value: 0,
        label: 'AI write permissions',
        detail: 'AI explains evidence; it does not initiate refunds or move money.',
    },
    {
        value: 1,
        label: 'Exception history',
        detail: 'One traceable record for investigation and resolution activity.',
    },
];

export const BENEFITS: readonly TextItem[] = [
    {
        title: 'Spend less time chasing transactions',
        description:
            'Bring related payment records and investigation context together instead of retracing events across disconnected tools.',
    },
    {
        title: 'See discrepancies, not just totals',
        description:
            'Surface missing counterparts, amount differences, and status conflicts so your team knows what needs attention.',
    },
    {
        title: 'Keep AI accountable',
        description:
            'Use explanations grounded in available evidence, with uncertainty made explicit and people responsible for the final decision.',
    },
    {
        title: 'Build recovery into the workflow',
        description:
            'Use idempotency and controlled retries to help background processing recover from interruptions without creating avoidable duplicates.',
    },
    {
        title: 'Make decisions traceable',
        description:
            'Preserve the reasoning, evidence, and recorded outcome behind each investigated exception.',
    },
];

export const GUARANTEES: readonly string[] = [
    'AI is read-only and never initiates refunds or money movements.',
    'People own final exception-resolution decisions.',
    'Ambiguous matches are flagged for review instead of silently forced.',
    'Merchant data access is designed to remain scoped to its owner.',
];