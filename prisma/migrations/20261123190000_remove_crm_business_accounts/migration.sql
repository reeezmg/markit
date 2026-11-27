-- LOCAL PREPARATION ONLY. Requires a separate explicit application instruction.
-- Source: schema.zmodel. Deploy the account-free CRM code first and stop legacy
-- writers. Refresh scripts/backup-crm-business-accounts.ts immediately before
-- applying, retain its before.json, and verify it contains the records below.
-- Do not replay the historical dedicated_crm create-table migration.
-- No CASCADE: unexpected dependencies must stop this removal.
BEGIN;
LOCK TABLE company_clients, crm_deals, crm_activities, crm_settings IN ACCESS EXCLUSIVE MODE;

ALTER TABLE company_clients DROP COLUMN IF EXISTS crm_account_id;
ALTER TABLE crm_deals DROP COLUMN IF EXISTS account_id;
ALTER TABLE crm_activities DROP COLUMN IF EXISTS account_id;
DROP TABLE IF EXISTS crm_accounts RESTRICT;

-- Remove retired account scoring and account-based saved-segment filters only.
-- Preserve every other setting, client identity, deal, activity and audit entry.
UPDATE crm_settings
SET settings = jsonb_set(settings #- '{scoring,account}', '{segments}',
      COALESCE((SELECT jsonb_agg(
        CASE WHEN jsonb_typeof(segment->'filters')='object'
          THEN jsonb_set(segment, '{filters}', (segment->'filters') - 'accountId')
          ELSE segment END ORDER BY position)
        FROM jsonb_array_elements(settings->'segments') WITH ORDINALITY AS s(segment,position)), '[]'::jsonb)),
    version=version+1, updated_at=now()
WHERE jsonb_typeof(settings->'segments')='array'
  AND ((settings->'scoring') ? 'account' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(settings->'segments') segment WHERE (segment->'filters') ? 'accountId'));

UPDATE crm_settings SET settings=settings #- '{scoring,account}', version=version+1, updated_at=now()
WHERE (settings->'scoring') ? 'account';
COMMIT;
