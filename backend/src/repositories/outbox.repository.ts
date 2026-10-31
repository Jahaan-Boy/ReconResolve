import { randomUUID } from 'node:crypto';
import type { ClaimedOutboxRecord, OutboxRepository } from '../services/outbox/types';

export interface OutboxDb {
    $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: any[]): Promise<T>;
    $executeRaw(query: TemplateStringsArray, ...values: any[]): Promise<number>;
}

interface RawOutboxRow {
    id: string;
    merchantId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
    status: string;
    attemptCount: number;
    claimToken: string;
    lockedAt: Date | string | null;
    availableAt: Date | string;
    dispatchedAt: Date | string | null;
    createdAt: Date | string;
}

function toDate(val: Date | string | null | undefined): Date | null {
    if (!val) return null;
    return val instanceof Date ? val : new Date(val);
}

function mapRow(row: RawOutboxRow): ClaimedOutboxRecord {
    return {
        id: row.id,
        merchantId: row.merchantId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        eventType: row.eventType,
        payload: row.payload,
        status: row.status as ClaimedOutboxRecord['status'],
        attemptCount: Number(row.attemptCount),
        claimToken: row.claimToken,
        lockedAt: toDate(row.lockedAt),
        availableAt: toDate(row.availableAt) ?? new Date(),
        dispatchedAt: toDate(row.dispatchedAt),
        createdAt: toDate(row.createdAt) ?? new Date(),
    };
}

export function createOutboxRepository(db: OutboxDb): OutboxRepository {
    return {
        async claimBatch(
            batchSize: number,
            leaseDurationMs: number,
            now: Date = new Date(),
            claimToken: string = randomUUID(),
        ): Promise<ClaimedOutboxRecord[]> {
            if (batchSize <= 0) {
                return [];
            }

            const expiredBefore = new Date(now.getTime() - leaseDurationMs);

            const rows = await db.$queryRaw<RawOutboxRow[]>`
                WITH eligible AS (
                    SELECT id FROM "outbox_events"
                    WHERE
                        ("status" = 'PENDING'::"OutboxStatus" AND "available_at" <= ${now})
                        OR
                        ("status" = 'PROCESSING'::"OutboxStatus" AND "locked_at" <= ${expiredBefore})
                    ORDER BY "created_at" ASC, "id" ASC
                    LIMIT ${batchSize}
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE "outbox_events"
                SET
                    "status" = 'PROCESSING'::"OutboxStatus",
                    "claim_token" = ${claimToken},
                    "locked_at" = ${now},
                    "attempt_count" = "attempt_count" + 1,
                    "updated_at" = ${now}
                FROM eligible
                WHERE "outbox_events"."id" = eligible.id
                RETURNING
                    "outbox_events"."id",
                    "outbox_events"."merchant_id" AS "merchantId",
                    "outbox_events"."aggregate_type" AS "aggregateType",
                    "outbox_events"."aggregate_id" AS "aggregateId",
                    "outbox_events"."event_type" AS "eventType",
                    "outbox_events"."payload",
                    "outbox_events"."status",
                    "outbox_events"."attempt_count" AS "attemptCount",
                    "outbox_events"."claim_token" AS "claimToken",
                    "outbox_events"."locked_at" AS "lockedAt",
                    "outbox_events"."available_at" AS "availableAt",
                    "outbox_events"."dispatched_at" AS "dispatchedAt",
                    "outbox_events"."created_at" AS "createdAt";
            `;

            if (!Array.isArray(rows)) {
                return [];
            }

            return rows.map(mapRow);
        },

        async markDispatched(id: string, claimToken: string, now: Date = new Date()): Promise<boolean> {
            const affected = await db.$executeRaw`
                UPDATE "outbox_events"
                SET
                    "status" = 'DISPATCHED'::"OutboxStatus",
                    "dispatched_at" = ${now},
                    "locked_at" = NULL,
                    "claim_token" = NULL,
                    "updated_at" = ${now}
                WHERE "id" = ${id}::uuid AND "claim_token" = ${claimToken};
            `;
            return affected > 0;
        },

        async scheduleRetry(
            id: string,
            claimToken: string,
            nextAvailableAt: Date,
            errorMessage: string,
            now: Date = new Date(),
        ): Promise<boolean> {
            const affected = await db.$executeRaw`
                UPDATE "outbox_events"
                SET
                    "status" = 'PENDING'::"OutboxStatus",
                    "available_at" = ${nextAvailableAt},
                    "last_error" = ${errorMessage},
                    "locked_at" = NULL,
                    "claim_token" = NULL,
                    "updated_at" = ${now}
                WHERE "id" = ${id}::uuid AND "claim_token" = ${claimToken};
            `;
            return affected > 0;
        },

        async markFailed(
            id: string,
            claimToken: string,
            errorMessage: string,
            now: Date = new Date(),
        ): Promise<boolean> {
            const affected = await db.$executeRaw`
                UPDATE "outbox_events"
                SET
                    "status" = 'FAILED'::"OutboxStatus",
                    "last_error" = ${errorMessage},
                    "locked_at" = NULL,
                    "claim_token" = NULL,
                    "updated_at" = ${now}
                WHERE "id" = ${id}::uuid AND "claim_token" = ${claimToken};
            `;
            return affected > 0;
        },

        async releaseClaim(
            id: string,
            claimToken: string,
            now: Date = new Date(),
        ): Promise<boolean> {
            const affected = await db.$executeRaw`
                UPDATE "outbox_events"
                SET
                    "status" = 'PENDING'::"OutboxStatus",
                    "locked_at" = NULL,
                    "claim_token" = NULL,
                    "attempt_count" = GREATEST("attempt_count" - 1, 0),
                    "updated_at" = ${now}
                WHERE "id" = ${id}::uuid AND "claim_token" = ${claimToken};
            `;
            return affected > 0;
        },
    };
}
