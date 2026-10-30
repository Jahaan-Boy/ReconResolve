import { GoogleGenAI } from '@google/genai';
import { AIInvestigatorError } from '../errors';
import type {
    GenerateInvestigationModelInput,
    InvestigationModelProvider,
    RawModelInvestigationOutput,
} from './model-provider.interface';

export interface GeminiClientLike {
    models: {
        generateContent(params: {
            model: string;
            contents: string;
            config?: {
                systemInstruction?: string;
                responseMimeType?: string;
                abortSignal?: AbortSignal;
                [key: string]: any;
            };
        }): Promise<{
            text?: string;
            candidates?: Array<{
                content?: {
                    parts?: Array<{ text?: string }>;
                };
            }>;
            [key: string]: any;
        }>;
    };
}

export interface GeminiProviderOptions {
    apiKey?: string;
    modelId?: string;
    client?: GeminiClientLike;
}

/**
 * Concrete production adapter for Google Gemini model provider.
 * Uses official @google/genai SDK.
 * Bounded request timeout, structured JSON response mode, and safe error normalization.
 */
export class GeminiInvestigationModelProvider implements InvestigationModelProvider {
    public readonly providerName = 'google-gemini';
    public readonly modelId: string;
    private readonly client: GeminiClientLike;

    constructor(options: GeminiProviderOptions = {}) {
        this.modelId = options.modelId?.trim() || process.env.GEMINI_MODEL_ID?.trim() || 'gemini-2.5-flash';

        if (options.client) {
            this.client = options.client;
        } else {
            const apiKey = options.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
            if (!apiKey) {
                throw AIInvestigatorError.providerUnavailable(
                    'GEMINI_API_KEY is not configured for GeminiInvestigationModelProvider',
                );
            }
            this.client = new GoogleGenAI({ apiKey });
        }
    }

    public async generate(input: GenerateInvestigationModelInput): Promise<RawModelInvestigationOutput> {
        const startTime = Date.now();
        const timeoutMs = input.timeoutMs ?? 15_000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort(new Error(`Model request timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        try {
            const response = await this.client.models.generateContent({
                model: this.modelId,
                contents: input.userPrompt,
                config: {
                    systemInstruction: input.systemPrompt,
                    responseMimeType: 'application/json',
                    abortSignal: controller.signal,
                },
            });

            const durationMs = Date.now() - startTime;
            const textContent =
                response.text ??
                response.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ??
                '';

            if (!textContent || textContent.trim().length === 0) {
                throw AIInvestigatorError.invalidModelOutput('Gemini returned empty response content');
            }

            return {
                rawContent: textContent,
                modelProvider: this.providerName,
                modelId: this.modelId,
                promptVersion: input.promptVersion,
                outputSchemaVersion: input.outputSchemaVersion,
                durationMs,
            };
        } catch (error: unknown) {
            this.handleError(error, controller.signal.aborted);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private handleError(error: unknown, wasAborted: boolean): never {
        if (error instanceof AIInvestigatorError) {
            throw error;
        }

        if (wasAborted) {
            throw AIInvestigatorError.modelTimeout('Gemini request timed out');
        }

        const err = error as Record<string, any> | undefined;
        const message = typeof err?.message === 'string' ? err.message : '';
        const status = Number(err?.status || err?.statusCode || err?.code || 0);

        // Sanitize error string: never leak API keys, auth headers, or raw URLs with keys
        const safeMessage = this.sanitizeMessage(message);

        // 1. Timeout / Abort detection
        if (
            err?.name === 'AbortError' ||
            message.toLowerCase().includes('aborted') ||
            message.toLowerCase().includes('timed out') ||
            message.toLowerCase().includes('deadline exceeded') ||
            status === 504
        ) {
            throw AIInvestigatorError.modelTimeout('Gemini request timed out: ' + safeMessage);
        }

        // 2. Authentication & Permission errors
        if (
            status === 401 ||
            status === 403 ||
            message.toLowerCase().includes('api_key_invalid') ||
            message.toLowerCase().includes('api key not valid') ||
            message.toLowerCase().includes('unauthenticated') ||
            message.toLowerCase().includes('permission_denied') ||
            message.toLowerCase().includes('unauthorized')
        ) {
            throw AIInvestigatorError.providerAuthError('Gemini authentication failure: ' + safeMessage);
        }

        // 3. Rate limiting / Quota errors
        if (
            status === 429 ||
            message.toLowerCase().includes('resource_exhausted') ||
            message.toLowerCase().includes('quota') ||
            message.toLowerCase().includes('rate limit')
        ) {
            throw AIInvestigatorError.providerRateLimit('Gemini rate limit exceeded: ' + safeMessage);
        }

        // 4. Provider Unavailable / Network errors
        if (
            status === 503 ||
            status === 502 ||
            message.toLowerCase().includes('unavailable') ||
            message.toLowerCase().includes('econnreset') ||
            message.toLowerCase().includes('fetch failed') ||
            message.toLowerCase().includes('enotfound')
        ) {
            throw AIInvestigatorError.providerUnavailable('Gemini provider unavailable: ' + safeMessage);
        }

        // 5. Default safe fallback
        throw AIInvestigatorError.providerUnavailable('Gemini model request failed: ' + safeMessage);
    }

    private sanitizeMessage(message: string): string {
        if (!message) return 'Unknown provider error';
        // Redact any patterns resembling API keys, auth tokens, or query params
        return message
            .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_API_KEY]')
            .replace(/key=[A-Za-z0-9_-]+/gi, 'key=[REDACTED]')
            .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
            .replace(/(?:api[_-]?key|secret|token)\s*[:=]\s*['"]?[A-Za-z0-9._-]+['"]?/gi, '$1=[REDACTED]')
            .slice(0, 300); // Truncate long internal messages
    }
}
