-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('PAYPAL');

-- CreateEnum
CREATE TYPE "ProviderConnectionStatus" AS ENUM ('ACTIVE', 'DISABLED', 'NEEDS_REAUTH');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CREATED', 'APPROVED', 'PENDING', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ProviderTransactionType" AS ENUM ('PAYMENT', 'CAPTURE', 'REFUND', 'REVERSAL', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MerchantOrderStatus" AS ENUM ('OPEN', 'PAYMENT_PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('MISSING_PROVIDER_COUNTERPART', 'MISSING_MERCHANT_COUNTERPART', 'AMOUNT_MISMATCH', 'STATUS_DISCREPANCY', 'AMBIGUOUS_MATCH');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_connections" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "connection_key" TEXT NOT NULL,
    "provider_account_id" TEXT,
    "status" "ProviderConnectionStatus" NOT NULL DEFAULT 'DISABLED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_transactions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "provider_connection_id" UUID NOT NULL,
    "provider_txn_id" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "type" "ProviderTransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fee_minor" BIGINT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_orders" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "external_order_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "MerchantOrderStatus" NOT NULL,
    "ordered_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'PENDING',
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exceptions" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "reconciliation_run_id" UUID,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "provider_transaction_id" UUID,
    "merchant_order_id" UUID,
    "details" JSONB,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

-- CreateIndex
CREATE INDEX "provider_connections_merchant_id_provider_idx" ON "provider_connections"("merchant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_merchant_id_provider_connection_key_key" ON "provider_connections"("merchant_id", "provider", "connection_key");

-- CreateIndex
CREATE INDEX "provider_transactions_merchant_id_occurred_at_idx" ON "provider_transactions"("merchant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "provider_transactions_merchant_id_provider_order_id_idx" ON "provider_transactions"("merchant_id", "provider_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_transactions_provider_connection_id_provider_txn_i_key" ON "provider_transactions"("provider_connection_id", "provider_txn_id");

-- CreateIndex
CREATE INDEX "merchant_orders_merchant_id_ordered_at_idx" ON "merchant_orders"("merchant_id", "ordered_at");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_orders_merchant_id_external_order_id_key" ON "merchant_orders"("merchant_id", "external_order_id");

-- CreateIndex
CREATE INDEX "reconciliation_runs_merchant_id_created_at_idx" ON "reconciliation_runs"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "reconciliation_runs_merchant_id_status_idx" ON "reconciliation_runs"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_merchant_id_status_created_at_idx" ON "reconciliation_exceptions"("merchant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_merchant_id_reconciliation_run_id_idx" ON "reconciliation_exceptions"("merchant_id", "reconciliation_run_id");

-- AddForeignKey
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_transactions" ADD CONSTRAINT "provider_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_transactions" ADD CONSTRAINT "provider_transactions_provider_connection_id_fkey" FOREIGN KEY ("provider_connection_id") REFERENCES "provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_orders" ADD CONSTRAINT "merchant_orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_provider_transaction_id_fkey" FOREIGN KEY ("provider_transaction_id") REFERENCES "provider_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_merchant_order_id_fkey" FOREIGN KEY ("merchant_order_id") REFERENCES "merchant_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
