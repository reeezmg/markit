import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createEvent } from 'h3';
import getWorkflow from '../server/api/settings/sales-workflow.get';
import putWorkflow from '../server/api/settings/sales-workflow.put';
import { pool } from '../server/db';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

(globalThis as any).requireAuthSession = async (event: any) => ({ data: { companyId: 'a', role: event.context.fixtureRole || 'manager' } });
function event(body?: any, role = 'manager', owner = 'a') {
    const json = body === undefined ? '' : JSON.stringify(body);
    const request: any = Readable.from(json ? [Buffer.from(json)] : []);
    request.url = '/api/settings/sales-workflow'; request.method = body === undefined ? 'GET' : 'PUT';
    request.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(json)), 'x-company-id': owner };
    const current = createEvent(request, { setHeader() {}, getHeader() {} } as any);
    current.context.authorizedCompanyIds = ['a', 'branch']; current.context.fixtureRole = role;
    return current;
}
test('workflow handlers enforce company scope, permission and boolean input before writing', async () => {
    const originalConnect = pool.connect, originalQuery = pool.query;
    const calls: { sql: string; args: any[] }[] = [];
    const db = { release() {}, query: async (sql: string, args: any[] = []) => { calls.push({ sql, args }); return { rows: sql.startsWith('SELECT id FROM companies') ? [{ id: args[0] }] : [] }; } };
    (pool as any).connect = async () => db;
    (pool as any).query = async () => ({ rows: [{ preference_value: { includeInvoicing: false } }] });
    try {
        assert.equal((await getWorkflow(event(undefined, 'staff'))).preferences.includeInvoicing, false);
        assert.equal(calls.length, 0, 'GET does not initialize or write data');
        await assert.rejects(putWorkflow(event({ includeInvoicing: false }, 'staff')), (e: any) => e.statusCode === 403);
        await assert.rejects(putWorkflow(event({ includeInvoicing: 'false' })), (e: any) => e.statusCode === 400);
        await assert.rejects(putWorkflow(event({ includeAfterSales: 'false' })), (e: any) => e.statusCode === 400);
        await assert.rejects(putWorkflow(event({})), (e: any) => e.statusCode === 400);
        await assert.rejects(putWorkflow(event({ includeAfterSales: false }, 'staff')), (e: any) => e.statusCode === 403);
        await assert.rejects(putWorkflow(event({ includeAfterSales: false }, 'manager', 'foreign')), (e: any) => e.statusCode === 403);
        await assert.rejects(putWorkflow(event({ includeInvoicing: false }, 'manager', 'foreign')), (e: any) => e.statusCode === 403);
        assert.equal(calls.length, 0);
        const result = await putWorkflow(event({ includeInvoicing: false }, 'manager', 'branch'));
        assert.equal(result.preferences.includeInvoicing, false);
        assert.equal(calls[0].sql, 'BEGIN'); assert.equal(calls.at(-1)!.sql, 'COMMIT');
        assert.ok(calls.some(c => c.sql.includes('FOR UPDATE') && c.args[0] === 'branch'));
        assert.ok(calls.some(c => c.sql.includes('defaults-backup') && c.args[0] === 'branch'));
        assert.ok(calls.some(c => c.args[1] === 'branch' && c.args[2] === '{"version":1,"includeInvoicing":false,"includeAfterSales":false}'));
        const afterSales = await putWorkflow(event({ includeAfterSales: false }, 'manager', 'branch'));
        assert.equal(afterSales.preferences.includeAfterSales, false);
        assert.equal(afterSales.preferences.includeInvoicing, false);
    } finally { pool.connect = originalConnect; pool.query = originalQuery; }
});
test('generic preference APIs cannot bypass workflow management permissions', async () => {
    const delegate = { findMany: async () => [{ pageName: 'sales-workflow' }], create: async () => { throw Error('Unexpected write'); }, update: async () => { throw Error('Unexpected write'); }, deleteMany: async () => { throw Error('Unexpected write'); } };
    const db: any = { generalPreference: delegate, $transaction: async (fn: any) => fn(db) };
    const api = scopeOrganizationModelReads(db, 'a', ['a']);
    for (const operation of ['create', 'update', 'deleteMany']) await assert.rejects(api.generalPreference[operation]({ data: { pageName: 'sales-workflow', companyId: 'a' } }), /Use Company & Branches settings/);
});
