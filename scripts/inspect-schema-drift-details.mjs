import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { accountingTestDatabaseUrl } from './lib/accounting-test-database.mjs';
dotenv.config({ quiet: true });
const dir = 'scripts/production-accounting/runs/prisma-schema-read-2026-10-06';
const sql = fs.readFileSync(`${dir}/direct-diff.sql`, 'utf8');
const constraints = [...sql.matchAll(/DROP CONSTRAINT "([^"]+)"/g)].map(m => m[1]);
const pool = new Pool({ connectionString: accountingTestDatabaseUrl(process.env.DATABASE_URL) });
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  const foreignKeys = (await client.query(`SELECT t.relname AS table_name, c.conname AS name,
    c.confdeltype AS delete_action, c.confupdtype AS update_action, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND c.conname=ANY($1::text[]) ORDER BY t.relname,c.conname`, [constraints])).rows;
  const defaults = (await client.query(`SELECT table_name,column_name,column_default FROM information_schema.columns
    WHERE table_schema='public' AND ((column_name='id' AND table_name IN
      ('ai_provider_credentials','ai_usage_events','storefront_agent_sessions','storefront_design_profiles','storefront_sources'))
      OR (table_name='accountant_v2_distributor_settings' AND column_name='updated_at')) ORDER BY table_name`)).rows;
  const indexes = (await client.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
    AND indexname IN ('ecomm_product_reviews_product_status_idx','accountant_v2_investor_events_company_id_investor_id_event_date')`)).rows;
  const result = { foreignKeys, defaults, indexes };
  fs.writeFileSync(`${dir}/drift-details.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await client.query('ROLLBACK'); client.release(); await pool.end(); }
