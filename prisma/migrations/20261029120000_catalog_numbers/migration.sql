-- Apply only with explicit database authorization.
-- Source contract: schema.zmodel Company/Product/Variant.
BEGIN;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS product_counter INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS variant_counter INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_no INTEGER;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS variant_no INTEGER;

-- Prisma db push may already have created the nullable fields and indexes without
-- performing the data backfill or installing the database allocator. Rebuild the
-- company-local sequences from the current rows in either starting state.
CREATE UNIQUE INDEX IF NOT EXISTS products_company_id_product_no_key ON products(company_id, product_no);
CREATE UNIQUE INDEX IF NOT EXISTS variants_company_id_variant_no_key ON variants(company_id, variant_no);

-- A row update on the company serializes allocation; rollback restores counters.
-- This covers raw SQL, generated model APIs and imports without client allocation.
CREATE OR REPLACE FUNCTION assign_catalog_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The migration enables this transaction-local flag while rebuilding existing
  -- values. Normal application sessions cannot override stored catalog numbers.
  IF current_setting('markit.catalog_number_backfill', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS NOT DISTINCT FROM OLD.company_id THEN
      IF TG_TABLE_NAME = 'products' THEN NEW.product_no := OLD.product_no;
      ELSE NEW.variant_no := OLD.variant_no;
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'products' THEN
    UPDATE companies SET product_counter = product_counter + 1
      WHERE id = NEW.company_id RETURNING product_counter - 1 INTO NEW.product_no;
  ELSE
    UPDATE companies SET variant_counter = variant_counter + 1
      WHERE id = NEW.company_id RETURNING variant_counter - 1 INTO NEW.variant_no;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS products_assign_catalog_number ON products;
DROP TRIGGER IF EXISTS variants_assign_catalog_number ON variants;
CREATE TRIGGER products_assign_catalog_number BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION assign_catalog_number();
CREATE TRIGGER variants_assign_catalog_number BEFORE INSERT OR UPDATE ON variants
  FOR EACH ROW EXECUTE FUNCTION assign_catalog_number();

-- Product/variant stock-accounting triggers are deferred and would recalculate
-- unrelated accounting state for every catalog-number-only update. Disable only
-- those known triggers for this transaction; rollback restores their prior state.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'products'::regclass
      AND tgname = 'accountant_v2_stock_product'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE products DISABLE TRIGGER accountant_v2_stock_product;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'variants'::regclass
      AND tgname = 'accountant_v2_stock_variant'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE variants DISABLE TRIGGER accountant_v2_stock_variant;
  END IF;
END;
$$;

-- Clear first so a database that already contains numbers cannot encounter a
-- transient unique-key collision while the deterministic sequence is rebuilt.
SET LOCAL markit.catalog_number_backfill = 'on';
UPDATE products SET product_no = NULL WHERE product_no IS NOT NULL;
UPDATE variants SET variant_no = NULL WHERE variant_no IS NOT NULL;
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY created_at, id)::integer AS n
  FROM products
)
UPDATE products p SET product_no = n.n FROM numbered n WHERE p.id = n.id;
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY company_id ORDER BY created_at, id)::integer AS n
  FROM variants
)
UPDATE variants v SET variant_no = n.n FROM numbered n WHERE v.id = n.id;
UPDATE companies c SET
  product_counter = COALESCE((SELECT MAX(product_no) FROM products WHERE company_id = c.id), 0) + 1,
  variant_counter = COALESCE((SELECT MAX(variant_no) FROM variants WHERE company_id = c.id), 0) + 1;
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'products'::regclass
      AND tgname = 'accountant_v2_stock_product'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE products ENABLE TRIGGER accountant_v2_stock_product;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'variants'::regclass
      AND tgname = 'accountant_v2_stock_variant'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE variants ENABLE TRIGGER accountant_v2_stock_variant;
  END IF;
END;
$$;
COMMIT;
