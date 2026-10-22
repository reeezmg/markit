import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { prisma } from '../server/prisma';
import { context, runAccountant } from '../server/utils/accountant/context';
import { provisionCompanyAccountDefaults } from '../server/utils/accountant/company-account-defaults';
import { prismaSqlClient } from '../server/utils/prisma-sql-client';
import { enableErpAccounting } from '../server/utils/accountant/erp';
import { enableUserAccounting } from '../server/utils/accountant/users';

// Test database only; data/configuration changes through application services.
// No DDL, historical posting, balance import, or stock replay.
assert.ok(process.argv.includes('--authorized-test-database'));
const apply = process.argv.includes('--apply');
const folder = 'tests/branch-reports';
class Preview extends Error { constructor(readonly report: any) { super('Preview rollback'); } }
try {
  const [pair] = await prisma.$queryRawUnsafe<any[]>(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status AND NOT hu.deleted
    JOIN companies b ON b.parent_company_id=h.id AND b.status
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status AND NOT bu.deleted
    WHERE h.is_head_office AND h.parent_company_id IS NULL AND h.status ORDER BY h.id,b.id LIMIT 1`);
  assert.ok(pair, 'Existing authorized seller office pair required');
  const report = await runAccountant({companyId: pair.branch, userId: pair.user_id, role: 'admin'}, async () => {
    const {db} = context();
    const q = (sql: string, ...args: any[]) => db.$queryRawUnsafe(sql, ...args);
    async function fingerprint(companyId: string) {
      const value: any = {};
      for (const table of ['bills','entries','expenses','items','salary_payments','user_ledger_entries','purchase_orders',
        'distributor_credits','distributor_payments','account_ledger_entries','money_transactions',
        'accountant_v2_manual_journals','accountant_v2_manual_journal_lines']) {
        value[table] = (await q(`SELECT count(*)::text count,md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) hash FROM ${table} t WHERE company_id=$1`,companyId))[0];
      }
      return value;
    }
    const before = await fingerprint(pair.branch), headBefore = await fingerprint(pair.head);
    const backup: any = {at: new Date().toISOString(), branch: pair.branch, before, headBefore, data: {}};
    for (const table of ['accountant_v2_accounting_accounts','accountant_v2_accountant_audit','accountant_v2_erp_settings',
      'accountant_v2_user_settings','accountant_v2_ecommerce_settings','accountant_v2_erp_sources','accountant_v2_user_sources'])
      backup.data[table] = await q(`SELECT * FROM ${table} WHERE company_id=$1`, pair.branch);
    writeFileSync(`${folder}/branch-accounting-${apply?'activation':'preview'}-backup.json`, JSON.stringify(backup, null, 2));
    const provision = await provisionCompanyAccountDefaults(prismaSqlClient(db), pair.branch, pair.user_id);
    const erp = await enableErpAccounting();
    const staff = await enableUserAccounting();
    assert.equal(erp.enabled, true); assert.equal(staff.enabled, true);
    assert.deepEqual(await fingerprint(pair.branch), before, 'Activation must not post history or change sources/stock');
    assert.deepEqual(await fingerprint(pair.head), headBefore, 'Head-office books must remain unchanged');
    for (const table of ['accountant_v2_erp_sources','accountant_v2_user_sources']) {
      const after = await q(`SELECT * FROM ${table} WHERE company_id=$1`,pair.branch);
      for (const previous of backup.data[table]) assert.deepEqual(after.find((row: any) => row.source_key===previous.source_key), previous);
      for (const row of after.filter((row: any) => !backup.data[table].some((old: any) => old.source_key===row.source_key))) {
        assert.equal(row.signature.excluded, true); assert.equal(row.journal_id, null);
      }
    }
    const result = {at: new Date().toISOString(), applied: apply, schemaChanges: false, historyImported: false,
      existingFinancialRowsUnchanged: true, headOfficeUnchanged: true, erpEnabled: erp.enabled, staffEnabled: staff.enabled,
      createdAccounts: provision.createdAccounts.length, backup: `branch-accounting-${apply?'activation':'preview'}-backup.json`};
    if (!apply) throw new Preview(result);
    return result;
  }, {lockCompany: true, transactionTimeoutMs: 120000}).catch(error => {if (error instanceof Preview) return error.report; throw error;});
  writeFileSync(`${folder}/branch-accounting-${apply?'activation':'preview'}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally { await prisma.$disconnect(); }
