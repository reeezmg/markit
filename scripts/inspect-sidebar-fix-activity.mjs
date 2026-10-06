import 'dotenv/config';
import fs from 'node:fs';
import {Pool} from 'pg';
const dir=process.env.ACCOUNTING_REVIEW_DIR || 'scripts/production-accounting/runs/sidebar-fixes-2026-10-06';
const before=JSON.parse(fs.readFileSync(dir+'/persisted-before.json','utf8'));
const after=JSON.parse(fs.readFileSync(dir+'/persisted-after.json','utf8'));
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const db=await pool.connect();
try {
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const audits=(await db.query(`SELECT a.id,a.company_id,c.name AS company,a.action,a.resource,a."resourceId",a.created_at::text AS created_at,a."after"
   FROM public.accountant_v2_accountant_audit a JOIN public.companies c ON c.id=a.company_id
   WHERE a.created_at>=$1::timestamptz AT TIME ZONE 'UTC' ORDER BY a.created_at`,[before.at])).rows;
 const bills=(await db.query(`SELECT b.id,b.company_id,c.name AS company,b.invoice_number,b.grand_total,b.payment_method,b.created_at::text AS created_at,
   s.journal_id,j.created_at::text AS posting_created_at,(SELECT count(*) FROM public.entries e WHERE e.bill_id=b.id)::int AS entries
   FROM public.bills b JOIN public.companies c ON c.id=b.company_id JOIN public.accountant_v2_erp_sources s ON s.company_id=b.company_id AND s.source_key='bill:'||b.id
   JOIN public.accountant_v2_manual_journals j ON j.id=s.journal_id
   WHERE j.created_at>=$1::timestamptz AT TIME ZONE 'UTC' ORDER BY j.created_at`,[before.at])).rows;
 const changes=after.tables.filter(t=>JSON.stringify(t)!==JSON.stringify(before.tables.find(old=>old.table===t.table))).map(t=>({table:t.table,before:before.tables.find(old=>old.table===t.table).rows,after:t.rows,added:t.rows-before.tables.find(old=>old.table===t.table).rows}));
 const ledger=(await db.query(`SELECT id,company_id,source_id,account_type,direction,amount,created_at::text AS created_at FROM public.account_ledger_entries WHERE source_id=ANY($1::text[])`,[bills.map(b=>b.id)])).rows;
 const fixtureMatches=(await db.query(`SELECT id,notes FROM public.bills WHERE id LIKE 'api-%' OR id LIKE 'review-%' OR notes LIKE '%accounting API%'`)).rows;
 const companyCounters=(await db.query(`SELECT id,name,bill_counter FROM public.companies WHERE id=ANY($1::text[])`,[bills.map(b=>b.company_id)])).rows;
 const existingLedgerUpdates=(await db.query(`SELECT id,company_id,source_id,source_type,amount,direction,account_type,
   created_at::text AS created_at,updated_at::text AS updated_at,entry_date::text AS entry_date,balance_after
   FROM public.account_ledger_entries WHERE updated_at>=$1::timestamptz AT TIME ZONE 'UTC' AND NOT(source_id=ANY($2::text[]))
   ORDER BY company_id,entry_date,id`,[before.at,bills.map(b=>b.id)])).rows;
 const invoiceTrigger=(await db.query(`SELECT pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='generate_invoice_number'`)).rows;
 const priorLedgerStates=[];
 for(const row of existingLedgerUpdates) {
   const prior=(await db.query(`SELECT
     (SELECT max(created_at) FROM public.account_ledger_entries WHERE company_id=$1 AND account_type=$2 AND account_id IS NOT DISTINCT FROM $3
       AND created_at<$4::timestamptz AT TIME ZONE 'UTC')::text AS updated_at,
     (SELECT sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END) FROM public.account_ledger_entries
       WHERE company_id=$1 AND account_type=$2 AND account_id IS NOT DISTINCT FROM $3 AND NOT(source_id=ANY($5::text[]))
         AND (entry_date,id)<=($6::timestamp,$7))::text AS balance_after`,
     [row.company_id,row.account_type,ledger.find(l=>l.company_id===row.company_id)?.account_id || null,before.at,bills.map(b=>b.id),row.entry_date,row.id])).rows[0];
   priorLedgerStates.push({id:row.id,...prior});
 }
 const exclusion={
   account_ledger_entries:['source_id',bills.map(b=>b.id)],
   accountant_v2_accountant_audit:['id',audits.map(a=>a.id)],
   accountant_v2_erp_sources:['source_key',bills.map(b=>'bill:'+b.id)],
   accountant_v2_manual_journal_lines:['journal_id',bills.map(b=>b.journal_id)],
   accountant_v2_manual_journals:['id',bills.map(b=>b.journal_id)],
   bills:['id',bills.map(b=>b.id)],entries:['bill_id',bills.map(b=>b.id)],
 };
 const counts=Object.fromEntries([...new Set(bills.map(b=>b.company_id))].map(id=>[id,bills.filter(b=>b.company_id===id).length]));
 const normalized=[];
 for(const change of changes) {
   let result;
   if(change.table==='companies') {
     result=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest FROM (
       SELECT md5((CASE WHEN $1::jsonb ? t.id THEN jsonb_set(to_jsonb(t),'{bill_counter}',to_jsonb(t.bill_counter-($1::jsonb->>t.id)::int)) ELSE to_jsonb(t) END)::text) h FROM public.companies t) x`,[JSON.stringify(counts)])).rows[0];
   } else if(change.table==='account_ledger_entries' && priorLedgerStates.length) {
     const states=Object.fromEntries(priorLedgerStates.map(row=>[row.id,{updated_at:row.updated_at,balance_after:row.balance_after}]));
     result=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest FROM (
       SELECT md5((CASE WHEN $2::jsonb ? t.id THEN
         jsonb_set(jsonb_set(to_jsonb(t),'{balance_after}',to_jsonb(($2::jsonb->t.id->>'balance_after')::numeric(12,2))),
           '{updated_at}',to_jsonb(($2::jsonb->t.id->>'updated_at')::timestamp(3))) ELSE to_jsonb(t) END)::text) h
       FROM public.account_ledger_entries t WHERE NOT(source_id=ANY($1::text[]))) x`,[bills.map(b=>b.id),JSON.stringify(states)])).rows[0];
   } else if(exclusion[change.table]) {
     const [field,ids]=exclusion[change.table];
     result=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(h,'' ORDER BY h),'')) digest FROM (
       SELECT md5(to_jsonb(t)::text) h FROM public."${change.table}" t WHERE "${field}" IS NULL OR NOT ("${field}"=ANY($1::text[]))) x`,[ids])).rows[0];
   }
   const original=before.tables.find(t=>t.table===change.table);
   normalized.push({table:change.table,normalized:result,baseline:{rows:original.rows,digest:original.digest},matchesBaseline:!!result && result.rows===original.rows && result.digest===original.digest});
 }
 const reconciled=changes.length>0 && normalized.every(t=>t.matchesBaseline);
 const out={at:new Date().toISOString(),baselineAt:before.at,timestamps:'Database timestamp text; no Node local-time conversion.',changes,audits,bills,ledger,existingLedgerUpdates,priorLedgerStates,fixtureMatches,companyCounters,invoiceTrigger,normalized,
   reconciled,method:'Read-only virtual exclusion of the new bill/dependent rows and invoice-counter increment. For its future-dated legacy balance row, recompute the earlier balance without this bill and use the last pre-run account transaction timestamp. Accept attribution only if every original hash matches. No UPDATE, DELETE or counter reset is issued.'};
 fs.writeFileSync(dir+'/production-activity.json',JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
} finally {await db.query('ROLLBACK');db.release();await pool.end();}
