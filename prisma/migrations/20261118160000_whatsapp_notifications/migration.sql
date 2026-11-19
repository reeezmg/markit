-- Prepared locally only. Requires explicit authorization before database application.
-- Authoritative contracts: schema.zmodel WhatsAppNotification* / WhatsAppInstallationAppointment.
CREATE TABLE whatsapp_notification_settings (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz(3) NOT NULL DEFAULT now(),
  rules jsonb NOT NULL DEFAULT '{}',
  updated_by text NOT NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TABLE whatsapp_notification_contacts (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  recipient text NOT NULL CHECK (recipient ~ '^[1-9][0-9]{7,14}$'),
  client_phone text NOT NULL,
  service_consent boolean NOT NULL DEFAULT false,
  marketing_consent boolean NOT NULL DEFAULT false,
  evidence text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(company_id,client_id)
);
CREATE INDEX whatsapp_notification_contacts_company_id_recipient_idx ON whatsapp_notification_contacts(company_id,recipient);
CREATE TABLE whatsapp_notification_sources (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  snapshot jsonb NOT NULL,
  observed_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,source_type,source_id)
);
CREATE TABLE whatsapp_notification_outbox (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  client_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','ACCEPTED','CANCELLED','SKIPPED','FAILED','UNKNOWN')),
  available_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  message_id text,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(company_id,event_key)
);
CREATE INDEX whatsapp_notification_outbox_company_id_status_available_at_idx ON whatsapp_notification_outbox(company_id,status,available_at);
CREATE TABLE whatsapp_installation_appointments (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_product_id text NOT NULL UNIQUE,
  appointment_on timestamptz(3) NOT NULL,
  technician text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CANCELLED')),
  updated_by text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_installation_appointments_company_id_status_appointment_on_idx ON whatsapp_installation_appointments(company_id,status,appointment_on);
