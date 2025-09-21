
CREATE TABLE IF NOT EXISTS products_synced (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  status BOOLEAN NOT NULL,
  rating FLOAT,
  description TEXT,
  company_id UUID NOT NULL,
  category_id UUID,
  subcategory_id UUID,
  purchaseorder_id UUID NOT NULL,
  write_id UUID
);

CREATE TABLE IF NOT EXISTS categories_synced (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  image TEXT,
  company_id UUID NOT NULL,
  short_cut TEXT,
  hsn TEXT,
  "taxType" TEXT NOT NULL DEFAULT 'FIXED',         
  "fixedTax" FLOAT,                                
  "thresholdAmount" FLOAT,                         
  "taxBelowThreshold" FLOAT,                       
  "taxAboveThreshold" FLOAT,                       
  margin FLOAT,
  write_id UUID
);

CREATE TABLE IF NOT EXISTS variants_synced (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  s_price FLOAT NOT NULL,
  p_price FLOAT,
  discount FLOAT,
  d_price FLOAT,
  images TEXT[], -- assuming this is a PostgreSQL array of text
  tax FLOAT NOT NULL DEFAULT 0.0,
  product_id UUID NOT NULL,
  company_id UUID NOT NULL,
  sold INT,
  write_id UUID
);

CREATE TABLE IF NOT EXISTS items_synced (
  id UUID PRIMARY KEY,
  barcode TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  variant_id UUID NOT NULL,
  size TEXT,
  qty INT DEFAULT 0,
  company_id UUID NOT NULL,
  write_id UUID
);



CREATE TABLE IF NOT EXISTS products_local (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  name TEXT,
  brand TEXT,
  status BOOLEAN,
  rating FLOAT,
  description TEXT,
  company_id UUID,
  category_id UUID,
  subcategory_id UUID,
  purchaseorder_id UUID,
  changed_columns TEXT[],
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  write_id UUID NOT NULL
);



-- The `products` view to combine the two tables on read.
    CREATE OR REPLACE VIEW products AS
SELECT
  COALESCE(local.id, synced.id) AS id,
  CASE WHEN 'created_at' = ANY(local.changed_columns) THEN local.created_at ELSE synced.created_at END AS created_at,
  CASE WHEN 'updated_at' = ANY(local.changed_columns) THEN local.updated_at ELSE synced.updated_at END AS updated_at,
  CASE WHEN 'name' = ANY(local.changed_columns) THEN local.name ELSE synced.name END AS name,
  CASE WHEN 'brand' = ANY(local.changed_columns) THEN local.brand ELSE synced.brand END AS brand,
  CASE WHEN 'status' = ANY(local.changed_columns) THEN local.status ELSE synced.status END AS status,
  CASE WHEN 'rating' = ANY(local.changed_columns) THEN local.rating ELSE synced.rating END AS rating,
  CASE WHEN 'description' = ANY(local.changed_columns) THEN local.description ELSE synced.description END AS description,
  CASE WHEN 'company_id' = ANY(local.changed_columns) THEN local.company_id ELSE synced.company_id END AS company_id,
  CASE WHEN 'category_id' = ANY(local.changed_columns) THEN local.category_id ELSE synced.category_id END AS category_id,
  CASE WHEN 'subcategory_id' = ANY(local.changed_columns) THEN local.subcategory_id ELSE synced.subcategory_id END AS subcategory_id,
  CASE WHEN 'purchaseorder_id' = ANY(local.changed_columns) THEN local.purchaseorder_id ELSE synced.purchaseorder_id END AS purchaseorder_id
FROM products_synced AS synced
FULL OUTER JOIN products_local AS local
  ON synced.id = local.id
WHERE local.id IS NULL OR local.is_deleted = FALSE;

-- triggers to handle the local table for `products` view
CREATE OR REPLACE FUNCTION delete_local_on_synced_insert_and_update_trigger()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM products_local
    WHERE id = NEW.id
      AND write_id IS NOT NULL
      AND write_id = NEW.write_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION delete_local_on_synced_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM products_local WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER delete_local_on_synced_insert
AFTER INSERT OR UPDATE ON products_synced
FOR EACH ROW
EXECUTE FUNCTION delete_local_on_synced_insert_and_update_trigger();

CREATE OR REPLACE TRIGGER delete_local_on_synced_delete
AFTER DELETE ON products_synced
FOR EACH ROW
EXECUTE FUNCTION delete_local_on_synced_delete_trigger();

-- The local `changes` table for capturing and persisting a log
-- of local write operations that we want to sync to the server.
CREATE TABLE IF NOT EXISTS changes (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  table_name TEXT NOT NULL,
  value JSONB NOT NULL,
  write_id UUID NOT NULL,
  transaction_id XID8 NOT NULL
);

-- The following `INSTEAD OF` triggers:
-- 1. allow the app code to write directly to the view
-- 2. to capture write operations and write change messages into the

