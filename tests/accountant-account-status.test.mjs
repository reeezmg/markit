import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

const compile = (source, bindings) => new Function(...Object.keys(bindings),
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText,
)(...Object.values(bindings));
const ast = file => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const accountsSource = ast('server/utils/accountant/accounts.ts');
const managementSource = ast('server/utils/accountant/management.ts');
const guard = accountsSource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'assertAccountParentsActive');
assert.ok(guard);
function handler(source, router, path, bindings) {
  const statement = source.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(source) === router + '.post' && node.expression.arguments[0].text === path);
  assert.ok(statement);
  return compile(`return (${statement.expression.arguments.at(-1).getText(source)});`, {
    z, asyncHandler: fn => fn, ...bindings,
  });
}
const ids = {
  root: 'c000000000000000000000000', parent: 'c000000000000000000000001',
  child: 'c000000000000000000000002', unrelated: 'c000000000000000000000003',
};
function fixture() {
  const rows = [
    { id: ids.root, parentId: null, isActive: true },
    { id: ids.parent, parentId: ids.root, isActive: false },
    { id: ids.child, parentId: ids.parent, isActive: false },
    { id: ids.unrelated, parentId: null, isActive: false },
  ].map(row => ({ ...row, name: row.id, companyId: 'company', deletedAt: null, isSystem: false }));
  const writes = [], audits = [];
  const matches = (row, where = {}) => row.companyId === 'company' && Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (value && typeof value === 'object') return (!value.in || value.in.includes(row[key])) && (!value.notIn || !value.notIn.includes(row[key]));
    return row[key] === value;
  });
  const prisma = { accountingAccount: {
    findFirst: async ({ where }) => rows.find(row => matches(row, { ...where, deletedAt: null })) || null,
    findMany: async ({ where }) => rows.filter(row => matches(row, { ...where, deletedAt: null })),
    count: async ({ where }) => rows.filter(row => matches(row, where)).length,
    update: async ({ where, data }) => {
      writes.push(where.id); const row = rows.find(row => matches(row, where)); Object.assign(row, data); return row;
    },
    updateMany: async ({ where, data }) => {
      const selected = rows.filter(row => matches(row, where));
      for (const row of selected) { writes.push(row.id); Object.assign(row, data); }
      return { count: selected.length };
    },
  } };
  const badRequest = message => Object.assign(Error(message), { statusCode: 400 });
  const assertAccountParentsActive = compile(guard.getText(accountsSource).replace(/^export /, '') + '\nreturn assertAccountParentsActive;', { prisma, badRequest });
  const bindings = { prisma, badRequest, notFound: badRequest, assertAccountParentsActive, logActivity: async value => audits.push(value) };
  const single = handler(accountsSource, 'accountingAccountRouter', '/:id/status', bindings);
  const bulk = handler(managementSource, 'accountantManagementRouter', '/bulk-update/accounts', bindings);
  const call = (kind, accountIds, isActive) => (kind === 'single' ? single : bulk)({
    user: { companyId: 'company', userId: 'user' }, params: { id: accountIds[0] },
    body: kind === 'single' ? { isActive } : { accountIds, isActive },
  }, { json() {} });
  return { rows, writes, audits, call };
}
for (const kind of ['single', 'bulk']) {
  test(`${kind}: inactive parent blocks child activation before any write or audit`, async () => {
    const f = fixture();
    await assert.rejects(f.call(kind, [ids.child], true), /Activate the parent account first/);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.audits, []);
    assert.equal(f.rows.find(row => row.id === ids.child).isActive, false);
  });
  test(`${kind}: active parent permits activation; top-level accounts need no parent`, async () => {
    const f = fixture(); f.rows.find(row => row.id === ids.parent).isActive = true;
    await f.call(kind, [ids.child], true); await f.call(kind, [ids.unrelated], true);
    assert.deepEqual(f.writes, [ids.child, ids.unrelated]);
  });
  test(`${kind}: inactive grandparent also blocks activation`, async () => {
    const f = fixture(); f.rows.find(row => row.id === ids.parent).isActive = true;
    f.rows.find(row => row.id === ids.root).isActive = false;
    await assert.rejects(f.call(kind, [ids.child], true), /Activate the parent account first/);
    assert.deepEqual(f.writes, []);
  });
  for (const reason of ['missing', 'archived', 'foreign-company']) test(`${kind}: ${reason} parent blocks activation`, async () => {
    const f = fixture(), parent = f.rows.find(row => row.id === ids.parent);
    parent.isActive = true;
    if (reason === 'missing') f.rows.splice(f.rows.indexOf(parent), 1);
    if (reason === 'archived') parent.deletedAt = 'deleted';
    if (reason === 'foreign-company') parent.companyId = 'other';
    await assert.rejects(f.call(kind, [ids.child], true), /Activate the parent account first/);
    assert.deepEqual(f.writes, []);
  });
  test(`${kind}: hierarchy cycles reject activation`, async () => {
    const f = fixture(); const parent = f.rows.find(row => row.id === ids.parent);
    parent.isActive = true; parent.parentId = ids.child;
    await assert.rejects(f.call(kind, [ids.child], true), /circular/); assert.deepEqual(f.writes, []);
  });
  test(`${kind}: active child prevents parent deactivation; inactive child allows it`, async () => {
    const f = fixture(), child = f.rows.find(row => row.id === ids.child);
    f.rows.find(row => row.id === ids.parent).isActive = true; child.isActive = true;
    await assert.rejects(f.call(kind, [ids.parent], false), /sub-accounts inactive first/);
    assert.deepEqual(f.writes, []); child.isActive = false;
    await f.call(kind, [ids.parent], false); assert.deepEqual(f.writes, [ids.parent]);
  });
}
test('bulk: parent and child may be activated together in either request order', async () => {
  for (const order of [[ids.child, ids.parent], [ids.parent, ids.child]]) {
    const f = fixture(); await f.call('bulk', order, true);
    assert.equal(f.rows.find(row => row.id === ids.parent).isActive, true);
    assert.equal(f.rows.find(row => row.id === ids.child).isActive, true);
  }
});
test('bulk: omitting an inactive ancestor rejects the whole batch, including unrelated accounts', async () => {
  const f = fixture(); f.rows.find(row => row.id === ids.root).isActive = false;
  await assert.rejects(f.call('bulk', [ids.unrelated, ids.child, ids.parent], true), /Activate the parent account first/);
  assert.deepEqual(f.writes, []);
});
test('bulk: complete inactive chain may activate together', async () => {
  const f = fixture(); f.rows.find(row => row.id === ids.root).isActive = false;
  await f.call('bulk', [ids.child, ids.parent, ids.root], true); assert.equal(f.writes.length, 3);
});
test('single: archived active children do not prevent deactivation', async () => {
  const f = fixture(); Object.assign(f.rows.find(row => row.id === ids.child), { isActive: true, deletedAt: 'deleted' });
  await f.call('single', [ids.parent], false); assert.deepEqual(f.writes, [ids.parent]);
});
test('bulk: parent and child can be made inactive together', async () => {
  const f = fixture(); for (const row of f.rows) row.isActive = true;
  await f.call('bulk', [ids.parent, ids.child], false); assert.equal(f.writes.length, 2);
});
