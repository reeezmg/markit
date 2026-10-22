import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createError, createEvent, defineEventHandler, readBody } from 'h3';
import { prisma } from '../server/prisma';

// Explicitly opt in only for the user-confirmed test database. All fixture writes
// use a new company namespace inside a transaction that always rolls back.
assert.ok(process.argv.includes('--test-database'), 'Pass --test-database only for the authorized test environment');
const prefix = `BRANCH_E2E_CREATE_${randomUUID()}`;
const path = 'tests/branch-reports/branch-create-transaction.json';
mkdirSync('tests/branch-reports', { recursive: true });
const report: any = { scope: 'actual branch creation handler; browser login is outside this test',
  prefix, existingRecords: [], steps: [], startedAt: new Date().toISOString(), cleanup: 'pending' };
const save = () => writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
const transaction = prisma.$transaction.bind(prisma);
let createdId: string | undefined;
const rollback = new Error('Run-owned branch fixture rollback');
let failure: unknown;
try {
  const fixture: any[] = await prisma.$queryRawUnsafe(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status=true AND hu.deleted=false
    JOIN companies b ON b.parent_company_id=h.id AND b.status=true
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status=true AND bu.deleted=false
    WHERE h.is_head_office=true AND h.parent_company_id IS NULL AND h.status=true ORDER BY h.id,b.id LIMIT 1`);
  assert.ok(fixture.length, 'Existing authorized head-office/branch admin membership is required');
  const f = fixture[0];
  assert.equal(await prisma.company.count({ where: { name: { startsWith: prefix } } }), 0);
  save(); // Backup before writing: the unique namespace contains no existing records.
  let selectedCompany = f.head;
  Object.assign(globalThis, { eventHandler: defineEventHandler, readBody, createError,
    requireAuthSession: async () => ({ data: { id: f.user_id, companyId: selectedCompany, role: 'admin' } }) });
  const handler = (await import('../server/api/branches/index.post')).default;
  const call = (body: any) => {
    const json = JSON.stringify(body), request: any = Readable.from([Buffer.from(json)]);
    request.method = 'POST'; request.url = '/api/branches';
    request.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)) };
    return handler(createEvent(request, {} as any));
  };
  await assert.rejects(call({ name: ' ' }), (error: any) => error.statusCode === 400);
  report.steps.push('blank branch name rejected before writing'); save();
  await transaction(async tx => {
    // The real handler keeps its transaction boundary, using this rollback-only
    // transaction as its client. No schema or existing company data is changed.
    (prisma as any).$transaction = async (callback: any) => callback(tx);
    try {
      selectedCompany = f.branch;
      await assert.rejects(call({ name: prefix + '_NESTED' }), (error: any) => error.statusCode === 409);
      report.steps.push('branch cannot create a nested branch');
      selectedCompany = f.head;
      const started = Date.now();
      const branch = await call({ name: prefix, city: 'E2E test city', state: 'E2E test state' });
      createdId = branch.id;
      report.durationMs = Date.now() - started;
      assert.ok(report.durationMs < 30000, 'Creation must finish within the handler transaction timeout');
      const company = await tx.company.findUniqueOrThrow({ where: { id: createdId },
        include: { address: true, productinput: true, variantinput: true, pipeline: true } });
      assert.equal(company.parentCompanyId, f.head);
      assert.equal(company.isHeadOffice, false);
      assert.ok(company.address && company.productinput && company.variantinput && company.pipeline);
      const member = await tx.companyUser.findUniqueOrThrow({ where: { companyId_userId: { companyId: company.id, userId: f.user_id } } });
      assert.equal(member.role, 'admin'); assert.ok(member.status && !member.deleted);
      assert.equal(await tx.expenseCategory.count({ where: { companyId: company.id, name: 'Purchase' } }), 1);
      const accounts: any[] = await tx.$queryRawUnsafe('SELECT id,code,account_type FROM accountant_v2_accounting_accounts WHERE company_id=$1', company.id);
      assert.ok(accounts.some(row => row.account_type === 'CASH'));
      assert.ok(accounts.some(row => row.account_type === 'BANK'));
      const settings: any[] = await tx.$queryRawUnsafe(`SELECT 'erp' kind,accounts FROM accountant_v2_erp_settings WHERE company_id=$1
        UNION ALL SELECT 'staff',accounts FROM accountant_v2_user_settings WHERE company_id=$1
        UNION ALL SELECT 'ecommerce',accounts FROM accountant_v2_ecommerce_settings WHERE company_id=$1`, company.id);
      assert.equal(settings.length, 3);
      const ownAccounts = new Set(accounts.map(row => row.id));
      for (const settingsRow of settings) for (const id of Object.values(settingsRow.accounts)) assert.ok(ownAccounts.has(id), 'Default accounts must belong to the new branch');
      report.snapshot = { company, membership: { role: member.role, status: member.status, deleted: member.deleted }, accounts, settings };
      report.steps.push('head office creates branch with address, settings, pipeline and admin membership',
        'Purchase category and branch-owned cash/bank/default account mappings are initialized');
      save();
    } finally { (prisma as any).$transaction = transaction; }
    throw rollback;
  }, { maxWait: 10000, timeout: 60000 }).catch(error => { if (error !== rollback) throw error; });
  report.status = 'passed';
} catch (error: any) {
  failure = error; report.status = 'failed'; report.error = error?.message || String(error);
} finally {
  (prisma as any).$transaction = transaction;
  try {
    assert.equal(await prisma.company.count({ where: { name: { startsWith: prefix } } }), 0);
    if (createdId) {
      const leftovers: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int count FROM accountant_v2_accounting_accounts WHERE company_id=$1`, createdId);
      assert.equal(leftovers[0].count, 0);
      assert.equal(await prisma.companyUser.count({ where: { companyId: createdId } }), 0);
      assert.equal(await prisma.expenseCategory.count({ where: { companyId: createdId } }), 0);
    }
    report.cleanup = 'verified rollback: no run-owned company, membership, expense category or accounts remain';
  } catch (error: any) { failure ||= error; report.status = 'failed'; report.cleanup = 'failed: ' + error.message; }
  report.finishedAt = new Date().toISOString(); save(); await prisma.$disconnect();
}
if (failure) { console.error(report.error || report.cleanup); process.exitCode = 1; }
else console.log('PASS: branch validation, parent ownership, admin membership, defaults and rollback cleanup');