-- The insert trigger
CREATE OR REPLACE FUNCTION products_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
  local_write_id UUID := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM products_synced WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot insert: id already exists in the synced table';
  END IF;

  IF EXISTS (SELECT 1 FROM products_local WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot insert: id already exists in the local table';
  END IF;

  -- Insert into the local table
  INSERT INTO products_local (
    id,
    created_at,
    updated_at,
    name,
    brand,
    status,
    rating,
    description,
    company_id,
    category_id,
    subcategory_id,
    purchaseorder_id,
    changed_columns,
    write_id
  )
  VALUES (
    NEW.id,
    NEW.created_at,
    NEW.updated_at,
    NEW.name,
    NEW.brand,
    NEW.status,
    NEW.rating,
    NEW.description,
    NEW.company_id,
    NEW.category_id,
    NEW.subcategory_id,
    NEW.purchaseorder_id,
    ARRAY[
      'created_at', 'updated_at', 'name', 'brand', 'status',
      'rating', 'description', 'company_id', 'category_id',
      'subcategory_id', 'purchaseorder_id'
    ],
    local_write_id
  );

  -- Record the write operation in the change log
  INSERT INTO changes (
    operation,
    table_name,
    value,
    write_id,
    transaction_id
  )
  VALUES (
    'insert',
    'products',
    jsonb_build_object(
      'id', NEW.id,
      'created_at', NEW.created_at,
      'updated_at', NEW.updated_at,
      'name', NEW.name,
      'brand', NEW.brand,
      'status', NEW.status,
      'rating', NEW.rating,
      'description', NEW.description,
      'company_id', NEW.company_id,
      'category_id', NEW.category_id,
      'subcategory_id', NEW.subcategory_id,
      'purchaseorder_id', NEW.purchaseorder_id
    ),
    local_write_id,
    pg_current_xact_id()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- The update trigger
CREATE OR REPLACE FUNCTION products_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
  synced products_synced%ROWTYPE;
  local products_local%ROWTYPE;
  changed_cols TEXT[] := '{}';
  local_write_id UUID := gen_random_uuid();
BEGIN
  -- Fetch the corresponding rows from the synced and local tables
  SELECT * INTO synced FROM products_synced WHERE id = NEW.id;
  SELECT * INTO local FROM products_local WHERE id = NEW.id;

  -- If not found in local, insert
  IF NOT FOUND THEN
    -- Compare each column with the synced table
    IF NEW.name IS DISTINCT FROM synced.name THEN
      changed_cols := array_append(changed_cols, 'name');
    END IF;
    IF NEW.brand IS DISTINCT FROM synced.brand THEN
      changed_cols := array_append(changed_cols, 'brand');
    END IF;
    IF NEW.status IS DISTINCT FROM synced.status THEN
      changed_cols := array_append(changed_cols, 'status');
    END IF;
    IF NEW.rating IS DISTINCT FROM synced.rating THEN
      changed_cols := array_append(changed_cols, 'rating');
    END IF;
    IF NEW.description IS DISTINCT FROM synced.description THEN
      changed_cols := array_append(changed_cols, 'description');
    END IF;
    IF NEW.company_id IS DISTINCT FROM synced.company_id THEN
      changed_cols := array_append(changed_cols, 'company_id');
    END IF;
    IF NEW.category_id IS DISTINCT FROM synced.category_id THEN
      changed_cols := array_append(changed_cols, 'category_id');
    END IF;
    IF NEW.subcategory_id IS DISTINCT FROM synced.subcategory_id THEN
      changed_cols := array_append(changed_cols, 'subcategory_id');
    END IF;
    IF NEW.purchaseorder_id IS DISTINCT FROM synced.purchaseorder_id THEN
      changed_cols := array_append(changed_cols, 'purchaseorder_id');
    END IF;
    IF NEW.updated_at IS DISTINCT FROM synced.updated_at THEN
      changed_cols := array_append(changed_cols, 'updated_at');
    END IF;

    INSERT INTO products_local (
      id,
      created_at,
      updated_at,
      name,
      brand,
      status,
      rating,
      description,
      company_id,
      category_id,
      subcategory_id,
      purchaseorder_id,
      changed_columns,
      write_id
    )
    VALUES (
      NEW.id,
      NEW.created_at,
      NEW.updated_at,
      NEW.name,
      NEW.brand,
      NEW.status,
      NEW.rating,
      NEW.description,
      NEW.company_id,
      NEW.category_id,
      NEW.subcategory_id,
      NEW.purchaseorder_id,
      changed_cols,
      local_write_id
    );

  ELSE
    UPDATE products_local
      SET
        name = CASE WHEN NEW.name IS DISTINCT FROM synced.name THEN NEW.name ELSE local.name END,
        brand = CASE WHEN NEW.brand IS DISTINCT FROM synced.brand THEN NEW.brand ELSE local.brand END,
        status = CASE WHEN NEW.status IS DISTINCT FROM synced.status THEN NEW.status ELSE local.status END,
        rating = CASE WHEN NEW.rating IS DISTINCT FROM synced.rating THEN NEW.rating ELSE local.rating END,
        description = CASE WHEN NEW.description IS DISTINCT FROM synced.description THEN NEW.description ELSE local.description END,
        company_id = CASE WHEN NEW.company_id IS DISTINCT FROM synced.company_id THEN NEW.company_id ELSE local.company_id END,
        category_id = CASE WHEN NEW.category_id IS DISTINCT FROM synced.category_id THEN NEW.category_id ELSE local.category_id END,
        subcategory_id = CASE WHEN NEW.subcategory_id IS DISTINCT FROM synced.subcategory_id THEN NEW.subcategory_id ELSE local.subcategory_id END,
        purchaseorder_id = CASE WHEN NEW.purchaseorder_id IS DISTINCT FROM synced.purchaseorder_id THEN NEW.purchaseorder_id ELSE local.purchaseorder_id END,
        updated_at = CASE WHEN NEW.updated_at IS DISTINCT FROM synced.updated_at THEN NEW.updated_at ELSE local.updated_at END,
        changed_columns = (
          SELECT array_agg(DISTINCT col) FROM (
            SELECT unnest(local.changed_columns) AS col
            UNION
            SELECT unnest(ARRAY[
              'name', 'brand', 'status', 'rating', 'description',
              'company_id', 'category_id', 'subcategory_id', 'purchaseorder_id', 'updated_at'
            ]) AS col
          ) AS cols
          WHERE (
            CASE
              WHEN col = 'name' THEN COALESCE(NEW.name, local.name) IS DISTINCT FROM synced.name
              WHEN col = 'brand' THEN COALESCE(NEW.brand, local.brand) IS DISTINCT FROM synced.brand
              WHEN col = 'status' THEN COALESCE(NEW.status, local.status) IS DISTINCT FROM synced.status
              WHEN col = 'rating' THEN COALESCE(NEW.rating, local.rating) IS DISTINCT FROM synced.rating
              WHEN col = 'description' THEN COALESCE(NEW.description, local.description) IS DISTINCT FROM synced.description
              WHEN col = 'company_id' THEN COALESCE(NEW.company_id, local.company_id) IS DISTINCT FROM synced.company_id
              WHEN col = 'category_id' THEN COALESCE(NEW.category_id, local.category_id) IS DISTINCT FROM synced.category_id
              WHEN col = 'subcategory_id' THEN COALESCE(NEW.subcategory_id, local.subcategory_id) IS DISTINCT FROM synced.subcategory_id
              WHEN col = 'purchaseorder_id' THEN COALESCE(NEW.purchaseorder_id, local.purchaseorder_id) IS DISTINCT FROM synced.purchaseorder_id
              WHEN col = 'updated_at' THEN COALESCE(NEW.updated_at, local.updated_at) IS DISTINCT FROM synced.updated_at
            END
          )
        ),
        write_id = local_write_id
      WHERE id = NEW.id;
  END IF;

  -- Record the update into the change log
  INSERT INTO changes (
    operation,
    table_name,
    value,
    write_id,
    transaction_id
  )
  VALUES (
    'update',
    'products',
    jsonb_strip_nulls(
      jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'brand', NEW.brand,
        'status', NEW.status,
        'rating', NEW.rating,
        'description', NEW.description,
        'company_id', NEW.company_id,
        'category_id', NEW.category_id,
        'subcategory_id', NEW.subcategory_id,
        'purchaseorder_id', NEW.purchaseorder_id,
        'updated_at', NEW.updated_at
      )
    ),
    local_write_id,
    pg_current_xact_id()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- The delete trigger
CREATE OR REPLACE FUNCTION products_delete_trigger()
RETURNS TRIGGER AS $$
DECLARE
  local_write_id UUID := gen_random_uuid();
BEGIN
  -- Soft delete in local table if exists, else insert a deleted stub
  IF EXISTS (SELECT 1 FROM products_local WHERE id = OLD.id) THEN
    UPDATE products_local
    SET
      is_deleted = TRUE,
      write_id = local_write_id
    WHERE id = OLD.id;
  ELSE
    INSERT INTO products_local (
      id,
      is_deleted,
      write_id
    )
    VALUES (
      OLD.id,
      TRUE,
      local_write_id
    );
  END IF;

  -- Record the delete operation in the change log
  INSERT INTO changes (
    operation,
    table_name,
    value,
    write_id,
    transaction_id
  )
  VALUES (
    'delete',
    'products',
    jsonb_build_object(
      'id', OLD.id
    ),
    local_write_id,
    pg_current_xact_id()
  );

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER products_insert
INSTEAD OF INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION products_insert_trigger();

CREATE OR REPLACE TRIGGER products_update
INSTEAD OF UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION products_update_trigger();

CREATE OR REPLACE TRIGGER products_delete
INSTEAD OF DELETE ON products
FOR EACH ROW
EXECUTE FUNCTION products_delete_trigger();

-- Notify on a `changes` topic whenever anything is added to the change log.
CREATE OR REPLACE FUNCTION changes_notify_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NOTIFY changes;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER changes_notify
AFTER INSERT ON changes
FOR EACH ROW
EXECUTE FUNCTION changes_notify_trigger();