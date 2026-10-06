import 'dotenv/config';
import {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const args=process.argv.slice(2),apply=args.includes('--apply');
const ids=args.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10));
if(Boolean(ids.length)===args.includes('--all-connected'))throw Error('Choose explicit companies or --all-connected');
for(const a of args)if(!['--apply','--all-connected'].includes(a)&&!a.startsWith('--company=')&&!a.startsWith('--report='))throw Error('Unknown option '+a);
const output=args.find(a=>a.startsWith('--report='))?.slice(9)||`stock-accounting-${apply?'import':'preview'}.json`;
const report={applied:false,at:new Date().toISOString(),valuation:'Remaining quantity times current variant purchase price, including products without PO',companies:[]};
const pool=new Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
const idFor=s=>'c'+createHash('sha256').update(s).digest('hex').slice(0,24);
try{
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('Invalid schema');
 await db.query(`SET LOCAL search_path TO "${schema}"`);await db.query("SET LOCAL lock_timeout='15s'");
 // Block concurrent stock/source changes before acquiring accounting locks.
 if(apply)await db.query('LOCK TABLE products,variants,items,bills,entries,purchase_orders,purchase_returns,distributor_credits,distributor_payments IN SHARE MODE');
 const companies=(await db.query(`SELECT c.id,c.name,c.currency,s.accounts->>'stock' stock FROM companies c JOIN accountant_v2_erp_settings s ON s.company_id=c.id AND s.enabled WHERE ($1::boolean OR c.id=ANY($2::text[])) ORDER BY c.id`,[args.includes('--all-connected'),ids])).rows;
 if(!companies.length||ids.some(id=>!companies.some(c=>c.id===id)))throw Error('Select enabled ERP companies');
 for(const c of companies){
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[c.id]);
  const account=async(name,code,type,category)=>{
   const id=idFor(c.id+':'+code);
   await db.query(`INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,code,account_type,category,currency,updated_at) VALUES($1,$2,$3,$4,$5::"AccountantAccountingAccountType",$6::"AccountantAccountingAccountCategory",$7,now()) ON CONFLICT(company_id,code) DO NOTHING`,[id,c.id,name,code,type,category,c.currency||'INR']);
   const r=(await db.query('SELECT id,account_type,is_active,deleted_at FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND code=$2',[c.id,code])).rows[0];
   if(!r||r.account_type!==type||!r.is_active||r.deleted_at)throw Error('Invalid stock control counterpart '+code);return r.id;
  };
  const opening=await account('Opening Inventory','STOCK-OPEN','EQUITY','EQUITY');
  const adjustment=await account('Inventory Adjustments','STOCK-ADJ','EXPENSE','EXPENSE');
  await db.query(`INSERT INTO accountant_v2_stock_control(company_id,stock_account_id,opening_account_id,adjustment_account_id,enabled) VALUES($1,$2,$3,$4,true) ON CONFLICT(company_id) DO UPDATE SET enabled=true`,[c.id,c.stock,opening,adjustment]);
  const changed=(await db.query('SELECT accountant_v2_sync_stock($1) n',[c.id])).rows[0].n;
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query('SET CONSTRAINTS ALL DEFERRED');
  const check=(await db.query(`WITH expected AS(SELECT v->>'account_id' id,round(sum((v->>'value')::numeric),2) value FROM jsonb_array_elements(accountant_v2_stock_snapshot($1)) v GROUP BY 1),posted AS(SELECT l.account_id id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END) value FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE l.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY 1) SELECT a.id,a.name,COALESCE(e.value,0)::text source,round(COALESCE(p.value,0),2)::text posted,round(COALESCE(p.value,0)-COALESCE(e.value,0),2)::text difference FROM accountant_v2_accounting_accounts a LEFT JOIN expected e ON e.id=a.id LEFT JOIN posted p ON p.id=a.id WHERE a.company_id=$1 AND a.account_type='STOCK' AND a.deleted_at IS NULL ORDER BY a.id`,[c.id])).rows;
  if(check.some(r=>Number(r.difference)!==0))throw Error('Stock verification mismatch');
  const repeat=(await db.query('SELECT accountant_v2_sync_stock($1) n',[c.id])).rows[0].n;
  if(repeat!==0)throw Error('Repeat reconciliation changed stock');
  const state=(await db.query('SELECT revision,source_snapshot FROM accountant_v2_stock_control WHERE company_id=$1',[c.id])).rows[0];
  report.companies.push({company:c.name,companyId:c.id,adjustmentJournals:changed,repeatChanges:repeat,accounts:check,products:state.source_snapshot});
 }
 const unbalanced=(await db.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id WHERE j.source_type='STOCK_CONTROL' AND j.company_id=ANY($1::text[]) GROUP BY j.id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`,[companies.map(c=>c.id)])).rows;
 if(unbalanced.length)throw Error('Unbalanced stock adjustment');
 if(apply){await db.query('COMMIT');report.applied=true;}else await db.query('ROLLBACK');
 writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,companies:report.companies.map(({products,...c})=>({...c,products:products.length,withPO:products.filter(p=>p.purchase_order_id).length}))},null,2));
}catch(e){await db.query('ROLLBACK');report.error=e.message;writeFileSync(output,JSON.stringify(report,null,2));throw e;}
finally{db.release();await pool.end();}
