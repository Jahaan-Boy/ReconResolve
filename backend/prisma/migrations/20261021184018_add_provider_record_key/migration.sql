/*
  Warnings:

  - A unique constraint covering the columns `[provider_connection_id,provider_record_key]` on the table `provider_transactions` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `provider_record_key` to the `provider_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "provider_transactions_provider_connection_id_provider_txn_i_key";

-- AlterTable
ALTER TABLE "provider_transactions" ADD COLUMN     "provider_record_key" VARCHAR(128) NOT NULL;

-- CreateIndex
CREATE INDEX "provider_transactions_provider_connection_id_provider_txn_i_idx" ON "provider_transactions"("provider_connection_id", "provider_txn_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_transactions_provider_connection_id_provider_recor_key" ON "provider_transactions"("provider_connection_id", "provider_record_key");
