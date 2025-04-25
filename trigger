-- bills

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    new_invoice_number INT;
BEGIN
    -- Get the current billCounter for the company
    SELECT bill_counter INTO new_invoice_number
    FROM companies
    WHERE id = NEW.company_id
    FOR UPDATE;

    -- Set the invoice number in the new bill
    NEW.invoice_number := new_invoice_number + 1;

    -- Increment the billCounter in the Company table
    UPDATE companies
    SET bill_counter = bill_counter + 1
    WHERE id = NEW.company_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the `bills` table
CREATE TRIGGER trigger_generate_invoice_number
BEFORE INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();

-- items
CREATE OR REPLACE FUNCTION generate_item_barcode()
RETURNS TRIGGER AS $$
DECLARE
    existing_barcode TEXT;
    number_part INT;
    prefix TEXT := '';
    base INT := 999999;
    temp_num INT;
    store_code INT;
BEGIN
    -- 1. Get the storeCode and current counter for the company
    SELECT storecode, barcode_counter INTO store_code, number_part
    FROM companies
    WHERE id = NEW.company_id
    FOR UPDATE;

    -- 2. Check if a barcode already exists
    IF NEW.size IS NULL THEN
        SELECT barcode INTO existing_barcode
        FROM variant_size_barcodes
        WHERE variant_id = NEW.variant_id AND size IS NULL;
    ELSE
        SELECT barcode INTO existing_barcode
        FROM variant_size_barcodes
        WHERE variant_id = NEW.variant_id AND size = NEW.size;
    END IF;

    IF existing_barcode IS NOT NULL THEN
        NEW.barcode := store_code::TEXT || existing_barcode;
        RETURN NEW;
    END IF;

    -- 3. Convert number_part to letter prefix and padded number
    temp_num := (number_part - 1) / base;

    WHILE temp_num >= 0 LOOP
        prefix := CHR(65 + (temp_num % 26)) || prefix;
        temp_num := (temp_num / 26)::INT - 1;
    END LOOP;

    -- 4. Final barcode = storeCode + letter + number
    NEW.barcode := store_code::TEXT || prefix || LPAD((number_part % base)::TEXT, 6, '0');

    -- 5. Save barcode
    INSERT INTO variant_size_barcodes (variant_id, size, barcode)
    VALUES (NEW.variant_id, NEW.size, prefix || LPAD((number_part % base)::TEXT, 6, '0'));

    -- 6. Increment the company's barcode counter
    UPDATE companies
    SET barcode_counter = barcode_counter + 1
    WHERE id = NEW.company_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_item_barcode') THEN
        DROP TRIGGER set_item_barcode ON "items";
    END IF;
END $$;

CREATE TRIGGER set_item_barcode
BEFORE INSERT ON "items"
FOR EACH ROW EXECUTE FUNCTION generate_item_barcode();

-- storeuniquename
CREATE OR REPLACE FUNCTION set_store_unique_name()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE companies
  SET store_unique_name = NEW.name || NEW.storecode
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_store_unique_name
AFTER INSERT ON companies
FOR EACH ROW
EXECUTE FUNCTION set_store_unique_name();

