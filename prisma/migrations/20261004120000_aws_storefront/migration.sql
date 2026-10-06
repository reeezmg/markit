-- Additive migration: existing companies keep their legacy providers.
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS repository_provider TEXT NOT NULL DEFAULT 'github';
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS hosting_provider TEXT NOT NULL DEFAULT 'vercel';
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS repository_arn TEXT;
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS amplify_app_id TEXT;
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS sandbox_role_arn TEXT;
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS template_digest TEXT;
ALTER TABLE storefront_sources ADD COLUMN IF NOT EXISTS provisioning_stage TEXT;
ALTER TABLE edit_environment ADD COLUMN IF NOT EXISTS compute_provider TEXT NOT NULL DEFAULT 'gcp';
ALTER TABLE edit_environment ADD COLUMN IF NOT EXISTS task_arn TEXT;
ALTER TABLE edit_environment ADD COLUMN IF NOT EXISTS task_token TEXT;
ALTER TABLE edit_environment ADD COLUMN IF NOT EXISTS lifecycle_state TEXT NOT NULL DEFAULT 'running';
ALTER TABLE edit_environment ADD COLUMN IF NOT EXISTS lifecycle_error TEXT;
CREATE INDEX IF NOT EXISTS edit_environment_provider_lifecycle_idx ON edit_environment(compute_provider,lifecycle_state);
ALTER TABLE storefront_agent_sessions ADD COLUMN IF NOT EXISTS runtime_result JSONB;
