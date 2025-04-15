///bills


CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
    new_invoice_number INT;
BEGIN
    -- Get the current billCounter for the company
    SELECT bill_counter INTO new_invoice_number
    FROM companies
    WHERE id = NEW."company_id"
    FOR UPDATE;

    -- Set the invoice number in the new bill
    NEW."invoiceNumber" := new_invoice_number + 1;

    -- Increment the billCounter in the Company table
    UPDATE companies
    SET bill_counter = bill_counter + 1
    WHERE id = NEW."company_id";

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the `bills` table
CREATE TRIGGER trigger_generate_invoice_number
BEFORE INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();

//items
-- Step 1: Create sequence for barcode numbering
CREATE SEQUENCE IF NOT EXISTS item_barcode_seq START 1;

-- Step 2: Function to generate barcode with base-26 prefixing
CREATE OR REPLACE FUNCTION generate_item_barcode()
RETURNS TRIGGER AS $$
DECLARE
    number_part INT;
    prefix TEXT := '';
    base INT := 999999;
    temp_num INT;
BEGIN
    -- Get the next sequence number
    number_part := nextval('item_barcode_seq');

    -- Convert number_part to a base-26 prefix (A-Z, AA-ZZ, etc.)
    temp_num := (number_part - 1) / base;  -- Ensure proper calculation

    WHILE temp_num >= 0 LOOP
        prefix := CHR(65 + (temp_num % 26)) || prefix;  -- Convert to ASCII A-Z
        temp_num := (temp_num / 26)::INT - 1;  -- Ensure integer division
    END LOOP;

    -- Generate barcode (prefix + 6-digit number)
    NEW.barcode := prefix || LPAD((number_part % base)::TEXT, 6, '0');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Drop trigger only if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_item_barcode') THEN
        DROP TRIGGER set_item_barcode ON "items";
    END IF;
END $$;

-- Step 4: Create trigger for item barcode generation
CREATE TRIGGER set_item_barcode
BEFORE INSERT ON "items"
FOR EACH ROW EXECUTE FUNCTION generate_item_barcode();
