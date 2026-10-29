export type AIInvestigatorErrorCode =
    | 'NOT_FOUND'
    | 'INSUFFICIENT_EVIDENCE'
    | 'MODEL_TIMEOUT'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_AUTH_ERROR'
    | 'PROVIDER_RATE_LIMIT'
    | 'INVALID_MODEL_OUTPUT'
    | 'UNKNOWN_EVIDENCE_REFERENCE'
    | 'PERSISTENCE_FAILED'
    | 'VALIDATION_FAILED'
    | 'FORBIDDEN'
    | 'INTERNAL_ERROR';

export class AIInvestigatorError extends Error {
    public readonly code: AIInvestigatorErrorCode;
    public readonly statusCode: number;
    public readonly details?: unknown;

    constructor(code: AIInvestigatorErrorCode, statusCode: number, message: string, details?: unknown) {
        super(message);
        this.name = 'AIInvestigatorError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        Object.setPrototypeOf(this, AIInvestigatorError.prototype);
    }

    static notFound(message = 'Exception not found or access denied'): AIInvestigatorError {
        return new AIInvestigatorError('NOT_FOUND', 404, message);
    }

    static insufficientEvidence(message: string, details?: unknown): AIInvestigatorError {
        return new AIInvestigatorError('INSUFFICIENT_EVIDENCE', 422, message, details);
    }

    static modelTimeout(message = 'AI model request timed out'): AIInvestigatorError {
        return new AIInvestigatorError('MODEL_TIMEOUT', 504, message);
    }

    static providerUnavailable(message = 'AI model provider is unavailable'): AIInvestigatorError {
        return new AIInvestigatorError('PROVIDER_UNAVAILABLE', 503, message);
    }

    static providerAuthError(message = 'AI provider authentication failed'): AIInvestigatorError {
        return new AIInvestigatorError('PROVIDER_AUTH_ERROR', 500, message);
    }

    static providerRateLimit(message = 'AI provider rate limit reached'): AIInvestigatorError {
        return new AIInvestigatorError('PROVIDER_RATE_LIMIT', 429, message);
    }

    static invalidModelOutput(message: string, details?: unknown): AIInvestigatorError {
        return new AIInvestigatorError('INVALID_MODEL_OUTPUT', 502, message, details);
    }

    static unknownEvidenceReference(refId: string): AIInvestigatorError {
        return new AIInvestigatorError(
            'UNKNOWN_EVIDENCE_REFERENCE',
            502,
            `Model output cited non-existent evidence reference: ${refId}`,
            { invalidRefId: refId },
        );
    }

    static persistenceFailed(message = 'Failed to persist investigation record'): AIInvestigatorError {
        return new AIInvestigatorError('PERSISTENCE_FAILED', 500, message);
    }

    static validationFailed(message: string, details?: unknown): AIInvestigatorError {
        return new AIInvestigatorError('VALIDATION_FAILED', 400, message, details);
    }

    static forbidden(message = 'Insufficient permissions'): AIInvestigatorError {
        return new AIInvestigatorError('FORBIDDEN', 403, message);
    }

    static internal(message = 'Internal investigation service error'): AIInvestigatorError {
        return new AIInvestigatorError('INTERNAL_ERROR', 500, message);
    }
}
