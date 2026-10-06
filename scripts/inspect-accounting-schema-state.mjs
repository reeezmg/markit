import fs from 'node:fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';

const fileEnv = dotenv.parse(fs.readFileSync('.env'));
const inheritedUrl = process.env.DATABASE_URL;
dotenv.config({ quiet: true });
if (process.argv.includes('--direct')) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith('.neon.tech')) url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.delete('pgbouncer');
  url.searchParams.set('schema', 'public');
  process.env.DATABASE_URL = url.toString();
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const client = await pool.connect();
try {
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '15s'");
  const state = (await client.query(`SELECT current_database() AS database, current_schema() AS schema,
    current_setting('search_path') AS search_path,
    to_regclass('public.accountant_v2_distributor_mappings')::text AS distributor_mappings,
    to_regclass('public.accountant_v2_accounting_accounts')::text AS accounting_accounts,
    to_regclass('public._prisma_migrations')::text AS migration_history`)).rows[0];
  const tables = (await client.query(`SELECT schemaname, count(*)::int AS accounting_tables FROM pg_tables
    WHERE tablename LIKE 'accountant_v2_%' GROUP BY schemaname ORDER BY schemaname`)).rows;
  const migrations = state.migration_history ? (await client.query(`SELECT migration_name,
    finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back,
    applied_steps_count FROM public._prisma_migrations ORDER BY started_at`)).rows : [];
  let unqualifiedMappingRead;
  await client.query('SAVEPOINT mapping_read');
  try {
    unqualifiedMappingRead = { rows: (await client.query('SELECT count(*)::int AS rows FROM accountant_v2_distributor_mappings')).rows[0].rows };
  } catch (error) {
    unqualifiedMappingRead = { code: error.code, message: error.message };
    await client.query('ROLLBACK TO SAVEPOINT mapping_read');
  }
  console.log(JSON.stringify({ environmentOverridesFile: !!inheritedUrl && inheritedUrl !== fileEnv.DATABASE_URL,
    state, unqualifiedMappingRead, tables, migrations }, null, 2));
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
const prisma = new PrismaClient();
try {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return { mappingRows: await tx.accountantDistributorMapping.count() };
  });
  console.log(JSON.stringify({ prismaRead: result }));
} finally { await prisma.$disconnect(); }
