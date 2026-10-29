-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('SUCCESS', 'INSUFFICIENT_EVIDENCE', 'FAILED');

-- CreateTable
CREATE TABLE "exception_investigations" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "exception_id" UUID NOT NULL,
    "actor_id" VARCHAR(128),
    "reconciliation_run_id" UUID,
    "idempotency_key" VARCHAR(128),
    "status" "InvestigationStatus" NOT NULL DEFAULT 'SUCCESS',
    "summary" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "likely_causes" JSONB NOT NULL,
    "recommended_next_steps" JSONB NOT NULL,
    "missing_or_conflicting_evidence" JSONB,
    "limitations" JSONB,
    "evidence_refs" JSONB NOT NULL,
    "model_provider" VARCHAR(64) NOT NULL,
    "model_id" VARCHAR(64) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "output_schema_version" VARCHAR(32) NOT NULL,
    "duration_ms" INTEGER,
    "error_category" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exception_investigations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exception_investigations_exception_id_created_at_idx" ON "exception_investigations"("exception_id", "created_at");

-- CreateIndex
CREATE INDEX "exception_investigations_merchant_id_created_at_idx" ON "exception_investigations"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "exception_investigations_merchant_id_idempotency_key_key" ON "exception_investigations"("merchant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "exception_investigations" ADD CONSTRAINT "exception_investigations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_investigations" ADD CONSTRAINT "exception_investigations_exception_id_fkey" FOREIGN KEY ("exception_id") REFERENCES "reconciliation_exceptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_investigations" ADD CONSTRAINT "exception_investigations_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
