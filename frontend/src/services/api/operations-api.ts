import { ApiClientError } from './types';
import type {
    EventTimelineResult,
    OperationsApiClient,
    OperationsSummary,
    ReplayOutboxEventResult,
    WebhookEventRecord,
} from './types';
import { queryCache } from './cache';

export class HttpOperationsApiClient implements OperationsApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async getOperationsSummary(merchantId: string, signal?: AbortSignal): Promise<OperationsSummary> {
        const cacheKey = `operations:summary:${merchantId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const response = await fetch(`${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/operations/summary`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    signal,
                });

                if (!response.ok) {
                    let errorBody: Record<string, unknown> = {};
                    try {
                        errorBody = (await response.json()) as Record<string, unknown>;
                    } catch {
                        // non-json
                    }
                    throw new ApiClientError(
                        typeof errorBody['error'] === 'string' ? errorBody['error'] : 'OPERATIONS_ERROR',
                        typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch operations summary',
                        response.status,
                        errorBody['details'],
                    );
                }

                return await response.json();
            },
            {
                ttl: 30_000,
                staleTtl: 120_000,
                tags: [`operations:${merchantId}`],
            },
        );
    }

    async replayOutboxEvent(
        merchantId: string,
        eventId: string,
    ): Promise<ReplayOutboxEventResult> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/operations/outbox/${encodeURIComponent(eventId)}/replay`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
            },
        );

        if (!response.ok) {
            let errorBody: Record<string, unknown> = {};
            try {
                errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
                // non-json
            }
            throw new ApiClientError(
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'REPLAY_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to replay outbox event',
                response.status,
                errorBody['details'],
            );
        }

        const result = await response.json();
        queryCache.invalidateTag(`operations:${merchantId}`);
        return result;
    }

    async getRecentWebhooks(
        merchantId: string,
        limit = 20,
    ): Promise<{ items: WebhookEventRecord[] }> {
        const cacheKey = `operations:webhooks:${merchantId}:${limit}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const response = await fetch(
                    `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/operations/webhooks?limit=${limit}`,
                    {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                    },
                );

                if (!response.ok) {
                    let errorBody: Record<string, unknown> = {};
                    try {
                        errorBody = (await response.json()) as Record<string, unknown>;
                    } catch {
                        // non-json
                    }
                    throw new ApiClientError(
                        typeof errorBody['error'] === 'string' ? errorBody['error'] : 'WEBHOOKS_ERROR',
                        typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch recent webhooks',
                        response.status,
                        errorBody['details'],
                    );
                }

                return await response.json();
            },
            {
                ttl: 30_000,
                staleTtl: 120_000,
                tags: [`operations:${merchantId}`],
            },
        );
    }

    async getEventTimeline(
        merchantId: string,
        eventId: string,
    ): Promise<EventTimelineResult> {
        const cacheKey = `operations:timeline:${merchantId}:${eventId}`;
        return queryCache.fetch(
            cacheKey,
            async () => {
                const response = await fetch(
                    `${this.baseUrl}/api/merchants/${encodeURIComponent(merchantId)}/operations/events/${encodeURIComponent(eventId)}/timeline`,
                    {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                    },
                );

                if (!response.ok) {
                    let errorBody: Record<string, unknown> = {};
                    try {
                        errorBody = (await response.json()) as Record<string, unknown>;
                    } catch {
                        // non-json
                    }
                    throw new ApiClientError(
                        typeof errorBody['error'] === 'string' ? errorBody['error'] : 'TIMELINE_ERROR',
                        typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch event timeline',
                        response.status,
                        errorBody['details'],
                    );
                }

                return await response.json();
            },
            {
                ttl: 60_000,
                staleTtl: 300_000,
                tags: [`operations:${merchantId}`],
            },
        );
    }
}

export const operationsApiClient: OperationsApiClient = new HttpOperationsApiClient();
