import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { importTransfers } from '../scripts/production-accounting/lib/import-transfers.mjs';
import { copyTransfersBatch } from '../scripts/production-accounting/lib/copy-transfers-batch.mjs';
const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = await pool.connect();
try {
  await db.query('BEGIN');
  const schema = 'transfer_test_' + randomUUID().replaceAll('-', '');
  await db.query(`CREATE SCHEMA "${schema}"`);
  await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query("CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR')");
  await db.query(
    readFileSync(
      new URL('../prisma/migrations/20260926120000_accountant_v2/migration.sql', import.meta.url),
      'utf8'
    )
  );
  await db.query(`CREATE TABLE accountant_v2_erp_settings(company_id text,enabled boolean,accounts jsonb);
 CREATE TABLE account_transfers(id text PRIMARY KEY,company_id text,from_type text,to_type text,from_account_id text,to_account_id text,amount numeric(18,2),note text,created_at timestamp);
 CREATE TABLE bank_accounts(id text PRIMARY KEY,company_id text);
 CREATE TABLE accountant_v2_distributor_mappings(company_id text,role text,account_id text);
 CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,banking boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND is_locked AND lock_date>=d AND module IN ('ALL','ACCOUNTS','BANKING')) THEN RAISE EXCEPTION 'Date locked'; END IF; END $$;
 INSERT INTO companies(id) VALUES('a'),('b');
 INSERT INTO accountant_v2_erp_settings VALUES('a',true,'{"cash":"cash","bank":"bank"}');
 INSERT INTO bank_accounts VALUES('old-bank','a');
 INSERT INTO accountant_v2_distributor_mappings VALUES('a','bank:old-bank','named');`);
  for (const [ident, type, category, code] of [
    ['cash', 'CASH', 'ASSET', null],
    ['bank', 'BANK', 'ASSET', null],
    ['named', 'BANK', 'ASSET', null],
    ['clearing', 'EQUITY', 'EQUITY', 'LCB-CLEARING'],
  ])
    await db.query(
      `INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,code,updated_at) VALUES($1,'a',$1,$2,$3,$4,now())`,
      [ident, type, category, code]
    );
  const sources = [
    ['one', 'CASH', 'BANK', null, 15],
    ['two', 'CASH', 'BANK', 'old-bank', 20],
    ['three', 'INVESTMENT', 'BANK', null, 5],
    ['four', 'BANK', 'CASH', null, 7],
  ];
  for (const [ident, from, to, toBank, amount] of sources)
    await db.query(
      `INSERT INTO account_transfers VALUES($1,'a',$2,$3,null,$4,$5,'History','2026-01-01')`,
      [ident, from, to, toBank, amount]
    );
  for (const [source, from, to, amount] of [
    ['one', 'cash', 'bank', 15],
    ['two', 'cash', 'clearing', 20],
    ['three', 'clearing', 'bank', 5],
  ]) {
    await db.query(
      `INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,updated_at) VALUES($1,'a',$1,'2026-01-01',$2,'History','INR',$3,'PUBLISHED',now(),true,'LEGACY_CASH_BANK_HISTORY',$1,now())`,
      ['old-' + source, 'ACCOUNT_TRANSFER:' + source, amount]
    );
    for (const [account, side] of [
      [from, 'CREDIT'],
      [to, 'DEBIT'],
    ])
      await db.query(
        `INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,updated_at) VALUES($1,'a',$2,$3,$4,$5,now())`,
        [source + side, 'old-' + source, account, side, amount]
      );
    await db.query(
      `INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES($1,'a','test','imported','legacy-cash-bank-import',$2,$3::jsonb,now())`,
      ['audit-' + source, 'old-' + source, JSON.stringify({ source: 'ACCOUNT_TRANSFER:' + source })]
    );
  }
  await assert.rejects(
    importTransfers(db, 'a', { through: '2026-01-02', verifyOnly: true }),
    /not been imported/
  );
  const result = await importTransfers(db, 'a', { through: '2026-01-02' });
  assert.equal(result.created, 4);
  assert.equal(result.replacedJournals, 3);
  const changes = Object.fromEntries(result.balanceChanges.map((r) => [r.accountId, r.amount]));
  assert.deepEqual(changes, { bank: '-7.00', cash: '7.00', clearing: '-20.00', named: '20.00' });
  const repeat = await importTransfers(db, 'a', { through: '2026-01-02' });
  assert.equal(repeat.created, 0);
  assert.equal(repeat.unchanged, 4);
  assert.deepEqual(repeat.balanceChanges, []);
  const verified = await importTransfers(
    {
      query: (sql, args) => {
        assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);
        return db.query(sql, args);
      },
    },
    'a',
    { through: '2026-01-02', verifyOnly: true }
  );
  assert.equal(verified.unchanged, 4);
  async function rejects(work, pattern) {
    await db.query('SAVEPOINT invalid');
    try {
      await assert.rejects(work, pattern);
    } finally {
      await db.query('ROLLBACK TO SAVEPOINT invalid');
      await db.query('RELEASE SAVEPOINT invalid');
    }
  }
  await rejects(async () => {
    await db.query("UPDATE account_transfers SET amount=99 WHERE id='one'");
    await importTransfers(db, 'a', { through: '2026-01-02' });
  }, /source changed/);
  await rejects(async () => {
    await db.query("DELETE FROM account_transfers WHERE id='one'");
    await importTransfers(db, 'a', { through: '2026-01-02' });
  }, /was deleted/);
  await rejects(
    () =>
      importTransfers(db, 'a', {
        through: '2026-01-02',
        mappings: { banks: { 'old-bank': 'foreign' } },
      }),
    /valid account mapping/
  );
  await rejects(async () => {
    await db.query('UPDATE accountant_v2_account_transfers SET amount=1');
    await importTransfers(db, 'a', { through: '2026-01-02' });
  }, /transfer changed/);
  // Exercise reset batching against the same proven historical fixtures. The
  // original importer must recognize every new fingerprint/link as unchanged.
  await db.query("DELETE FROM accountant_v2_account_transfers WHERE company_id='a'");
  await db.query("DELETE FROM accountant_v2_manual_journals WHERE company_id='a' AND source_type IN ('ACCOUNT_TRANSFER','TRANSFER_HISTORY_MIGRATION_REVERSAL')");
  await db.query("DELETE FROM accountant_v2_accountant_audit WHERE company_id='a' AND resource='transfer-history-import'");
  const batched = await copyTransfersBatch(db, 'a', { through: '2026-01-02' });
  assert.equal(batched.created, 4);
  assert.equal(batched.verified, true);
  const afterBatch = await importTransfers(db, 'a', { through: '2026-01-02' });
  assert.equal(afterBatch.created, 0);
  assert.equal(afterBatch.unchanged, 4);
  assert.deepEqual(afterBatch.balanceChanges, []);
  await rejects(() => copyTransfersBatch(db,'a',{through:'2026-01-02'}), /empty transfer target/);
  console.log(
    'PASS transfer import: source records, balanced replacements, named-bank correction, investment preservation, repeat no-op, source mutation/deletion and foreign-account rejection. Fixtures rolled back.'
  );
} finally {
  await db.query('ROLLBACK');
  db.release();
  await pool.end();
}
