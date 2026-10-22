import 'dotenv/config';
import { Pool } from 'pg';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

// Inspection only: no schema changes, repairs, imports, or committed writes.
const targets = [
  ['6980e6e4-7d5d-413c-9554-24f385c9b853', 'ORIGINALS CLOTHING'],
  ['1c1feec8-d0fe-432d-911c-ec14ce4f8475', 'Shobika Women Boutique'],
  ['f3f1d8cf-60e2-464d-9416-36e5fad087ec', 'City Center'],
];
const ids = targets.map(t => t[0]);
const path = process.argv.find(a => a.startsWith('--report='))?.slice(9) || '../artifacts/account-source-tally.json';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const db = await pool.connect();
const report = { at: new Date().toISOString(), readOnly: true, companies: [], checks: {}, coverage: {} };
const q = async sql => (await db.query(sql, [ids])).rows;
const active = `active AS (SELECT * FROM accountant_v2_manual_journals WHERE company_id=ANY($1::text[]) AND status='PUBLISHED' AND deleted_at IS NULL)`;
async function check(name, sql) {
  await db.query('SAVEPOINT tally_check');
  try {
    const mismatches = await q(sql);
    report.checks[name] = { passed: mismatches.length === 0, count: mismatches.length, mismatches };
    await db.query('RELEASE SAVEPOINT tally_check');
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT tally_check');
    await db.query('RELEASE SAVEPOINT tally_check');
    report.checks[name] = { passed: false, error: error.message };
  }
  console.log(JSON.stringify({ check: name, passed: report.checks[name].passed, count: report.checks[name].count, error: report.checks[name].error }));
}
async function compare(name, ctes, expected, sources) {
  await check(name, `WITH ${active},${ctes}, expected AS (${expected}), e AS (
    SELECT company_id,source_id,account_id,sum(amount) amount FROM expected GROUP BY 1,2,3
  ), sources AS (${sources}), a AS (
    SELECT s.company_id,s.source_id,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
    FROM sources s JOIN active j ON j.company_id=s.company_id AND j.id=s.journal_id
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3
  ) SELECT coalesce(e.company_id,a.company_id) company_id,coalesce(e.source_id,a.source_id) source_id,coalesce(e.account_id,a.account_id) account_id,
    coalesce(e.amount,0)::text expected,coalesce(a.amount,0)::text actual FROM e FULL JOIN a USING(company_id,source_id,account_id)
    WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`);
}
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid schema');
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("SET LOCAL statement_timeout='60s'");
  await db.query("SET LOCAL lock_timeout='5s'");
  report.companies = await q('SELECT id,name FROM companies WHERE id=ANY($1::text[]) ORDER BY id');
  if (report.companies.length!==3 || report.companies.some(c=>!targets.some(t=>t[0]===c.id && t[1]===c.name))) throw Error('Company identity mismatch');
  report.journals = await q(`WITH ${active} SELECT company_id,source_type,count(*)::int count FROM active GROUP BY 1,2 ORDER BY 1,2`);
  report.trialBalances = await q(`WITH ${active} SELECT j.company_id,count(DISTINCT j.id)::int journals,
    sum(round(l.amount*j.exchange_rate,2)) FILTER(WHERE l.side='DEBIT')::text debit,
    sum(round(l.amount*j.exchange_rate,2)) FILTER(WHERE l.side='CREDIT')::text credit
    FROM active j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1`);
  report.moneySourceDetails=await q(`WITH ${active} SELECT m.company_id,m.id,m.direction,m.payment_mode,m.account_id,m.amount::text,m.note,
    cfg.accounts->>'cash' configured_cash,cfg.accounts->>'bank' configured_bank,j.id journal_id,
    original."after"->>'offsetAccountId' original_offset,
    jsonb_agg(jsonb_build_object('accountId',l.account_id,'account',ac.name,'code',ac.code,'accountType',ac.account_type,'side',l.side,'amount',l.amount)) lines
    FROM money_transactions m JOIN accountant_v2_erp_settings cfg ON cfg.company_id=m.company_id
    JOIN accountant_v2_accountant_audit imp ON imp.company_id=m.company_id AND imp.resource='transaction-history-import' AND imp.action='imported' AND imp."resourceId"=m.id
    JOIN active j ON j.id=imp."after"->>'journalId' AND j.company_id=m.company_id
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
    JOIN accountant_v2_accounting_accounts ac ON ac.id=l.account_id AND ac.company_id=l.company_id
    LEFT JOIN accountant_v2_accountant_audit original ON original.company_id=j.company_id AND original.resource='legacy-cash-bank-import' AND original.action='imported' AND original."resourceId"=j.id
    WHERE m.company_id=ANY($1::text[]) GROUP BY m.company_id,m.id,cfg.accounts,j.id,original."after"`);
  await check('journalBalanceAndHeaderTotal', `WITH ${active} SELECT j.company_id,j.id,j.source_type FROM active j
    LEFT JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY j.company_id,j.id,j.source_type,j.total
    HAVING coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0)<>0
      OR coalesce(sum(l.amount) FILTER(WHERE l.side='DEBIT'),0)<>j.total`);
  await check('tenantAndAccountLinks', `WITH ${active} SELECT j.company_id,j.id journal_id,l.id line_id FROM active j
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.deleted_at IS NULL
    LEFT JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
    WHERE l.company_id<>j.company_id OR a.id IS NULL OR a.company_id<>j.company_id`);
  await check('duplicateSourceIdentifiers', `WITH ${active} SELECT company_id,source_type,source_id,count(*)::int count FROM active
    WHERE source_id IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1`);
  await check('reversalCancellation', `WITH ${active}, pairs AS (
    SELECT r.company_id,r.id rid,o.id oid FROM active r LEFT JOIN active o ON o.company_id=r.company_id AND o.id=r.reversed_from_id
    WHERE r.reversed_from_id IS NOT NULL
  ), totals AS (
    SELECT p.company_id,p.rid,p.oid,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END) amount
    FROM pairs p JOIN active j ON j.id IN (p.rid,p.oid) AND j.company_id=p.company_id
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL GROUP BY 1,2,3,4
  ) SELECT company_id,rid,oid,account_id,amount::text FROM totals WHERE oid IS NULL OR amount<>0`);
  await compare('erpExpectedLines', `src AS (SELECT * FROM accountant_v2_erp_sources WHERE company_id=ANY($1::text[]))`,
    `SELECT s.company_id,s.source_key source_id,s.accounts->>(v->>'role') account_id,(v->>'amount')::numeric amount FROM src s
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.signature->'lines','[]')) v`,
    `SELECT company_id,source_key source_id,journal_id FROM src`);
  await check('erpPositiveSourceCoverage', `SELECT b.company_id,'bill:'||b.id source_id FROM bills b
    WHERE b.company_id=ANY($1::text[]) AND NOT coalesce(b.deleted,false) AND NOT coalesce(b.is_markit,false)
    AND b.type='BILL' AND b.payment_status IN ('PAID','PENDING') AND round(b.grand_total::numeric,2)<>0
    AND NOT EXISTS(SELECT 1 FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
      WHERE s.company_id=b.company_id AND s.source_key='bill:'||b.id)
    UNION ALL SELECT e.company_id,'expense:'||e.id FROM expenses e WHERE e.company_id=ANY($1::text[]) AND e.status::text IN ('PAID','PENDING','UNPAID') AND round(e.total_amount::numeric,2)<>0
    AND NOT EXISTS(SELECT 1 FROM distributor_payments p WHERE p.company_id=e.company_id AND p.expense_id=e.id)
    AND NOT EXISTS(SELECT 1 FROM accountant_v2_erp_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL WHERE s.company_id=e.company_id AND s.source_key='expense:'||e.id)`);
  const supplierCte=`events AS (SELECT e.*,s.accounts,s.journal_id FROM accountant_v2_distributor_events e
    JOIN accountant_v2_distributor_settings cfg ON cfg.company_id=e.company_id AND cfg.distributor_id=e.distributor_id AND cfg.enabled
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key WHERE e.company_id=ANY($1::text[]))`;
  await compare('supplierExpectedLines', supplierCte,
    `SELECT company_id,distributor_id||':'||source_key source_id,accounts->>'payable' account_id,CASE WHEN kind IN ('PAYMENT','RETURN') THEN abs(amount) ELSE -amount END amount FROM events
    UNION ALL SELECT company_id,distributor_id||':'||source_key,accounts->>'stock',CASE WHEN kind='RETURN' THEN -(abs(amount)-tax) ELSE abs(amount)-tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT company_id,distributor_id||':'||source_key,accounts->>'tax',CASE WHEN kind='RETURN' THEN -tax ELSE tax END FROM events WHERE kind IN ('PURCHASE','RETURN')
    UNION ALL SELECT company_id,distributor_id||':'||source_key,CASE WHEN kind='OPENING' THEN accounts->>'opening' WHEN mode='CASH' THEN accounts->>'cash' WHEN bank_id IS NOT NULL THEN accounts->>('bank:'||bank_id) ELSE accounts->>'bank' END,CASE WHEN kind='PAYMENT' THEN -amount ELSE amount END FROM events WHERE kind NOT IN ('PURCHASE','RETURN')`,
    `SELECT company_id,distributor_id||':'||source_key source_id,journal_id FROM events`);
  await check('supplierLiveSignatures', `WITH ${supplierCte} SELECT e.company_id,e.distributor_id,e.source_key FROM events e
    LEFT JOIN accountant_v2_distributor_sources s ON s.company_id=e.company_id AND s.distributor_id=e.distributor_id AND s.source_key=e.source_key
    WHERE s.signature IS DISTINCT FROM jsonb_build_object('source_key',e.source_key,'kind',e.kind,'event_date',e.event_date,'amount',e.amount,'tax',e.tax,'mode',e.mode,'bank_id',e.bank_id,'description',e.description,'reference',e.reference)`);
  const purchaseCte=`state AS (SELECT DISTINCT ON(company_id,"resourceId") company_id,"resourceId" source_id,"after" body
    FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND resource='purchase-order-source-state'
    ORDER BY company_id,"resourceId",("after"->>'revision')::int DESC)`;
  await compare('unassignedPurchaseLines',purchaseCte,
    `SELECT company_id,source_id,body->'accounts'->>'payable' account_id,-(body->'signature'->>'gross')::numeric amount FROM state WHERE body->'signature'->>'kind'='PURCHASE'
    UNION ALL SELECT company_id,source_id,body->'accounts'->>'stock',(body->'signature'->>'gross')::numeric-(body->'signature'->>'tax')::numeric FROM state WHERE body->'signature'->>'kind'='PURCHASE'
    UNION ALL SELECT company_id,source_id,body->'accounts'->>'tax',(body->'signature'->>'tax')::numeric FROM state WHERE body->'signature'->>'kind'='PURCHASE'`,
    `SELECT company_id,source_id,body->>'journalId' journal_id FROM state`);
  await check('positivePurchaseCoverage',`WITH ${active},${purchaseCte} SELECT p.company_id,p.id,p.total_amount::text FROM purchase_orders p
    WHERE p.company_id=ANY($1::text[]) AND p.total_amount>0 AND NOT EXISTS(
      SELECT 1 FROM accountant_v2_distributor_sources s JOIN active j ON j.id=s.journal_id AND j.company_id=s.company_id WHERE s.company_id=p.company_id AND s.source_key='purchase:'||p.id)
    AND NOT EXISTS(SELECT 1 FROM state s JOIN active j ON j.id=s.body->>'journalId' AND j.company_id=s.company_id WHERE s.company_id=p.company_id AND s.source_id=p.id)`);
  await compare('transferLines', `src AS (SELECT t.*,j.id journal_id FROM accountant_v2_account_transfers t LEFT JOIN active j ON j.company_id=t.company_id AND j.source_type='ACCOUNT_TRANSFER' AND j.source_id=t.id WHERE t.company_id=ANY($1::text[]) AND t.deleted_at IS NULL)`,
    `SELECT company_id,id source_id,from_account_id account_id,-amount amount FROM src UNION ALL SELECT company_id,id,to_account_id,amount FROM src`,
    `SELECT company_id,id source_id,journal_id FROM src`);
  await check('transferDatesCurrencyAndTotal', `WITH ${active} SELECT t.company_id,t.id FROM accountant_v2_account_transfers t
    LEFT JOIN active j ON j.company_id=t.company_id AND j.source_type='ACCOUNT_TRANSFER' AND j.source_id=t.id
    WHERE t.company_id=ANY($1::text[]) AND t.deleted_at IS NULL AND (j.id IS NULL OR j.total<>t.amount OR j.journal_date<>t.transfer_date OR j.currency<>t.currency OR j.exchange_rate<>t.exchange_rate)`);
  await check('oldTransferSourceMatch',`SELECT o.company_id,o.id FROM account_transfers o
    LEFT JOIN accountant_v2_accountant_audit a ON a.company_id=o.company_id AND a.resource='transfer-history-import' AND a.action='imported' AND a."resourceId"=o.id
    LEFT JOIN accountant_v2_account_transfers t ON t.company_id=o.company_id AND t.id=a."after"->>'transferId' AND t.deleted_at IS NULL
    WHERE o.company_id=ANY($1::text[]) AND (t.id IS NULL OR t.amount<>round(o.amount::numeric,2) OR t.transfer_date<>o.created_at OR t.reference_number<>o.id)`);
  await check('investmentOriginalSource',`WITH ${active} SELECT e.company_id,e.id FROM accountant_v2_investor_events e
    LEFT JOIN investments i ON i.company_id=e.company_id AND i.id=e.legacy_id LEFT JOIN active j ON j.company_id=e.company_id AND j.id=e.journal_id
    WHERE e.company_id=ANY($1::text[]) AND e.legacy_id IS NOT NULL AND (i.id IS NULL OR i.amount<>e.amount
      OR e.kind<>CASE i.direction WHEN 'IN' THEN 'CAPITAL_IN' ELSE 'CAPITAL_OUT' END
      OR (i.status='COMPLETED' AND (j.id IS NULL OR j.total<>e.amount OR j.journal_date::date<>e.event_date)) OR (i.status='PENDING' AND e.journal_id IS NOT NULL))`);
  await compare('investmentLines',`src AS (SELECT e.*,p.accounts,coalesce(e.details->'mapping'->>'counterAccountId',e.details->>'counterAccountId') counterpart FROM accountant_v2_investor_events e
    JOIN accountant_v2_investors p ON p.company_id=e.company_id AND p.id=e.investor_id WHERE e.company_id=ANY($1::text[]) AND e.journal_id IS NOT NULL AND e.kind IN ('CAPITAL_IN','CAPITAL_OUT','LOAN_IN','LOAN_OUT','PROFIT_ALLOCATE','PROFIT_PAY'))`,
    `SELECT company_id,id source_id,counterpart account_id,CASE WHEN kind IN ('CAPITAL_IN','LOAN_IN','PROFIT_ALLOCATE') THEN amount ELSE -amount END amount FROM src
    UNION ALL SELECT company_id,id,accounts->>CASE WHEN kind LIKE 'CAPITAL%' THEN 'capital' WHEN kind LIKE 'LOAN%' THEN 'loan' ELSE 'profit' END,CASE WHEN kind IN ('CAPITAL_IN','LOAN_IN','PROFIT_ALLOCATE') THEN -amount ELSE amount END FROM src`,
    `SELECT company_id,id source_id,journal_id FROM src`);
  await check('legacyMoneySourceAndCashLeg',`WITH ${active} SELECT m.company_id,m.id FROM money_transactions m
    JOIN accountant_v2_accountant_audit a ON a.company_id=m.company_id AND a.resource='transaction-history-import' AND a.action='imported' AND a."resourceId"=m.id
    LEFT JOIN active j ON j.id=a."after"->>'journalId' AND j.company_id=m.company_id
    WHERE m.company_id=ANY($1::text[]) AND m.status='PAID' AND (j.id IS NULL OR j.total<>round(m.amount::numeric,2) OR j.journal_date<>m.created_at
    OR j.source_id<>m.id OR j.source_type<>CASE m.direction WHEN 'RECEIVED' THEN 'MONEY_RECEIVE' ELSE 'MONEY_PAY' END
    OR (SELECT count(*) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts ac ON ac.id=l.account_id AND ac.company_id=l.company_id
      WHERE l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL AND ac.account_type IN ('CASH','BANK')
      AND l.amount=round(m.amount::numeric,2) AND l.side::text=CASE m.direction WHEN 'RECEIVED' THEN 'DEBIT' ELSE 'CREDIT' END)<>1)`);
  await check('openingBalanceSourceAndLeg',`WITH ${active} SELECT o.company_id,o.id FROM accountant_v2_account_opening_balances o
    LEFT JOIN active j ON j.company_id=o.company_id AND j.id=o.journal_id WHERE o.company_id=ANY($1::text[]) AND o.deleted_at IS NULL AND o.amount<>0
    AND (j.id IS NULL OR j.source_type<>'OPENING_BALANCE' OR j.source_id<>o.account_id OR j.journal_date<>o.as_of_date OR j.currency<>o.currency OR j.exchange_rate<>o.exchange_rate OR j.total<>o.amount
      OR (SELECT coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) FROM accountant_v2_manual_journal_lines l
        WHERE l.journal_id=j.id AND l.company_id=j.company_id AND l.account_id=o.account_id AND l.deleted_at IS NULL)<>CASE o.side WHEN 'DEBIT' THEN o.amount ELSE -o.amount END)`);
  await check('openingBalanceCounterpart',`WITH ${active} SELECT o.company_id,o.id FROM accountant_v2_account_opening_balances o
    JOIN active j ON j.company_id=o.company_id AND j.id=o.journal_id WHERE o.company_id=ANY($1::text[]) AND o.deleted_at IS NULL AND o.amount<>0
    AND ((SELECT count(*) FROM accountant_v2_manual_journal_lines l WHERE l.company_id=j.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL)<>2
      OR (SELECT coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) FROM accountant_v2_manual_journal_lines l
      JOIN accountant_v2_accounting_accounts a ON a.company_id=l.company_id AND a.id=l.account_id AND a.code='2220'
      WHERE l.company_id=j.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL)<>CASE o.side WHEN 'DEBIT' THEN -o.amount ELSE o.amount END)`);
  await check('legacyMoneyAccount',`WITH ${active} SELECT m.company_id,m.id FROM money_transactions m
    JOIN accountant_v2_erp_settings cfg ON cfg.company_id=m.company_id
    JOIN accountant_v2_accountant_audit imp ON imp.company_id=m.company_id AND imp.resource='transaction-history-import' AND imp.action='imported' AND imp."resourceId"=m.id
    JOIN active j ON j.id=imp."after"->>'journalId' AND j.company_id=m.company_id
    LEFT JOIN accountant_v2_accountant_audit original ON original.company_id=j.company_id AND original.resource='legacy-cash-bank-import' AND original.action='imported' AND original."resourceId"=j.id
    WHERE m.company_id=ANY($1::text[]) AND m.status='PAID' AND (
      (SELECT coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) FROM accountant_v2_manual_journal_lines l
        WHERE l.company_id=j.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL
        AND l.account_id=CASE WHEN m.payment_mode='CASH' THEN cfg.accounts->>'cash' WHEN m.account_id IS NULL THEN cfg.accounts->>'bank'
          ELSE (SELECT min(d.account_id) FROM accountant_v2_distributor_mappings d WHERE d.company_id=m.company_id AND d.role='bank:'||m.account_id HAVING count(DISTINCT d.account_id)=1) END)
        <>CASE m.direction WHEN 'RECEIVED' THEN round(m.amount::numeric,2) ELSE -round(m.amount::numeric,2) END
      )`);
  // The original migration offset can be superseded by an explicitly recorded
  // purpose classification. Never infer a loan/revenue/expense from party type.
  const evidencePath='production-accounting/runs/production-2026-10-05/party-purpose-verification.json';
  const evidence=JSON.parse(readFileSync(new URL(evidencePath,import.meta.url),'utf8'));
  if(!evidence.passed || !evidence.committedEvidenceMatchesBackup || !evidence.sourceHashesUnchanged) throw Error('Money purpose evidence is not verified');
  const cents=v=>Math.round(Number(v)*100);
  const purposeMismatches=[];
  report.moneyPurposeEvidence={path:evidencePath,at:evidence.at,committedEvidenceMatchesBackup:true};
  for(const row of report.moneySourceDetails) {
    const known=evidence.money.find(e=>e.companyId===row.company_id && e.sourceId===row.id && e.journalId===row.journal_id
      && e.direction===row.direction && cents(e.amount)===cents(row.amount) && (e.sourceNote||'')===(row.note||'') && e.matched);
    const counter=row.lines.find(l=>l.side===(row.direction==='RECEIVED'?'CREDIT':'DEBIT'));
    const matched=row.lines.length===2 && counter && cents(counter.amount)===cents(row.amount)
      && (known?.purpose ? counter.account===known.purposeAccount : counter.accountId===row.original_offset);
    if(!matched)purposeMismatches.push({company_id:row.company_id,id:row.id,expectedPurpose:known?.purposeAccount||row.original_offset,actualPurpose:counter?.account});
  }
  report.checks.legacyMoneyCounterpart={passed:purposeMismatches.length===0,count:purposeMismatches.length,mismatches:purposeMismatches};
  console.log(JSON.stringify({check:'legacyMoneyCounterpart',passed:purposeMismatches.length===0,count:purposeMismatches.length}));
  await check('unassignedPurchaseLiveSignatures',`WITH ${purchaseCte} SELECT s.company_id,s.source_id FROM state s
    LEFT JOIN purchase_orders p ON p.company_id=s.company_id AND p.id=s.source_id JOIN companies c ON c.id=s.company_id
    WHERE s.body->'signature' IS DISTINCT FROM CASE WHEN p.id IS NOT NULL AND p.distributor_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM distributor_credits dc WHERE dc.company_id=p.company_id AND dc.purchase_order_id=p.id)
    THEN jsonb_build_object('kind','PURCHASE','gross',round(p.total_amount::numeric,2),'tax',accountant_v2_purchase_tax(p),
      'date',p.created_at,'reference',coalesce(p.bill_no,'PO-'||p.purchase_order_no::text,p.id),'currency',c.currency)
    ELSE jsonb_build_object('kind','DELETED') END`);
  await check('stockCurrentValuation',`WITH ${active}, expected AS (
    SELECT cfg.company_id,v->>'account_id' account_id,round(sum((v->>'value')::numeric),2) amount
    FROM accountant_v2_stock_control cfg CROSS JOIN LATERAL jsonb_array_elements(accountant_v2_stock_snapshot(cfg.company_id)) v
    WHERE cfg.company_id=ANY($1::text[]) AND cfg.enabled GROUP BY 1,2
  ), actual AS (
    SELECT j.company_id,l.account_id,round(sum(CASE l.side WHEN 'DEBIT' THEN l.amount*j.exchange_rate ELSE -l.amount*j.exchange_rate END),2) amount
    FROM active j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
    JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id AND a.account_type='STOCK'
    JOIN accountant_v2_stock_control cfg ON cfg.company_id=j.company_id AND cfg.enabled GROUP BY 1,2
  ) SELECT coalesce(e.company_id,a.company_id) company_id,coalesce(e.account_id,a.account_id) account_id,coalesce(e.amount,0)::text expected,coalesce(a.amount,0)::text actual
    FROM expected e FULL JOIN actual a USING(company_id,account_id) WHERE coalesce(e.amount,0)<>coalesce(a.amount,0)`);
  await check('stockAdjustmentAudit',`WITH ${active} SELECT j.company_id,j.id FROM active j
    LEFT JOIN accountant_v2_accountant_audit a ON a.company_id=j.company_id AND a.resource='stock-control' AND a."resourceId"=j.id
    WHERE j.source_type='STOCK_CONTROL' AND (a.id IS NULL OR j.total<>abs((a."after"->>'adjustment')::numeric)
      OR (SELECT coalesce(sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END),0) FROM accountant_v2_manual_journal_lines l
        WHERE l.journal_id=j.id AND l.company_id=j.company_id AND l.account_id=a."after"->>'accountId' AND l.deleted_at IS NULL)<>(a."after"->>'adjustment')::numeric)`);
  await check('untracedActiveJournals',`WITH ${active},${purchaseCte}, known AS (
    SELECT company_id,journal_id id FROM accountant_v2_erp_sources WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,journal_id FROM accountant_v2_distributor_sources WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,journal_id FROM accountant_v2_user_sources WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,body->>'journalId' FROM state
    UNION SELECT t.company_id,j.id FROM accountant_v2_account_transfers t JOIN active j ON j.company_id=t.company_id AND j.source_type='ACCOUNT_TRANSFER' AND j.source_id=t.id WHERE t.deleted_at IS NULL
    UNION SELECT company_id,journal_id FROM accountant_v2_investor_events WHERE company_id=ANY($1::text[])
    UNION SELECT company_id,journal_id FROM accountant_v2_account_opening_balances WHERE company_id=ANY($1::text[]) AND deleted_at IS NULL
    UNION SELECT company_id,CASE WHEN resource='transaction-history-import' THEN "after"->>'journalId' ELSE "resourceId" END
      FROM accountant_v2_accountant_audit WHERE company_id=ANY($1::text[]) AND (
        (resource='transaction-history-import' AND action='imported') OR (resource='money-entry' AND action='created') OR resource='stock-control')
    UNION SELECT r.company_id,r.id FROM active r JOIN active o ON o.company_id=r.company_id AND o.id=r.reversed_from_id
    UNION SELECT r.company_id,r.reversed_from_id FROM active r JOIN active o ON o.company_id=r.company_id AND o.id=r.reversed_from_id
  ) SELECT j.company_id,j.id,j.source_type FROM active j LEFT JOIN known k ON k.company_id=j.company_id AND k.id=j.id WHERE k.id IS NULL`);
  const tables=(await db.query(`SELECT table_name FROM information_schema.columns WHERE table_schema=$1 AND column_name='company_id'
    AND (table_name IN ('salary_payments','user_ledger_entries','purchase_returns','investments','money_transactions','account_transfers','purchase_orders')
    OR table_name LIKE 'accountant_v2_%' OR table_name LIKE '%receipt%' OR table_name LIKE '%ecommerce%') ORDER BY table_name`,[schema])).rows;
  for(const {table_name:table} of tables){
    if(!/^[a-z0-9_]+$/.test(table))throw Error('Invalid identifier');
    const [{count}]=await q(`SELECT count(*)::int count FROM "${table}" WHERE company_id=ANY($1::text[])`);
    report.coverage[table]=count;
  }
  report.passed=Object.values(report.checks).every(c=>c.passed);
  await db.query('ROLLBACK');
} catch(error) { await db.query('ROLLBACK'); report.error=error.message; report.passed=false; }
finally {
  db.release(); await pool.end(); mkdirSync('../artifacts',{recursive:true});
  writeFileSync(path,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,report:path,checks:Object.keys(report.checks).length}));
  if(!report.passed)process.exitCode=1;
}
