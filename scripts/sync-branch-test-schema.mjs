import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { accountingTestDatabaseUrl } from './lib/accounting-test-database.mjs';

// Explicit user-authorized workflow: schema.zmodel -> ZenStack -> Prisma db push.
// This helper never executes handwritten schema SQL and never accepts data loss.
assert.ok(process.argv.includes('--authorized-test-database'));
const target = accountingTestDatabaseUrl(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: target });
const folder = 'tests/branch-reports';
const sourceHash = () => createHash('sha256').update(readFileSync('schema.zmodel')).digest('hex');
const generatedHash = () => createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex');
const generated = readFileSync('prisma/schema.prisma', 'utf8');
assert.match(generated, /model DistributorPaymentAllocation/);
assert.match(generated, /distributorId\s+String\?/);
const preview = readFileSync(folder + '/dependency-schema-regenerated/direct-diff.sql', 'utf8');
assert.doesNotMatch(preview, /DROP\s+(?:TABLE|COLUMN|TYPE)|TRUNCATE|DELETE\s+FROM/i, 'Refuse destructive schema drift');
const tables = [...new Set([...preview.matchAll(/ALTER TABLE "([^"]+)"/g)].map(m => m[1]))];
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function snapshot() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const records = {};
    for (const table of tables) {
      if (table === 'distributor_payment_allocations') continue;
      // Expense new fields are excluded only from its before/after comparison.
      const expression = table === 'expenses' ? "to_jsonb(t)-'client_id'-'distributor_id'" : 'to_jsonb(t)';
      records[table] = (await client.query(`SELECT ${expression} row FROM ${quote(table)} t ORDER BY ${expression}::text`)).rows.map(r => r.row);
    }
    const constraints = (await client.query(`SELECT c.conname, t.relname, pg_get_constraintdef(c.oid) definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname=ANY($1::text[]) ORDER BY t.relname,c.conname`, [tables])).rows;
    const indexes = (await client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`)).rows;
    await client.query('ROLLBACK');
    return { records, constraints, indexes };
  } finally { client.release(); }
}
try {
  const before = await snapshot();
  const schemaHash = sourceHash(), prismaHash = generatedHash();
  writeFileSync(folder + '/schema-push-backup.json', JSON.stringify({ at: new Date().toISOString(), schemaHash, prismaHash, tables, ...before }, null, 2));
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], {
    env: { ...process.env, DATABASE_URL: target, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  });
  const redact = value => String(value || '').replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[database URL redacted]');
  writeFileSync(folder + '/schema-push-followup.log', redact(result.stdout) + redact(result.stderr));
  assert.equal(sourceHash(), schemaHash, 'Schema source stayed unchanged during push');
  assert.equal(generatedHash(), prismaHash, 'Generated schema stayed unchanged during push');
  assert.equal(result.status, 0, 'Prisma db push must finish without data-loss acceptance');
  const after = await snapshot();
  assert.deepEqual(after.records, before.records, 'Existing affected-table rows must remain unchanged');
  writeFileSync(folder + '/schema-push-followup.json', JSON.stringify({ finishedAt: new Date().toISOString(),
    command: 'npx prisma db push --skip-generate --schema prisma/schema.prisma', schemaHash, prismaHash,
    exitCode: result.status, existingRowsUnchanged: true, backedUpTables: tables,
    handwrittenSchemaSqlExecuted: false, acceptedDataLoss: false }, null, 2));
  console.log('PASS: Prisma schema push succeeded; existing affected-table rows verified unchanged.');
} finally { await pool.end(); }
