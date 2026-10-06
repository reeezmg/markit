import 'dotenv/config';
import {importTransfers} from './lib/import-transfers.mjs';
import {verifyUserAccounting} from './lib/verify-user-accounting.mjs';
import {Pool} from 'pg';
import {readFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2),get=k=>args.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
for(const arg of args)if(!['company','through','report','cash-report','erp-report'].some(k=>arg.startsWith(`--${k}=`)))throw Error('Unknown option '+arg);
const ids=args.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10)),through=get('through');
if(!ids.length||!/^\d{4}-\d{2}-\d{2}$/.test(through)||!Number.isFinite(Date.parse(through))||new Date(through).toISOString().slice(0,10)!==through)throw Error('Explicit companies and valid cutoff required');
const cutoff=through+' 23:59:59.999',report={at:new Date().toISOString(),through,readOnly:true,issues:[],companies:[]};
const cash=get('cash-report')?JSON.parse(readFileSync(get('cash-report'),'utf8')):null;
const erp=get('erp-report')?JSON.parse(readFileSync(get('erp-report'),'utf8')):null;
if(cash && cash.through!==cutoff)throw Error('Cash report cutoff differs from verification cutoff');
if(erp && erp.through!==cutoff)throw Error('ERP report cutoff differs from verification cutoff');
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);await db.query("SET LOCAL lock_timeout='10s'");
 for(const id of ids){
  const company=(await db.query('SELECT name FROM companies WHERE id=$1',[id])).rows[0];if(!company)throw Error('Company not found');
  const r={company:company.name,companyId:id};report.companies.push(r);
  const settings=(await db.query('SELECT enabled FROM accountant_v2_erp_settings WHERE company_id=$1',[id])).rows[0];
  if(!settings?.enabled)report.issues.push({company:id,reason:'ERP accounting is not enabled'});
  r.missingDistributors=(await db.query(`SELECT dc.distributor_id FROM distributor_companies dc LEFT JOIN accountant_v2_distributor_settings s ON s.company_id=dc.company_id AND s.distributor_id=dc.distributor_id WHERE dc.company_id=$1 AND NOT COALESCE(s.enabled,false)`,[id])).rows;
  r.incompleteHistory=(await db.query(`WITH docs AS(SELECT 'bill:'||id key FROM bills WHERE company_id=$1 AND created_at<=$2::timestamp UNION ALL SELECT 'expense:'||id FROM expenses WHERE company_id=$1 AND created_at<=$2::timestamp)
   SELECT docs.key FROM docs LEFT JOIN accountant_v2_erp_sources s ON s.company_id=$1 AND s.source_key=docs.key WHERE s.source_key IS NULL OR s.signature->>'excluded'='true'`,[id,cutoff])).rows;
  // READ ONLY makes any attempted repair fail instead of modifying the books.
  await db.query('SELECT accountant_v2_sync_distributor(company_id,distributor_id) FROM accountant_v2_distributor_settings WHERE company_id=$1 AND enabled',[id]);
  await db.query("SELECT accountant_v2_sync_erp(company_id,upper(split_part(source_key,':',1)),substr(source_key,strpos(source_key,':')+1)) FROM accountant_v2_erp_sources WHERE company_id=$1",[id]);
  r.erpMismatches=(await db.query(`WITH expected AS(SELECT s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount FROM accountant_v2_erp_sources s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.signature->'lines','[]')) v WHERE s.company_id=$1 GROUP BY 1,2),actual AS(SELECT s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE s.company_id=$1 GROUP BY 1,2) SELECT COALESCE(e.source_key,a.source_key) source FROM expected e FULL JOIN actual a USING(source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`,[id])).rows;
  r.distributorLineMismatches=(await db.query(`WITH events AS (
 SELECT e.*,s.accounts,s.journal_id FROM accountant_v2_distributor_events e
 JOIN accountant_v2_distributor_settings cfg ON cfg.company_id=e.company_id AND cfg.distributor_id=e.distributor_id AND cfg.enabled
 LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key WHERE e.company_id=$1
 ), expected AS (
 SELECT company_id,distributor_id,source_key,accounts->>'payable' account_id,CASE WHEN kind IN ('PAYMENT','RETURN') THEN amount ELSE -amount END amount FROM events
 UNION ALL SELECT company_id,distributor_id,source_key,accounts->>'stock',CASE WHEN kind='RETURN' THEN -(abs(amount)-tax) ELSE abs(amount)-tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
 UNION ALL SELECT company_id,distributor_id,source_key,accounts->>'tax',CASE WHEN kind='RETURN' THEN -tax ELSE tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
 UNION ALL SELECT company_id,distributor_id,source_key,CASE WHEN kind='OPENING' THEN accounts->>'opening' WHEN mode='CASH' THEN accounts->>'cash' WHEN bank_id IS NOT NULL THEN accounts->>('bank:'||bank_id) ELSE accounts->>'bank' END,CASE WHEN kind='PAYMENT' THEN -amount ELSE amount END FROM events WHERE kind NOT IN ('PURCHASE','RETURN')
 ), expected_totals AS(SELECT company_id,distributor_id,source_key,account_id,sum(amount) amount FROM expected GROUP BY 1,2,3,4),actual AS(
 SELECT e.company_id,e.distributor_id,e.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount FROM events e JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3,4
 ) SELECT COALESCE(e.company_id,a.company_id) company_id,COALESCE(e.source_key,a.source_key) source_key,COALESCE(e.account_id,a.account_id) account_id,e.amount expected,a.amount actual FROM expected_totals e FULL JOIN actual a USING(company_id,distributor_id,source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`,[id])).rows;

  r.payableMismatches=(await db.query(`WITH expected AS(SELECT distributor_id,sum(CASE WHEN kind IN ('PAYMENT','RETURN') THEN -amount ELSE amount END) balance FROM accountant_v2_distributor_events WHERE company_id=$1 GROUP BY 1),actual AS(SELECT l.distributor_id,sum(CASE l.side WHEN 'CREDIT' THEN l.amount ELSE -l.amount END) balance FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.company_id=$1 AND a.account_type='ACCOUNTS_PAYABLE' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1) SELECT s.distributor_id,COALESCE(e.balance,0)::text expected,COALESCE(a.balance,0)::text actual FROM accountant_v2_distributor_settings s LEFT JOIN expected e USING(distributor_id) LEFT JOIN actual a USING(distributor_id) WHERE s.company_id=$1 AND s.enabled AND COALESCE(e.balance,0)<>COALESCE(a.balance,0)`,[id])).rows;
  const control=(await db.query('SELECT enabled FROM accountant_v2_stock_control WHERE company_id=$1',[id])).rows[0];
  if(!control?.enabled)report.issues.push({company:id,reason:'Stock control is not enabled'});
  r.stock=(await db.query(`WITH physical AS(SELECT round(COALESCE(sum(i.qty::numeric*v.p_price::numeric),0),2) value FROM items i JOIN variants v ON v.id=i.variant_id AND v.company_id=i.company_id JOIN products p ON p.id=v.product_id AND p.company_id=v.company_id WHERE i.company_id=$1),ledger AS(SELECT round(COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),0),2) value FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.company_id=$1 AND a.account_type='STOCK' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL) SELECT p.value::text source,l.value::text posted,(p.value-l.value)::text difference FROM physical p CROSS JOIN ledger l`,[id])).rows[0];
  r.unbalanced=(await db.query(`SELECT j.id FROM accountant_v2_manual_journals j LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL GROUP BY j.id HAVING COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0`,[id])).rows;
  r.transfers=await importTransfers(db,id,{through,verifyOnly:true});
  r.staff=await verifyUserAccounting(db,id);
  if(!r.staff.passed)report.issues.push({company:id,reason:'Staff accounting verification failed'});
  r.cashBank=[];
  const cashCompany=cash?.companies?.find(c=>c.companyId===id),erpCompany=erp?.companies?.find(c=>c.companyId===id);
  if(!cash?.applied||!erp?.applied||!cashCompany||!erpCompany)report.issues.push({company:id,reason:'Applied cash and ERP reports are required to verify final cash/bank balances'});
  else{
   const {cents,money}=await import('./lib/legacy-cash-bank-plan.mjs');
   for(const account of cashCompany.reconciliation){
    const before=erpCompany.before.find(a=>a.id===account.accountId)?.balance||'0.00';
    const after=erpCompany.after.find(a=>a.id===account.accountId)?.balance||'0.00';
    const expected=cents(account.newBalanceAfter)+cents(after)-cents(before);
    const actual=(await db.query(`SELECT round(COALESCE(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),0),2)::text balance FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=$1 AND l.account_id=$2 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$3::timestamp`,[id,account.accountId,cutoff])).rows[0].balance;
    const difference=cents(actual)-expected;r.cashBank.push({account:account.account,expected:money(expected),actual,difference:money(difference)});
    if(difference!==0n)report.issues.push({company:id,reason:'Cash/bank differs from imported baseline plus native ERP changes',account:account.account});
   }
  }
  for(const key of ['distributorLineMismatches','missingDistributors','incompleteHistory','erpMismatches','payableMismatches','unbalanced'])if(r[key].length)report.issues.push({company:id,reason:key,count:r[key].length});
  if(Number(r.stock.difference)!==0)report.issues.push({company:id,reason:'Stock differs from product source'});
 }
 report.passed=report.issues.length===0;await db.query('ROLLBACK');
 writeFileSync(get('report')||'production-accounting-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 if(!report.passed)process.exitCode=2;
}catch(e){await db.query('ROLLBACK');report.passed=false;report.error=e.message;writeFileSync(get('report')||'production-accounting-verification.json',JSON.stringify(report,null,2));throw e;}
finally{await db.query('ROLLBACK');db.release();await pool.end();}
