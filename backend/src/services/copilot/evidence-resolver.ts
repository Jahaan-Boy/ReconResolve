import type { PrismaClient } from '../../generated/prisma';
import { sanitizeErrorMessage } from '../outbox/error-sanitizer';

export interface ResolvedEvidenceItem {
    type: 'ptxn' | 'mord' | 'run' | 'exc' | string;
    id: string;
    label: string;
    available: boolean;
    reason?: string;
    data?: Record<string, unknown>;
}

// Redact known secret fields from raw JSON payloads
export function redactSensitivePayload(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;
    if (Array.isArray(raw)) {
        return raw.map(redactSensitivePayload);
    }
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
        const lowerKey = k.toLowerCase();
        if (
            lowerKey.includes('secret') ||
            lowerKey.includes('token') ||
            lowerKey.includes('auth') ||
            lowerKey.includes('password') ||
            lowerKey.includes('key')
        ) {
            clean[k] = '[REDACTED]';
        } else if (typeof v === 'object' && v !== null) {
            clean[k] = redactSensitivePayload(v);
        } else {
            clean[k] = v;
        }
    }
    return clean;
}

export class EvidenceResolver {
    private readonly db: any;

    constructor(db: any) {
        this.db = db;
    }

    async resolveReference(merchantId: string, refType: string, refId: string): Promise<ResolvedEvidenceItem> {
        const normalizedType = refType.toLowerCase();
        switch (normalizedType) {
            case 'ptxn':
                return this.resolveProviderTransaction(merchantId, refId);
            case 'mord':
                return this.resolveMerchantOrder(merchantId, refId);
            case 'run':
                return this.resolveReconciliationRun(merchantId, refId);
            case 'exc':
                return this.resolveException(merchantId, refId);
            default:
                return {
                    type: normalizedType,
                    id: refId,
                    label: `Unknown Evidence (${refType})`,
                    available: false,
                    reason: `Unsupported evidence type: ${refType}`,
                };
        }
    }

    private async resolveProviderTransaction(merchantId: string, id: string): Promise<ResolvedEvidenceItem> {
        try {
            const row = await this.db.providerTransaction.findFirst({
                where: { id, merchantId },
                include: {
                    providerConnection: {
                        select: { provider: true, connectionKey: true },
                    },
                },
            });

            if (!row) {
                return {
                    type: 'ptxn',
                    id,
                    label: `Provider Txn ${id.slice(0, 8)}...`,
                    available: false,
                    reason: 'Provider transaction not found or access denied for this merchant',
                };
            }

            return {
                type: 'ptxn',
                id: row.id,
                label: `PayPal Txn ${row.providerTxnId} (${row.currency} ${row.amountMinor.toString()})`,
                available: true,
                data: {
                    id: row.id,
                    providerTxnId: row.providerTxnId,
                    type: row.type,
                    status: row.status,
                    amountMinor: row.amountMinor.toString(),
                    currency: row.currency,
                    feeMinor: row.feeMinor ? row.feeMinor.toString() : null,
                    occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : new Date(row.occurredAt).toISOString(),
                    provider: row.providerConnection?.provider,
                    connectionKey: row.providerConnection?.connectionKey,
                    rawPayload: redactSensitivePayload(row.rawPayload),
                },
            };
        } catch (err) {
            return {
                type: 'ptxn',
                id,
                label: `Provider Txn ${id}`,
                available: false,
                reason: sanitizeErrorMessage(err),
            };
        }
    }

    private async resolveMerchantOrder(merchantId: string, id: string): Promise<ResolvedEvidenceItem> {
        try {
            const row = await this.db.merchantOrder.findFirst({
                where: { id, merchantId },
            });

            if (!row) {
                return {
                    type: 'mord',
                    id,
                    label: `Merchant Order ${id.slice(0, 8)}...`,
                    available: false,
                    reason: 'Merchant order not found or access denied for this merchant',
                };
            }

            return {
                type: 'mord',
                id: row.id,
                label: `Order ${row.externalOrderId} (${row.currency} ${row.amountMinor.toString()})`,
                available: true,
                data: {
                    id: row.id,
                    externalOrderId: row.externalOrderId,
                    status: row.status,
                    amountMinor: row.amountMinor.toString(),
                    currency: row.currency,
                    orderedAt: row.orderedAt instanceof Date ? row.orderedAt.toISOString() : new Date(row.orderedAt).toISOString(),
                    metadata: redactSensitivePayload(row.metadata),
                },
            };
        } catch (err) {
            return {
                type: 'mord',
                id,
                label: `Merchant Order ${id}`,
                available: false,
                reason: sanitizeErrorMessage(err),
            };
        }
    }

