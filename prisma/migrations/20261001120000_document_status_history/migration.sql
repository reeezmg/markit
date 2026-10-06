-- No historical backfill: created_at/updated_at do not prove payment time.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_at timestamptz(3);
ALTER TABLE ecomm_orders ADD COLUMN IF NOT EXISTS paid_at timestamptz(3);
ALTER TABLE ecomm_checkouts ADD COLUMN IF NOT EXISTS paid_at timestamptz(3);

CREATE TABLE IF NOT EXISTS document_status_history (
    id text PRIMARY KEY,
    sequence bigserial UNIQUE NOT NULL,
    company_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    field text NOT NULL,
    previous_status text,
    status text,
    changed_at timestamptz(3) NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'database',
    actor_id text
);
CREATE INDEX IF NOT EXISTS document_status_history_document_idx
    ON document_status_history(company_id, entity_type, entity_id, changed_at);

-- The first observed PAID transition is immutable. Reopening/refunds are
-- represented by history, not by overwriting the original collection date.
CREATE OR REPLACE FUNCTION capture_document_paid_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.paid_at := CASE WHEN NEW.payment_status::text = 'PAID' THEN now() ELSE NULL END;
    ELSE
        NEW.paid_at := OLD.paid_at;
        IF OLD.paid_at IS NULL AND NEW.payment_status::text = 'PAID'
           AND OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
            NEW.paid_at := now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION capture_document_status_history() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    old_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    new_row jsonb := to_jsonb(NEW);
    tracked_field text;
BEGIN
    FOREACH tracked_field IN ARRAY ARRAY['status', 'payment_status'] LOOP
        IF (old_row->>tracked_field) IS DISTINCT FROM (new_row->>tracked_field) THEN
            INSERT INTO document_status_history
                (id, company_id, entity_type, entity_id, field, previous_status, status, source, actor_id)
            VALUES (gen_random_uuid()::text, NEW.company_id, TG_TABLE_NAME, NEW.id,
                tracked_field, old_row->>tracked_field, new_row->>tracked_field,
                COALESCE(NULLIF(current_setting('app.status_source', true), ''), 'database'),
                NULLIF(current_setting('app.status_actor', true), ''));
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

-- BEFORE handles paid_at even for raw SQL writes. AFTER sees the final status
-- after any other BEFORE triggers. Audit rows roll back with the source write.
DO $$
DECLARE target text;
BEGIN
    FOREACH target IN ARRAY ARRAY['bills', 'ecomm_orders', 'ecomm_checkouts'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS capture_paid_at ON %I', target);
        EXECUTE format('CREATE TRIGGER capture_paid_at BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capture_document_paid_at()', target);
        EXECUTE format('DROP TRIGGER IF EXISTS capture_status_history ON %I', target);
        EXECUTE format('CREATE TRIGGER capture_status_history AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capture_document_status_history()', target);
    END LOOP;
END;
$$;
