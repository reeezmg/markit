import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const name=process.argv.includes('--customer-accounts') ? '20260930140000_customer_account_links' : process.argv.includes('--user-credit-baseline') ? '20260930131000_user_credit_cut_baseline' : process.argv.includes('--users') ? '20260930130000_user_accounting' : process.argv.includes('--stock') ? '20260929110000_stock_control' : process.argv.includes('--erp-parties') ? '20260927170000_erp_party_links' : process.argv.includes('--expense-tax') ? '20260927160000_expense_tax_recovery' : process.argv.includes('--erp-deleted-sources') ? '20260927151000_erp_deleted_source_stability' : process.argv.includes('--erp') ? '20260927150000_erp_accounting' : process.argv.includes('--receipt-consistency') ? '20260927133000_distributor_receipt_consistency' : process.argv.includes('--purchase-tax') ? '20260927130000_distributor_purchase_tax' : process.argv.includes('--history-projection') ? '20260927123000_distributor_history_projection' : '20260927120000_distributor_accounting';
const sql=readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8');
const checksum=createHash('sha256').update(sql).digest('hex');
const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('Invalid schema');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const c=await db.connect();
try {
  await c.query('BEGIN');
  await c.query(`SET LOCAL search_path TO "${schema}"`);
  await c.query("SET LOCAL lock_timeout='15s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2-migration'))");
  const applied=await c.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',[name]);
  if(applied.rowCount) {
    if(applied.rows[0].checksum!==checksum) throw new Error('Applied migration checksum differs');
    console.log('Distributor accounting migration already applied.');
  } else {
    await c.query(sql);
    await c.query('INSERT INTO _prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)',[randomUUID(),checksum,name]);
    console.log('Distributor accounting schema and transactional posting installed; no history imported yet.');
  }
  await c.query('COMMIT');
} catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();await db.end();}
