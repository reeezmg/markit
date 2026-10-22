import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createError, createEvent } from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
import { getAllStoreIds, getHeadOfficeAdmin, listAccessibleCompanies } from '../server/utils/organizationAccess';
import { getReadCompanyId, getReadCompanyIds } from '../server/utils/organizationReadScope';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

test('live head office/branch authorization and model queries (SELECT only)', { timeout: 90000 }, async t => {
  const db = await pool.connect();
  let data: any;
  Object.assign(globalThis, { createError, requireAuthSession: async () => ({ data }) });
  const request = (headers: Record<string, string> = {}, query = '') => createEvent({
    headers, method: 'GET', url: '/api/test' + query,
  } as any, {} as any);
  try {
    await db.query('BEGIN READ ONLY');
    const { rows } = await db.query(`SELECT c.id,cu.user_id FROM companies c
      JOIN company_users cu ON cu.company_id=c.id
      WHERE c.is_head_office=true AND c.parent_company_id IS NULL AND c.status=true
        AND cu.role='admin' AND cu.status=true AND cu.deleted=false
      ORDER BY c.id,cu.user_id LIMIT 1`);
    if (!rows.length) { t.skip('No existing active head-office admin fixture; no records were created.'); return; }
    const head = rows[0].id, user = rows[0].user_id;
    data = { companyId: head, id: user, email: 'readonly@example.invalid', role: 'admin' };
    const expected = [head, ...(await db.query('SELECT id FROM companies WHERE parent_company_id=$1 AND status=true ORDER BY id', [head])).rows.map(r => r.id)];
    assert.ok(await getHeadOfficeAdmin(user, head));
    assert.deepEqual((await getAllStoreIds(user, head)).sort(), [...expected].sort());
    const accessible = await listAccessibleCompanies(user);
    for (const id of expected) assert.ok(accessible.some(c => c.id === id));
    assert.deepEqual((await getReadCompanyIds(request({ 'x-company-filter': '*' }))).sort(), [...expected].sort());
    for (const id of expected) {
      assert.deepEqual(await getReadCompanyIds(request({ 'x-company-filter': id })), [id]);
      assert.equal(await getReadCompanyId(request({}, '?companyId=' + id)), id);
      const scoped = scopeOrganizationModelReads(prisma, head, expected);
      assert.equal(await scoped.product.count({ where: { companyId: id } }), await prisma.product.count({ where: { companyId: id } }));
      assert.equal(await scoped.billHistory.count({ where: { bill: { companyId: id } } }), await prisma.billHistory.count({ where: { bill: { companyId: id } } }));
    }
    const outside = (await db.query('SELECT id FROM companies WHERE NOT(id=ANY($1::text[])) ORDER BY id LIMIT 1', [expected])).rows[0]?.id;
    if (outside) await assert.rejects(getReadCompanyIds(request({ 'x-company-filter': outside })), (e: any) => e.statusCode === 403);
    for (const branch of expected.slice(1)) {
      data = { ...data, companyId: branch };
      assert.equal(await getHeadOfficeAdmin(user, branch), null);
      assert.deepEqual(await getReadCompanyIds(request({ 'x-company-filter': '*' })), [branch]);
      await assert.rejects(getReadCompanyId(request({}, '?companyId=' + head)), (e: any) => e.statusCode === 403);
    }
    console.log(`PASS live authorization: 1 head office, ${expected.length - 1} branches, explicit filters, downloads, model counts and outside-company rejection. SELECT-only inspection.`);
  } finally { await db.query('ROLLBACK'); db.release(); await pool.end(); await prisma.$disconnect(); }
});
