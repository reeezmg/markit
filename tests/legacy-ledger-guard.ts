import assert from 'node:assert/strict';

/** Assert the entire archive, including dates and running balances, is immutable. */
export async function legacyLedgerGuard(db: { query: Function }) {
  const snapshot = async () => (await db.query(`SELECT count(*)::int AS rows,
    md5(COALESCE(string_agg(h,'' ORDER BY h),'')) AS digest
    FROM (SELECT md5(to_jsonb(t)::text) h FROM account_ledger_entries t) x`)).rows[0];
  const before = await snapshot();
  return async () => assert.deepEqual(await snapshot(), before, 'Source writes must leave every legacy account-ledger row unchanged');
}
