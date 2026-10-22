import type { Provider, ProviderConnectionStatus } from '../../generated/prisma';

export interface ResolvedWebhookConnection {
    id: string;
    merchantId: string;
    webhookId: string;
    status: ProviderConnectionStatus;
    provider: Provider;
}

export interface IngestWebhookInput {
    connection: ResolvedWebhookConnection;
    providerEventId: string;
    eventType: string;
    resourceType: string | null;
    transmissionId: string | null;
    transmissionTime: Date | null;
    payload: Record<string, unknown>;
}

export type IngestOutcome = 'accepted' | 'duplicate';

export interface IngestWebhookResult {
    outcome: IngestOutcome;
    webhookEventId: string;
    outboxEventId?: string;
}
