import { PayPalTokenResponseSchema } from './schemas';
import type { PayPalTokenResponse } from './schemas';
import { PayPalError } from './errors';

export interface HttpRequestFn {
    (url: string, options: HttpRequestOptions): Promise<HttpResponse>;
}

export interface HttpRequestOptions {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}

export interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    json(): Promise<unknown>;
}

const SANDBOX_TOKEN_URL = 'https://api-m.sandbox.paypal.com/v1/oauth2/token';

const EXPIRY_SAFETY_MARGIN_SECONDS = 60;

const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

interface CachedToken {
    accessToken: string;
    expiresAtMs: number;
}

export interface TokenManagerConfig {
    clientId: string;
    clientSecret: string;
    httpRequest: HttpRequestFn;
}

export class PayPalTokenManager {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly httpRequest: HttpRequestFn;

    private cached: CachedToken | null = null;
    private inflight: Promise<string> | null = null;

    constructor(config: TokenManagerConfig) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.httpRequest = config.httpRequest;
    }

    /**
     * Validate that credentials are present. Call before any network access.
     * @throws PayPalError with code PAYPAL_CONFIG_MISSING
     */
    assertCredentials(): void {
        if (!this.clientId || !this.clientSecret) {
            throw PayPalError.configMissing(
                'PayPal client ID and secret must be provided',
            );
        }
    }

    async getToken(): Promise<string> {
        this.assertCredentials();

        if (this.cached && Date.now() < this.cached.expiresAtMs) {
            return this.cached.accessToken;
        }

        if (this.inflight) {
            return this.inflight;
        }

        this.inflight = this.refreshToken();
        try {
            return await this.inflight;
        } finally {
            this.inflight = null;
        }
    }


    async forceRefresh(): Promise<string> {
        this.cached = null;

        if (this.inflight) {
            return this.inflight;
        }

        this.inflight = this.refreshToken();
        try {
            return await this.inflight;
        } finally {
            this.inflight = null;
        }
    }

    clearCache(): void {
        this.cached = null;
        this.inflight = null;
    }


    private async refreshToken(): Promise<string> {
        const basicAuth = Buffer.from(
            `${this.clientId}:${this.clientSecret}`,
        ).toString('base64');

        const controller = new AbortController();
        const timeout = setTimeout(
            () => controller.abort(),
            TOKEN_REQUEST_TIMEOUT_MS,
        );

        let response: HttpResponse;
        try {
            response = await this.httpRequest(SANDBOX_TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${basicAuth}`,
                    Accept: 'application/json',
                },
                body: 'grant_type=client_credentials',
                signal: controller.signal,
            });
        } catch (err) {
            clearTimeout(timeout);

            if (err instanceof Error && err.name === 'AbortError') {
                throw PayPalError.timeout('OAuth token request timed out');
            }
            throw PayPalError.unavailable(
                `OAuth token request failed: ${err instanceof Error ? err.message : 'network error'}`,
            );
        } finally {
            clearTimeout(timeout);
        }

        if (response.status === 401) {
            throw PayPalError.authFailed(
                'Invalid client credentials (401 on token endpoint)',
            );
        }
        if (response.status === 403) {
            throw PayPalError.forbidden(
                'Insufficient permissions / scope not granted (403)',
            );
        }
        if (response.status === 429) {
            throw PayPalError.rateLimited('Rate limited on token endpoint');
        }
        if (response.status >= 500) {
            throw PayPalError.unavailable(
                `Token endpoint returned ${response.status}`,
            );
        }
        if (response.status !== 200) {
            throw PayPalError.authFailed(
                `Unexpected token endpoint status: ${response.status}`,
            );
        }

        let rawBody: unknown;
        try {
            rawBody = await response.json();
        } catch {
            throw PayPalError.responseInvalid(
                'Token endpoint returned non-JSON body',
            );
        }

        const parsed = PayPalTokenResponseSchema.safeParse(rawBody);
        if (!parsed.success) {
            throw PayPalError.responseInvalid(
                `Token response validation failed: ${parsed.error.message}`,
            );
        }

        const tokenData: PayPalTokenResponse = parsed.data;

        this.cached = {
            accessToken: tokenData.access_token,
            expiresAtMs:
                Date.now() +
                (tokenData.expires_in - EXPIRY_SAFETY_MARGIN_SECONDS) * 1000,
        };

        return tokenData.access_token;
    }
}