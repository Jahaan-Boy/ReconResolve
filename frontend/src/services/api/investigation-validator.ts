import { ApiClientError, type ConfidenceLevel, type InvestigationFact, type InvestigationLikelyCause, type InvestigationNextStep, type InvestigationRecord, type InvestigationResult, type InvestigationStatus } from './types';

/**
 * Defensive runtime validator for AI Investigator payloads.
 * Protects the UI against unexpected server structures or malformed model responses.
 */
export function validateInvestigationRecord(data: unknown): InvestigationRecord {
    if (!data || typeof data !== 'object') {
        throw new ApiClientError('INVALID_MODEL_OUTPUT', 'Investigation response is not an object', 502);
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj.id !== 'string' || obj.id.trim() === '') {
        throw new ApiClientError('INVALID_MODEL_OUTPUT', 'Investigation record is missing a valid id', 502);
    }
    if (typeof obj.merchantId !== 'string' || typeof obj.exceptionId !== 'string') {
        throw new ApiClientError('INVALID_MODEL_OUTPUT', 'Investigation record is missing merchantId or exceptionId', 502);
    }

    const rawStatus = String(obj.status || 'SUCCESS').toUpperCase();
    const validStatuses: InvestigationStatus[] = ['SUCCESS', 'INSUFFICIENT_EVIDENCE', 'FAILED'];
    const status: InvestigationStatus = validStatuses.includes(rawStatus as InvestigationStatus)
        ? (rawStatus as InvestigationStatus)
        : 'FAILED';

    if (!obj.result || typeof obj.result !== 'object') {
        throw new ApiClientError('INVALID_MODEL_OUTPUT', 'Investigation record is missing result object', 502);
    }

    const rawResult = obj.result as Record<string, unknown>;

    const summary = typeof rawResult.summary === 'string' ? rawResult.summary : 'No summary provided by investigator.';

    // Validate facts array
    const facts: InvestigationFact[] = [];
    if (Array.isArray(rawResult.facts)) {
        for (const item of rawResult.facts) {
            if (item && typeof item === 'object') {
                const factObj = item as Record<string, unknown>;
                const statement = typeof factObj.statement === 'string' ? factObj.statement : '';
                const evidenceRefs = Array.isArray(factObj.evidenceRefs)
                    ? factObj.evidenceRefs.map(String).filter((s) => s.length > 0)
                    : [];
                if (statement.length > 0) {
                    facts.push({ statement, evidenceRefs });
                }
            }
        }
    }

    // Validate likelyCauses array
    const likelyCauses: InvestigationLikelyCause[] = [];
    if (Array.isArray(rawResult.likelyCauses)) {
        for (const item of rawResult.likelyCauses) {
            if (item && typeof item === 'object') {
                const causeObj = item as Record<string, unknown>;
                const hypothesis = typeof causeObj.hypothesis === 'string' ? causeObj.hypothesis : '';
                const rationale = typeof causeObj.rationale === 'string' ? causeObj.rationale : '';
                const rawConf = String(causeObj.confidence || 'medium').toLowerCase();
                const confidence: ConfidenceLevel = (rawConf === 'high' || rawConf === 'low') ? rawConf : 'medium';
                const evidenceRefs = Array.isArray(causeObj.evidenceRefs)
                    ? causeObj.evidenceRefs.map(String).filter((s) => s.length > 0)
                    : [];

                if (hypothesis.length > 0) {
                    likelyCauses.push({ hypothesis, rationale, confidence, evidenceRefs });
                }
            }
        }
    }

    // Validate recommendedNextSteps array (invariants: nonDestructive must be true)
    const recommendedNextSteps: InvestigationNextStep[] = [];
    if (Array.isArray(rawResult.recommendedNextSteps)) {
        for (const item of rawResult.recommendedNextSteps) {
            if (item && typeof item === 'object') {
                const stepObj = item as Record<string, unknown>;
                const action = typeof stepObj.action === 'string' ? stepObj.action : '';
                const description = typeof stepObj.description === 'string' ? stepObj.description : '';
                if (action.length > 0) {
                    recommendedNextSteps.push({
                        action,
                        description,
                        nonDestructive: true,
                    });
                }
            }
        }
    }

    const missingOrConflictingEvidence = Array.isArray(rawResult.missingOrConflictingEvidence)
        ? rawResult.missingOrConflictingEvidence.map(String).filter((s) => s.length > 0)
        : [];

    const limitations = Array.isArray(rawResult.limitations)
        ? rawResult.limitations.map(String).filter((s) => s.length > 0)
        : [];

    const evidenceRefs = Array.isArray(rawResult.evidenceRefs)
        ? rawResult.evidenceRefs.map(String).filter((s) => s.length > 0)
        : [];

    const result: InvestigationResult = {
        summary,
        facts,
        likelyCauses,
        recommendedNextSteps,
        missingOrConflictingEvidence,
        limitations,
        evidenceRefs,
        generatedAt: typeof rawResult.generatedAt === 'string' ? rawResult.generatedAt : new Date().toISOString(),
        modelProvider: typeof rawResult.modelProvider === 'string' ? rawResult.modelProvider : 'reconciliation-investigator',
        modelId: typeof rawResult.modelId === 'string' ? rawResult.modelId : 'v1',
        promptVersion: typeof rawResult.promptVersion === 'string' ? rawResult.promptVersion : 'v1',
        outputSchemaVersion: typeof rawResult.outputSchemaVersion === 'string' ? rawResult.outputSchemaVersion : 'v1',
        status,
    };

    return {
        id: obj.id,
        merchantId: obj.merchantId,
        exceptionId: obj.exceptionId,
        actorId: typeof obj.actorId === 'string' ? obj.actorId : null,
        reconciliationRunId: typeof obj.reconciliationRunId === 'string' ? obj.reconciliationRunId : null,
        idempotencyKey: typeof obj.idempotencyKey === 'string' ? obj.idempotencyKey : null,
        status,
        result,
        modelProvider: typeof obj.modelProvider === 'string' ? obj.modelProvider : result.modelProvider,
        modelId: typeof obj.modelId === 'string' ? obj.modelId : result.modelId,
        promptVersion: typeof obj.promptVersion === 'string' ? obj.promptVersion : result.promptVersion,
        outputSchemaVersion: typeof obj.outputSchemaVersion === 'string' ? obj.outputSchemaVersion : result.outputSchemaVersion,
        durationMs: typeof obj.durationMs === 'number' ? obj.durationMs : 0,
        errorCategory: typeof obj.errorCategory === 'string' ? obj.errorCategory : undefined,
        createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    };
}
