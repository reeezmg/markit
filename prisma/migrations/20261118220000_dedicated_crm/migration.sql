-- Local preparation only. Apply only after a separate explicit instruction.
-- Authoritative contracts: schema.zmodel CrmSettings through CrmAudit.
CREATE TABLE crm_settings (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  settings jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL, updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE crm_accounts (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL, industry text NOT NULL DEFAULT '', website text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '',
  owner_id text NOT NULL, tags text[] NOT NULL, description text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(company_id,id)
);
CREATE INDEX crm_accounts_company_id_archived_name_idx ON crm_accounts(company_id,archived,name);
-- CRM-only attributes extend the existing company membership; identities stay in clients.
ALTER TABLE company_clients ADD COLUMN crm_data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE company_clients ADD COLUMN crm_version integer NOT NULL DEFAULT 0;
ALTER TABLE company_clients ADD COLUMN crm_account_id text;
ALTER TABLE company_clients ADD CONSTRAINT company_clients_crm_account_fkey FOREIGN KEY(company_id,crm_account_id) REFERENCES crm_accounts(company_id,id) ON DELETE RESTRICT;
CREATE TABLE crm_deals (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text, account_id text, name text NOT NULL, pipeline_key text NOT NULL, stage_key text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN', value decimal(18,2) NOT NULL DEFAULT 0, probability integer NOT NULL DEFAULT 0,
  expected_close date, closed_at timestamptz(3), stage_changed_at timestamptz(3) NOT NULL DEFAULT now(),
  loss_reason text NOT NULL DEFAULT '', owner_id text NOT NULL, source text NOT NULL DEFAULT 'Other', tags text[] NOT NULL,
  description text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(company_id,id), FOREIGN KEY(company_id,client_id) REFERENCES company_clients(company_id,client_id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,account_id) REFERENCES crm_accounts(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX crm_deals_company_id_archived_pipeline_key_stage_key_idx ON crm_deals(company_id,archived,pipeline_key,stage_key);
CREATE INDEX crm_deals_company_id_owner_id_expected_close_idx ON crm_deals(company_id,owner_id,expected_close);
CREATE TABLE crm_activities (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text, account_id text, deal_id text, kind text NOT NULL DEFAULT 'TASK', subject text NOT NULL,
  body text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'OPEN', priority text NOT NULL DEFAULT 'NORMAL', owner_id text NOT NULL,
  due_at timestamptz(3), end_at timestamptz(3), completed_at timestamptz(3), reminded_at timestamptz(3),
  recurrence_days integer, recurrence_key text, attachments jsonb NOT NULL DEFAULT '[]', archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, created_by text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(company_id,recurrence_key),
  FOREIGN KEY(company_id,client_id) REFERENCES company_clients(company_id,client_id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,account_id) REFERENCES crm_accounts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,deal_id) REFERENCES crm_deals(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX crm_activities_company_id_status_due_at_owner_id_idx ON crm_activities(company_id,status,due_at,owner_id);
CREATE INDEX crm_activities_company_id_client_id_created_at_idx ON crm_activities(company_id,client_id,created_at);
CREATE TABLE crm_document_links (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id text NOT NULL, kind text NOT NULL, document_id text NOT NULL, created_by text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(company_id,deal_id,kind,document_id),
  FOREIGN KEY(company_id,deal_id) REFERENCES crm_deals(company_id,id) ON DELETE RESTRICT
);
CREATE TABLE crm_audit (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL, actor_id text NOT NULL,
  summary text NOT NULL, changes jsonb NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX crm_audit_company_id_entity_type_entity_id_created_at_idx ON crm_audit(company_id,entity_type,entity_id,created_at);
