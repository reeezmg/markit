-- Invoice number: assigned by a BEFORE INSERT trigger on `bills`.
-- Skips quote-converted invoices (they use invoice_code) via the invoice_code IS NULL guard.
-- Run against the app database (neondb). Safe to re-run.

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invoice_code IS NULL THEN
        UPDATE companies
        SET bill_counter = bill_counter + 1
        WHERE id = NEW.company_id
        RETURNING bill_counter INTO NEW.invoice_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON bills;

CREATE TRIGGER trigger_generate_invoice_number
BEFORE INSERT ON bills
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();
