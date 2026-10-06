import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ quiet: true } as any);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; this test creates and removes its own isolated schema');
const url = new URL(process.env.DATABASE_URL);
const schema = `accountant_test_${randomUUID().replaceAll('-', '')}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const connection = await pool.connect();
let db: any;
try {
  await connection.query(`CREATE SCHEMA "${schema}"`);
  await connection.query('BEGIN');
  await connection.query(`SET LOCAL search_path TO "${schema}"`);
  await connection.query('CREATE TABLE companies (id text PRIMARY KEY, currency text NOT NULL DEFAULT \'INR\')');
  await connection.query(readFileSync(new URL('../prisma/migrations/20260926120000_accountant_v2/migration.sql', import.meta.url), 'utf8'));
  // The distributor integration adds this optional dimension to every journal line.
  await connection.query('ALTER TABLE accountant_v2_manual_journal_lines ADD COLUMN distributor_id text, ADD COLUMN source_parties jsonb');
  await connection.query("INSERT INTO companies(id) VALUES ('company-a'), ('company-b')");
  await connection.query('COMMIT');
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const { prisma: generated } = await import('../server/prisma');
  db = generated;
  const { runAccountant, accountantPrisma: prisma } = await import('../server/utils/accountant/context');
  const { accountingAccountRouter: accounts } = await import('../server/utils/accountant/accounts');
  const { manualJournalRouter: journals } = await import('../server/utils/accountant/journals');
  const { accountTransferRouter: transfers } = await import('../server/utils/accountant/transfers');
  const { accountantManagementRouter: management } = await import('../server/utils/accountant/management');
  const { directoryRouter: directory } = await import('../server/utils/accountant/directories');
  const { balancedTotal } = await import('../server/utils/accountant/posting');
  const { rbac } = await import('../server/utils/accountant/router');
  let companyId = 'company-a', userId = 'admin-a', role = 'admin';
  async function call(router: any, method: string, path: string, body: any = {}, query = {}) {
    const identity = { companyId, userId, role };
    return runAccountant(identity, async () => {
      let result: any;
      const res = { json(data: any) { result = data; return res; }, status() { return res; } };
      const req = { user: identity, body, query, params: {} };
      await rbac('ACCOUNT', 'READ')(req, res);
      await router.dispatch(method, path, req, res);
      return result;
    });
  }
  const listed = await call(accounts, 'GET', '/');
  assert.ok(listed.data.length >= 18);
  const cash = listed.data.find((a: any) => a.name === 'Petty Cash');
  const sales = listed.data.find((a: any) => a.name === 'Sales');
  const expense = listed.data.find((a: any) => a.name === 'General Expenses');
  const bank = await call(accounts, 'POST', '/', { name: 'Test Bank', accountType: 'BANK', openingBalance: 100, openingBalanceDate: '2026-04-01' });
  const lines = [{ accountId: cash.id, side: 'DEBIT', amount: 10.25 }, { accountId: sales.id, side: 'CREDIT', amount: 10.25 }];
  const body = { journalDate: '2026-05-01', notes: 'Test sale', lines, status: 'PUBLISHED' };
  assert.throws(() => balancedTotal([{ side: 'DEBIT', amount: 0.001 }, { side: 'CREDIT', amount: 0.001 }]));
  await assert.rejects(call(journals, 'POST', '/', { ...body, lines: [lines[0], { ...lines[1], amount: 11 }] }));
  const j = await call(journals, 'POST', '/', body);
  assert.equal(j.status, 'PUBLISHED');
  assert.equal((await call(accounts, 'GET', `/${cash.id}/ledger`)).debitTotal, 10.25);
  await assert.rejects(call(journals, 'PATCH', `/${j.id}`, body));
  const reverse = await call(journals, 'POST', `/${j.id}/reverse`, { journalDate: '2026-05-02' });
  assert.equal(reverse.reversedFromId, j.id);
  await assert.rejects(call(journals, 'POST', `/${j.id}/reverse`, { journalDate: '2026-05-03' }));
  assert.equal((await call(accounts, 'GET', `/${cash.id}/ledger`)).closingBalance, 0);
  const draft = await call(journals, 'POST', '/', { ...body, status: 'DRAFT' });
  await call(journals, 'DELETE', `/${draft.id}`);
  const next = await call(journals, 'POST', '/', { ...body, status: 'DRAFT' });
  assert.notEqual(next.entryNumber, draft.entryNumber);

  companyId = 'company-b';
  await call(accounts, 'GET', '/');
  await assert.rejects(call(accounts, 'GET', `/${bank.id}/ledger`));
  await assert.rejects(call(journals, 'POST', '/', body));
  await assert.rejects(call(journals, 'GET', `/${j.id}`));
  await assert.rejects(call(accounts, 'PATCH', `/${bank.id}`, { name: 'Stolen' }));
  companyId = 'company-a';
  role = 'biller';
  await assert.rejects(call(accounts, 'GET', '/'));
  role = 'admin';

  const transfer = await call(transfers, 'POST', '/', { transferDate: '2026-05-05', fromAccountId: bank.id, toAccountId: cash.id, amount: 20 });
  assert.equal((await call(accounts, 'GET', `/${bank.id}/ledger`)).closingBalance, 80);
  await call(transfers, 'PATCH', `/${transfer.id}`, { transferDate: '2026-05-05', fromAccountId: bank.id, toAccountId: cash.id, amount: 30 });
  assert.equal((await call(accounts, 'GET', `/${bank.id}/ledger`)).closingBalance, 70);
  await db.accountantAudit.create({data:{companyId,userId,action:'imported',resource:'transfer-history-import',resourceId:'legacy-transfer',after:{transferId:transfer.id}}});
  assert.equal((await call(transfers,'GET','/')).data.find((r:any)=>r.id===transfer.id).imported,true);
  await assert.rejects(call(transfers,'PATCH',`/${transfer.id}`,{transferDate:'2026-05-05',fromAccountId:bank.id,toAccountId:cash.id,amount:99}),/preserved as history/);
  await assert.rejects(call(transfers,'DELETE',`/${transfer.id}`),/preserved as history/);
  await db.accountantAudit.deleteMany({where:{companyId,resource:'transfer-history-import'}});
  await call(transfers, 'DELETE', `/${transfer.id}`);
  assert.equal((await call(accounts, 'GET', `/${bank.id}/ledger`)).closingBalance, 100);
  await call(management, 'POST', '/opening-balances', { accountId: bank.id, asOfDate: '2026-04-01', side: 'DEBIT', amount: 150 });
  await call(management, 'POST', '/opening-balances', { accountId: bank.id, asOfDate: '2026-04-01', side: 'DEBIT', amount: 175 });
  assert.equal((await call(accounts, 'GET', `/${bank.id}/ledger`)).closingBalance, 175);

  const pref = { recurringChildStatus: 'DRAFT', allowThirteenthMonth: true, journalApprovalType: 'SIMPLE', allowSelfApproval: false, fyStartMonth: 4 };
  await call(management, 'PUT', '/preferences', pref);
  await assert.rejects(call(journals, 'POST', '/', body));
  await assert.rejects(call(journals, 'POST', `/${next.id}/publish`));
  await assert.rejects(call(journals, 'POST', `/${next.id}/approve`));
  userId = 'approver';
  await call(journals, 'POST', `/${next.id}/approve`);
  await call(journals, 'POST', `/${next.id}/publish`);
  userId = 'admin-a';
  await call(management, 'PUT', '/preferences', { ...pref, journalApprovalType: 'NONE' });
  await call(management, 'POST', '/journal-templates', { name: 'Test template', lines });
  const recurring = await call(management, 'POST', '/recurring-journals', { profileName: 'Monthly', frequency: 'MONTHLY', startDate: '2026-06-01', lines });
  const child = await call(management, 'POST', `/recurring-journals/${recurring.id}/generate`);
  assert.equal(child.status, 'DRAFT');
  await call(journals, 'POST', `/${child.id}/publish`);
  const budget = await call(management, 'POST', '/budgets', { name: 'Annual', fiscalYear: 2026, periodType: 'YEARLY', allocations: [{ accountId: sales.id, periods: [1000] }] });
  assert.ok((await call(management, 'GET', `/budgets/${budget.id}/actual`)).actual[sales.id].reduce((a: number, b: number) => a + b, 0) > 0);

  const assetAccount = await call(accounts, 'POST', '/', { name: 'Equipment', accountType: 'FIXED_ASSET' });
  const accumulated = await call(accounts, 'POST', '/', { name: 'Accumulated depreciation', accountType: 'FIXED_ASSET' });
  const category = await call(management, 'POST', '/asset-categories', { name: 'Equipment', assetAccountId: assetAccount.id, accumulatedDepAccountId: accumulated.id, depreciationExpenseAccountId: expense.id, usefulLifeMonths: 12 });
  const asset = await call(management, 'POST', '/fixed-assets', { categoryId: category.id, name: 'Desk', purchaseDate: '2026-04-01', availableForUseDate: '2026-04-01', purchaseCost: 120, usefulLifeMonths: 12 });
  await call(management, 'POST', `/fixed-assets/${asset.id}/depreciate`, { date: '2026-04-30' });
  await assert.rejects(call(management, 'POST', `/fixed-assets/${asset.id}/depreciate`, { date: '2026-04-30' }));
  const disposal = await call(management, 'POST', `/fixed-assets/${asset.id}/dispose`, { disposalDate: '2026-05-10', disposalMethod: 'SALE', proceeds: 100, proceedsAccountId: cash.id, gainLossAccountId: expense.id });
  assert.equal(Number(disposal.gainLoss), -10);
  const adjustment = await call(management, 'POST', '/currency-adjustments', { adjustmentDate: '2026-06-01', adjustmentType: 'CURRENCY_REVALUATION', currency: 'USD', exchangeRate: 80, accountId: bank.id, gainLossAccountId: sales.id, foreignBalance: 1, baseBalanceBefore: 75, publish: true });
  assert.ok(adjustment.journalId);
  const currencyDraft = await call(management, 'POST', '/currency-adjustments', { adjustmentDate: '2026-06-02', adjustmentType: 'BASE_CURRENCY', currency: 'USD', exchangeRate: 80, accountId: bank.id, gainLossAccountId: sales.id, foreignBalance: 1, baseBalanceBefore: 79 });
  assert.equal(currencyDraft.status, 'DRAFT');
  assert.equal((await call(management, 'POST', `/currency-adjustments/${currencyDraft.id}/publish`)).status, 'POSTED');
  await assert.rejects(call(management, 'POST', `/currency-adjustments/${currencyDraft.id}/publish`));
  const beforeFx = (await call(accounts, 'GET', `/${cash.id}/ledger`)).closingBalance;
  await call(journals, 'POST', '/', { ...body, journalDate: '2026-06-03', currency: 'USD', exchangeRate: 80 });
  assert.equal((await call(accounts, 'GET', `/${cash.id}/ledger`)).closingBalance, beforeFx + 820);
  const periodLedger = await call(accounts, 'GET', `/${bank.id}/ledger`, {}, { from: '2026-05-01' });
  assert.equal(periodLedger.closingBalance, 181); // 175 opening + 5 revaluation + 1 adjustment.
  const endMonth = await call(management, 'POST', '/recurring-journals', { profileName: 'Month end', frequency: 'MONTHLY', startDate: '2027-01-31', lines });
  await call(management, 'POST', `/recurring-journals/${endMonth.id}/generate`);
  const recurringRows = await call(management, 'GET', '/recurring-journals');
  assert.equal(recurringRows.data.find((r: any) => r.id === endMonth.id).nextRunDate.toISOString().slice(0, 10), '2027-02-28');
  await call(management, 'POST', '/thirteenth-month-journals', { fiscalYear: 2026, journalDate: '2027-03-31', notes: 'Year end', lines });
  const contact = await call(directory, 'POST', '/parties', { name: 'New accounting client' });
  await call(management, 'POST', '/clients', { partyId: contact.id, serviceType: 'BOOKKEEPING', accessLevel: 'ACCOUNTANT', fiscalYearEndMonth: 3 });
  await call(management, 'POST', '/bulk-update/accounts', { accountIds: [bank.id], showOnDashboard: true });
  const lock = await call(management, 'POST', '/transaction-locks', { module: 'ALL', lockDate: '2026-06-30', reason: 'Period closed' });
  await assert.rejects(call(journals, 'POST', '/', body));
  await assert.rejects(call(accounts, 'PATCH', `/${bank.id}`, { openingBalance: 0 }));
  await assert.rejects(call(transfers, 'POST', '/', { transferDate: '2026-05-05', fromAccountId: bank.id, toAccountId: cash.id, amount: 20 }));
  await call(management, 'POST', `/transaction-locks/${lock.id}/unlock`, { reason: 'Testing unlock' });
  // All published journals must remain balanced after the full set of workflows.
  await runAccountant({ companyId, userId, role }, async () => {
    const posted = await prisma.manualJournal.findMany({ where: { status: 'PUBLISHED' }, include: { lines: { where: { deletedAt: null } } } });
    for (const journal of posted) balancedTotal(journal.lines);
  });
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => call(journals, 'POST', '/', body)));
  assert.equal(new Set(concurrent.map(j => j.entryNumber)).size, 5);
  console.log('Accountant integration passed: isolation, journals, approvals, openings, transfers, recurring, budgets, assets, currency, clients, locks and concurrent numbering.');
} finally {
  if (db) await db.$disconnect();
  await connection.query('ROLLBACK');
  // The only cleanup target is the random schema created above, never an application schema.
  if (!/^accountant_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Invalid test cleanup target');
  await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  connection.release();
  await pool.end();
}
