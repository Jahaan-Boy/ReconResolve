-- AlterTable
ALTER TABLE "reconciliation_exceptions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "exception_audit_events" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "exception_id" UUID NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "actor_type" VARCHAR(32) NOT NULL DEFAULT 'OPERATOR',
    "action" VARCHAR(32) NOT NULL,
    "from_status" "ExceptionStatus" NOT NULL,
    "to_status" "ExceptionStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exception_audit_events_exception_id_created_at_idx" ON "exception_audit_events"("exception_id", "created_at");

-- CreateIndex
CREATE INDEX "exception_audit_events_merchant_id_created_at_idx" ON "exception_audit_events"("merchant_id", "created_at");

-- AddForeignKey
ALTER TABLE "exception_audit_events" ADD CONSTRAINT "exception_audit_events_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_audit_events" ADD CONSTRAINT "exception_audit_events_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "reconciliation_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
