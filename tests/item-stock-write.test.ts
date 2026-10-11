import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';
import { prepareItemStockWrite } from '../server/utils/item-stock-write';
import { prisma } from '../server/prisma';
import { pool } from '../server/db';

let writes = 0;
const save = async (args: any) => { writes++; return args; };
const delegate = { create: save, createMany: save, update: save, updateMany: save, upsert: save,
  createManyAndReturn: save, updateManyAndReturn: save, findUnique: async () => ({ companyId: 'company' }) };
const fake: any = { item: delegate, variant: delegate, product: delegate, $transaction: async (run: any) => run(fake) };
const scoped: any = scopeOrganizationModelReads(fake, 'company', ['company']);
try {
  const created = await scoped.item.create({ data: { companyId: 'company', qty: 5 } });
  assert.deepEqual([created.data.initialQty, created.data.qty, created.data.soldQty], [5, 5, 0]);
  const nested = await scoped.product.create({ data: { companyId: 'company', variants: { create: { items: { createMany: { data: [{ qty: 7 }] } } } } } });
  const row = nested.data.variants.create.items.createMany.data[0];
  assert.deepEqual([row.initialQty, row.qty, row.soldQty], [7, 7, 0]);
  const baseline = writes;
  for (const field of ['qty', 'initialQty', 'soldQty']) {
    for (const value of [0, { set: 0 }, { increment: 1 }]) {
      await assert.rejects(scoped.item.update({ where: { id: 'i' }, data: { [field]: value } }), /product edit API/);
      await assert.rejects(scoped.item.updateMany({ data: { [field]: value } }), /product edit API/);
      await assert.rejects(scoped.variant.update({ where: { id: 'v' }, data: { items: { update: { where: { id: 'i' }, data: { [field]: value } } } } }), /product edit API/);
      await assert.rejects(scoped.variant.update({ where: { id: 'v' }, data: { items: { updateMany: { where: {}, data: { [field]: value } } } } }), /product edit API/);
      await assert.rejects(scoped.item.upsert({ where: { id: 'i' }, create: { qty: 1 }, update: { [field]: value } }), /product edit API/);
    }
  }
  await assert.rejects(scoped.item.create({ data: { qty: 5, soldQty: 2 } }), /zero sold/);
  await assert.rejects(scoped.item.createManyAndReturn({ data: [{ qty: 1 }] }));
  await assert.rejects(scoped.item.updateManyAndReturn({ data: { qty: 0 } }));
  assert.equal(writes, baseline, 'Rejected stock counter changes never reach the write delegate');
  await scoped.item.update({ where: { id: 'i' }, data: { size: 'M' } });

  let existing = false, foreign = false, inserted: any[] = [];
  const itemDb: any = { $queryRawUnsafe: async () => foreign ? [] : [{ id: 'v' }], item: {
    count: async () => existing ? 1 : 0, createMany: async ({ data }: any) => { inserted = data; }, findMany: async () => inserted,
  } };
  const bindings: any = { prisma: { $transaction: async (run: any) => run(itemDb) }, prepareItemStockWrite,
    useCompanyRequestSession: async () => ({ data: { companyId: 'company' } }), eventHandler: (fn: any) => fn,
    readBody: async (e: any) => e, createError: (e: any) => Object.assign(new Error(e.statusMessage), e) };
  const js = ts.transpileModule(readFileSync('server/api/item.post.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import .*;?\r?\n/gm, '').replace('export default ', 'return ');
  const handler = new Function(...Object.keys(bindings), js)(...Object.values(bindings));
  await handler({ variants: [{ id: 'v', qty: 6 }] });
  assert.deepEqual([inserted[0].initialQty, inserted[0].qty, inserted[0].soldQty], [6, 6, 0]);
  existing = true;
  await assert.rejects(handler({ variants: [{ id: 'v', qty: 99 }] }), /Items already exist/);
  assert.equal(inserted[0].qty, 6, 'Legacy item generator cannot recreate existing stock');
  existing = false; foreign = true;
  await assert.rejects(handler({ variants: [{ id: 'v', qty: 99 }] }), /another company/);
  console.log('Item stock writes passed: direct/nested creation, counter protection, bulk/upsert guards, metadata edits, legacy endpoint and ownership.');
} finally { await pool.end(); await prisma.$disconnect(); }
