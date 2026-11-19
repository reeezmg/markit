-- PREPARED LOCALLY ONLY. Apply separately after review/explicit authorization.
-- Source contract: schema.zmodel RecurringInvoice/Occurrence and RetainerInvoice/Event.
-- No historical bills, payments, journals or balances are modified.
CREATE TABLE recurring_invoices (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL, currency TEXT NOT NULL, frequency TEXT NOT NULL CHECK (frequency IN ('DAY','WEEK','MONTH','YEAR')),
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 365),
  start_date DATE NOT NULL, end_date DATE, next_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','COMPLETED')),
  generation_mode TEXT NOT NULL DEFAULT 'DRAFT' CHECK (generation_mode IN ('DRAFT','ISSUE')),
  due_days INTEGER NOT NULL DEFAULT 0 CHECK (due_days BETWEEN 0 AND 3650),
  template JSONB NOT NULL, revision TEXT NOT NULL, created_by TEXT NOT NULL, last_error TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL,
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX recurring_invoices_company_id_idx ON recurring_invoices(company_id);
CREATE INDEX recurring_invoices_status_next_date_idx ON recurring_invoices(status,next_date);
CREATE TABLE recurring_invoice_occurrences (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  profile_id TEXT NOT NULL REFERENCES recurring_invoices(id) ON DELETE RESTRICT,
  invoice_date DATE NOT NULL, due_date DATE NOT NULL CHECK (due_date >= invoice_date), template JSONB NOT NULL,
  bill_id TEXT REFERENCES bills(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX recurring_invoice_occurrences_bill_id_key ON recurring_invoice_occurrences(bill_id);
CREATE UNIQUE INDEX recurring_invoice_occurrences_profile_id_invoice_date_key ON recurring_invoice_occurrences(profile_id,invoice_date);
CREATE INDEX recurring_invoice_occurrences_company_id_idx ON recurring_invoice_occurrences(company_id);
CREATE TABLE retainer_invoices (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  number INTEGER NOT NULL CHECK (number > 0), currency TEXT NOT NULL, retainer_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SENT','VOID')),
  description TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', terms_and_conditions TEXT NOT NULL DEFAULT '',
  amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
  liability_account_id TEXT NOT NULL REFERENCES accountant_v2_accounting_accounts(id) ON DELETE RESTRICT,
  revision TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX retainer_invoices_company_id_number_key ON retainer_invoices(company_id,number);
CREATE INDEX retainer_invoices_company_id_client_id_idx ON retainer_invoices(company_id,client_id);
CREATE TABLE retainer_events (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  retainer_id TEXT NOT NULL REFERENCES retainer_invoices(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('COLLECTION','APPLY','REFUND','UNAPPLY')),
  amount DECIMAL(18,2) NOT NULL CHECK (amount > 0), event_date DATE NOT NULL, reference TEXT NOT NULL DEFAULT '',
  payment_method TEXT, account_id TEXT REFERENCES accountant_v2_accounting_accounts(id) ON DELETE RESTRICT,
  bill_id TEXT REFERENCES bills(id) ON DELETE RESTRICT, payment_id TEXT REFERENCES payments(id) ON DELETE RESTRICT,
  journal_id TEXT NOT NULL REFERENCES accountant_v2_manual_journals(id) ON DELETE RESTRICT,
  reverses_id TEXT REFERENCES retainer_events(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((kind IN ('COLLECTION','REFUND') AND account_id IS NOT NULL AND payment_method IN ('Cash','UPI','Card','Bank') AND bill_id IS NULL AND payment_id IS NULL AND reverses_id IS NULL)
    OR (kind='APPLY' AND bill_id IS NOT NULL AND payment_id IS NOT NULL AND reverses_id IS NULL AND account_id IS NULL AND payment_method IS NULL)
    OR (kind='UNAPPLY' AND bill_id IS NOT NULL AND reverses_id IS NOT NULL AND payment_id IS NULL AND account_id IS NULL AND payment_method IS NULL))
);
CREATE UNIQUE INDEX retainer_events_payment_id_key ON retainer_events(payment_id);
CREATE UNIQUE INDEX retainer_events_journal_id_key ON retainer_events(journal_id);
CREATE UNIQUE INDEX retainer_events_reverses_id_key ON retainer_events(reverses_id);
CREATE INDEX retainer_events_company_id_retainer_id_idx ON retainer_events(company_id,retainer_id);
CREATE INDEX retainer_events_company_id_bill_id_idx ON retainer_events(company_id,bill_id);
