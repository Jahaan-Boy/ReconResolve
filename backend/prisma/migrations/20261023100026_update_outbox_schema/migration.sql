-- AlterEnum
ALTER TYPE "OutboxStatus" ADD VALUE 'PROCESSING';

-- DropIndex
DROP INDEX "outbox_events_status_available_at_idx";

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "claim_token" VARCHAR(128),
ADD COLUMN     "last_error" VARCHAR(1000),
ADD COLUMN     "locked_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_locked_at_idx" ON "outbox_events"("status", "available_at", "locked_at");
