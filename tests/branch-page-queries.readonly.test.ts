import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from '@vue/compiler-sfc';
import { computed, ref } from 'vue';
import ts from 'typescript';
import { PrismaClient } from '@prisma/client';
import { enhance } from '@zenstackhq/runtime';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

function pageQuery(file: string, companyId: string) {
  const content = parse(readFileSync(file, 'utf8')).descriptor.scriptSetup!.content;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.ESNext, true);
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === 'queryArgs');
  assert.ok(declaration?.initializer, `${file}: production queryArgs must exist`);
  const js = ts.transpileModule(`const result=${declaration.initializer.getText(source)}; export default result;`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace('export default', 'return');
  const args = new Function('computed', 'companyId', 'sort', 'page', 'pageCount', 'useAuth', js)(
    computed, ref(companyId), ref({ column: 'distributor.name', direction: 'asc' }), ref(1), ref('10'),
    () => ({ session: ref({ companyId }) }),
  ).value;
  return { ...args, take: 1 }; // Bound returned data; preserve the production selection and filters.
}

test('production distributor page queries validate for head and branch (READ ONLY)', { timeout: 120000 }, async t => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('options', '-c default_transaction_read_only=on');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const mode: any = await db.$queryRawUnsafe('SHOW default_transaction_read_only');
    assert.equal(mode[0].default_transaction_read_only, 'on');
    const fixtures: any = await db.$queryRawUnsafe(`SELECT h.id head,b.id branch,hu.user_id FROM companies h
      JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status=true AND hu.deleted=false
      JOIN companies b ON b.parent_company_id=h.id AND b.status=true
      JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status=true AND bu.deleted=false
      WHERE h.is_head_office=true AND h.parent_company_id IS NULL AND h.status=true ORDER BY h.id,b.id LIMIT 1`);
    assert.ok(fixtures.length, 'Existing authorized head/branch fixture required; no records are created');
    const fixture = fixtures[0];
    const client = scopeOrganizationModelReads(enhance(db, { user: { id: fixture.user_id, role: 'admin' } }), fixture.head, [fixture.head, fixture.branch]);
    for (const [label, companyId] of [['head', fixture.head], ['branch', fixture.branch]]) {
      for (const file of ['pages/distributor/index.vue', 'components/Distributor/List.vue', 'components/Distributor/Dlist.vue']) {
        await t.test(`${label}: ${file}`, async () => {
          try {
            const rows = await client.distributorCompany.findMany(pageQuery(file, companyId));
            for (const row of rows) assert.equal(row.companyId, companyId);
          } catch (error: any) {
            const details = String(error.message).split('\n').filter(line => /Unknown (argument|field)|Argument .*missing|Invalid value/.test(line)).slice(0, 3).join(' ');
            throw Error(details || `${error.name} (${error.code || 'no-code'}; model=${error.meta?.modelName || '-'}; table=${error.meta?.table || '-'})`);
          }
        });
      }
    }
  } finally { await db.$disconnect(); }
});
