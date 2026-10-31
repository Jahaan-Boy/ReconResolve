import { randomUUID } from 'node:crypto';
import {
    createInvestigationRepository,
    type InvestigationRepository,
} from '../../repositories/investigation.repository';
import { AIInvestigatorError } from './errors';
import { EvidenceAssembler } from './evidence-assembler';
import { InvestigationOutputValidator } from './output-validator';
import { buildUserPrompt, OUTPUT_SCHEMA_VERSION, PROMPT_VERSION, SYSTEM_PROMPT } from './prompt/investigation-prompt';
import { resolveModelProvider } from './provider/env-provider-factory';
import type { InvestigationModelProvider } from './provider/model-provider.interface';
import type {
    InvestigationRecord,
    InvestigationRequest,
    InvestigationResult,
} from './types';

export interface InvestigationServiceDeps {
    evidenceAssembler?: EvidenceAssembler;
    outputValidator?: InvestigationOutputValidator;
    modelProvider?: InvestigationModelProvider;
    repository?: InvestigationRepository;
    maxRetries?: number;
    timeoutMs?: number;
}

export class InvestigationService {
    private readonly evidenceAssembler: EvidenceAssembler;
    private readonly outputValidator: InvestigationOutputValidator;
    private readonly modelProvider: InvestigationModelProvider;
    private readonly repository: InvestigationRepository;
    private readonly maxRetries: number;
    private readonly timeoutMs: number;

    constructor(deps: InvestigationServiceDeps = {}) {
        this.evidenceAssembler = deps.evidenceAssembler ?? new EvidenceAssembler();
        this.outputValidator = deps.outputValidator ?? new InvestigationOutputValidator();
        this.modelProvider =
            deps.modelProvider ??
            resolveModelProvider({ allowTestFakeInNonTest: process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_FAKE_AI === 'true' }).provider;
        this.repository = deps.repository ?? createInvestigationRepository();
        this.maxRetries = deps.maxRetries ?? 1; // Bounded retry: at most 1 retry on transient error
        this.timeoutMs = deps.timeoutMs ?? 15_000; // Strict 15s timeout
    }

    /**
     * Conducts an AI investigation for a persisted reconciliation exception.
     * Guaranteed READ-ONLY with respect to exception state, order state, and transaction state.
     */
    public async investigate(request: InvestigationRequest): Promise<InvestigationRecord> {
        const startTime = Date.now();

        // 1. Check idempotency: If an idempotency key was supplied, return existing record if present
        if (request.idempotencyKey && request.idempotencyKey.trim().length > 0) {
            const existing = await this.repository.findByIdempotencyKey(
                request.merchantId,
                request.idempotencyKey.trim(),
            );
            if (existing) {
                return existing;
            }
        }

        // 2. Assemble minimum evidence bundle strictly scoped to the authenticated merchant
        const bundle = await this.evidenceAssembler.assemble(request.merchantId, request.exceptionId);

        // 3. Build system and user prompts
        const userPrompt = buildUserPrompt(bundle);

        // 4. Invoke model provider with bounded retries for transient errors only
        let attempts = 0;
        let rawOutput: any = null;
        let lastError: unknown = null;

        while (attempts <= this.maxRetries) {
            attempts++;
            try {
                rawOutput = await this.modelProvider.generate({
                    evidenceBundle: bundle,
                    systemPrompt: SYSTEM_PROMPT,
                    userPrompt,
                    promptVersion: PROMPT_VERSION,
                    outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
                    timeoutMs: this.timeoutMs,
                    correlationId: request.correlationId,
                });
                break; // Succeeded
            } catch (err) {
                lastError = err;
                // Only retry on transient rate limits or timeouts, never on auth/client errors
                const isRetryable =
                    err instanceof AIInvestigatorError &&
                    (err.code === 'MODEL_TIMEOUT' || err.code === 'PROVIDER_RATE_LIMIT');

                if (isRetryable && attempts <= this.maxRetries) {
                    await new Promise((r) => setTimeout(r, 500 * attempts));
                    continue;
                }
                throw err;
            }
        }

        if (!rawOutput) {
            throw lastError instanceof Error ? lastError : AIInvestigatorError.internal('Failed to generate investigation');
        }

        // 5. Runtime output validation and citation integrity verification
        const validatedResult: InvestigationResult = this.outputValidator.validate(
            rawOutput.rawContent,
            bundle,
            {
                modelProvider: rawOutput.modelProvider,
                modelId: rawOutput.modelId,
                promptVersion: PROMPT_VERSION,
                outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
            },
        );

        // 6. Build immutable investigation record
        const durationMs = Date.now() - startTime;
        const investigationRecord: InvestigationRecord = {
            id: randomUUID(),
            merchantId: request.merchantId,
            exceptionId: request.exceptionId,
            actorId: request.actorId ?? null,
            reconciliationRunId: bundle.exception.reconciliationRunId,
            idempotencyKey: request.idempotencyKey?.trim() || null,
            status: validatedResult.status,
            result: validatedResult,
            modelProvider: rawOutput.modelProvider,
            modelId: rawOutput.modelId,
            promptVersion: PROMPT_VERSION,
            outputSchemaVersion: OUTPUT_SCHEMA_VERSION,
            durationMs,
            createdAt: new Date(),
        };

        // 7. Persist investigation record
        const savedRecord = await this.repository.save(investigationRecord);

        // Invariant: Exception status and reconciliation outcomes remain untouched!
        return savedRecord;
    }

    public async getInvestigation(
        merchantId: string,
        exceptionId: string,
        investigationId: string,
    ): Promise<InvestigationRecord | null> {
        return this.repository.findById(merchantId, exceptionId, investigationId);
    }

    public async listInvestigations(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord[]> {
        return this.repository.listByException(merchantId, exceptionId);
    }

    public async getLatestInvestigation(
        merchantId: string,
        exceptionId: string,
    ): Promise<InvestigationRecord | null> {
        return this.repository.findLatestByException(merchantId, exceptionId);
    }
}

export function createInvestigationService(deps: InvestigationServiceDeps = {}): InvestigationService {
    return new InvestigationService(deps);
}
