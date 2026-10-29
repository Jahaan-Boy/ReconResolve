import { z } from 'zod';

export type InvestigationStatus = 'SUCCESS' | 'INSUFFICIENT_EVIDENCE' | 'FAILED';

export type EvidenceRefType =
    | 'EXCEPTION'
    | 'PROVIDER_TRANSACTION'
    | 'MERCHANT_ORDER'
    | 'RECONCILIATION_RUN'
    | 'RECONCILIATION_MATCH'
    | 'AUDIT_EVENT';

export interface EvidenceReference {
    refId: string;
    type: EvidenceRefType;
    label: string;
    recordId: string;
}

export interface ExceptionEvidenceData {
    id: string;
    type: string;
    status: string;
    reconciliationRunId: string | null;
    providerTransactionId: string | null;
    merchantOrderId: string | null;
    version: number;
    details: unknown;
    createdAt: string;
}

export interface ProviderTransactionEvidenceData {
    id: string;
    providerTxnId: string;
    providerRecordKey: string;
    providerOrderId: string | null;
    type: string;
    status: string;
    amountMinor: string; // Exact string representation of minor units (cents)
    currency: string;
    feeMinor: string | null;
    occurredAt: string;
    sanitizedDescription?: string;
}

export interface MerchantOrderEvidenceData {
    id: string;
    externalOrderId: string;
    amountMinor: string; // Exact string representation
    currency: string;
    status: string;
    orderedAt: string;
    sanitizedMetadata?: Record<string, unknown>;
}

export interface ReconciliationRunEvidenceData {
    id: string;
    rulesetVersion: string;
    windowStart: string;
    windowEnd: string;
    status: string;
    totalConsidered: number;
    matchedCount: number;
    unmatchedCount: number;
    ambiguousCount: number;
}

export interface EvidenceBundle {
    exceptionId: string;
    merchantId: string;
    assembledAt: string;
    availableEvidenceRefs: string[];
    evidenceMap: Record<string, EvidenceReference>;
    exception: ExceptionEvidenceData;
    providerTransaction: ProviderTransactionEvidenceData | null;
    merchantOrder: MerchantOrderEvidenceData | null;
    reconciliationRun: ReconciliationRunEvidenceData | null;
    flags: {
        hasProviderTransaction: boolean;
        hasMerchantOrder: boolean;
        hasReconciliationRun: boolean;
        isAmountDiscrepancy: boolean;
        isMissingCounterpart: boolean;
        isStatusDiscrepancy: boolean;
    };
    untrustedTextSnippets: Array<{ source: string; content: string }>;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface InvestigationFact {
    statement: string;
    evidenceRefs: string[];
}

export interface InvestigationLikelyCause {
    hypothesis: string;
    rationale: string;
    confidence: ConfidenceLevel;
    evidenceRefs: string[];
}

export interface InvestigationNextStep {
    action: string;
    description: string;
    nonDestructive: true; // Invariant: AI can only suggest non-destructive operator steps
}

export interface InvestigationResult {
    summary: string;
    facts: InvestigationFact[];
    likelyCauses: InvestigationLikelyCause[];
    recommendedNextSteps: InvestigationNextStep[];
    missingOrConflictingEvidence: string[];
    limitations: string[];
    evidenceRefs: string[];
    generatedAt: string;
    modelProvider: string;
    modelId: string;
    promptVersion: string;
    outputSchemaVersion: string;
    status: InvestigationStatus;
}

export interface InvestigationRecord {
    id: string;
    merchantId: string;
    exceptionId: string;
    actorId: string | null;
    reconciliationRunId: string | null;
    idempotencyKey: string | null;
    status: InvestigationStatus;
    result: InvestigationResult;
    modelProvider: string;
    modelId: string;
    promptVersion: string;
    outputSchemaVersion: string;
    durationMs: number;
    errorCategory?: string;
    createdAt: Date;
}

export interface InvestigationRequest {
    exceptionId: string;
    merchantId: string;
    actorId?: string;
    idempotencyKey?: string;
    correlationId?: string;
}

// ---------------------------------------------------------------------------
// Runtime Zod Schemas for Model Output Validation
// ---------------------------------------------------------------------------

export const InvestigationFactSchema = z.object({
    statement: z.string().min(5).max(1000),
    evidenceRefs: z.array(z.string().min(1).max(100)).min(1),
});

export const InvestigationLikelyCauseSchema = z.object({
    hypothesis: z.string().min(5).max(1000),
    rationale: z.string().min(5).max(2000),
    confidence: z.enum(['low', 'medium', 'high']),
    evidenceRefs: z.array(z.string().min(1).max(100)).min(1),
});

export const InvestigationNextStepSchema = z.object({
    action: z.string().min(3).max(200),
    description: z.string().min(5).max(1000),
    nonDestructive: z.literal(true),
});

export const InvestigationModelOutputSchema = z.object({
    summary: z.string().min(10).max(2000),
    facts: z.array(InvestigationFactSchema).min(1).max(20),
    likelyCauses: z.array(InvestigationLikelyCauseSchema).max(10),
    recommendedNextSteps: z.array(InvestigationNextStepSchema).min(1).max(10),
    missingOrConflictingEvidence: z.array(z.string().max(500)).default([]),
    limitations: z.array(z.string().max(500)).default([]),
    evidenceRefs: z.array(z.string().max(100)).min(1),
    status: z.enum(['SUCCESS', 'INSUFFICIENT_EVIDENCE', 'FAILED']).default('SUCCESS'),
});

export type RawInvestigationModelOutput = z.infer<typeof InvestigationModelOutputSchema>;
