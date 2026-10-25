import {
    ApiClientError,
    ConcurrencyConflictError,
    type ExceptionDetail,
    type ExceptionsApiClient,
    type ListExceptionsFilter,
    type ListExceptionsResult,
    type OperatorContext,
    type ResolveExceptionInput,
    type ReopenExceptionInput,
    type DismissExceptionInput,
    type InvestigateExceptionInput,
    type ExceptionAuditEventSummary,
} from './types';

export const SEEDED_MERCHANTS = [
    {
        id: '50f20dea-28b3-4da4-b733-517fead8e3a7',
        name: 'Demo Merchant (PostgreSQL)',
        slug: 'demo-merchant',
    },
    {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Acme Retail US (Sandbox)',
        slug: 'sandbox-merchant',
    },
    {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Acme Retail US',
        slug: 'acme-retail',
    },
    {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Global Goods EMEA',
        slug: 'global-goods',
    },
] as const;

export const DEFAULT_MERCHANT_ID = SEEDED_MERCHANTS[0].id;

const INITIAL_MOCK_EXCEPTIONS: ExceptionDetail[] = [
    {
        id: 'e1000000-0000-4000-8000-000000000001',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'AMOUNT_MISMATCH',
        status: 'OPEN',
        providerTransactionId: 'p1000000-0000-4000-8000-000000000001',
        merchantOrderId: 'm1000000-0000-4000-8000-000000000001',
        details: {
            reasonCode: 'AMOUNT_MISMATCH',
            evidence: {
                rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                expectedAmountMinor: '10200',
                actualAmountMinor: '12000',
                orderId: 'm1000000-0000-4000-8000-000000000001',
            },
        },
        resolutionNote: null,
        resolvedAt: null,
        version: 1,
        createdAt: '2026-10-25T14:32:00.000Z',
        updatedAt: '2026-10-25T14:32:00.000Z',
        linkedProviderTransaction: {
            id: 'p1000000-0000-4000-8000-000000000001',
            providerTxnId: 'PAYID-M458992-TXN-1043',
            amountMinor: '12000',
            currency: 'USD',
            status: 'CAPTURED',
            occurredAt: '2026-10-25T14:30:15.000Z',
        },
        linkedMerchantOrder: {
            id: 'm1000000-0000-4000-8000-000000000001',
            externalOrderId: 'ORD-1043',
            amountMinor: '10200',
            currency: 'USD',
            status: 'PAID',
            orderedAt: '2026-10-25T14:28:00.000Z',
        },
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-25T00:00:00.000Z',
            windowEnd: '2026-10-25T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a1000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e1000000-0000-4000-8000-000000000001',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Discrepancy detected during daily run: amount mismatch $18.00 gap',
                metadata: { ruleset: 'v1.2' },
                createdAt: '2026-10-25T14:32:00.000Z',
            },
        ],
    },
    {
        id: 'e2000000-0000-4000-8000-000000000002',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'STATUS_DISCREPANCY',
        status: 'INVESTIGATING',
        providerTransactionId: 'p2000000-0000-4000-8000-000000000002',
        merchantOrderId: 'm2000000-0000-4000-8000-000000000002',
        details: {
            reasonCode: 'ORDER_CANCELLED',
            evidence: {
                rule: 'EXACT_PROVIDER_ORDER_REFERENCE',
                orderStatus: 'CANCELLED',
                transactionStatus: 'CAPTURED',
            },
        },
        resolutionNote: null,
        resolvedAt: null,
        version: 2,
        createdAt: '2026-10-25T13:10:00.000Z',
        updatedAt: '2026-10-25T13:45:00.000Z',
        linkedProviderTransaction: {
            id: 'p2000000-0000-4000-8000-000000000002',
            providerTxnId: 'PAYID-M993012-TXN-1088',
            amountMinor: '24000',
            currency: 'USD',
            status: 'CAPTURED',
            occurredAt: '2026-10-25T13:08:44.000Z',
        },
        linkedMerchantOrder: {
            id: 'm2000000-0000-4000-8000-000000000002',
            externalOrderId: 'ORD-1088',
            amountMinor: '24000',
            currency: 'USD',
            status: 'CANCELLED',
            orderedAt: '2026-10-25T12:55:00.000Z',
        },
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-25T00:00:00.000Z',
            windowEnd: '2026-10-25T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a2000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e2000000-0000-4000-8000-000000000002',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Discrepancy detected: order was marked CANCELLED while payment captured',
                createdAt: '2026-10-25T13:10:00.000Z',
            },
            {
                id: 'a2000000-0000-4000-8000-000000000002',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e2000000-0000-4000-8000-000000000002',
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'INVESTIGATE',
                fromStatus: 'OPEN',
                toStatus: 'INVESTIGATING',
                reason: 'Customer initiated cancellation right as PayPal capture completed. Checking refund webhook.',
                createdAt: '2026-10-25T13:45:00.000Z',
            },
        ],
    },
    {
        id: 'e3000000-0000-4000-8000-000000000003',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'MISSING_PROVIDER_COUNTERPART',
        status: 'OPEN',
        providerTransactionId: null,
        merchantOrderId: 'm3000000-0000-4000-8000-000000000003',
        details: {
            reasonCode: 'NO_PROVIDER_TRANSACTION',
            details: 'Merchant order placed with payment provider PayPal, but no matching capture or settlement record found.',
        },
        resolutionNote: null,
        resolvedAt: null,
        version: 1,
        createdAt: '2026-10-25T11:20:00.000Z',
        updatedAt: '2026-10-25T11:20:00.000Z',
        linkedProviderTransaction: null,
        linkedMerchantOrder: {
            id: 'm3000000-0000-4000-8000-000000000003',
            externalOrderId: 'ORD-1102',
            amountMinor: '8950',
            currency: 'USD',
            status: 'PAYMENT_PENDING',
            orderedAt: '2026-10-25T11:15:00.000Z',
        },
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-25T00:00:00.000Z',
            windowEnd: '2026-10-25T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a3000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e3000000-0000-4000-8000-000000000003',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Missing provider counterpart: order pending settlement over 6 hours.',
                createdAt: '2026-10-25T11:20:00.000Z',
            },
        ],
    },
    {
        id: 'e4000000-0000-4000-8000-000000000004',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'MISSING_MERCHANT_COUNTERPART',
        status: 'OPEN',
        providerTransactionId: 'p4000000-0000-4000-8000-000000000004',
        merchantOrderId: null,
        details: {
            reasonCode: 'NO_CANDIDATE_ORDERS',
            details: 'PayPal captured payment $65.00 without any matching internal merchant order or cart checkout.',
        },
        resolutionNote: null,
        resolvedAt: null,
        version: 1,
        createdAt: '2026-10-25T09:40:00.000Z',
        updatedAt: '2026-10-25T09:40:00.000Z',
        linkedProviderTransaction: {
            id: 'p4000000-0000-4000-8000-000000000004',
            providerTxnId: 'PAYID-GHOST-TXN-9844',
            amountMinor: '6500',
            currency: 'USD',
            status: 'CAPTURED',
            occurredAt: '2026-10-25T09:35:12.000Z',
        },
        linkedMerchantOrder: null,
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-25T00:00:00.000Z',
            windowEnd: '2026-10-25T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a4000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e4000000-0000-4000-8000-000000000004',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Unmatched captured funds: no merchant order counterpart found.',
                createdAt: '2026-10-25T09:40:00.000Z',
            },
        ],
    },
    {
        id: 'e5000000-0000-4000-8000-000000000005',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'AMBIGUOUS_MATCH',
        status: 'RESOLVED',
        providerTransactionId: 'p5000000-0000-4000-8000-000000000005',
        merchantOrderId: 'm5000000-0000-4000-8000-000000000005',
        details: {
            reasonCode: 'MULTIPLE_CANDIDATES',
            candidateCount: 2,
            details: '2 orders with exact $45.00 amount created within 10 minutes of capture.',
        },
        resolutionNote: 'Customer confirmed order ORD-1099 corresponds to this PayPal checkout via invoice review.',
        resolvedAt: '2026-10-25T15:00:00.000Z',
        version: 3,
        createdAt: '2026-10-25T08:15:00.000Z',
        updatedAt: '2026-10-25T15:00:00.000Z',
        linkedProviderTransaction: {
            id: 'p5000000-0000-4000-8000-000000000005',
            providerTxnId: 'PAYID-AMBIG-TXN-5521',
            amountMinor: '4500',
            currency: 'USD',
            status: 'CAPTURED',
            occurredAt: '2026-10-25T08:10:00.000Z',
        },
        linkedMerchantOrder: {
            id: 'm5000000-0000-4000-8000-000000000005',
            externalOrderId: 'ORD-1099',
            amountMinor: '4500',
            currency: 'USD',
            status: 'PAID',
            orderedAt: '2026-10-25T08:08:00.000Z',
        },
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-25T00:00:00.000Z',
            windowEnd: '2026-10-25T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a5000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e5000000-0000-4000-8000-000000000005',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: 'Ambiguous candidate orders identified; engine declined fuzzy heuristic.',
                createdAt: '2026-10-25T08:15:00.000Z',
            },
            {
                id: 'a5000000-0000-4000-8000-000000000002',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e5000000-0000-4000-8000-000000000005',
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'INVESTIGATE',
                fromStatus: 'OPEN',
                toStatus: 'INVESTIGATING',
                reason: 'Cross-referencing billing email on PayPal checkout with customer records.',
                createdAt: '2026-10-25T09:00:00.000Z',
            },
            {
                id: 'a5000000-0000-4000-8000-000000000003',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e5000000-0000-4000-8000-000000000005',
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'RESOLVE',
                fromStatus: 'INVESTIGATING',
                toStatus: 'RESOLVED',
                reason: 'Customer confirmed order ORD-1099 corresponds to this PayPal checkout via invoice review.',
                createdAt: '2026-10-25T15:00:00.000Z',
            },
        ],
    },
    {
        id: 'e6000000-0000-4000-8000-000000000006',
        merchantId: DEFAULT_MERCHANT_ID,
        reconciliationRunId: 'r1000000-0000-4000-8000-000000000001',
        type: 'AMOUNT_MISMATCH',
        status: 'DISMISSED',
        providerTransactionId: 'p6000000-0000-4000-8000-000000000006',
        merchantOrderId: 'm6000000-0000-4000-8000-000000000006',
        details: {
            reasonCode: 'AMOUNT_MISMATCH',
            details: '1 cent rounding delta caused by legacy tax engine calculation.',
        },
        resolutionNote: 'Dismissed per merchant finance policy: rounding delta under $0.05 tolerance limit.',
        resolvedAt: '2026-10-25T16:10:00.000Z',
        version: 2,
        createdAt: '2026-10-24T18:00:00.000Z',
        updatedAt: '2026-10-25T16:10:00.000Z',
        linkedProviderTransaction: {
            id: 'p6000000-0000-4000-8000-000000000006',
            providerTxnId: 'PAYID-DISM-TXN-1299',
            amountMinor: '1999',
            currency: 'USD',
            status: 'CAPTURED',
            occurredAt: '2026-10-24T17:59:00.000Z',
        },
        linkedMerchantOrder: {
            id: 'm6000000-0000-4000-8000-000000000006',
            externalOrderId: 'ORD-1011',
            amountMinor: '2000',
            currency: 'USD',
            status: 'PAID',
            orderedAt: '2026-10-24T17:55:00.000Z',
        },
        reconciliationRun: {
            id: 'r1000000-0000-4000-8000-000000000001',
            rulesetVersion: 'v1.2',
            windowStart: '2026-10-24T00:00:00.000Z',
            windowEnd: '2026-10-24T23:59:59.000Z',
            status: 'COMPLETED',
        },
        auditEvents: [
            {
                id: 'a6000000-0000-4000-8000-000000000001',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e6000000-0000-4000-8000-000000000006',
                actorId: 'reconciliation-engine',
                actorType: 'SYSTEM',
                action: 'CREATE',
                fromStatus: 'OPEN',
                toStatus: 'OPEN',
                reason: '1 cent rounding gap detected.',
                createdAt: '2026-10-24T18:00:00.000Z',
            },
            {
                id: 'a6000000-0000-4000-8000-000000000002',
                merchantId: DEFAULT_MERCHANT_ID,
                exceptionId: 'e6000000-0000-4000-8000-000000000006',
                actorId: 'operator-sarah',
                actorType: 'OPERATOR',
                action: 'DISMISS',
                fromStatus: 'OPEN',
                toStatus: 'DISMISSED',
                reason: 'Dismissed per merchant finance policy: rounding delta under $0.05 tolerance limit.',
                createdAt: '2026-10-25T16:10:00.000Z',
            },
        ],
    },
];

