-- Local preparation only. Requires 20261030150000_after_sales; separate authorization is required to apply.
BEGIN;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_service_product" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "service_charges" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'Service',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_charges_company_id_archived_idx" ON "service_charges"("company_id", "archived");

COMMIT;
