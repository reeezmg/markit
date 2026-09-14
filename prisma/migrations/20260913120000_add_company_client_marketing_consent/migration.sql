ALTER TABLE company_clients
  ADD COLUMN IF NOT EXISTS marketing_opt_in_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz;
