import 'dotenv/config';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import pg from 'pg';

// Execute the actual page handlers. Database work stays in one rolled-back
// repeatable-read transaction; the hook adapter applies only the submitted field.
const file = 'pages/client/index.vue';
const source = ts.createSourceFile(file, parse(fs.readFileSync(file, 'utf8')).descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
function handler(name, context) {
  let code;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = `(${node.getText(source)})`;
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) code = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(code, name);
  return vm.runInNewContext(ts.transpileModule(`const subject = ${code}; subject;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  await db.query("SET LOCAL lock_timeout='5s'");
  const { rows: [row] } = await db.query(`SELECT cc.company_id AS "companyId", cc.client_id AS "clientId", c.name, co.name AS "companyName"
    FROM company_clients cc JOIN clients c ON c.id=cc.client_id JOIN companies co ON co.id=cc.company_id
    WHERE cc.status AND EXISTS (SELECT 1 FROM bills b WHERE b.client_id=cc.client_id AND b.company_id=cc.company_id)
    ORDER BY cc.company_id,cc.client_id LIMIT 1`);
  assert.ok(row, 'An active client with bill history is required');
  async function snapshot() {
    const result = {};
    for (const table of ['clients', 'company_clients', 'bills', 'entries', 'items', 'accountant_v2_erp_sources', 'accountant_v2_manual_journals', 'accountant_v2_manual_journal_lines', 'account_ledger_entries']) {
      // Exclude only the one status value allowed to change; every other field
      // and every other company's membership must remain identical.
      const value = table === 'company_clients'
        ? `CASE WHEN t.company_id=$1 AND t.client_id=$2 THEN to_jsonb(t)-'status' ELSE to_jsonb(t) END`
        : 'to_jsonb(t)';
      result[table] = (await db.query(`SELECT md5(COALESCE(string_agg(v::text, '' ORDER BY v::text),'')) AS hash FROM (SELECT ${value} AS v FROM ${table} t) s`, table === 'company_clients' ? [row.companyId, row.clientId] : [])).rows[0].hash;
    }
    return result;
  }
  const before = await snapshot();
  const errors = [], requests = [];
  let confirms = true, refreshes = 0;
  const context = {
    window: { confirm: () => confirms }, toast: { add: error => errors.push(error) },
    refetch: async () => refreshes++,
    UpdateCompanyClient: { mutateAsync: async args => {
      const key = args.where.companyId_clientId;
      assert.equal(key.companyId, row.companyId); assert.equal(key.clientId, row.clientId);
      assert.deepEqual(JSON.parse(JSON.stringify(args.data)), { status: false });
      requests.push(args);
      await db.query('UPDATE company_clients SET status=false WHERE company_id=$1 AND client_id=$2', [key.companyId, key.clientId]);
    } },
  };
  const remove = handler('removeClient', context);
  confirms = false; await remove(row); assert.equal(requests.length, 0);
  confirms = true; await remove(row); await remove(row);
  assert.equal(requests.length, 2); assert.equal(refreshes, 2);
  assert.equal((await db.query('SELECT status FROM company_clients WHERE company_id=$1 AND client_id=$2', [row.companyId, row.clientId])).rows[0].status, false);
  assert.deepEqual(await snapshot(), before, 'Client identity, points, other memberships, bill/client IDs, stock and all financial rows are preserved');
  context.UpdateCompanyClient.mutateAsync = async () => { throw Error('Rejected'); };
  await remove(row); assert.equal(errors.length, 1); assert.equal(refreshes, 2);
  const bill = handler('deleteBill', { ...context, $fetch: async (path, options) => {
    assert.equal(path, '/api/billSale/deleteBill');
    assert.equal(options.headers['x-company-id'], 'branch');
    assert.equal(options.body.companyId, 'branch'); assert.equal(options.body.billId, 'bill');
    requests.push(options);
  } });
  await bill({ id: 'bill', companyId: 'branch', invoiceNumber: 42 });
  assert.equal(requests.length, 3); assert.equal(refreshes, 3);
  confirms = false; await bill({ id: 'bill' }); assert.equal(requests.length, 3);
  console.log('PASS: client soft removal preserves all relationships, balances and stock; repeat/cancel/failure paths; branch bill deletion uses full lifecycle API. Database rolled back.');
} finally {
  await db.query('ROLLBACK'); db.release(); await pool.end();
}
