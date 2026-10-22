-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'FAILED');

-- AlterTable
ALTER TABLE "provider_connections" ADD COLUMN "webhook_id" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "provider_connection_id" UUID NOT NULL,
    "provider" "Provider" NOT NULL DEFAULT 'PAYPAL',
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "resource_type" TEXT,
    "transmission_id" TEXT,
    "transmission_time" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_connection_id_provider_event_id_key" ON "webhook_events"("provider_connection_id", "provider_event_id");

-- CreateIndex
CREATE INDEX "webhook_events_merchant_id_received_at_idx" ON "webhook_events"("merchant_id", "received_at");

-- CreateIndex
CREATE INDEX "webhook_events_processing_status_received_at_idx" ON "webhook_events"("processing_status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_merchant_id_aggregate_type_aggregate_id_event_key" ON "outbox_events"("merchant_id", "aggregate_type", "aggregate_id", "event_type");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_merchant_id_created_at_idx" ON "outbox_events"("merchant_id", "created_at");

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_provider_connection_id_fkey" FOREIGN KEY ("provider_connection_id") REFERENCES "provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
