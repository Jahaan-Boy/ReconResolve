import { ApiClientError } from './types';
import type {
    OperationsApiClient,
    OperationsSummary,
    OperationsTimelineResponse,
    OperationsTimelineStage,
} from './types';

export type { OperationsTimelineResponse, OperationsTimelineStage };

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
    ): Promise<{ outcome: string; eventId: string; status: string; message?: string }> {
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

    async getEventTimeline(
        merchantId: string,
        identifier: string,
        signal?: AbortSignal,
    ): Promise<OperationsTimelineResponse> {
        const response = await fetch(
            `${this.baseUrl}/api/merchants/${merchantId}/operations/timeline/${encodeURIComponent(identifier)}`,
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
                typeof errorBody['message'] === 'string' ? errorBody['message'] : 'Failed to fetch operations timeline',
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
    ): Promise<{ outcome: string; eventId: string; status: string; message?: string }> {
        return {
            outcome: 'replayed',
            eventId,
            status: 'PENDING',
            message: 'Outbox event successfully queued for processing',
        };
    }

    async getEventTimeline(
        merchantId: string,
        identifier: string,
    ): Promise<OperationsTimelineResponse> {
        const now = new Date().toISOString();
        return {
            merchantId,
            identifier,
            pipelineOutcome: 'SUCCESS',
            summary: 'Operations timeline evaluated: 6/6 stages completed (SUCCESS).',
            stages: [
                { stage: 'WEBHOOK_RECEIVED', label: 'Webhook Received', status: 'COMPLETED', timestamp: now, evidenceId: 'wh-mock-01', summary: 'PayPal webhook received' },
                { stage: 'SIGNATURE_VERIFIED', label: 'Signature Verified', status: 'COMPLETED', timestamp: now, evidenceId: 'sig-mock-01', summary: 'Cryptographic signature verified' },
                { stage: 'INBOX_STORED', label: 'Inbox Stored', status: 'COMPLETED', timestamp: now, evidenceId: 'inbox-mock-01', summary: 'Payload persisted in database' },
                { stage: 'OUTBOX_ENQUEUED', label: 'Outbox Enqueued', status: 'COMPLETED', timestamp: now, evidenceId: 'outbox-mock-01', summary: 'Transactional outbox event created' },
                { stage: 'WORKER_PROCESSED', label: 'Worker Processed', status: 'COMPLETED', timestamp: now, evidenceId: 'worker-mock-01', summary: 'Worker dispatched event (attempt 1/5)' },
                { stage: 'LEDGER_RECORDED', label: 'Ledger Recorded', status: 'COMPLETED', timestamp: now, evidenceId: 'ledger-mock-01', summary: 'Transaction recorded in ledger' },
            ],
        };
    }
}

export const operationsApiClient = new HttpOperationsApiClient();
