import { AIInvestigatorError } from '../errors';
import type {
    GenerateInvestigationModelInput,
    InvestigationModelProvider,
    RawModelInvestigationOutput,
} from './model-provider.interface';

export interface TestFakeProviderOptions {
    providerName?: string;
    modelId?: string;
    delayMs?: number;
    simulateTimeout?: boolean;
    simulateRateLimit?: boolean;
    simulateAuthError?: boolean;
    simulateInvalidJson?: boolean;
    simulateHallucinatedRef?: boolean;
    customResponseGenerator?: (input: GenerateInvestigationModelInput) => string;
}

export class TestFakeInvestigationModelProvider implements InvestigationModelProvider {
    public readonly providerName: string;
    public readonly modelId: string;
    private options: TestFakeProviderOptions;

    constructor(options: TestFakeProviderOptions = {}) {
        this.providerName = options.providerName ?? 'test-fake-provider';
        this.modelId = options.modelId ?? 'fake-investigator-v1';
        this.options = options;
    }

    public setOptions(options: Partial<TestFakeProviderOptions>): void {
        this.options = { ...this.options, ...options };
    }

    public async generate(input: GenerateInvestigationModelInput): Promise<RawModelInvestigationOutput> {
        const start = Date.now();

        if (this.options.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
        }

        if (this.options.simulateTimeout) {
            throw AIInvestigatorError.modelTimeout('Simulated model provider timeout');
        }

        if (this.options.simulateRateLimit) {
            throw AIInvestigatorError.providerRateLimit('Simulated provider 429 Too Many Requests');
        }

        if (this.options.simulateAuthError) {
            throw AIInvestigatorError.providerAuthError('Simulated provider 401 Unauthorized API key');
        }

        if (this.options.simulateInvalidJson) {
            return {
                rawContent: 'This is not valid JSON content from the model',
                modelProvider: this.providerName,
                modelId: this.modelId,
                promptVersion: input.promptVersion,
                outputSchemaVersion: input.outputSchemaVersion,
                durationMs: Date.now() - start,
            };
        }

        if (this.options.customResponseGenerator) {
            return {
                rawContent: this.options.customResponseGenerator(input),
                modelProvider: this.providerName,
                modelId: this.modelId,
                promptVersion: input.promptVersion,
                outputSchemaVersion: input.outputSchemaVersion,
                durationMs: Date.now() - start,
            };
        }

        const bundle = input.evidenceBundle;
        const refs = bundle.availableEvidenceRefs;
        const citedRefs = [...refs];

        if (this.options.simulateHallucinatedRef) {
            citedRefs.push('ptxn:hallucinated-nonexistent-id');
        }

        // Formulate realistic grounded response
        let summary = `Investigation for exception ${bundle.exception.id} (${bundle.exception.type}).`;
        if (bundle.flags.isAmountDiscrepancy && bundle.providerTransaction && bundle.merchantOrder) {
            summary = `Amount discrepancy detected: provider transaction ${bundle.providerTransaction.providerTxnId} recorded ${bundle.providerTransaction.amountMinor} ${bundle.providerTransaction.currency}, but merchant order ${bundle.merchantOrder.externalOrderId} expected ${bundle.merchantOrder.amountMinor} ${bundle.merchantOrder.currency}.`;
        } else if (bundle.flags.isMissingCounterpart) {
            summary = `Missing counterpart detected for exception type ${bundle.exception.type}. Provider transaction or merchant order record is missing in reconciliation window.`;
        }

        const defaultPayload = {
            summary,
            facts: refs.map((ref) => ({
                statement: `Persisted record ${ref} was verified in the merchant ledger.`,
                evidenceRefs: [ref],
            })),
            likelyCauses: [
                {
                    hypothesis: 'Discrepancy arises from asynchronous settlement or currency/fee timing difference.',
                    rationale: 'Provider timestamp and merchant order timestamp differ within the reconciliation window.',
                    confidence: 'medium',
                    evidenceRefs: [refs[0] ?? 'exc:unknown'],
                },
            ],
            recommendedNextSteps: [
                {
                    action: 'Verify gateway settlement report',
                    description: 'Review the payment gateway portal to confirm final captured gross amounts and fees.',
                    nonDestructive: true,
                },
                {
                    action: 'Contact customer support or merchant operator',
                    description: 'Confirm if partial fulfillment or order amendment occurred prior to capture.',
                    nonDestructive: true,
                },
            ],
            missingOrConflictingEvidence: bundle.flags.hasProviderTransaction && !bundle.flags.hasMerchantOrder
                ? ['Merchant order record not present in database']
                : [],
            limitations: [
                'Analysis is based strictly on currently persisted snapshot evidence; subsequent gateway syncs may alter state.',
            ],
            evidenceRefs: citedRefs,
            status: 'SUCCESS',
        };

        return {
            rawContent: JSON.stringify(defaultPayload),
            modelProvider: this.providerName,
            modelId: this.modelId,
            promptVersion: input.promptVersion,
            outputSchemaVersion: input.outputSchemaVersion,
            durationMs: Date.now() - start,
        };
    }
}
