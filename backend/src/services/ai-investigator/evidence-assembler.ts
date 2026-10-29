import { getDB } from '../../db/postgres';
import type { PrismaClient } from '../../generated/prisma';
import { AIInvestigatorError } from './errors';
import type {
    EvidenceBundle,
    EvidenceReference,
    ExceptionEvidenceData,
    MerchantOrderEvidenceData,
    ProviderTransactionEvidenceData,
    ReconciliationRunEvidenceData,
} from './types';

export interface EvidenceAssemblerDeps {
    getDb?: () => PrismaClient;
}

const MAX_UNTRUSTED_TEXT_LENGTH = 300;

/**
 * Strips control characters and truncates untrusted user/provider text to safe limits.
 */
export function sanitizeUntrustedText(text: unknown, maxLength = MAX_UNTRUSTED_TEXT_LENGTH): string {
    if (typeof text !== 'string') return '';
    // Replace non-printable ASCII / control characters (except common whitespace)
    const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength)}... [truncated]`;
}

/**
 * Deterministically constructs a minimum evidence bundle from persisted records.
 * Strictly scopes all database queries to the authenticated merchant ID.
 */
export class EvidenceAssembler {
    private readonly dbProvider: () => PrismaClient;

    constructor(deps: EvidenceAssemblerDeps = {}) {
        this.dbProvider = deps.getDb ?? getDB;
    }

    public async assemble(merchantId: string, exceptionId: string): Promise<EvidenceBundle> {
        const db = this.dbProvider();

        // 1. Fetch exception with merchant-isolation and selected relation fields only
        const exceptionRow: any = await (db.reconciliationException as any).findFirst({
            where: {
                id: exceptionId,
                merchantId, // Authoritative tenant boundary
            },
            select: {
                id: true,
                merchantId: true,
                reconciliationRunId: true,
                type: true,
                status: true,
                providerTransactionId: true,
                merchantOrderId: true,
                details: true,
                version: true,
                createdAt: true,
                providerTransaction: {
                    select: {
                        id: true,
                        merchantId: true,
                        providerTxnId: true,
                        providerRecordKey: true,
                        providerOrderId: true,
                        type: true,
                        status: true,
                        amountMinor: true,
                        currency: true,
                        feeMinor: true,
                        occurredAt: true,
                        rawPayload: true,
                    },
                },
                merchantOrder: {
                    select: {
                        id: true,
                        merchantId: true,
                        externalOrderId: true,
                        amountMinor: true,
                        currency: true,
                        status: true,
                        orderedAt: true,
                        metadata: true,
                    },
                },
                reconciliationRun: {
                    select: {
                        id: true,
                        merchantId: true,
                        rulesetVersion: true,
                        windowStart: true,
                        windowEnd: true,
                        status: true,
                        totalConsidered: true,
                        matchedCount: true,
                        unmatchedCount: true,
                        ambiguousCount: true,
                    },
                },
            },
        });

        // Fail safely: Cross-tenant access is indistinguishable from not found
        if (!exceptionRow) {
            throw AIInvestigatorError.notFound('Exception not found or access denied');
        }

        const availableEvidenceRefs: string[] = [];
        const evidenceMap: Record<string, EvidenceReference> = {};
        const untrustedTextSnippets: Array<{ source: string; content: string }> = [];

        // 2. Exception reference
        const exceptionRefId = `exc:${exceptionRow.id}`;
        availableEvidenceRefs.push(exceptionRefId);
        evidenceMap[exceptionRefId] = {
            refId: exceptionRefId,
            type: 'EXCEPTION',
            label: `Exception ${exceptionRow.type} (${exceptionRow.status})`,
            recordId: exceptionRow.id,
        };

        const exceptionData: ExceptionEvidenceData = {
            id: exceptionRow.id,
            type: exceptionRow.type,
            status: exceptionRow.status,
            reconciliationRunId: exceptionRow.reconciliationRunId,
            providerTransactionId: exceptionRow.providerTransactionId,
            merchantOrderId: exceptionRow.merchantOrderId,
            version: exceptionRow.version ?? 1,
            details: exceptionRow.details ?? null,
            createdAt: exceptionRow.createdAt.toISOString(),
        };

        // 3. Provider transaction reference (if linked and strictly tenant-owned)
        let providerTransactionData: ProviderTransactionEvidenceData | null = null;
        if (exceptionRow.providerTransaction && exceptionRow.providerTransaction.merchantId === merchantId) {
            const ptxn = exceptionRow.providerTransaction;
            const ptxnRefId = `ptxn:${ptxn.id}`;
            availableEvidenceRefs.push(ptxnRefId);
            evidenceMap[ptxnRefId] = {
                refId: ptxnRefId,
                type: 'PROVIDER_TRANSACTION',
                label: `Provider Transaction ${ptxn.providerTxnId} (${ptxn.amountMinor.toString()} ${ptxn.currency})`,
                recordId: ptxn.id,
            };

            // Extract bounded, untrusted provider description if present in payload (NO raw secrets or auth headers)
            let sanitizedDesc = '';
            if (ptxn.rawPayload && typeof ptxn.rawPayload === 'object') {
                const descCandidate =
                    (ptxn.rawPayload as any)?.description ||
                    (ptxn.rawPayload as any)?.note ||
                    (ptxn.rawPayload as any)?.custom_id;
                if (typeof descCandidate === 'string') {
                    sanitizedDesc = sanitizeUntrustedText(descCandidate);
                    untrustedTextSnippets.push({
                        source: `provider_transaction:${ptxn.id}`,
                        content: sanitizedDesc,
                    });
                }
            }

            providerTransactionData = {
                id: ptxn.id,
                providerTxnId: ptxn.providerTxnId,
                providerRecordKey: ptxn.providerRecordKey,
                providerOrderId: ptxn.providerOrderId,
                type: ptxn.type,
                status: ptxn.status,
                // Invariant: Never convert minor units via JavaScript floating point!
                amountMinor: ptxn.amountMinor.toString(),
                currency: ptxn.currency,
                feeMinor: ptxn.feeMinor ? ptxn.feeMinor.toString() : null,
                occurredAt: ptxn.occurredAt.toISOString(),
                sanitizedDescription: sanitizedDesc || undefined,
            };
        }

        // 4. Merchant order reference (if linked and strictly tenant-owned)
        let merchantOrderData: MerchantOrderEvidenceData | null = null;
        if (exceptionRow.merchantOrder && exceptionRow.merchantOrder.merchantId === merchantId) {
            const mord = exceptionRow.merchantOrder;
            const mordRefId = `mord:${mord.id}`;
            availableEvidenceRefs.push(mordRefId);
            evidenceMap[mordRefId] = {
                refId: mordRefId,
                type: 'MERCHANT_ORDER',
                label: `Merchant Order ${mord.externalOrderId} (${mord.amountMinor.toString()} ${mord.currency})`,
                recordId: mord.id,
            };

            let sanitizedMetadata: Record<string, unknown> | undefined;
            if (mord.metadata && typeof mord.metadata === 'object' && !Array.isArray(mord.metadata)) {
                sanitizedMetadata = {};
                for (const [k, v] of Object.entries(mord.metadata)) {
                    if (typeof v === 'string') {
                        const safeVal = sanitizeUntrustedText(v);
                        sanitizedMetadata[k] = safeVal;
                        untrustedTextSnippets.push({
                            source: `merchant_order:${mord.id}:${k}`,
                            content: safeVal,
                        });
                    } else if (typeof v === 'number' || typeof v === 'boolean') {
                        sanitizedMetadata[k] = v;
                    }
                }
            }

            merchantOrderData = {
                id: mord.id,
                externalOrderId: mord.externalOrderId,
                // Invariant: Exact string representation of BigInt minor units
                amountMinor: mord.amountMinor.toString(),
                currency: mord.currency,
                status: mord.status,
                orderedAt: mord.orderedAt.toISOString(),
                sanitizedMetadata,
            };
        }

        // 5. Reconciliation run reference (if linked and strictly tenant-owned)
        let reconciliationRunData: ReconciliationRunEvidenceData | null = null;
        if (exceptionRow.reconciliationRun && exceptionRow.reconciliationRun.merchantId === merchantId) {
            const run = exceptionRow.reconciliationRun;
            const runRefId = `run:${run.id}`;
            availableEvidenceRefs.push(runRefId);
            evidenceMap[runRefId] = {
                refId: runRefId,
                type: 'RECONCILIATION_RUN',
                label: `Reconciliation Run ${run.id} (${run.rulesetVersion})`,
                recordId: run.id,
            };

            reconciliationRunData = {
                id: run.id,
                rulesetVersion: run.rulesetVersion,
                windowStart: run.windowStart.toISOString(),
                windowEnd: run.windowEnd.toISOString(),
                status: run.status,
                totalConsidered: run.totalConsidered,
                matchedCount: run.matchedCount,
                unmatchedCount: run.unmatchedCount,
                ambiguousCount: run.ambiguousCount,
            };
        }

        // 6. Inspect flags & check sufficiency
        const hasProviderTransaction = providerTransactionData !== null;
        const hasMerchantOrder = merchantOrderData !== null;
        const hasReconciliationRun = reconciliationRunData !== null;

        // An exception with neither provider transaction, nor merchant order, nor details is insufficient
        if (!hasProviderTransaction && !hasMerchantOrder && (!exceptionRow.details || Object.keys(exceptionRow.details).length === 0)) {
            throw AIInvestigatorError.insufficientEvidence(
                'Exception lacks linked provider transaction, merchant order, and contextual details to formulate an explanation',
                { exceptionId },
            );
        }

        const isAmountDiscrepancy =
            providerTransactionData !== null &&
            merchantOrderData !== null &&
            (providerTransactionData.amountMinor !== merchantOrderData.amountMinor ||
                providerTransactionData.currency !== merchantOrderData.currency);

        const isMissingCounterpart =
            exceptionRow.type === 'MISSING_PROVIDER_COUNTERPART' ||
            exceptionRow.type === 'MISSING_MERCHANT_COUNTERPART' ||
            (!hasProviderTransaction && hasMerchantOrder) ||
            (hasProviderTransaction && !hasMerchantOrder);

        const isStatusDiscrepancy =
            exceptionRow.type === 'STATUS_DISCREPANCY' ||
            (providerTransactionData !== null &&
                merchantOrderData !== null &&
                providerTransactionData.status === 'CAPTURED' &&
                merchantOrderData.status === 'CANCELLED');

        return {
            exceptionId,
            merchantId,
            assembledAt: new Date().toISOString(),
            availableEvidenceRefs,
            evidenceMap,
            exception: exceptionData,
            providerTransaction: providerTransactionData,
            merchantOrder: merchantOrderData,
            reconciliationRun: reconciliationRunData,
            flags: {
                hasProviderTransaction,
                hasMerchantOrder,
                hasReconciliationRun,
                isAmountDiscrepancy,
                isMissingCounterpart,
                isStatusDiscrepancy,
            },
            untrustedTextSnippets,
        };
    }
}
