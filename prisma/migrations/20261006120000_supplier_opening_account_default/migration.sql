-- Snapshot the company purchase opening default only for a new opening source.
-- Existing source selections and the installed supplier posting function stay intact.
CREATE OR REPLACE FUNCTION accountant_v2_select_supplier_opening() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved jsonb; chosen jsonb; opening_id text;
BEGIN
 IF COALESCE(NEW.opening_due,0)=0 OR NOT EXISTS (
   SELECT 1 FROM accountant_v2_distributor_settings WHERE company_id=NEW.company_id AND distributor_id=NEW.distributor_id AND enabled
 ) THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('accountant-v2:'||NEW.company_id));
 IF EXISTS (SELECT 1 FROM accountant_v2_distributor_sources WHERE company_id=NEW.company_id AND distributor_id=NEW.distributor_id
   AND source_key='opening' AND accounts<>'{}'::jsonb) THEN RETURN NEW; END IF;
 SELECT "after" INTO saved FROM accountant_v2_accountant_audit WHERE company_id=NEW.company_id AND resource='account-defaults'
   AND action='configured' AND "resourceId"='purchase' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1;
 opening_id:=saved->>'opening';
 IF opening_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM accountant_v2_accounting_accounts WHERE id=opening_id AND company_id=NEW.company_id
   AND is_active AND deleted_at IS NULL AND account_type::text IN ('EQUITY','OTHER_CURRENT_LIABILITY')) THEN
   RAISE EXCEPTION 'Select an active company opening account';
 END IF;
 SELECT jsonb_object_agg(role,account_id) INTO chosen FROM accountant_v2_distributor_mappings
   WHERE company_id=NEW.company_id AND distributor_id=NEW.distributor_id;
 chosen:=COALESCE(chosen,'{}'::jsonb)||jsonb_build_object('opening',opening_id);
 INSERT INTO accountant_v2_distributor_sources(company_id,distributor_id,source_key,signature,accounts)
   VALUES(NEW.company_id,NEW.distributor_id,'opening','{}',chosen)
   ON CONFLICT(company_id,distributor_id,source_key) DO UPDATE SET accounts=EXCLUDED.accounts
     WHERE accountant_v2_distributor_sources.accounts='{}'::jsonb;
 RETURN NEW;
END $$;
CREATE TRIGGER accountant_v2_supplier_opening_selection BEFORE INSERT OR UPDATE OF opening_due,opening_due_date ON distributor_companies
 FOR EACH ROW EXECUTE FUNCTION accountant_v2_select_supplier_opening();
