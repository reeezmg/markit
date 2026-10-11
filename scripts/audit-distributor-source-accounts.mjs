import dotenv from 'dotenv';
import pg from 'pg';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
dotenv.config({quiet:true});
const company = process.argv.find(a=>a.startsWith('--company='))?.slice(10);
const reportPath = process.argv.find(a=>a.startsWith('--report='))?.slice(9);
if (!company || !reportPath) throw Error('Explicit --company and --report are required');
const client = new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const query = async sql => (await client.query(sql,[company])).rows;
  const purchases = await query(`SELECT p.id,p.purchase_order_no,round(p.total_amount::numeric,2)::text amount,
      e.amount::text event_amount,coalesce(s.journal_id,state.payload->>'journalId') journal_id,
      j.status,j.deleted_at,j.total::text posted
    FROM purchase_orders p
    LEFT JOIN accountant_v2_distributor_events e ON e.company_id=p.company_id AND e.source_key='purchase:'||p.id
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key
    LEFT JOIN LATERAL(SELECT a."after" payload FROM accountant_v2_accountant_audit a WHERE a.company_id=p.company_id
      AND a.resource='purchase-order-source-state' AND a."resourceId"=p.id ORDER BY (a."after"->>'revision')::integer DESC LIMIT 1) state ON true
    LEFT JOIN accountant_v2_manual_journals j ON j.id=coalesce(s.journal_id,state.payload->>'journalId') AND j.company_id=p.company_id
    WHERE p.company_id=$1 AND p.total_amount>0 ORDER BY p.purchase_order_no`);
  const payments = await query(`SELECT p.id,p.payment_no,p.payment_type,round(p.amount::numeric,2)::text amount,
      e.amount::text event_amount,s.journal_id,j.status,j.deleted_at,j.total::text posted
    FROM distributor_payments p
    LEFT JOIN accountant_v2_distributor_events e ON e.company_id=p.company_id AND e.distributor_id=p.distributor_id AND e.source_key='payment:'||p.id
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key
    LEFT JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=p.company_id
    WHERE p.company_id=$1 ORDER BY p.payment_no`);
  const events = await query(`SELECT e.source_key,e.distributor_id,e.kind,e.amount::text amount,s.journal_id,j.status,j.deleted_at,
      coalesce(sum(CASE l.side WHEN 'CREDIT' THEN l.amount ELSE -l.amount END) FILTER(WHERE a.account_type='ACCOUNTS_PAYABLE'),0)::text posted,
      coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)::text imbalance
    FROM accountant_v2_distributor_events e
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key
    LEFT JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=e.company_id
    LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=e.company_id AND l.deleted_at IS NULL
    LEFT JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=e.company_id
    WHERE e.company_id=$1 GROUP BY e.source_key,e.distributor_id,e.kind,e.amount,s.journal_id,j.status,j.deleted_at`);
  const lineMismatches = await query(`WITH events AS (
    SELECT e.*,s.accounts,s.journal_id FROM accountant_v2_distributor_events e
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key WHERE e.company_id=$1
    ), expected AS (
    SELECT distributor_id,source_key,accounts->>'payable' account_id,CASE WHEN kind IN ('PAYMENT','RETURN') THEN amount ELSE -amount END amount FROM events
    UNION ALL SELECT distributor_id,source_key,accounts->>'stock',CASE WHEN kind='RETURN' THEN -(abs(amount)-tax) ELSE abs(amount)-tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT distributor_id,source_key,accounts->>'tax',CASE WHEN kind='RETURN' THEN -tax ELSE tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT distributor_id,source_key,CASE WHEN kind='OPENING' THEN accounts->>'opening' WHEN mode='CASH' THEN accounts->>'cash' WHEN bank_id IS NOT NULL THEN accounts->>('bank:'||bank_id) ELSE accounts->>'bank' END,CASE WHEN kind='PAYMENT' THEN -amount ELSE amount END FROM events WHERE kind NOT IN ('PURCHASE','RETURN')
    ), totals AS(SELECT distributor_id,source_key,account_id,sum(amount) amount FROM expected GROUP BY 1,2,3), actual AS(
    SELECT e.distributor_id,e.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
    FROM events e JOIN accountant_v2_manual_journals j ON j.id=e.journal_id AND j.company_id=e.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3
    ) SELECT coalesce(e.source_key,a.source_key) source_key,coalesce(e.account_id,a.account_id) account_id,e.amount expected,a.amount actual
    FROM totals e FULL JOIN actual a USING(distributor_id,source_key,account_id) WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`);
  const unlinked = await query(`SELECT j.id,j.entry_number,j.source_type FROM accountant_v2_manual_journals j
    WHERE j.company_id=$1 AND (j.source_type IN ('DISTRIBUTOR','DISTRIBUTOR_REVERSAL') OR EXISTS(
      SELECT 1 FROM accountant_v2_manual_journal_lines l WHERE l.journal_id=j.id AND l.distributor_id IS NOT NULL))
    AND NOT EXISTS(SELECT 1 FROM accountant_v2_distributor_sources s JOIN accountant_v2_distributor_events e
      ON e.company_id=s.company_id AND e.distributor_id=s.distributor_id AND e.source_key=s.source_key
      WHERE s.company_id=j.company_id AND s.journal_id=j.id)`);
  const balances = await query(`WITH expected AS(SELECT distributor_id,sum(CASE WHEN kind IN ('PAYMENT','RETURN') THEN -amount ELSE amount END) balance
    FROM accountant_v2_distributor_events WHERE company_id=$1 GROUP BY distributor_id), posted AS(
    SELECT l.distributor_id,sum(CASE l.side WHEN 'CREDIT' THEN l.amount ELSE -l.amount END) balance
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
    WHERE l.company_id=$1 AND a.account_type='ACCOUNTS_PAYABLE' AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.distributor_id)
    SELECT d.distributor_id,coalesce(e.balance,0)::text source,coalesce(p.balance,0)::text posted FROM distributor_companies d
    LEFT JOIN expected e USING(distributor_id) LEFT JOIN posted p USING(distributor_id) WHERE d.company_id=$1`);
  // Validate the actual API reference query without executing any writes or schema changes.
  const api = readFileSync(new URL('../server/utils/accountant/distributors.ts',import.meta.url),'utf8');
  const referenceSql = api.match(/const events = await query\(`([\s\S]*?)`,companyId,id\);/)?.[1];
  if (!referenceSql) throw Error('API reference query not found');
  const references=[];
  for (const supplier of balances) references.push(...(await client.query(referenceSql,[company,supplier.distributor_id])).rows);
  const invalid = r=>!r.journal_id || r.status!=='PUBLISHED' || r.deleted_at || Number(r.posted)!==Number(r.amount)
    || (r.event_amount!=null && Number(r.event_amount)!==Number(r.amount));
  const issues={purchases:purchases.filter(invalid),payments:payments.filter(invalid),
    events:events.filter(r=>!r.journal_id||r.status!=='PUBLISHED'||r.deleted_at||Number(r.imbalance)!==0
      ||Number(r.posted)!==Number(r.amount)*(['PAYMENT','RETURN'].includes(r.kind)?-1:1)),
    lineMismatches,unlinked,balances:balances.filter(r=>Number(r.source)!==Number(r.posted)),
    references:references.filter(r=>!r.source_reference||r.source_reference.startsWith('DIST-'))};
  const report={company,checkedAt:new Date().toISOString(),readOnly:true,
    counts:{purchases:purchases.length,payments:payments.length,events:events.length,distributors:balances.length},
    purchases,payments,events,balances,references,issues,passed:Object.values(issues).every(r=>r.length===0)};
  await client.query('ROLLBACK');
  mkdirSync(dirname(resolve(reportPath)),{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({counts:report.counts,issues,passed:report.passed,report:resolve(reportPath)},null,2));
  if(!report.passed)process.exitCode=1;
} finally {await client.query('ROLLBACK');await client.end();}
