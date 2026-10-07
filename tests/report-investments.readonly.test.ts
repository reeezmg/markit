import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { accountingMoneyActivity } from '../server/utils/report-accounting';

// CTE fixtures only: no schema or data writes. Execute the actual report SQL.
const fixtures = `WITH accountant_v2_manual_journals AS (
 SELECT id,company_id,journal_date::timestamptz,status,NULL::timestamptz AS deleted_at,
 source_type,reversed_from_id,1::numeric AS exchange_rate FROM (VALUES
 ('original','a','2026-09-30','PUBLISHED','INVESTOR',NULL::text),
 ('reverse','a','2026-10-02','PUBLISHED','INVESTOR_REVERSAL','original'),
 ('legacy','a','2026-10-03','PUBLISHED','LEGACY_INVESTOR',NULL),
 ('native','a','2026-10-03','PUBLISHED','INVESTOR',NULL),
 ('withdraw','a','2026-10-04','PUBLISHED','INVESTOR',NULL),
 ('receive','a','2026-10-04','PUBLISHED','MONEY_RECEIVE',NULL),
 ('transfer','a','2026-10-04','PUBLISHED','ACCOUNT_TRANSFER',NULL),
 ('draft','a','2026-10-04','DRAFT','INVESTOR',NULL),
 ('foreign','b','2026-10-04','PUBLISHED','INVESTOR',NULL)
 ) j(id,company_id,journal_date,status,source_type,reversed_from_id)
), accountant_v2_accounting_accounts AS (
 SELECT * FROM (VALUES ('cash','a','Cash','CASH'),('bank','a','Bank','BANK'),
 ('bank2','a','Second Bank','BANK'),('equity','a','Capital','EQUITY'),('foreign-cash','b','Cash','CASH'))
 a(id,company_id,name,account_type)
), accountant_v2_manual_journal_lines AS (
 SELECT *,NULL::timestamptz AS deleted_at,NULL::text AS distributor_id,
 '{}'::jsonb AS source_parties FROM (VALUES
 ('original','a','cash','DEBIT',100::numeric),
 ('reverse','a','cash','CREDIT',100),
 ('legacy','a','cash','DEBIT',300),
 ('legacy','a','equity','CREDIT',300),
 ('native','a','cash','DEBIT',200),
 ('native','a','bank2','DEBIT',25),
 ('withdraw','a','bank','CREDIT',50),
 ('receive','a','cash','DEBIT',20),
 ('transfer','a','cash','CREDIT',40),
 ('transfer','a','bank','DEBIT',40),
 ('draft','a','cash','DEBIT',999),
 ('foreign','b','foreign-cash','DEBIT',999)
 ) l(journal_id,company_id,account_id,side,amount)
), accountant_v2_accountant_audit AS (
 SELECT NULL::text AS id,NULL::text AS company_id,NULL::text AS resource,
 NULL::text AS action,'{}'::jsonb AS "after" WHERE false
)
`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
try {
  await db.query('BEGIN READ ONLY');
  const activity = await accountingMoneyActivity(
    { query: (sql, args) => db.query(fixtures + sql, args) },
    ['a'], new Date('2026-10-01T00:00:00Z'), new Date('2026-10-05T23:59:59Z')
  );
  assert.deepEqual(activity.investments, {
    cash: { debit: 500, credit: 100, net: 400 },
    bank: { debit: 25, credit: 50, net: -25 },
  });
  assert.equal(activity.investmentsDisplay.find(row => row.id === 'bank').net, -50);
  assert.equal(activity.investmentsDisplay.find(row => row.id === 'bank2').net, 25);
  assert.equal(activity.investmentsDisplay.reduce((sum, row) => sum + row.net, 0), 375);
  assert.equal(activity.transactionsDisplay[0].name, 'Cash');
  assert.equal(activity.transactionsDisplay[0].net, 20);
  assert.equal(activity.transactions.cash.net, 20);
  assert.equal(activity.moneyTransactions.in.total, 20);
  assert.equal(activity.transfers.cash.net + activity.transfers.bank.net, 0);
  console.log('Read-only investment fixtures passed: native/imported movements, dated reversal, cash/bank-only, draft/date/company isolation and Receive/Pay separation');
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
}
