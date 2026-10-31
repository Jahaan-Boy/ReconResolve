import type { Prisma, PrismaClient } from '../../generated/prisma';
import type { IngestWebhookInput, IngestWebhookResult, ResolvedWebhookConnection } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebhookIngressDb {
    providerConnection: Pick<PrismaClient['providerConnection'], 'findUnique'>;
    webhookEvent: Pick<PrismaClient['webhookEvent'], 'findUnique' | 'create'>;
    outboxEvent: Pick<PrismaClient['outboxEvent'], 'create'>;
    $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

export function isValidUuid(id: string): boolean {
    return UUID_REGEX.test(id);
}

export async function resolveWebhookConnection(
    db: Pick<PrismaClient, 'providerConnection'>,
    providerConnectionId: string,
): Promise<ResolvedWebhookConnection | null> {
    if (!isValidUuid(providerConnectionId)) {
        return null;
    }

    const connection = await db.providerConnection.findUnique({
        where: { id: providerConnectionId },
        select: {
            id: true,
            merchantId: true,
            provider: true,
            status: true,
            webhookId: true,
        },
    });

    if (!connection) {
        return null;
    }

    if (
        connection.provider !== 'PAYPAL' ||
        connection.status !== 'ACTIVE' ||
        !connection.webhookId ||
        connection.webhookId.trim() === ''
    ) {
        return null;
    }

    return {
        id: connection.id,
        merchantId: connection.merchantId,
        webhookId: connection.webhookId.trim(),
        status: connection.status,
        provider: connection.provider,
    };
}

function isWebhookEventConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
    if (code !== 'P2002') return false;
    const target = meta?.target;
    if (!target) return true;
    const names = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
    return names.some((name) => {
        const cleaned = name.toLowerCase().replace(/_/g, '');
        return (
            cleaned.includes('providereventid') ||
            cleaned.includes('providerconnectionid') ||
            cleaned.includes('webhookevent')
        );
    });
}

export async function ingestWebhookEvent(
    db: WebhookIngressDb,
    input: IngestWebhookInput,
): Promise<IngestWebhookResult> {
    const { connection, providerEventId, eventType, resourceType, transmissionId, transmissionTime, payload } =
        input;

    // 1. First check if event is already persisted (outside or within transaction)
    const existing = await db.webhookEvent.findUnique({
        where: {
            providerConnectionId_providerEventId: {
                providerConnectionId: connection.id,
                providerEventId,
            },
        },
    });

    if (existing) {
        return {
            outcome: 'duplicate',
            webhookEventId: existing.id,
        };
    }

    // 2. Perform atomic insert of WebhookEvent + OutboxEvent in a single transaction
    try {
        return await db.$transaction(async (tx) => {
            // Re-check inside transaction to prevent race conditions
            const txExisting = await tx.webhookEvent.findUnique({
                where: {
                    providerConnectionId_providerEventId: {
                        providerConnectionId: connection.id,
                        providerEventId,
                    },
                },
            });

            if (txExisting) {
                return {
                    outcome: 'duplicate',
                    webhookEventId: txExisting.id,
                };
            }

            const webhookEvent = await tx.webhookEvent.create({
                data: {
                    merchantId: connection.merchantId,
                    providerConnectionId: connection.id,
                    provider: 'PAYPAL',
                    providerEventId,
                    eventType,
                    resourceType: resourceType ?? null,
                    transmissionId: transmissionId ?? null,
                    transmissionTime: transmissionTime ?? null,
                    processingStatus: 'RECEIVED',
                    payload: payload as Prisma.InputJsonValue,
                },
            });

            const outboxEvent = await tx.outboxEvent.create({
                data: {
                    merchantId: connection.merchantId,
                    aggregateType: 'WebhookEvent',
                    aggregateId: webhookEvent.id,
                    eventType: 'PAYPAL_WEBHOOK_RECEIVED',
                    payload: { webhookEventId: webhookEvent.id } as Prisma.InputJsonValue,
                    status: 'PENDING',
                },
            });

            return {
                outcome: 'accepted',
                webhookEventId: webhookEvent.id,
                outboxEventId: outboxEvent.id,
            };
        });
    } catch (error) {
        // 3. Handle concurrent duplicate race condition
        if (isWebhookEventConflict(error)) {
            const confirmedExisting = await db.webhookEvent.findUnique({
                where: {
                    providerConnectionId_providerEventId: {
                        providerConnectionId: connection.id,
                        providerEventId,
                    },
                },
            });

            if (confirmedExisting) {
                return {
                    outcome: 'duplicate',
                    webhookEventId: confirmedExisting.id,
                };
            }
        }

        // Re-throw database failure so caller can return retryable 503
        throw error;
    }
}
