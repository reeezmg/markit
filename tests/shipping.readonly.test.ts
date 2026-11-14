import assert from 'node:assert/strict'
import { test } from 'node:test'
import { config } from 'dotenv'
import { Pool } from 'pg'
import { createShippingService } from '../server/utils/shipping/service'

test('real database: single and bulk previews run inside a read-only transaction without shipping HTTP', {
  skip: process.env.SHIPPING_READONLY_CHECK !== '1',
}, async () => {
  config({ quiet: true })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 })
  const db = await pool.connect()
  try {
    await db.query('BEGIN READ ONLY')
    await db.query("SET LOCAL statement_timeout='20s'")
    const sample = (await db.query(`SELECT id,company_id FROM ecomm_orders WHERE status='PACKED' AND meta->>'awb' IS NULL ORDER BY created_at DESC LIMIT 1`)).rows[0]
    assert.ok(sample, 'A packed unshipped order is needed for this read-only check')
    const service = createShippingService(db, sample.company_id, async () => { throw Error('Preview attempted an HTTP call') })
    const preview = await service.run({ method: 'GET', path: `order/${sample.id}/preview` })
    assert.equal(preview.order.orderId, sample.id)
    assert.equal(typeof preview.order.canShip, 'boolean')
    assert.ok(Array.isArray(preview.order.lines))
    const bulk = await service.run({ method: 'POST', path: 'bulk-preview', body: { orderIds: [sample.id] } })
    assert.equal(bulk.total, 1)
    assert.deepEqual(bulk.orders[0], preview.order)
    const empty = await service.run({ method: 'POST', path: 'bulk-preview', body: { orderIds: [] } })
    assert.equal(empty.total, 0)
  } finally {
    await db.query('ROLLBACK')
    db.release()
    await pool.end()
  }
})
