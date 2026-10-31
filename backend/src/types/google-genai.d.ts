declare module '@google/genai' {
    export class GoogleGenAI {
        constructor(options: { apiKey?: string; [key: string]: any });
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
}

