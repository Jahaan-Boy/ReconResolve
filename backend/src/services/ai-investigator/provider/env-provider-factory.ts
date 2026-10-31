import { AIInvestigatorError } from '../errors';
import { GeminiInvestigationModelProvider } from './gemini-provider';
import type { InvestigationModelProvider } from './model-provider.interface';
import { TestFakeInvestigationModelProvider } from './test-fake-provider';

export interface ProviderResolutionResult {
    provider: InvestigationModelProvider;
    isLive: boolean;
    providerName: string;
    modelId: string;
}

export interface ResolveProviderOptions {
    allowTestFakeInNonTest?: boolean;
    customProvider?: InvestigationModelProvider;
    forceLive?: boolean;
}

/**
 * Resolves the appropriate model provider based on runtime environment and credentials.
 * Explicitly wires live vendor providers (Google Gemini) when configured.
 * Strictly prevents silent fallback to fakes in production.
 */
export function resolveModelProvider(options?: ResolveProviderOptions): ProviderResolutionResult {
    if (options?.customProvider) {
        return {
            provider: options.customProvider,
            isLive: false,
            providerName: options.customProvider.providerName,
            modelId: options.customProvider.modelId,
        };
    }

    const nodeEnv = process.env.NODE_ENV || 'development';
    const isTestEnv = nodeEnv === 'test';
    const isProdEnv = nodeEnv === 'production';

    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

    // In automated test runs, retain deterministic fake provider unless explicitly forced
    if (isTestEnv && !options?.forceLive && process.env.LIVE_AI_TEST !== 'true') {
        const fake = new TestFakeInvestigationModelProvider();
        return {
            provider: fake,
            isLive: false,
            providerName: fake.providerName,
            modelId: fake.modelId,
        };
    }

    // 1. Live Google Gemini provider
    if (geminiKey && geminiKey.length > 0) {
        const geminiProvider = new GeminiInvestigationModelProvider({
            apiKey: geminiKey,
            modelId: process.env.GEMINI_MODEL_ID?.trim() || undefined,
        });

        return {
            provider: geminiProvider,
            isLive: true,
            providerName: geminiProvider.providerName,
            modelId: geminiProvider.modelId,
        };
    }

    // 2. Unsupported vendors in this milestone
    if (openaiKey && openaiKey.length > 0) {
        throw AIInvestigatorError.providerUnavailable(
            'OpenAI provider adapter is not configured in this release; please configure GEMINI_API_KEY for Google Gemini.',
        );
    }

    if (anthropicKey && anthropicKey.length > 0) {
        throw AIInvestigatorError.providerUnavailable(
            'Anthropic provider adapter is not configured in this release; please configure GEMINI_API_KEY for Google Gemini.',
        );
    }

    // 3. Production must FAIL CLOSED with typed provider-unavailable error
    if (isProdEnv && !options?.allowTestFakeInNonTest) {
        throw AIInvestigatorError.providerUnavailable(
            'No AI model provider is configured (missing GEMINI_API_KEY). Production cannot run without a live AI provider.',
        );
    }

    // 4. Development mode: allow explicit fake if opted in
    if (options?.allowTestFakeInNonTest) {
        const fake = new TestFakeInvestigationModelProvider();
        return {
            provider: fake,
            isLive: false,
            providerName: fake.providerName,
            modelId: fake.modelId,
        };
    }

    // 5. Development mode without credentials and without explicit fake
    throw AIInvestigatorError.providerUnavailable(
        'No AI model provider is configured (missing GEMINI_API_KEY). Live model invocation remains blocked.',
    );
}
