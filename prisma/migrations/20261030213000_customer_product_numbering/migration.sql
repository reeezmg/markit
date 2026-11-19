-- Prepared locally. Apply only with separate explicit database authorization.
BEGIN;
CREATE TABLE "customer_product_numbering" (
  "company_id" TEXT NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT 'PR',
  "last_number" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_product_numbering_pkey" PRIMARY KEY ("company_id")
);
CREATE UNIQUE INDEX "customer_products_company_id_reference_key" ON "customer_products"("company_id", "reference");
DROP INDEX "customer_products_reference_key";
-- No historical references or counters are rewritten. First use creates a counter.
COMMIT;
