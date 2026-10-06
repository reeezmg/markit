import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config({quiet:true});
const companyId='6980e6e4-7d5d-413c-9554-24f385c9b853';
const pool=new Pool({connectionString:process.env.DIRECT_URL||process.env.DATABASE_URL,connectionTimeoutMillis:15000});
const db=await pool.connect();
try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query('SET LOCAL search_path TO public');
  const company=(await db.query('SELECT id,name FROM companies WHERE id=$1',[companyId])).rows[0];
  if(company?.name!=='ORIGINALS CLOTHING')throw Error('Unexpected company');
  const sources=(await db.query('SELECT * FROM investments WHERE company_id=$1 ORDER BY created_at,id',[companyId])).rows;
  const investors=(await db.query('SELECT * FROM accountant_v2_investors WHERE company_id=$1 ORDER BY id',[companyId])).rows;
  const events=(await db.query('SELECT * FROM accountant_v2_investor_events WHERE company_id=$1 ORDER BY event_date,id',[companyId])).rows;
  const journals=(await db.query('SELECT * FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id',[companyId,events.map(e=>e.journal_id).filter(Boolean)])).rows;
  const lines=(await db.query('SELECT * FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=ANY($2::text[]) ORDER BY journal_id,id',[companyId,journals.map(j=>j.id)])).rows;
  const accounts=(await db.query('SELECT id,name,code,account_type,category FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND is_active AND deleted_at IS NULL ORDER BY id',[companyId])).rows;
  const defaults=(await db.query(`SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='account-defaults' AND "resourceId"='investments' AND action='configured' AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`,[companyId])).rows[0]?.after;
  await db.query('COMMIT');
  const report={at:new Date().toISOString(),company,defaults,sources,investors,events,journals,lines,accounts};
  const out='scripts/production-accounting/runs/originals-settings-selection-2026-10-06/investment-links-inspection.json';
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({company:company.name,sources:sources.length,completed:sources.filter(s=>s.status==='COMPLETED').length,investors:investors.map(i=>({id:i.id,name:i.name,accounts:i.accounts})),events:events.map(e=>({id:e.id,legacyId:e.legacy_id,kind:e.kind,amount:e.amount,details:e.details})),lines:lines.map(l=>({id:l.id,journalId:l.journal_id,account:accounts.find(a=>a.id===l.account_id)?.name,amount:l.amount,side:l.side,investor:l.source_parties?.investor})),out},null,2));
}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();await pool.end();}
