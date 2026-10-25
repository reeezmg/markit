import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

// Execute the real route with history fixtures; no database writes or schema setup.
const path = 'server/utils/accountant/management.ts';
const source = readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const statement = ast.statements.find(node => ts.isExpressionStatement(node) &&
  ts.isCallExpression(node.expression) &&
  node.expression.expression.getText(ast) === 'accountantManagementRouter.get' &&
  node.expression.arguments[0].text === '/account-details');
assert.ok(statement, 'Account details route exists');
const handlerSource = ts.transpileModule(`const handler = ${statement.expression.arguments[1].getText(ast)};`, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

function matches(value, where) {
  return Object.entries(where).every(([key, expected]) => expected && typeof expected === 'object'
    ? value[key] && matches(value[key], expected)
    : value[key] === expected);
}

test('account details counts ledger-visible activity, including cancellations, and excludes drafts, archives and other companies', async () => {
  const accounts = [
    { id: 'cash', companyId: 'company', category: 'ASSET', name: 'Cash', deletedAt: null },
    { id: 'sales', companyId: 'company', category: 'INCOME', name: 'Sales', deletedAt: null },
    { id: 'unused', companyId: 'company', category: 'ASSET', name: 'Unused', deletedAt: null },
    { id: 'foreign', companyId: 'other', category: 'ASSET', name: 'Other company', deletedAt: null },
    { id: 'archived', companyId: 'company', category: 'ASSET', name: 'Archived', deletedAt: 'deleted' },
  ];
  const posted = { companyId: 'company', status: 'PUBLISHED', deletedAt: null };
  const line = (id, accountId, side, amount, changes = {}) => ({
    id, accountId, companyId: 'company', deletedAt: null, side, amount, journal: posted, ...changes,
  });
  const lines = [
    line('opening', 'cash', 'DEBIT', 100),
    line('payment', 'cash', 'CREDIT', 30),
    line('cancellation', 'cash', 'DEBIT', 30),
    line('sale', 'sales', 'CREDIT', 70),
    line('draft', 'cash', 'DEBIT', 500, { journal: { ...posted, status: 'DRAFT' } }),
    line('deleted-line', 'cash', 'DEBIT', 600, { deletedAt: 'deleted' }),
    line('deleted-journal', 'cash', 'DEBIT', 700, { journal: { ...posted, deletedAt: 'deleted' } }),
    line('foreign-line', 'cash', 'DEBIT', 800, { companyId: 'other' }),
    line('foreign-journal', 'cash', 'DEBIT', 900, { journal: { ...posted, companyId: 'other' } }),
  ];
  const prisma = { accountingAccount: { findMany: async ({ where, include }) => {
    assert.equal(where.companyId, 'company');
    const count = include._count.select.journalLines;
    return accounts.filter(account => matches(account, where)).map(account => ({
      ...account, _count: { journalLines: lines.filter(row => row.accountId === account.id &&
        (count === true || matches(row, count.where))).length },
    }));
  } } };
  const baseCurrencyTotals = async () => [
    { accountId: 'cash', side: 'DEBIT', _sum: { amount: 130 } },
    { accountId: 'cash', side: 'CREDIT', _sum: { amount: 30 } },
    { accountId: 'sales', side: 'CREDIT', _sum: { amount: 70 } },
  ];
  const handler = new Function('prisma', 'baseCurrencyTotals', 'asyncHandler', handlerSource + '\nreturn handler;')(
    prisma, baseCurrencyTotals, fn => fn,
  );
  let result;
  await handler({ user: { companyId: 'company' } }, { json: data => { result = data; } });
  assert.deepEqual(result.data.map(row => [row.id, row._count.journalLines, row.balance]), [
    ['cash', 3, 100], ['sales', 1, 70], ['unused', 0, 0],
  ]);
});
