import 'dotenv/config'
import { Pool } from 'pg'
import { crmReady } from '../server/utils/crm'

// Read-only verification of the same physical contract used by CRM bootstrap.
const db = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 })
try {
  const ready = await crmReady(db)
  console.log(JSON.stringify({ crmReady: ready }))
  if (!ready) process.exitCode = 1
} finally {
  await db.end()
}
