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
CREATE OR REPLACE FUNCTION generate_item_barcode()
RETURNS TRIGGER AS $$
DECLARE
    existing_barcode TEXT;
    number_part INT;
    prefix TEXT := '';
    base INT := 999999;
    temp_num INT;
BEGIN
    -- Try to find an existing barcode for this variant + size
    SELECT barcode INTO existing_barcode
    FROM variant_size_barcodes
    WHERE variant_id = NEW.variantId AND size = NEW.size;

    IF existing_barcode IS NOT NULL THEN
        NEW.barcode := existing_barcode;
        RETURN NEW;
    END IF;

    -- Generate new barcode from sequence
    number_part := nextval('item_barcode_seq');
    temp_num := (number_part - 1) / base;

    WHILE temp_num >= 0 LOOP
        prefix := CHR(65 + (temp_num % 26)) || prefix;
        temp_num := (temp_num / 26)::INT - 1;
    END LOOP;

    NEW.barcode := prefix || LPAD((number_part % base)::TEXT, 6, '0');

    -- Store new barcode for this variant + size
    INSERT INTO variant_size_barcodes (variant_id, size, barcode)
    VALUES (NEW.variantId, NEW.size, NEW.barcode);

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
