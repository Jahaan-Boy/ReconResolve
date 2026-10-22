import { PayPalTokenManager } from './token-manager';
import type { HttpRequestFn } from './token-manager';
import { PayPalError } from './errors';

const SANDBOX_VERIFY_URL =
    'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface WebhookVerificationInput {
    authAlgo: string;
    certUrl: string;
    transmissionId: string;
    transmissionSig: string;
    transmissionTime: string;
    webhookId: string;
    webhookEvent: Record<string, unknown>;
}

export interface WebhookVerificationResult {
    verified: boolean;
    verificationStatus: 'SUCCESS' | 'FAILURE' | string;
}

export interface WebhookVerifier {
    verify(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
}

export class WebhookVerifierUnavailableError extends Error {
    readonly isRetryable = true;

    constructor(message: string, readonly originalError?: unknown) {
        super(message);
        this.name = 'WebhookVerifierUnavailableError';
    }
}

export interface PayPalWebhookVerifierConfig {
    tokenManager: PayPalTokenManager;
    httpRequest?: HttpRequestFn;
    timeoutMs?: number;
    verifyUrl?: string;
}

function defaultHttpRequest(): HttpRequestFn {
    return async (url, options) => {
        const resp = await fetch(url, {
            method: options.method,
            headers: options.headers,
            body: options.body,
            signal: options.signal,
        });

        const headers: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        return {
            status: resp.status,
            headers,
            json: () => resp.json() as Promise<unknown>,
        };
    };
}

export class PayPalWebhookVerifier implements WebhookVerifier {
    private readonly tokenManager: PayPalTokenManager;
    private readonly httpRequest: HttpRequestFn;
    private readonly timeoutMs: number;
    private readonly verifyUrl: string;

    constructor(config: PayPalWebhookVerifierConfig) {
        this.tokenManager = config.tokenManager;
        this.httpRequest = config.httpRequest ?? defaultHttpRequest();
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.verifyUrl = config.verifyUrl ?? SANDBOX_VERIFY_URL;
    }

    async verify(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
        let token: string;
        try {
            token = await this.tokenManager.getToken();
        } catch (error) {
            // If OAuth fails due to network/timeout or 5xx, report verifier unavailable
            if (
                error instanceof PayPalError &&
                (error.code === 'PAYPAL_RATE_LIMITED' ||
                    error.code === 'PAYPAL_TIMEOUT' ||
                    error.code === 'PAYPAL_UNAVAILABLE')
            ) {
                throw new WebhookVerifierUnavailableError(
                    'Failed to obtain PayPal OAuth token for webhook verification',
                    error,
                );
            }
            throw error;
        }

        const requestBody = JSON.stringify({
            auth_algo: input.authAlgo,
            cert_url: input.certUrl,
            transmission_id: input.transmissionId,
            transmission_sig: input.transmissionSig,
            transmission_time: input.transmissionTime,
            webhook_id: input.webhookId,
            webhook_event: input.webhookEvent,
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await this.httpRequest(this.verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: requestBody,
                signal: controller.signal,
            });

            // Handle rate limiting and server errors as retryable verifier outages
            if (response.status === 429 || response.status >= 500) {
                throw new WebhookVerifierUnavailableError(
                    `PayPal verification service returned HTTP ${response.status}`,
                );
            }

            // 400 or other 4xx means verification request was rejected / invalid signature
            if (response.status !== 200) {
                return {
                    verified: false,
                    verificationStatus: 'FAILURE',
                };
            }

            const data = (await response.json()) as { verification_status?: unknown };
            const status =
                typeof data === 'object' && data !== null && typeof data.verification_status === 'string'
                    ? data.verification_status.toUpperCase()
                    : 'FAILURE';

            return {
                verified: status === 'SUCCESS',
                verificationStatus: status,
            };
        } catch (error) {
            if (error instanceof WebhookVerifierUnavailableError) {
                throw error;
            }
            // AbortController timeout or network error
            const isAbort =
                error instanceof Error &&
                (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
            throw new WebhookVerifierUnavailableError(
                isAbort
                    ? 'PayPal signature verification request timed out'
                    : 'Network error calling PayPal signature verification endpoint',
                error,
            );
        } finally {
            clearTimeout(timeout);
        }
    }
}
