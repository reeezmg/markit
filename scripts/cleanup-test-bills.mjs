#!/usr/bin/env node
import pg from 'pg'

const { Pool } = pg
const DB_URL = 'postgresql://neondb_owner:npg_gHeLu8s2adzi@ep-orange-night-a1hei8bh-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
const API = 'http://localhost:3000'
const COMPANY_ID = '02856c86-60b8-41a4-ba18-79dbd55bf016'

const pool = new Pool({ connectionString: DB_URL })

const r = await pool.query(
  `SELECT DISTINCT b.id
   FROM bills b
   JOIN entries e ON e.bill_id = b.id
   WHERE b.company_id = $1 AND e.user_name = 'TEST' AND b.deleted = false`,
  [COMPANY_ID],
)

console.log(`Found ${r.rowCount} orphan TEST bills, soft-deleting via API...`)

for (const row of r.rows) {
  try {
    const res = await fetch(`${API}/api/billSale/deleteBill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ billId: row.id, companyId: COMPANY_ID }),
    })
    console.log(res.ok ? `  ✓ ${row.id}` : `  ✗ ${row.id} ${res.status}`)
  } catch (e) {
    console.log(`  ✗ ${row.id} ${e.message}`)
  }
}

await pool.end()
