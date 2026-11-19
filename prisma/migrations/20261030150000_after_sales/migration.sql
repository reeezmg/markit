-- Prepared locally only. Applying requires separate explicit authorization.
BEGIN;

-- CreateTable
CREATE TABLE "service_configurations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_configuration_revisions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "configuration_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_configuration_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_service_links" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "configuration_id" TEXT NOT NULL,

    CONSTRAINT "product_service_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_products" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "product_id" TEXT,
    "item_id" TEXT,
    "bill_id" TEXT,
    "entry_id" TEXT,
    "order_id" TEXT,
    "serial_number" TEXT,
    "name" TEXT NOT NULL,
    "purchased_on" DATE NOT NULL,
    "delivered_on" DATE,
    "installed_on" DATE,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "replaced_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_service_agreements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_product_id" TEXT NOT NULL,
    "configuration_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "starts_on" DATE,
    "ends_on" DATE,
    "next_due" DATE,
    "completed_visits" INTEGER NOT NULL DEFAULT 0,
    "last_completed_on" DATE,

    CONSTRAINT "customer_service_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_occurrences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "due_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "maintenance_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "agreement_id" TEXT NOT NULL,
    "occurrence_id" TEXT,
    "request_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigned_to" TEXT,
    "appointment_on" TIMESTAMPTZ(3),
    "completed_on" DATE,
    "details" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "charge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bill_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_readings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "customer_product_id" TEXT NOT NULL,
    "recorded_on" DATE NOT NULL,
    "values" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "service_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_audit" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_reminders" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "lead_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_configurations_company_id_kind_archived_idx" ON "service_configurations"("company_id", "kind", "archived");

-- CreateIndex
CREATE INDEX "service_configuration_revisions_company_id_idx" ON "service_configuration_revisions"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_configuration_revisions_configuration_id_revision_key" ON "service_configuration_revisions"("configuration_id", "revision");

-- CreateIndex
CREATE INDEX "product_service_links_company_id_product_id_idx" ON "product_service_links"("company_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_service_links_product_id_configuration_id_key" ON "product_service_links"("product_id", "configuration_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_products_reference_key" ON "customer_products"("reference");

-- CreateIndex
CREATE INDEX "customer_products_company_id_client_id_idx" ON "customer_products"("company_id", "client_id");

-- CreateIndex
CREATE INDEX "customer_products_company_id_bill_id_idx" ON "customer_products"("company_id", "bill_id");

-- CreateIndex
CREATE INDEX "customer_products_company_id_order_id_idx" ON "customer_products"("company_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_products_company_id_source_key_key" ON "customer_products"("company_id", "source_key");

-- CreateIndex
CREATE INDEX "customer_service_agreements_customer_product_id_configurati_idx" ON "customer_service_agreements"("customer_product_id", "configuration_id");

-- CreateIndex
CREATE INDEX "customer_service_agreements_company_id_status_next_due_idx" ON "customer_service_agreements"("company_id", "status", "next_due");

-- CreateIndex
CREATE INDEX "maintenance_occurrences_company_id_status_due_on_idx" ON "maintenance_occurrences"("company_id", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_occurrences_agreement_id_due_on_key" ON "maintenance_occurrences"("agreement_id", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "service_jobs_occurrence_id_key" ON "service_jobs"("occurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_jobs_bill_id_key" ON "service_jobs"("bill_id");

-- CreateIndex
CREATE INDEX "service_jobs_company_id_status_idx" ON "service_jobs"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "service_jobs_company_id_request_key_key" ON "service_jobs"("company_id", "request_key");

-- CreateIndex
CREATE INDEX "service_readings_company_id_customer_product_id_idx" ON "service_readings"("company_id", "customer_product_id");

-- CreateIndex
CREATE INDEX "service_audit_company_id_resource_id_idx" ON "service_audit"("company_id", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_reminders_occurrence_id_lead_days_key" ON "service_reminders"("occurrence_id", "lead_days");

-- AddForeignKey
ALTER TABLE "service_configuration_revisions" ADD CONSTRAINT "service_configuration_revisions_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "service_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_service_links" ADD CONSTRAINT "product_service_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_service_links" ADD CONSTRAINT "product_service_links_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "service_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_service_agreements" ADD CONSTRAINT "customer_service_agreements_customer_product_id_fkey" FOREIGN KEY ("customer_product_id") REFERENCES "customer_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_occurrences" ADD CONSTRAINT "maintenance_occurrences_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "customer_service_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_jobs" ADD CONSTRAINT "service_jobs_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "customer_service_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_readings" ADD CONSTRAINT "service_readings_customer_product_id_fkey" FOREIGN KEY ("customer_product_id") REFERENCES "customer_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
