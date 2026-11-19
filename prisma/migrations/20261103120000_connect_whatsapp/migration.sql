-- PREPARED ONLY. Apply only after separate explicit database authorization.
CREATE TABLE connect_whatsapp_connections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL UNIQUE,
  phone_id TEXT NOT NULL UNIQUE,
  display_phone TEXT NOT NULL,
  verified_name TEXT NOT NULL,
  token TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  subscribed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE TABLE connect_whatsapp_messages (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connect_whatsapp_connections(id) ON DELETE CASCADE,
  meta_id TEXT UNIQUE,
  recipient TEXT NOT NULL,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL,
  status_at TIMESTAMP(3),
  consent_at TIMESTAMP(3),
  actor_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX connect_whatsapp_messages_connection_id_created_at_idx ON connect_whatsapp_messages(connection_id, created_at);
