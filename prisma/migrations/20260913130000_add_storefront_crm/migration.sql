-- CRM tables and verified-email consent, safe after the initial consent migration.
ALTER TABLE company_clients
  ADD COLUMN IF NOT EXISTS marketing_opt_in_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_email text;

CREATE TABLE IF NOT EXISTS ecomm_marketing_verifications (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, client_id)
);
ALTER TABLE ecomm_marketing_verifications ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS ecomm_marketing_campaigns (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  segment text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('DRAFT','QUEUED','ENQUEUED','COMPLETE','CANCELLED')),
  CHECK (segment IN ('all','new','repeat','inactive','cart'))
);
CREATE INDEX IF NOT EXISTS ecomm_marketing_campaigns_due_idx ON ecomm_marketing_campaigns(status, scheduled_at);

CREATE TABLE IF NOT EXISTS ecomm_marketing_automations (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  delay_hours integer NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, kind),
  CHECK (kind IN ('abandoned_cart','post_purchase')),
  CHECK (delay_hours BETWEEN 1 AND 720)
);

CREATE TABLE IF NOT EXISTS ecomm_marketing_jobs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id text REFERENCES ecomm_marketing_campaigns(id) ON DELETE CASCADE,
  automation_kind text,
  event_key text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_key, client_id),
  CHECK (status IN ('PENDING','SENDING','SENT','FAILED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS ecomm_marketing_jobs_due_idx ON ecomm_marketing_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS ecomm_marketing_jobs_company_idx ON ecomm_marketing_jobs(company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ecomm_crm_activities (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_by text NOT NULL,
  kind text NOT NULL,
  body text NOT NULL,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('note','task'))
);
CREATE INDEX IF NOT EXISTS ecomm_crm_activities_customer_idx ON ecomm_crm_activities(company_id, client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ecomm_marketing_audit (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL,
  action text NOT NULL,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ecomm_marketing_audit_company_idx ON ecomm_marketing_audit(company_id, created_at DESC);
