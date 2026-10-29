import { AIInvestigatorError } from '../errors';
import type { InvestigationModelProvider } from './model-provider.interface';
import { TestFakeInvestigationModelProvider } from './test-fake-provider';

export interface ProviderResolutionResult {
    provider: InvestigationModelProvider;
    isLive: boolean;
    providerName: string;
    modelId: string;
}

/**
 * Resolves the appropriate model provider based on runtime environment.
 * Explicitly distinguishes live vendor providers from explicit test fakes.
 * Prevents silent fallback in production.
 */
export function resolveModelProvider(options?: {
    allowTestFakeInNonTest?: boolean;
    customProvider?: InvestigationModelProvider;
}): ProviderResolutionResult {
    if (options?.customProvider) {
        return {
            provider: options.customProvider,
            isLive: false,
            providerName: options.customProvider.providerName,
            modelId: options.customProvider.modelId,
        };
    }

    const nodeEnv = process.env.NODE_ENV || 'development';

    // Check for configured live LLM providers
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (geminiKey && geminiKey.trim().length > 0) {
        // If live Gemini is configured in future iteration, adapter will be instantiated here
    }

    if (openaiKey && openaiKey.trim().length > 0) {
        // If live OpenAI is configured in future iteration, adapter will be instantiated here
    }

    if (anthropicKey && anthropicKey.trim().length > 0) {
        // If live Anthropic is configured in future iteration, adapter will be instantiated here
    }

    // In test environment, or if explicit development fake flag is provided
    if (nodeEnv === 'test' || options?.allowTestFakeInNonTest) {
        const fake = new TestFakeInvestigationModelProvider();
        return {
            provider: fake,
            isLive: false,
            providerName: fake.providerName,
            modelId: fake.modelId,
        };
    }

    // In normal runtime when no live provider is configured, do NOT silently fake real AI:
    // Report clearly that live model configuration is missing.
    throw AIInvestigatorError.providerUnavailable(
        'No AI model provider is configured (missing GEMINI_API_KEY / OPENAI_API_KEY). Live model invocation remains blocked.',
    );
}
