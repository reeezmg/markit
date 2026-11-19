import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { publicCompanyInfo, syncCompanyInfo } from '../../storefront-starter/scripts/sync-company-info.mjs'
import { companySnapshot } from '../../storefront-starter/src/lib/company-info.js'

const store = { id: 'company-a', name: 'Originals Clothing', phone: '+91 1234567890', email: 'store@example.test',
  logoUrl: 'https://images.markit.co.in/logo.webp', currency: 'INR', formatted_address: 'Shop address',
  instagramUrl: 'javascript:alert(1)', account_no: 'private-bank-account', apiKey: 'private-key', cash: 1000 }

test('company file contains only verified public fields and safe logo/social URLs', () => {
  const info = publicCompanyInfo(store, 'company-a')
  assert.equal(info.store.name, store.name); assert.equal(info.store.phone, store.phone); assert.equal(info.store.email, store.email)
  assert.equal(info.store.logoUrl, store.logoUrl); assert.equal(info.store.instagramUrl, null)
  for (const key of ['account_no', 'apiKey', 'cash']) assert.equal(key in info.store, false)
  assert.equal(info.store.youtubeUrl, null)
})
test('cross-company profiles cannot enter the workspace or render as fallback', () => {
  assert.throws(() => publicCompanyInfo(store, 'company-b'), /does not match/)
  const info = publicCompanyInfo(store, 'company-a')
  assert.equal(companySnapshot(info, 'company-b'), null)
  assert.equal(companySnapshot(info, 'company-a')?.name, store.name)
  assert.equal(companySnapshot({ schemaVersion: 1, companyId: null, store: null }, 'company-a'), null)
})
test('sync is idempotent, refreshes changed details, and preserves a safe same-company fallback on a network failure', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'company-info-'))
  try {
    let current = store
    const args = { directory, companyId: 'company-a', apiBaseUrl: 'https://api.example.test/api',
      fetcher: async (url: string) => { assert.equal(url, 'https://api.example.test/api/custom/company-a/store'); return Response.json({ store: current }) } }
    assert.equal((await syncCompanyInfo(args)).changed, true)
    assert.equal((await syncCompanyInfo(args)).changed, false)
    current = { ...store, phone: '+91 9999999999' }
    assert.equal((await syncCompanyInfo(args)).info.store.phone, current.phone)
    const offline = await syncCompanyInfo({ ...args, allowExisting: true, fetcher: async () => { throw new Error('network unavailable') } })
    assert.equal(offline.source, 'existing-snapshot'); assert.equal(offline.info.store.phone, current.phone)
    await assert.rejects(syncCompanyInfo({ ...args, allowExisting: true, companyId: 'company-b', fetcher: async () => { throw new Error('offline') } }))
    await assert.rejects(syncCompanyInfo({ ...args, allowExisting: true, fetcher: async () => Response.json({}, { status: 404 }) }), /404/)
    await assert.rejects(syncCompanyInfo({ ...args, allowExisting: true, fetcher: async () => Response.json({ store: { ...store, id: 'company-b' } }) }), /does not match/)
  } finally { await fs.rm(directory, { recursive: true, force: true }) }
})
