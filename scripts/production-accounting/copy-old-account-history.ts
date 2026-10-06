import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { accountantContext } from '../../server/utils/accountant/context';
import { importInvestors, planInvestorImport } from '../../server/utils/accountant/investor-import';
import { prisma } from '../../server/prisma';
import { importTransfers } from './lib/import-transfers.mjs';
import { importTransactions } from './lib/import-transactions.mjs';
import { copyTransfersBatch } from './lib/copy-transfers-batch.mjs';

const ORIGINALS = '6980e6e4-7d5d-413c-9554-24f385c9b853';
const args = process.argv.slice(2);
const get = (k: string) => args.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
if (args.includes('--help')) {
  console.log('node --import tsx scripts/production-accounting/copy-old-account-history.ts --company=ID --through=YYYY-MM-DD [--only=transfers|transactions|investments] [--reset] [--apply] [--mappings=FILE] [--backup=FILE] [--report=FILE] [--verify]');
  process.exit(0);
}
for (const a of args) if (!['--reset','--apply','--verify','--plan','--migration-clearing'].includes(a) && !['company','through','only','mappings','backup','report','time-zone'].some(k => a.startsWith(`--${k}=`))) throw Error(`Unknown option ${a}`);
const companies = args.filter(a => a.startsWith('--company=')).map(a => a.slice(10));
const through = get('through')!;
const only = get('only');
const reset = args.includes('--reset'), apply = args.includes('--apply'), verify = args.includes('--verify');
if (!companies.length || new Set(companies).size !== companies.length || !/^\d{4}-\d{2}-\d{2}$/.test(through || '') || new Date(through).toISOString().slice(0,10) !== through) throw Error('Explicit companies and valid --through date required');
if (only && !['transfers','transactions','investments'].includes(only)) throw Error('Invalid --only');
if (reset && (companies.length !== 1 || companies[0] !== ORIGINALS || only)) throw Error('--reset is authorized only for all three areas of ORIGINALS CLOTHING');
if (verify && (reset || apply || only !== 'transfers')) throw Error('--verify supports transfers only, without reset/apply');
if (args.includes('--plan') && (reset || apply || only !== 'investments')) throw Error('--plan supports investments only without reset/apply');
if (reset && apply && !get('backup')) throw Error('--backup is required for reset application');
const mappings = get('mappings') ? JSON.parse(readFileSync(get('mappings')!, 'utf8')) : {};
const json = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2) + '\n';
const rollback = new Error('Preview rollback');
let report: any = { applied: false, reset, companies: [] };
try {
  // All companies, deletion and all three imports share one transaction.
  await prisma.$transaction(async tx => {
    const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') || 'public';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid schema');
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='15s'");
    if (!verify) await tx.$executeRawUnsafe('LOCK TABLE account_transfers, money_transactions, investments IN SHARE ROW EXCLUSIVE MODE');
    for (const companyId of [...companies].sort()) {
      await tx.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE', companyId);
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))", companyId);
      await accountantContext.run({ companyId, userId: 'copy-old-account-history', role: 'admin', db: tx }, async () => {
        const db = { query: async (sql: string, values: any[] = []) => {
          // pg infers numeric string parameters from the SQL target; Prisma binds
          // strings as text. Send decimal parameters as numbers to the pg engines.
          values = values.map(value => typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value);
          if (/^\s*SELECT\s+(pg_advisory_xact_lock|accountant_v2_distributor_check_date)\(/i.test(sql)) { await tx.$executeRawUnsafe(sql, ...values); return { rows: [], rowCount: 0 }; }
          if (/^\s*(SELECT|WITH|INSERT.*RETURNING)/is.test(sql)) { const rows: any = await tx.$queryRawUnsafe(sql, ...values); return { rows, rowCount: rows.length }; }
          const rowCount = await tx.$executeRawUnsafe(sql, ...values); return { rows: [], rowCount };
        }};
        const r: any = { companyId };
        const company = (await db.query('SELECT id,name FROM companies WHERE id=$1', [companyId])).rows[0];
        if (!company || (reset && company.name !== 'ORIGINALS CLOTHING')) throw Error('Company target does not match authorized rebuild');
        r.companyName = company.name;
        const config = mappings[companyId] || mappings;
        if (reset) {
          const backup: any = { companyId, capturedAt: new Date().toISOString(), tables: {} };
          for (const table of ['account_transfers','money_transactions','investments','accountant_v2_accounting_accounts','accountant_v2_account_transfers','accountant_v2_investor_events','accountant_v2_investors','accountant_v2_investor_terms','accountant_v2_manual_journals','accountant_v2_manual_journal_lines','accountant_v2_accountant_audit']) backup.tables[table] = (await db.query(`SELECT * FROM ${table} WHERE company_id=$1 ORDER BY id`, [companyId])).rows;
          for (const table of ['account_transfers','money_transactions','investments']) if (backup.tables[table].some((row: any) => new Date(row.created_at).toISOString().slice(0,10) > through)) throw Error('Reset cutoff would omit old source rows');
          const oldSources = json([backup.tables.account_transfers,backup.tables.money_transactions,backup.tables.investments]);
          // Include reused cash-history money journals, native entries and all descendants.
          const targets = await db.query(`WITH RECURSIVE chosen AS (
            SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND (
              source_type IN ('ACCOUNT_TRANSFER','TRANSFER_HISTORY_MIGRATION_REVERSAL','MONEY_RECEIVE','MONEY_PAY','MONEY_REVERSAL','LEGACY_MONEY_RECEIVE','LEGACY_MONEY_PAY','INVESTOR','INVESTOR_REVERSAL','LEGACY_INVESTOR')
              OR id IN (SELECT journal_id FROM accountant_v2_investor_events WHERE company_id=$1)
              OR id IN (SELECT "after"->>'journalId' FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='transaction-history-import')
              OR (source_type='LEGACY_CASH_BANK_HISTORY' AND reference_number LIKE 'MONEY_TRANSACTION:%'))
            UNION SELECT j.id FROM accountant_v2_manual_journals j JOIN chosen c ON j.reversed_from_id=c.id WHERE j.company_id=$1
          ) SELECT j.* FROM accountant_v2_manual_journals j JOIN chosen c ON c.id=j.id WHERE j.company_id=$1`, [companyId]);
          const locked = await db.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_transaction_locks l ON l.company_id=j.company_id AND l.is_locked AND l.deleted_at IS NULL AND l.module IN ('ALL','ACCOUNTS','BANKING') AND j.journal_date<=l.lock_date WHERE j.company_id=$1 AND j.id=ANY($2::text[]) LIMIT 1`, [companyId, targets.rows.map((j: any) => j.id)]);
          if (locked.rowCount) throw Error('Rebuild touches a locked accounting date');
          backup.deletedJournalIds = targets.rows.map((j: any) => j.id);
          if (get('backup')) writeFileSync(get('backup')!, json(backup), { flag: 'wx' });
          const ids = backup.deletedJournalIds;
          await db.query('DELETE FROM accountant_v2_investor_events WHERE company_id=$1', [companyId]);
          await db.query('DELETE FROM accountant_v2_account_transfers WHERE company_id=$1', [companyId]);
          await db.query('DELETE FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=ANY($2::text[])', [companyId, ids]);
          // Move import metadata into the durable backup; keep unrelated audit history.
          await db.query(`DELETE FROM accountant_v2_accountant_audit WHERE company_id=$1 AND (resource IN ('transfer-history-import','transaction-history-import','investor-history','investor-profit-batch') OR (resource='legacy-cash-bank-import' AND "resourceId"=ANY($2::text[])))`, [companyId, ids]);
          r.deleted = { transfers: backup.tables.accountant_v2_account_transfers.length, investorEvents: backup.tables.accountant_v2_investor_events.length, journals: ids.length };
          r.sourceCounts = { transfers: backup.tables.account_transfers.length, transactions: backup.tables.money_transactions.length, investments: backup.tables.investments.length };
          r.originalSources = oldSources;
        }
        if (!only || only === 'transactions') {
          console.error('Copying and checking old money transactions');
          r.transactions = await importTransactions(db, companyId, { through, mappings: config.transactions || (only ? config : {}), clearing: true });
          const repeat = await importTransactions(db, companyId, { through, mappings: config.transactions || (only ? config : {}), clearing: true });
          if (repeat.created || repeat.reused || repeat.balanceChanges.length) throw Error('Transaction repeat changed accounting');
        }
        if (!only || only === 'transfers') {
          console.error('Copying and checking old account transfers');
          r.transfers = reset
            ? await copyTransfersBatch(db, companyId, { through, mappings: config.transfers || {} })
            : await importTransfers(db, companyId, { through, mappings: config.transfers || (only ? config : {}), verifyOnly: verify });
          if (!verify && !reset) {
            const repeat = await importTransfers(db, companyId, { through, mappings: config.transfers || (only ? config : {}) });
            if (repeat.created || repeat.replacedJournals || repeat.balanceChanges.length) throw Error('Transfer repeat changed accounting');
          }
        }
        if (!only || only === 'investments') {
          console.error('Copying and checking old investments');
          if (args.includes('--plan')) { r.investments = await planInvestorImport(through); report.companies.push(r); return; }
          const source: any = await tx.$queryRawUnsafe('SELECT * FROM investments WHERE company_id=$1 ORDER BY created_at,id', companyId);
          const settings: any = await tx.$queryRawUnsafe('SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1 AND enabled', companyId);
          if (!settings.length) throw Error('Connect ERP accounting first');
          const investmentMappings: any = config.investments || (only ? config : {});
          for (const row of source) if (row.status === 'COMPLETED' && !investmentMappings[row.id]) {
            if (!['CASH','BANK','UPI','CARD','CHEQUE'].includes(row.payment_mode)) throw Error('Unsupported investment payment mode');
            investmentMappings[row.id] = { counterAccountId: settings[0].accounts[row.payment_mode === 'CASH' ? 'cash' : 'bank'] };
          }
          r.investments = await importInvestors(through, investmentMappings, get('time-zone') || 'Asia/Kolkata');
          if ((await importInvestors(through, investmentMappings, get('time-zone') || 'Asia/Kolkata')).created) throw Error('Investment repeat changed accounting');
        }
        if (reset) {
          const source = [];
          for (const table of ['account_transfers','money_transactions','investments']) source.push((await db.query(`SELECT * FROM ${table} WHERE company_id=$1 ORDER BY id`,[companyId])).rows);
          if (json(source) !== r.originalSources) throw Error('Old source rows changed');
          delete r.originalSources;
          const transferMismatch = await db.query(`SELECT t.id FROM account_transfers t LEFT JOIN accountant_v2_account_transfers n ON n.company_id=t.company_id AND n.reference_number=t.id WHERE t.company_id=$1 AND (n.id IS NULL OR n.amount<>round(t.amount::numeric,2) OR n.transfer_date<>t.created_at OR n.deleted_at IS NOT NULL)`, [companyId]);
          const investmentMismatch = await db.query(`SELECT i.id FROM investments i LEFT JOIN accountant_v2_investor_events e ON e.company_id=i.company_id AND e.legacy_id=i.id WHERE i.company_id=$1 AND (e.id IS NULL OR e.amount<>round(i.amount::numeric,2) OR e.kind<>CASE i.direction WHEN 'IN' THEN 'CAPITAL_IN' ELSE 'CAPITAL_OUT' END OR (i.status='COMPLETED' AND e.journal_id IS NULL) OR (i.status='PENDING' AND e.journal_id IS NOT NULL))`, [companyId]);
          if (transferMismatch.rowCount || investmentMismatch.rowCount) throw Error('Rebuilt records do not match all original sources');
          r.verified = { allTransfersMatch: true, allInvestmentsMatch: true, originalSourcesUnchanged: true };
          await db.query(`INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES($1,$2,'copy-old-account-history','rebuilt','account-history-rebuild',$1,$3::jsonb,now())`, [randomUUID(),companyId,json({ backup: get('backup'), through, deleted: r.deleted })]);
        }
        const unbalanced = await db.query(`SELECT j.id FROM accountant_v2_manual_journals j JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY j.id HAVING sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)<>0`, [companyId]);
        if (unbalanced.rowCount) throw Error('Unbalanced published journals');
        report.companies.push(r);
      });
    }
    if (!apply) throw rollback;
  }, { maxWait: 15000, timeout: 1800000 });
  report.applied = true;
} catch (e: any) {
  if (e !== rollback) { report.error = e.message; process.exitCode = 1; }
} finally {
  await prisma.$disconnect();
  writeFileSync(get('report') || 'old-account-history-report.json', json(report));
  console.log(json(report));
}
