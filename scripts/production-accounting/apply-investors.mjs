import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
const args = process.argv.slice(2);
if (args.some((a) => a !== '--apply'))
    throw Error(
        'Usage: node scripts/production-accounting/apply-investors.mjs [--apply]'
    );
const name = '20260930120000_investors',
    sql = readFileSync(
        new URL(
            `../../prisma/migrations/${name}/migration.sql`,
            import.meta.url
        ),
        'utf8'
    );
const checksum = createHash('sha256').update(sql).digest('hex');
const schema =
    new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))
    throw Error('Invalid database schema');
const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
    client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query("SET LOCAL lock_timeout='15s'");
    await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('accountant-investors-schema'))"
    );
    const applied = await client.query(
        'SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL',
        [name]
    );
    if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
            throw Error('Applied investor migration checksum differs');
        console.log('Investor schema already applied.');
    } else {
        await client.query(sql);
        if (args.includes('--apply'))
            await client.query(
                'INSERT INTO _prisma_migrations(id,checksum,migration_name,finished_at,applied_steps_count) VALUES($1,$2,$3,now(),1)',
                [randomUUID(), checksum, name]
            );
        console.log(
            args.includes('--apply')
                ? 'Investor schema installed.'
                : 'Investor schema preview succeeded; all changes rolled back.'
        );
    }
    await client.query(args.includes('--apply') ? 'COMMIT' : 'ROLLBACK');
} catch (e) {
    await client.query('ROLLBACK');
    throw e;
} finally {
    client.release();
    await pool.end();
}
