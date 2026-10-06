import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';
const dir=process.env.ACCOUNTING_REVIEW_DIR;
if(!dir)throw Error('ACCOUNTING_REVIEW_DIR is required');
const before=JSON.parse(fs.readFileSync(`${dir}/persisted-before.json`,'utf8'));
const after=JSON.parse(fs.readFileSync(`${dir}/persisted-after.json`,'utf8'));
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),db=await pool.connect();
try {
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query('SET LOCAL search_path TO public');
 // Fingerprint timestamps are recorded after scanning: include activity during
 // the initial scan by using the new run directory's creation as a lower bound.
 const runStartedAt=fs.statSync(dir).birthtime.toISOString();
 const activityFrom=runStartedAt<before.at?runStartedAt:before.at;
 const dates=[activityFrom,after.at];
 const condition="updated_at >= $1::timestamptz AT TIME ZONE 'UTC' AND updated_at <= $2::timestamptz AT TIME ZONE 'UTC'";
 const bills=(await db.query(`SELECT b.id,c.name AS company,b.invoice_number,b.grand_total,b.payment_method,b.deleted,b.created_at::text,b.updated_at::text
   FROM bills b JOIN companies c ON c.id=b.company_id WHERE ${condition.replaceAll('updated_at','b.updated_at')} ORDER BY b.updated_at`,dates)).rows;
 const entries=(await db.query(`SELECT e.id,b.invoice_number,c.name AS company,e.qty,e.rate,e.value
   FROM entries e JOIN bills b ON b.id=e.bill_id JOIN companies c ON c.id=b.company_id
   WHERE ${condition.replaceAll('updated_at','b.updated_at')} ORDER BY b.updated_at,e.id`,dates)).rows;
 const ledger=(await db.query(`SELECT l.id,c.name AS company,l.source_id,l.source_type,l.amount,l.account_type,l.direction,l.balance_after,l.created_at::text,l.updated_at::text
   FROM account_ledger_entries l JOIN companies c ON c.id=l.company_id WHERE ${condition.replaceAll('updated_at','l.updated_at')} ORDER BY l.updated_at`,dates)).rows;
 const native=(await db.query(`SELECT s.source_key,s.journal_id,s.signature,s.accounts,l.account_id,a.account_type::text,l.side,l.amount::text
   FROM accountant_v2_erp_sources s LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=s.journal_id
   LEFT JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
   WHERE s.source_key=ANY($1::text[]) ORDER BY s.source_key,l.account_id`,[bills.map(b=>'bill:'+b.id)])).rows;
 const result={at:new Date().toISOString(),window:{activityFrom,fingerprintCompletedBefore:before.at,after:after.at},method:'Read-only inspection of bills/legacy ledger updated during the run, including the initial fingerprint scan. The run directory creation is an inclusive lower bound; activity in that initial scan is not necessarily absent from its baseline snapshot. Entries have no update timestamp: shown entries belong to those bills, not necessarily each changed. Baseline hashes do not include prior row contents, so exact changed fields cannot be reconstructed from this report alone.',bills,entries,ledger,native};
 fs.writeFileSync(`${dir}/source-activity.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await db.query('ROLLBACK');db.release();await pool.end();}
