import { ApiClientError } from './types';
import type { OperationsApiClient, OperationsSummary } from './types';

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
}

export const operationsApiClient = new HttpOperationsApiClient();
