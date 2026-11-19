import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });
const source = readFileSync('server/utils/accountant/loans.ts', 'utf8');
const queries = [...source.matchAll(/'(SELECT e\.\*,e\.event_date::text AS event_date[^']*)'/g)].map(m => m[1]);
assert.equal(queries.length, 2, 'Check the actual company-list and individual-history SQL');
const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
assert.match(schema, /^[A-Za-z_][A-Za-z0-9_]*$/);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
let client;
try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    await client.query("SELECT set_config('search_path',$1,true)", [schema]);
    for (const sql of queries) {
        const result = await client.query(sql, sql.includes('$2') ? [randomUUID(), randomUUID()] : [randomUUID()]);
        assert.equal(result.rows.length, 0, 'Random company scope never retrieves customer records');
    }
    console.log('Both actual loan event queries passed PostgreSQL in a read-only transaction. No customer records retrieved.');
} finally {
    if (client) {
        try { await client.query('ROLLBACK'); } finally { client.release(); }
    }
    await pool.end();
}