export class MockExceptionsApiClient implements ExceptionsApiClient {
    private store: Map<string, ExceptionDetail>;

    constructor() {
        this.store = new Map();
        INITIAL_MOCK_EXCEPTIONS.forEach((item) => {
            this.store.set(item.id, JSON.parse(JSON.stringify(item)));
        });
    }

    private simulateDelay(): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, 80));
    }

    async listExceptions(merchantId: string, filter?: ListExceptionsFilter): Promise<ListExceptionsResult> {
        await this.simulateDelay();

        let all = Array.from(this.store.values()).filter(
            (e) => e.merchantId === merchantId || (merchantId === '11111111-1111-4111-8111-111111111111' && e.merchantId === DEFAULT_MERCHANT_ID),
        );

        if (filter?.status) {
            all = all.filter((e) => e.status === filter.status);
        }
        if (filter?.type) {
            all = all.filter((e) => e.type === filter.type);
        }
        if (filter?.reconciliationRunId) {
            all = all.filter((e) => e.reconciliationRunId === filter.reconciliationRunId);
        }
        if (filter?.providerTransactionId) {
            all = all.filter((e) => e.providerTransactionId === filter.providerTransactionId);
        }
        if (filter?.merchantOrderId) {
            all = all.filter((e) => e.merchantOrderId === filter.merchantOrderId);
        }
        if (filter?.createdFrom) {
            const from = new Date(filter.createdFrom).getTime();
            all = all.filter((e) => new Date(e.createdAt).getTime() >= from);
        }
        if (filter?.createdTo) {
            const to = new Date(filter.createdTo).getTime();
            all = all.filter((e) => new Date(e.createdAt).getTime() <= to);
        }
        if (filter?.search) {
            const q = filter.search.toLowerCase().trim();
            all = all.filter(
                (e) =>
                    e.id.toLowerCase().includes(q) ||
                    e.linkedMerchantOrder?.externalOrderId.toLowerCase().includes(q) ||
                    e.linkedProviderTransaction?.providerTxnId.toLowerCase().includes(q) ||
                    e.type.toLowerCase().includes(q),
            );
        }

        // Sort descending by createdAt
        all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 100);

        let startIndex = 0;
        if (filter?.cursor) {
            const foundIdx = all.findIndex((e) => e.id === filter.cursor);
            if (foundIdx >= 0) {
                startIndex = foundIdx + 1;
            }
        }

        const itemsSlice = all.slice(startIndex, startIndex + limit);
        const hasMore = startIndex + limit < all.length;
        const nextCursor = hasMore && itemsSlice.length > 0 ? itemsSlice[itemsSlice.length - 1].id : null;

        return {
            items: itemsSlice.map((item) => ({
                id: item.id,
                merchantId: item.merchantId,
                reconciliationRunId: item.reconciliationRunId,
                type: item.type,
                status: item.status,
                providerTransactionId: item.providerTransactionId,
                merchantOrderId: item.merchantOrderId,
                details: item.details,
                resolutionNote: item.resolutionNote,
                resolvedAt: item.resolvedAt,
                version: item.version,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            })),
            pagination: {
                limit,
                nextCursor,
                hasMore,
                totalCount: all.length,
            },
        };
    }

    async getException(merchantId: string, exceptionId: string): Promise<ExceptionDetail> {
        await this.simulateDelay();
        const found = this.store.get(exceptionId);
        if (!found || found.merchantId !== merchantId) {
            throw new ApiClientError('EXCEPTION_NOT_FOUND', `Exception ${exceptionId} not found`, 404);
        }
        return JSON.parse(JSON.stringify(found));
    }

    private checkConcurrency(record: ExceptionDetail, expectedVersion: number): void {
        if (record.version !== expectedVersion) {
            throw new ConcurrencyConflictError(
                `Record version conflict: expected version ${expectedVersion}, but current version is ${record.version}.`,
                { currentVersion: record.version, expectedVersion },
            );
        }
    }

    async resolve(
        merchantId: string,
        exceptionId: string,
        input: ResolveExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        await this.simulateDelay();
        const record = this.store.get(exceptionId);
        if (!record || record.merchantId !== merchantId) {
            throw new ApiClientError('EXCEPTION_NOT_FOUND', 'Exception not found', 404);
        }

        this.checkConcurrency(record, input.expectedVersion);

        if (record.status !== 'OPEN' && record.status !== 'INVESTIGATING') {
            throw new ApiClientError(
                'INVALID_STATE_TRANSITION',
                `Cannot transition to RESOLVED from status ${record.status}`,
                409,
            );
        }

        const trimmedNote = input.resolutionNote.trim();
        if (trimmedNote.length < 10) {
            throw new ApiClientError(
                'VALIDATION_FAILED',
                'resolutionNote must be at least 10 characters',
                400,
            );
        }

        const fromStatus = record.status;
        const now = new Date().toISOString();
        record.status = 'RESOLVED';
        record.resolutionNote = trimmedNote;
        record.resolvedAt = now;
        record.updatedAt = now;
        record.version += 1;

        const auditEvent: ExceptionAuditEventSummary = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            merchantId,
            exceptionId,
            actorId: ctx.operatorId,
            actorType: 'OPERATOR',
            action: 'RESOLVE',
            fromStatus,
            toStatus: 'RESOLVED',
            reason: trimmedNote,
            createdAt: now,
        };
        record.auditEvents.push(auditEvent);

        return JSON.parse(JSON.stringify(record));
    }

    async reopen(
        merchantId: string,
        exceptionId: string,
        input: ReopenExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        await this.simulateDelay();
        const record = this.store.get(exceptionId);
        if (!record || record.merchantId !== merchantId) {
            throw new ApiClientError('EXCEPTION_NOT_FOUND', 'Exception not found', 404);
        }

        this.checkConcurrency(record, input.expectedVersion);

        if (record.status === 'OPEN') {
            throw new ApiClientError('INVALID_STATE_TRANSITION', 'Exception is already OPEN', 409);
        }

        const trimmedReason = input.reopenReason.trim();
        if (trimmedReason.length < 10) {
            throw new ApiClientError('VALIDATION_FAILED', 'reopenReason must be at least 10 characters', 400);
        }

        const fromStatus = record.status;
        const now = new Date().toISOString();
        record.status = 'OPEN';
        record.resolutionNote = null;
        record.resolvedAt = null;
        record.updatedAt = now;
        record.version += 1;

        const auditEvent: ExceptionAuditEventSummary = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            merchantId,
            exceptionId,
            actorId: ctx.operatorId,
            actorType: 'OPERATOR',
            action: 'REOPEN',
            fromStatus,
            toStatus: 'OPEN',
            reason: trimmedReason,
            createdAt: now,
        };
        record.auditEvents.push(auditEvent);

        return JSON.parse(JSON.stringify(record));
    }

    async dismiss(
        merchantId: string,
        exceptionId: string,
        input: DismissExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        await this.simulateDelay();
        const record = this.store.get(exceptionId);
        if (!record || record.merchantId !== merchantId) {
            throw new ApiClientError('EXCEPTION_NOT_FOUND', 'Exception not found', 404);
        }

        this.checkConcurrency(record, input.expectedVersion);

        if (record.status !== 'OPEN' && record.status !== 'INVESTIGATING') {
            throw new ApiClientError(
                'INVALID_STATE_TRANSITION',
                `Cannot transition to DISMISSED from status ${record.status}`,
                409,
            );
        }

        const trimmedReason = input.dismissReason.trim();
        if (trimmedReason.length < 10) {
            throw new ApiClientError('VALIDATION_FAILED', 'dismissReason must be at least 10 characters', 400);
        }

        const fromStatus = record.status;
        const now = new Date().toISOString();
        record.status = 'DISMISSED';
        record.resolutionNote = trimmedReason;
        record.resolvedAt = now;
        record.updatedAt = now;
        record.version += 1;

        const auditEvent: ExceptionAuditEventSummary = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            merchantId,
            exceptionId,
            actorId: ctx.operatorId,
            actorType: 'OPERATOR',
            action: 'DISMISS',
            fromStatus,
            toStatus: 'DISMISSED',
            reason: trimmedReason,
            createdAt: now,
        };
        record.auditEvents.push(auditEvent);

        return JSON.parse(JSON.stringify(record));
    }

    async investigate(
        merchantId: string,
        exceptionId: string,
        input: InvestigateExceptionInput,
        ctx: OperatorContext,
    ): Promise<ExceptionDetail> {
        await this.simulateDelay();
        const record = this.store.get(exceptionId);
        if (!record || record.merchantId !== merchantId) {
            throw new ApiClientError('EXCEPTION_NOT_FOUND', 'Exception not found', 404);
        }

        this.checkConcurrency(record, input.expectedVersion);

        if (record.status !== 'OPEN') {
            throw new ApiClientError(
                'INVALID_STATE_TRANSITION',
                `Cannot transition to INVESTIGATING from status ${record.status}`,
                409,
            );
        }

        const note = input.note?.trim();
        const fromStatus = record.status;
        const now = new Date().toISOString();
        record.status = 'INVESTIGATING';
        record.updatedAt = now;
        record.version += 1;

        const auditEvent: ExceptionAuditEventSummary = {
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            merchantId,
            exceptionId,
            actorId: ctx.operatorId,
            actorType: 'OPERATOR',
            action: 'INVESTIGATE',
            fromStatus,
            toStatus: 'INVESTIGATING',
            reason: note || 'Operator began active investigation.',
            createdAt: now,
        };
        record.auditEvents.push(auditEvent);

        return JSON.parse(JSON.stringify(record));
    }
}
