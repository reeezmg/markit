CREATE TABLE accountant_v2_investors (
 id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), name text NOT NULL,
 legacy_user_id text, profile jsonb NOT NULL DEFAULT '{}', accounts jsonb NOT NULL DEFAULT '{}',
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,legacy_user_id), UNIQUE(company_id,id)
);
CREATE INDEX accountant_v2_investors_company_id_idx ON accountant_v2_investors(company_id);
CREATE TABLE accountant_v2_investor_terms (
 id text PRIMARY KEY, company_id text NOT NULL, investor_id text NOT NULL,
 effective_date date NOT NULL, terms jsonb NOT NULL,
 created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,investor_id,effective_date),
 FOREIGN KEY(company_id,investor_id) REFERENCES accountant_v2_investors(company_id,id)
);
CREATE TABLE accountant_v2_investor_events (
 id text PRIMARY KEY, company_id text NOT NULL, investor_id text NOT NULL,
 event_date date NOT NULL, kind text NOT NULL, amount numeric(16,2) NOT NULL CHECK(amount>0),
 journal_id text, legacy_id text, request_id text NOT NULL, reversed_id text,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(company_id,request_id), UNIQUE(company_id,legacy_id), UNIQUE(company_id,reversed_id),
 FOREIGN KEY(company_id,investor_id) REFERENCES accountant_v2_investors(company_id,id)
);
CREATE INDEX accountant_v2_investor_events_company_id_investor_id_event_date_idx
 ON accountant_v2_investor_events(company_id,investor_id,event_date);
-- Imported source rows are immutable, including writes via generated CRUD.
CREATE FUNCTION accountant_investor_legacy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM accountant_v2_investor_events WHERE company_id=OLD.company_id AND legacy_id=OLD.id) THEN
  RAISE EXCEPTION 'Imported investment is read-only; use Investors in Accountant';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER accountant_investor_legacy_guard BEFORE UPDATE OR DELETE ON investments
 FOR EACH ROW EXECUTE FUNCTION accountant_investor_legacy_guard();
