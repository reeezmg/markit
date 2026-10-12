import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';

function evaluate(file, bindings, names) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return new Function(...Object.keys(bindings), code + `\nreturn {${names}}`)(...Object.values(bindings));
}
const { journalDateRange } = evaluate('server/utils/accountant/date-range.ts', { badRequest: message => Error(message) }, 'journalDateRange');
const { accountLedgerSql, readAccountLedger } = evaluate('server/utils/accountant/account-ledger.ts', { z, journalDateRange }, 'accountLedgerSql,readAccountLedger');
for (const query of [{ from: 'invalid' }, { from: '2026-10-03', to: '2026-10-01' }, { pageSize: 300 }, { minAmount: 50, maxAmount: 10 }, { minAmount: -1 }, { side: 'wrong' }, { order: 'DROP TABLE' }]) {
  assert.throws(() => accountLedgerSql('company', 'cash', query));
}
const escaped = accountLedgerSql('company', 'cash', { search: "'; DROP TABLE x; --" });
assert.ok(!escaped.sql.includes('DROP TABLE x'));
assert.equal(escaped.values[4], "'; DROP TABLE x; --");

if (process.argv.includes('--read-only-sql')) {
  await import('dotenv/config');
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='20s'");
    const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
    assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    // EXPLAIN verifies the actual table/column contract without reading business rows.
    await client.query('EXPLAIN ' + escaped.sql, escaped.values);
    const journals = [
      ['opening', '2026-09-30T12:00:00', 1, 'OPENING_BALANCE'],
      ['sale', '2026-10-01T12:00:00', 2, 'SALES_INVOICE'],
      ['payment', '2026-10-02T23:59:59.999', 1, 'MONEY_PAY'],
      ['later', '2026-10-03T00:00:00', 1, 'MONEY_RECEIVE'],
      ['draft', '2026-10-01T12:00:00', 1, 'MANUAL'],
      ['foreign', '2026-10-01T12:00:00', 1, 'MANUAL'],
    ].map(([id, date, rate, type]) => ({ id, company_id: id === 'foreign' ? 'other' : 'company', journal_date: date,
      entry_number: id, reference_number: `REF-${id}`, notes: id, currency: 'INR', exchange_rate: rate,
      status: id === 'draft' ? 'DRAFT' : 'PUBLISHED', source_type: type, deleted_at: null }));
    const lines = [ ['opening', 'DEBIT', 100], ['sale', 'DEBIT', 20], ['payment', 'CREDIT', 5], ['later', 'DEBIT', 90], ['draft', 'DEBIT', 500], ['foreign', 'DEBIT', 800] ]
      .map(([id, side, amount]) => ({ id, journal_id: id, company_id: id === 'foreign' ? 'other' : 'company', account_id: 'cash', side, amount,
        created_at: '2026-10-01T00:00:00', description: null, source_parties: null, party_id: null, deleted_at: null }));
    lines.push({ ...lines[1], id: 'deleted', deleted_at: '2026-10-01' }, { ...lines[1], id: 'other-account', account_id: 'bank' });
    const ctes = `WITH accountant_v2_manual_journals AS (
      SELECT * FROM jsonb_to_recordset($12::jsonb) AS j(id text,company_id text,journal_date timestamp,entry_number text,reference_number text,notes text,currency text,exchange_rate numeric,status text,source_type text,deleted_at timestamp)
    ), accountant_v2_manual_journal_lines AS (
      SELECT * FROM jsonb_to_recordset($13::jsonb) AS l(id text,journal_id text,company_id text,account_id text,side text,amount numeric,created_at timestamp,description text,source_parties jsonb,party_id text,deleted_at timestamp)
    ), accountant_v2_accountant_contact AS (SELECT NULL::text AS id,NULL::text AS company_id,NULL::text AS name,NULL::timestamp AS deleted_at WHERE false), posted AS (`;
    const db = { $queryRawUnsafe: async (sql, ...values) => (await client.query(sql.replace('WITH posted AS (', ctes), [...values, JSON.stringify(journals), JSON.stringify(lines)])).rows };
    const read = q => readAccountLedger(db, 'company', { id: 'cash', category: 'ASSET' }, 'INR', q);
    const dates = { from: '2026-10-01', to: '2026-10-02' };
    const ledger = await read(dates);
    assert.equal(ledger.total, 2);
    assert.equal(ledger.closingBalance, 135);
    assert.equal(ledger.filteredDebitTotal, 40);
    assert.equal(ledger.filteredCreditTotal, 5);
    assert.deepEqual(ledger.data.map(l => [l.id, l.balance]), [['payment', 135], ['sale', 140]]);
    assert.equal((await read({ ...dates, pageSize: 1, page: 2 })).data[0].balance, 140);
    assert.deepEqual((await read({ ...dates, order: 'asc' })).data.map(l => l.id), ['sale', 'payment']);
    for (const filter of [{ side: 'CREDIT' }, { sourceType: 'MONEY_PAY' }, { search: 'REF-payment' }, { maxAmount: 10 }]) {
      const result = await read({ ...dates, ...filter });
      assert.equal(result.total, 1); assert.equal(result.data[0].id, 'payment');
      assert.equal(result.data[0].balance, 135, 'Hidden lines still contribute to running balance');
    }
    const amounts = await read({ ...dates, minAmount: 30, maxAmount: 50 });
    assert.equal(amounts.data[0].id, 'sale', 'Amount filter uses converted base currency');
    assert.equal((await read({ ...dates, search: 'missing' })).closingBalance, 135);
    assert.equal((await read({ page: 50 })).total, 4);
    assert.equal((await read({})).closingBalance, 225);
    const foreign = await readAccountLedger(db, 'unknown', { id: 'cash', category: 'ASSET' }, 'INR', {});
    assert.equal(foreign.total, 0);
    console.log('Read-only PostgreSQL checks passed: schema contract, currency, inclusive dates, carry-forward, filters, ordering, pagination and company/account isolation. No data or schema changes.');
  } finally { await client.query('ROLLBACK'); await client.end(); }
}
console.log('Ledger query validation and parameterization passed.');
