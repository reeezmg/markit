-- CreateEnum
CREATE TYPE "AccountantAccountingAccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "AccountantAccountingAccountType" AS ENUM ('OTHER_ASSET', 'OTHER_CURRENT_ASSET', 'CASH', 'BANK', 'FIXED_ASSET', 'ACCOUNTS_RECEIVABLE', 'STOCK', 'PAYMENT_CLEARING_ACCOUNT', 'INTANGIBLE_ASSET', 'NON_CURRENT_ASSET', 'DEFERRED_TAX_ASSET', 'OTHER_CURRENT_LIABILITY', 'CREDIT_CARD', 'NON_CURRENT_LIABILITY', 'OTHER_LIABILITY', 'ACCOUNTS_PAYABLE', 'OVERSEAS_TAX_PAYABLE', 'DEFERRED_TAX_LIABILITY', 'EQUITY', 'INCOME', 'OTHER_INCOME', 'EXPENSE', 'COST_OF_GOODS_SOLD', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "AccountantManualJournalStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AccountantManualJournalType" AS ENUM ('BOTH', 'CASH', 'ACCRUAL');

-- CreateEnum
CREATE TYPE "AccountantJournalEntrySide" AS ENUM ('DEBIT', 'CREDIT');


-- CreateTable
CREATE TABLE "accountant_v2_accounting_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "category" "AccountantAccountingAccountCategory" NOT NULL,
    "account_type" "AccountantAccountingAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "show_on_dashboard" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "bank_name" TEXT,
    "account_number" TEXT,
    "routing_number" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accounting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_manual_journals" (
    "created_by_id" TEXT,
    "approvals" JSONB NOT NULL DEFAULT '[]',
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entry_number" TEXT NOT NULL,
    "journal_date" TIMESTAMP(3) NOT NULL,
    "reference_number" TEXT,
    "notes" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "journal_type" "AccountantManualJournalType" NOT NULL DEFAULT 'BOTH',
    "status" "AccountantManualJournalStatus" NOT NULL DEFAULT 'DRAFT',
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reversal_date" TIMESTAMP(3),
    "reversed_from_id" TEXT,
    "published_at" TIMESTAMP(3),
    "is_system_generated" BOOLEAN NOT NULL DEFAULT false,
    "source_type" TEXT,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_manual_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_manual_journal_lines" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "side" "AccountantJournalEntrySide" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "party_id" TEXT,
    "project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_manual_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_journal_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference_number" TEXT,
    "notes" TEXT,
    "journal_type" TEXT NOT NULL DEFAULT 'BOTH',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "template_mode" TEXT NOT NULL DEFAULT 'AMOUNT',
    "lines" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_journal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_recurring_journal_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "repeat_every" INTEGER NOT NULL DEFAULT 1,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "next_run_date" TIMESTAMP(3) NOT NULL,
    "last_run_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "child_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference_number" TEXT,
    "notes" TEXT NOT NULL,
    "journal_type" TEXT NOT NULL DEFAULT 'BOTH',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "lines" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_recurring_journal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accounting_budgets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "period_type" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "allocations" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accounting_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_transaction_locks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "lock_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT true,
    "locked_by_id" TEXT NOT NULL,
    "unlocked_by_id" TEXT,
    "unlocked_at" TIMESTAMP(3),
    "unlock_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_transaction_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_account_opening_balances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "as_of_date" TIMESTAMP(3) NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "journal_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_account_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_fixed_asset_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_account_id" TEXT NOT NULL,
    "accumulated_dep_account_id" TEXT NOT NULL,
    "depreciation_expense_account_id" TEXT NOT NULL,
    "depreciation_method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "useful_life_months" INTEGER NOT NULL,
    "salvage_percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_fixed_asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_fixed_assets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "asset_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "available_for_use_date" TIMESTAMP(3) NOT NULL,
    "purchase_cost" DECIMAL(18,2) NOT NULL,
    "salvage_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "useful_life_months" INTEGER NOT NULL,
    "depreciation_method" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "serial_number" TEXT,
    "location" TEXT,
    "vendor_id" TEXT,
    "accumulated_depreciation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "book_value" DECIMAL(18,2) NOT NULL,
    "last_depreciation_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_asset_depreciations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "depreciation_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "accumulated_after" DECIMAL(18,2) NOT NULL,
    "book_value_after" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_asset_depreciations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_asset_disposals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "disposal_date" TIMESTAMP(3) NOT NULL,
    "disposal_method" TEXT NOT NULL,
    "proceeds" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proceeds_account_id" TEXT,
    "gain_loss" DECIMAL(18,2) NOT NULL,
    "gain_loss_account_id" TEXT NOT NULL,
    "journal_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_currency_adjustments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "adjustment_number" TEXT NOT NULL,
    "adjustment_date" TIMESTAMP(3) NOT NULL,
    "adjustment_type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL,
    "account_id" TEXT NOT NULL,
    "gain_loss_account_id" TEXT NOT NULL,
    "foreign_balance" DECIMAL(18,2) NOT NULL,
    "base_balance_before" DECIMAL(18,2) NOT NULL,
    "base_balance_after" DECIMAL(18,2) NOT NULL,
    "gain_loss" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journal_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_currency_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accountant_preferences" (
    "fy_start_month" INTEGER NOT NULL DEFAULT 4,
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recurring_child_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "allow_thirteenth_month" BOOLEAN NOT NULL DEFAULT false,
    "journal_approval_type" TEXT NOT NULL DEFAULT 'NONE',
    "allow_self_approval" BOOLEAN NOT NULL DEFAULT false,
    "unrealized_gain_account_id" TEXT,
    "unrealized_loss_account_id" TEXT,
    "journal_custom_fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accountant_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accountant_clients" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "service_type" TEXT NOT NULL DEFAULT 'BOOKKEEPING',
    "engagement_status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "access_level" TEXT NOT NULL DEFAULT 'ACCOUNTANT',
    "fiscal_year_end_month" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accountant_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_account_transfers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "transfer_number" TEXT NOT NULL,
    "transfer_date" TIMESTAMP(3) NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "reference_number" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_account_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accountant_contact" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CLIENT',
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accountant_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accountant_project" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accountant_project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountant_v2_accountant_audit" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "after" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accountant_v2_accountant_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accountant_v2_accounting_accounts_company_id_category_is_ac_idx" ON "accountant_v2_accounting_accounts"("company_id", "category", "is_active");

