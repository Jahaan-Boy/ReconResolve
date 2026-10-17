-- =============================================================================
-- Migration: add_check_constraints
-- Purpose: Add database CHECK constraints that cannot be expressed in
--          Prisma schema DSL. These enforce domain invariants at the DB layer.
-- =============================================================================

-- Non-negative monetary amounts on provider_transactions
ALTER TABLE "provider_transactions"
  ADD CONSTRAINT "chk_provider_transactions_amount_non_negative"
    CHECK ("amount_minor" >= 0);

ALTER TABLE "provider_transactions"
  ADD CONSTRAINT "chk_provider_transactions_fee_non_negative"
    CHECK ("fee_minor" IS NULL OR "fee_minor" >= 0);

-- Non-negative monetary amount on merchant_orders
ALTER TABLE "merchant_orders"
  ADD CONSTRAINT "chk_merchant_orders_amount_non_negative"
    CHECK ("amount_minor" >= 0);

-- Reconciliation window must be a valid range (end > start)
ALTER TABLE "reconciliation_runs"
  ADD CONSTRAINT "chk_reconciliation_runs_window"
    CHECK ("window_end" > "window_start");

-- Every reconciliation exception must reference at least one source record
-- (providerTransactionId or merchantOrderId — or both)
ALTER TABLE "reconciliation_exceptions"
  ADD CONSTRAINT "chk_reconciliation_exceptions_has_source"
    CHECK (
      "provider_transaction_id" IS NOT NULL
      OR "merchant_order_id" IS NOT NULL
    );