-- AlterTable
ALTER TABLE "reconciliation_runs" ADD COLUMN     "ambiguous_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "excluded_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failure_reason" VARCHAR(1000),
ADD COLUMN     "idempotency_key" VARCHAR(128),
ADD COLUMN     "matched_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ruleset_version" VARCHAR(32) NOT NULL DEFAULT 'v1',
ADD COLUMN     "total_considered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unmatched_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reconciliation_matches" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reconciliation_run_id" UUID NOT NULL,
    "provider_transaction_id" UUID NOT NULL,
    "merchant_order_id" UUID NOT NULL,
    "rule_code" VARCHAR(64) NOT NULL,
    "ruleset_version" VARCHAR(32) NOT NULL DEFAULT 'v1',
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_matches_merchant_id_created_at_idx" ON "reconciliation_matches"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "reconciliation_matches_merchant_order_id_idx" ON "reconciliation_matches"("merchant_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_matches_reconciliation_run_id_provider_trans_key" ON "reconciliation_matches"("reconciliation_run_id", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_exceptions_reconciliation_run_id_provider_tra_key" ON "reconciliation_exceptions"("reconciliation_run_id", "provider_transaction_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_runs_merchant_id_idempotency_key_key" ON "reconciliation_runs"("merchant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_provider_transaction_id_fkey" FOREIGN KEY ("provider_transaction_id") REFERENCES "provider_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_merchant_order_id_fkey" FOREIGN KEY ("merchant_order_id") REFERENCES "merchant_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
