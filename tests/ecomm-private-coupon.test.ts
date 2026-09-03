import assert from 'node:assert/strict'
import { eligibleCoupons, findEligibleCoupon } from '../server/utils/ecomm-coupons'

function recordingDb(rows: any[] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  return {
    calls,
    db: {
      async query(sql: string, params: unknown[]) {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
        return { rows }
      },
    } as any,
  }
}

async function run() {
  {
    const { db, calls } = recordingDb()
    await eligibleCoupons(db, 'company-1', 'client-1', 1000)
    assert.match(calls[0].sql, /c\.audience_type = 'ALL'/)
    assert.equal(calls[0].params[2], null)
    assert.equal(calls[0].params[5], false)
  }

  {
    const { db, calls } = recordingDb()
    await eligibleCoupons(db, 'company-1', 'client-1', 1000, ' secret10 ')
    assert.match(calls[0].sql, /c\.audience_type = 'PRIVATE'/)
    assert.equal(calls[0].params[2], 'SECRET10')
  }

  {
    const coupon = { id: 'private-1', audience_type: 'PRIVATE' }
    const { db, calls } = recordingDb([coupon])
    assert.equal(await findEligibleCoupon(db, 'company-1', 'client-1', 1000, coupon.id), coupon)
    assert.equal(calls[0].params[4], coupon.id)
    assert.equal(calls[0].params[5], true)
  }
}

run().then(() => console.log('ecomm-private-coupon tests passed'))