-- CreateIndex
CREATE INDEX "accountant_v2_accounting_accounts_company_id_parent_id_idx" ON "accountant_v2_accounting_accounts"("company_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_accounting_accounts_company_id_name_key" ON "accountant_v2_accounting_accounts"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_accounting_accounts_company_id_code_key" ON "accountant_v2_accounting_accounts"("company_id", "code");

-- CreateIndex
CREATE INDEX "accountant_v2_manual_journals_company_id_journal_date_statu_idx" ON "accountant_v2_manual_journals"("company_id", "journal_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_manual_journals_company_id_entry_number_key" ON "accountant_v2_manual_journals"("company_id", "entry_number");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_manual_journals_company_id_source_type_source_key" ON "accountant_v2_manual_journals"("company_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "accountant_v2_manual_journal_lines_company_id_journal_id_idx" ON "accountant_v2_manual_journal_lines"("company_id", "journal_id");

-- CreateIndex
CREATE INDEX "accountant_v2_manual_journal_lines_company_id_account_id_idx" ON "accountant_v2_manual_journal_lines"("company_id", "account_id");

-- CreateIndex
CREATE INDEX "accountant_v2_journal_templates_company_id_is_active_idx" ON "accountant_v2_journal_templates"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_journal_templates_company_id_name_key" ON "accountant_v2_journal_templates"("company_id", "name");

-- CreateIndex
CREATE INDEX "accountant_v2_recurring_journal_profiles_company_id_status__idx" ON "accountant_v2_recurring_journal_profiles"("company_id", "status", "next_run_date");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_recurring_journal_profiles_company_id_profile_key" ON "accountant_v2_recurring_journal_profiles"("company_id", "profile_name");

-- CreateIndex
CREATE INDEX "accountant_v2_accounting_budgets_company_id_fiscal_year_sta_idx" ON "accountant_v2_accounting_budgets"("company_id", "fiscal_year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_accounting_budgets_company_id_name_fiscal_yea_key" ON "accountant_v2_accounting_budgets"("company_id", "name", "fiscal_year");

-- CreateIndex
CREATE INDEX "accountant_v2_transaction_locks_company_id_module_is_locked_idx" ON "accountant_v2_transaction_locks"("company_id", "module", "is_locked", "lock_date");

-- CreateIndex
CREATE INDEX "accountant_v2_account_opening_balances_company_id_as_of_dat_idx" ON "accountant_v2_account_opening_balances"("company_id", "as_of_date");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_account_opening_balances_company_id_account_i_key" ON "accountant_v2_account_opening_balances"("company_id", "account_id");

-- CreateIndex
CREATE INDEX "accountant_v2_fixed_asset_categories_company_id_is_active_idx" ON "accountant_v2_fixed_asset_categories"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_fixed_asset_categories_company_id_name_key" ON "accountant_v2_fixed_asset_categories"("company_id", "name");

-- CreateIndex
CREATE INDEX "accountant_v2_fixed_assets_company_id_category_id_status_idx" ON "accountant_v2_fixed_assets"("company_id", "category_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_fixed_assets_company_id_asset_number_key" ON "accountant_v2_fixed_assets"("company_id", "asset_number");

-- CreateIndex
CREATE INDEX "accountant_v2_asset_depreciations_company_id_depreciation_d_idx" ON "accountant_v2_asset_depreciations"("company_id", "depreciation_date");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_asset_depreciations_asset_id_depreciation_dat_key" ON "accountant_v2_asset_depreciations"("asset_id", "depreciation_date");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_asset_disposals_asset_id_key" ON "accountant_v2_asset_disposals"("asset_id");

-- CreateIndex
CREATE INDEX "accountant_v2_asset_disposals_company_id_disposal_date_idx" ON "accountant_v2_asset_disposals"("company_id", "disposal_date");

-- CreateIndex
CREATE INDEX "accountant_v2_currency_adjustments_company_id_adjustment_ty_idx" ON "accountant_v2_currency_adjustments"("company_id", "adjustment_type", "adjustment_date");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_currency_adjustments_company_id_adjustment_nu_key" ON "accountant_v2_currency_adjustments"("company_id", "adjustment_number");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_accountant_preferences_company_id_key" ON "accountant_v2_accountant_preferences"("company_id");

-- CreateIndex
CREATE INDEX "accountant_v2_accountant_clients_company_id_engagement_stat_idx" ON "accountant_v2_accountant_clients"("company_id", "engagement_status");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_accountant_clients_company_id_party_id_key" ON "accountant_v2_accountant_clients"("company_id", "party_id");

-- CreateIndex
CREATE INDEX "accountant_v2_account_transfers_company_id_transfer_date_idx" ON "accountant_v2_account_transfers"("company_id", "transfer_date");

-- CreateIndex
CREATE INDEX "accountant_v2_account_transfers_company_id_from_account_id_idx" ON "accountant_v2_account_transfers"("company_id", "from_account_id");

-- CreateIndex
CREATE INDEX "accountant_v2_account_transfers_company_id_to_account_id_idx" ON "accountant_v2_account_transfers"("company_id", "to_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "accountant_v2_account_transfers_company_id_transfer_number_key" ON "accountant_v2_account_transfers"("company_id", "transfer_number");

-- CreateIndex
CREATE INDEX "accountant_v2_accountant_contact_company_id_idx" ON "accountant_v2_accountant_contact"("company_id");

-- CreateIndex
CREATE INDEX "accountant_v2_accountant_project_company_id_idx" ON "accountant_v2_accountant_project"("company_id");

-- CreateIndex
CREATE INDEX "accountant_v2_accountant_audit_company_id_idx" ON "accountant_v2_accountant_audit"("company_id");

-- AddForeignKey
ALTER TABLE "accountant_v2_accounting_accounts" ADD CONSTRAINT "accountant_v2_accounting_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accounting_accounts" ADD CONSTRAINT "accountant_v2_accounting_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accountant_v2_accounting_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journals" ADD CONSTRAINT "accountant_v2_manual_journals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journals" ADD CONSTRAINT "accountant_v2_manual_journals_reversed_from_id_fkey" FOREIGN KEY ("reversed_from_id") REFERENCES "accountant_v2_manual_journals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journal_lines" ADD CONSTRAINT "accountant_v2_manual_journal_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journal_lines" ADD CONSTRAINT "accountant_v2_manual_journal_lines_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "accountant_v2_manual_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_manual_journal_lines" ADD CONSTRAINT "accountant_v2_manual_journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accountant_v2_accounting_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_journal_templates" ADD CONSTRAINT "accountant_v2_journal_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_recurring_journal_profiles" ADD CONSTRAINT "accountant_v2_recurring_journal_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accounting_budgets" ADD CONSTRAINT "accountant_v2_accounting_budgets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_transaction_locks" ADD CONSTRAINT "accountant_v2_transaction_locks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_account_opening_balances" ADD CONSTRAINT "accountant_v2_account_opening_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_fixed_asset_categories" ADD CONSTRAINT "accountant_v2_fixed_asset_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_fixed_assets" ADD CONSTRAINT "accountant_v2_fixed_assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_asset_depreciations" ADD CONSTRAINT "accountant_v2_asset_depreciations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_asset_disposals" ADD CONSTRAINT "accountant_v2_asset_disposals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_currency_adjustments" ADD CONSTRAINT "accountant_v2_currency_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accountant_preferences" ADD CONSTRAINT "accountant_v2_accountant_preferences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accountant_clients" ADD CONSTRAINT "accountant_v2_accountant_clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_account_transfers" ADD CONSTRAINT "accountant_v2_account_transfers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accountant_contact" ADD CONSTRAINT "accountant_v2_accountant_contact_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accountant_project" ADD CONSTRAINT "accountant_v2_accountant_project_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountant_v2_accountant_audit" ADD CONSTRAINT "accountant_v2_accountant_audit_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

