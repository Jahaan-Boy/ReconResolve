import { z } from 'zod';
import { AIInvestigatorError } from './errors';
import {
    InvestigationModelOutputSchema,
    type EvidenceBundle,
    type InvestigationResult,
    type RawInvestigationModelOutput,
} from './types';

export class InvestigationOutputValidator {
    /**
     * Parses raw model text, validates it against the Zod schema,
     * and rigorously asserts that all cited evidence reference IDs belong
     * to the supplied EvidenceBundle's availableEvidenceRefs.
     */
    public validate(
        rawContent: string,
        bundle: EvidenceBundle,
        metadata: {
            modelProvider: string;
            modelId: string;
            promptVersion: string;
            outputSchemaVersion: string;
        },
    ): InvestigationResult {
        // 1. Clean JSON fences if the LLM outputted them despite instructions
        let cleanText = rawContent.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        } else if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // 2. Safe JSON parse
        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(cleanText);
        } catch (err) {
            throw AIInvestigatorError.invalidModelOutput('Model output is not valid JSON', {
                rawSnippet: cleanText.slice(0, 200),
                parseError: err instanceof Error ? err.message : String(err),
            });
        }

        // 3. Schema validation via Zod
        let validatedOutput: RawInvestigationModelOutput;
        try {
            validatedOutput = InvestigationModelOutputSchema.parse(parsedJson);
        } catch (err) {
            if (err instanceof z.ZodError) {
                throw AIInvestigatorError.invalidModelOutput('Model output failed schema validation', {
                    issues: err.issues,
                });
            }
            throw AIInvestigatorError.invalidModelOutput('Model output schema validation error');
        }

        // 4. Citation Integrity Check: Every cited evidence reference MUST exist in bundle.availableEvidenceRefs
        const allowedRefSet = new Set(bundle.availableEvidenceRefs);

        // Check facts
        for (const fact of validatedOutput.facts) {
            for (const refId of fact.evidenceRefs) {
                if (!allowedRefSet.has(refId)) {
                    throw AIInvestigatorError.unknownEvidenceReference(refId);
                }
            }
        }

        // Check likely causes
        for (const cause of validatedOutput.likelyCauses) {
            for (const refId of cause.evidenceRefs) {
                if (!allowedRefSet.has(refId)) {
                    throw AIInvestigatorError.unknownEvidenceReference(refId);
                }
            }
        }

        // Check top-level evidenceRefs
        for (const refId of validatedOutput.evidenceRefs) {
            if (!allowedRefSet.has(refId)) {
                throw AIInvestigatorError.unknownEvidenceReference(refId);
            }
        }

        // 5. Construct validated domain result
        return {
            summary: validatedOutput.summary,
            facts: validatedOutput.facts,
            likelyCauses: validatedOutput.likelyCauses,
            recommendedNextSteps: validatedOutput.recommendedNextSteps,
            missingOrConflictingEvidence: validatedOutput.missingOrConflictingEvidence,
            limitations: validatedOutput.limitations,
            evidenceRefs: validatedOutput.evidenceRefs,
            generatedAt: new Date().toISOString(),
            modelProvider: metadata.modelProvider,
            modelId: metadata.modelId,
            promptVersion: metadata.promptVersion,
            outputSchemaVersion: metadata.outputSchemaVersion,
            status: validatedOutput.status,
        };
    }
}
