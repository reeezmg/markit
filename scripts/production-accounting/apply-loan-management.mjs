import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
const args = process.argv.slice(2);
if (args.some(a => a !== '--apply')) throw Error('Usage: node scripts/production-accounting/apply-loan-management.mjs [--apply]');
const name = '20261102120000_loan_management';
const sql = readFileSync(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');
if (!args.includes('--apply')) {
    console.log(JSON.stringify({ migration: name, checksum, applied: false, databaseAccessed: false, adds: ['accountant_v2_loans', 'accountant_v2_loan_events'], prerequisite: 'Existing Accountant and investor migrations', next: 'Separate explicit authorization is required before running with --apply.' }, null, 2));
} else {
    await import('dotenv/config');
    const { Pool } = await import('pg');
    const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw Error('Invalid database schema');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL }), client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        await client.query("SET LOCAL lock_timeout='15s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('accountant-loans-schema'))");
        const applied = await client.query('SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [name]);
        if (applied.rowCount) {
            if (applied.rows[0].checksum !== checksum) throw Error('Applied loan migration checksum differs');
        } else {
            await client.query(sql);
            await client.query('INSERT INTO _prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)', [randomUUID(), checksum, name]);
        }
        await client.query('COMMIT');
        console.log('Loan management schema installed; no loan agreements or accounting history imported.');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); await pool.end(); }
}
