-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_mappings" DROP CONSTRAINT "accountant_v2_distributor_mappings_account_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_mappings" DROP CONSTRAINT "accountant_v2_distributor_mappings_company_id_distributor__fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_settings" DROP CONSTRAINT "accountant_v2_distributor_settings_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_settings" DROP CONSTRAINT "accountant_v2_distributor_settings_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_settings" DROP CONSTRAINT "accountant_v2_distributor_settings_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_sources" DROP CONSTRAINT "accountant_v2_distributor_sources_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_sources" DROP CONSTRAINT "accountant_v2_distributor_sources_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_distributor_sources" DROP CONSTRAINT "accountant_v2_distributor_sources_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_erp_settings" DROP CONSTRAINT "accountant_v2_erp_settings_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_erp_sources" DROP CONSTRAINT "accountant_v2_erp_sources_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_investor_events" DROP CONSTRAINT "accountant_v2_investor_events_company_id_investor_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_investor_terms" DROP CONSTRAINT "accountant_v2_investor_terms_company_id_investor_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_investors" DROP CONSTRAINT "accountant_v2_investors_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_manual_journal_lines" DROP CONSTRAINT "accountant_v2_manual_journal_lines_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_stock_control" DROP CONSTRAINT "accountant_v2_stock_control_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_user_settings" DROP CONSTRAINT "accountant_v2_user_settings_company_id_fkey";

-- DropForeignKey
ALTER TABLE "accountant_v2_user_sources" DROP CONSTRAINT "accountant_v2_user_sources_company_id_fkey";

-- DropIndex
DROP INDEX "edit_environment_provider_lifecycle_idx";

-- AlterTable
ALTER TABLE "accountant_v2_distributor_settings" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "client_id" TEXT,
ADD COLUMN     "distributor_id" TEXT;

-- CreateTable
CREATE TABLE "distributor_payment_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "distributor_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distributor_payment_allocations_company_id_purchase_order_i_idx" ON "distributor_payment_allocations"("company_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_payment_allocations_payment_id_purchase_order_i_key" ON "distributor_payment_allocations"("payment_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "expenses_company_id_distributor_id_idx" ON "expenses"("company_id", "distributor_id");

-- CreateIndex
CREATE INDEX "expenses_company_id_client_id_idx" ON "expenses"("company_id", "client_id");

-- AddForeignKey
ALTER TABLE "distributor_payment_allocations" ADD CONSTRAINT "distributor_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "distributor_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_payment_allocations" ADD CONSTRAINT "distributor_payment_allocations_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_distributor_id_company_id_fkey" FOREIGN KEY ("distributor_id", "company_id") REFERENCES "distributor_companies"("distributor_id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_client_id_fkey" FOREIGN KEY ("company_id", "client_id") REFERENCES "company_clients"("company_id", "client_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journal_lines" ADD CONSTRAINT "accountant_v2_manual_journal_lines_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_settings" ADD CONSTRAINT "accountant_v2_distributor_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_settings" ADD CONSTRAINT "accountant_v2_distributor_settings_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_settings" ADD CONSTRAINT "accountant_v2_distributor_settings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "accountant_v2_accountant_contact"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_mappings" ADD CONSTRAINT "accountant_v2_distributor_mappin_company_id_distributor_id_fkey" FOREIGN KEY ("company_id", "distributor_id") REFERENCES "accountant_v2_distributor_settings"("company_id", "distributor_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_mappings" ADD CONSTRAINT "accountant_v2_distributor_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accountant_v2_accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_sources" ADD CONSTRAINT "accountant_v2_distributor_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_sources" ADD CONSTRAINT "accountant_v2_distributor_sources_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_distributor_sources" ADD CONSTRAINT "accountant_v2_distributor_sources_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "accountant_v2_manual_journals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_investors" ADD CONSTRAINT "accountant_v2_investors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_investor_terms" ADD CONSTRAINT "accountant_v2_investor_terms_company_id_investor_id_fkey" FOREIGN KEY ("company_id", "investor_id") REFERENCES "accountant_v2_investors"("company_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_investor_events" ADD CONSTRAINT "accountant_v2_investor_events_company_id_investor_id_fkey" FOREIGN KEY ("company_id", "investor_id") REFERENCES "accountant_v2_investors"("company_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_erp_settings" ADD CONSTRAINT "accountant_v2_erp_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_erp_sources" ADD CONSTRAINT "accountant_v2_erp_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_stock_control" ADD CONSTRAINT "accountant_v2_stock_control_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_user_settings" ADD CONSTRAINT "accountant_v2_user_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "accountant_v2_user_sources" ADD CONSTRAINT "accountant_v2_user_sources_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "accountant_v2_investor_events_company_id_investor_id_event__idx" RENAME TO "accountant_v2_investor_events_company_id_investor_id_event_date";

