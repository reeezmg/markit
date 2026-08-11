-- Custom product/variant input definitions, configured in Settings → Products.
-- Values are stored as a JSONB map (field key → value) on products/variants.

CREATE TABLE IF NOT EXISTS "product_custom_fields" (
    "id"         TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "scope"      TEXT NOT NULL DEFAULT 'PRODUCT',
    "key"        TEXT NOT NULL,
    "label"      TEXT NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'TEXT',
    "options"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "required"   BOOLEAN NOT NULL DEFAULT false,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_custom_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_custom_fields_id_key"
    ON "product_custom_fields" ("id");

CREATE UNIQUE INDEX IF NOT EXISTS "product_custom_fields_company_id_scope_key_key"
    ON "product_custom_fields" ("company_id", "scope", "key");

CREATE INDEX IF NOT EXISTS "product_custom_fields_company_id_scope_idx"
    ON "product_custom_fields" ("company_id", "scope");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_custom_fields_company_id_fkey'
    ) THEN
        ALTER TABLE "product_custom_fields"
            ADD CONSTRAINT "product_custom_fields_company_id_fkey"
            FOREIGN KEY ("company_id") REFERENCES "companies"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Stored values: { "<field key>": "<value>" }
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
ALTER TABLE "variants" ADD COLUMN IF NOT EXISTS "custom_fields" JSONB;