    private async resolveReconciliationRun(merchantId: string, id: string): Promise<ResolvedEvidenceItem> {
        try {
            const row = await this.db.reconciliationRun.findFirst({
                where: { id, merchantId },
            });

            if (!row) {
                return {
                    type: 'run',
                    id,
                    label: `Reconciliation Run ${id.slice(0, 8)}...`,
                    available: false,
                    reason: 'Reconciliation run not found or access denied for this merchant',
                };
            }

            return {
                type: 'run',
                id: row.id,
                label: `Run ${row.id.slice(0, 8)} [${row.status}] (${row.matchedCount} matched / ${row.totalConsidered} considered)`,
                available: true,
                data: {
                    id: row.id,
                    status: row.status,
                    rulesetVersion: row.rulesetVersion,
                    windowStart: row.windowStart instanceof Date ? row.windowStart.toISOString() : new Date(row.windowStart).toISOString(),
                    windowEnd: row.windowEnd instanceof Date ? row.windowEnd.toISOString() : new Date(row.windowEnd).toISOString(),
                    totalConsidered: row.totalConsidered,
                    matchedCount: row.matchedCount,
                    unmatchedCount: row.unmatchedCount,
                    ambiguousCount: row.ambiguousCount,
                    excludedCount: row.excludedCount,
                    failureReason: row.failureReason,
                    startedAt: row.startedAt ? (row.startedAt instanceof Date ? row.startedAt.toISOString() : new Date(row.startedAt).toISOString()) : null,
                    completedAt: row.completedAt ? (row.completedAt instanceof Date ? row.completedAt.toISOString() : new Date(row.completedAt).toISOString()) : null,
                    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
                },
            };
        } catch (err) {
            return {
                type: 'run',
                id,
                label: `Reconciliation Run ${id}`,
                available: false,
                reason: sanitizeErrorMessage(err),
            };
        }
    }

    private async resolveException(merchantId: string, id: string): Promise<ResolvedEvidenceItem> {
        try {
            const row = await this.db.reconciliationException.findFirst({
                where: { id, merchantId },
                include: {
                    providerTransaction: true,
                    merchantOrder: true,
                    auditEvents: {
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                    },
                },
            });

            if (!row) {
                return {
                    type: 'exc',
                    id,
                    label: `Exception ${id.slice(0, 8)}...`,
                    available: false,
                    reason: 'Exception break record not found or access denied for this merchant',
                };
            }

            let amountDeltaMinor: string | null = null;
            let currencyMismatch = false;

            if (row.providerTransaction && row.merchantOrder) {
                if (row.providerTransaction.currency !== row.merchantOrder.currency) {
                    currencyMismatch = true;
                } else {
                    const diff = BigInt(row.providerTransaction.amountMinor) - BigInt(row.merchantOrder.amountMinor);
                    amountDeltaMinor = diff.toString();
                }
            }

            return {
                type: 'exc',
                id: row.id,
                label: `Break ${row.type} [${row.status}]`,
                available: true,
                data: {
                    id: row.id,
                    type: row.type,
                    status: row.status,
                    version: row.version,
                    resolutionNote: row.resolutionNote,
                    resolvedAt: row.resolvedAt ? (row.resolvedAt instanceof Date ? row.resolvedAt.toISOString() : new Date(row.resolvedAt).toISOString()) : null,
                    amountDeltaMinor,
                    currencyMismatch,
                    providerTransaction: row.providerTransaction
                        ? {
                              id: row.providerTransaction.id,
                              providerTxnId: row.providerTransaction.providerTxnId,
                              amountMinor: row.providerTransaction.amountMinor.toString(),
                              currency: row.providerTransaction.currency,
                              occurredAt: row.providerTransaction.occurredAt instanceof Date ? row.providerTransaction.occurredAt.toISOString() : new Date(row.providerTransaction.occurredAt).toISOString(),
                          }
                        : null,
                    merchantOrder: row.merchantOrder
                        ? {
                              id: row.merchantOrder.id,
                              externalOrderId: row.merchantOrder.externalOrderId,
                              amountMinor: row.merchantOrder.amountMinor.toString(),
                              currency: row.merchantOrder.currency,
                              orderedAt: row.merchantOrder.orderedAt instanceof Date ? row.merchantOrder.orderedAt.toISOString() : new Date(row.merchantOrder.orderedAt).toISOString(),
                          }
                        : null,
                    recentAuditEvents: (row.auditEvents || []).map((a: any) => ({
                        id: a.id,
                        action: a.action,
                        actorId: a.actorId,
                        fromStatus: a.fromStatus,
                        toStatus: a.toStatus,
                        reason: a.reason,
                        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : new Date(a.createdAt).toISOString(),
                    })),
                },
            };
        } catch (err) {
            return {
                type: 'exc',
                id,
                label: `Exception ${id}`,
                available: false,
                reason: sanitizeErrorMessage(err),
            };
        }
    }
}

