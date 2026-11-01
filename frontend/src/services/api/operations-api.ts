import { ApiClientError } from './types';
import type { OperationsApiClient, OperationsSummary, WebhookEventRecord } from './types';

export class HttpOperationsApiClient implements OperationsApiClient {
    private readonly baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async getOperationsSummary(merchantId: string, signal?: AbortSignal): Promise<OperationsSummary> {
        const response = await fetch(`${this.baseUrl}/api/merchants/${merchantId}/operations/summary`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
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
    }

    async replayOutboxEvent(
        merchantId: string,
        eventId: string,
    ): Promise<{ outcome: 'replayed'; eventId: string; status: 'PENDING' }> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/operations/outbox/${eventId}/replay`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'OPERATIONS_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to replay outbox event',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }

    async getRecentWebhooks(
        merchantId: string,
        limit = 25,
        signal?: AbortSignal,
    ): Promise<{ items: WebhookEventRecord[] }> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/operations/webhooks?limit=${limit}`,
            {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal,
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
                typeof errorBody['error'] === 'string' ? errorBody['error'] : 'OPERATIONS_ERROR',
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch webhooks',
                response.status,
                errorBody['details'],
            );
        }

        return await response.json();
    }
}

export class MockOperationsApiClient implements OperationsApiClient {
    async getOperationsSummary(merchantId: string): Promise<OperationsSummary> {
        return {
            merchantId,
            generatedAt: new Date().toISOString(),
            pipelineHealth: 'HEALTHY',
            outbox: {
                pendingCount: 0,
                processingCount: 0,
                failedCount: 0,
                dispatchedCount: 142,
                oldestPendingAgeMs: 0,
                deadLetterCount: 0,
            },
            reconciliation: {
                latestRunStatus: 'COMPLETED',
                latestRunId: 'mock-run-001',
                failedRunsCount: 0,
                recentAmbiguousCount: 2,
            },
            investigations: {
                totalInvestigationsCount: 5,
                recentFailedCount: 0,
            },
            deadLetterQueue: [],
        };
    }

    async replayOutboxEvent(
        _merchantId: string,
        eventId: string,
    ): Promise<{ outcome: 'replayed'; eventId: string; status: 'PENDING' }> {
        return {
            outcome: 'replayed',
            eventId,
            status: 'PENDING',
        };
    }

    async getRecentWebhooks(): Promise<{ items: WebhookEventRecord[] }> {
        return {
            items: [
                {
                    id: 'mock-wh-1',
                    merchantId: 'mock-merchant-001',
                    provider: 'PAYPAL',
                    providerConnectionId: 'mock-conn-001',
                    providerEventId: 'WH-89X-001',
                    eventType: 'PAYMENT.CAPTURE.COMPLETED',
                    resourceType: 'capture',
                    transmissionId: 'trans-mock-001',
                    transmissionTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                    verifiedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                    receivedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
                    processingStatus: 'PROCESSED',
                },
                {
                    id: 'mock-wh-2',
                    merchantId: 'mock-merchant-001',
                    provider: 'PAYPAL',
                    providerConnectionId: 'mock-conn-001',
                    providerEventId: 'WH-89X-002',
                    eventType: 'CHECKOUT.ORDER.APPROVED',
                    resourceType: 'order',
                    transmissionId: 'trans-mock-002',
                    transmissionTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                    verifiedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                    receivedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
                    processingStatus: 'PROCESSED',
                },
            ],
        };
    }
}

export const operationsApiClient = new HttpOperationsApiClient();
