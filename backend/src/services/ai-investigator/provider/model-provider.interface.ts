import type { EvidenceBundle } from '../types';

export interface GenerateInvestigationModelInput {
    evidenceBundle: EvidenceBundle;
    systemPrompt: string;
    userPrompt: string;
    promptVersion: string;
    outputSchemaVersion: string;
    timeoutMs?: number;
    correlationId?: string;
}

export interface RawModelInvestigationOutput {
    rawContent: string;
    modelProvider: string;
    modelId: string;
    promptVersion: string;
    outputSchemaVersion: string;
    durationMs: number;
}

export interface InvestigationModelProvider {
    readonly providerName: string;
    readonly modelId: string;
    generate(input: GenerateInvestigationModelInput): Promise<RawModelInvestigationOutput>;
}
