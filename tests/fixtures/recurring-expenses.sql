-- Test-only fixture mirroring the recurring models created by Prisma schema push.
CREATE TABLE recurring_expenses (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  note text,
  total_amount double precision NOT NULL,
  tax_amount double precision NOT NULL DEFAULT 0,
  recoverable_tax_amount double precision NOT NULL DEFAULT 0,
  next_due_date date NOT NULL,
  day_of_month integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX recurring_expenses_active_next_due_date_idx ON recurring_expenses(active, next_due_date);
CREATE INDEX recurring_expenses_company_id_idx ON recurring_expenses(company_id);
CREATE TABLE recurring_expense_occurrences (
  id text PRIMARY KEY,
  schedule_id text NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  expense_id text UNIQUE REFERENCES expenses(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_occurrences_schedule_id_due_date_key UNIQUE(schedule_id, due_date)
);
