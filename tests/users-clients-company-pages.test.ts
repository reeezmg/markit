import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createError, createEvent, defineEventHandler, getHeader, getQuery, getRequestURL, readBody } from 'h3';
import { pool } from '../server/db';
import { prisma } from '../server/prisma';
import { scopeOrganizationModelReads } from '../server/utils/organizationModelScope';

const REEZC = '5271d5cb-2e97-4303-85c0-3fc9e3e6bb05';
const PUTTUR = 'cbbc74af-a72c-47a0-b92e-18af76d32221';
const MARKIT = '02856c86-60b8-41a4-ba18-79dbd55bf016';
const ADMIN = 'de505401-800f-4560-aba2-00571ea30e7c';

let sessionData: any = { companyId: REEZC, id: ADMIN, email: 'people-scope-test@example.invalid', role: 'admin' };
(globalThis as any).requireAuthSession = async () => ({ data: sessionData });
Object.assign(globalThis, { createError, defineEventHandler, getHeader, getQuery, getRequestURL, readBody });

function eventFor(method: string, url: string, body: any, companyId: string, authorizedIds: string[], filter?: string) {
  const json = JSON.stringify(body ?? {});
  const req = Readable.from([Buffer.from(json)]) as any;
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(json)),
    'x-company-id': companyId,
    ...(filter ? { 'x-company-filter': filter } : {}),
  };
  req.url = url;
  req.method = method;
  const event = createEvent(req, {} as any);
  event.context.authorizedCompanyIds = Promise.resolve(authorizedIds);
  return event;
}

const fixtures = [
  { id: REEZC, name: 'reezc', authorized: [REEZC, PUTTUR] },
  { id: PUTTUR, name: 'puttur', authorized: [REEZC, PUTTUR] },
  { id: MARKIT, name: 'Markit', authorized: [MARKIT] },
];

const userIds: string[] = [];
const clientIds: string[] = [];
const shiftIds: string[] = [];
const holidayIds: string[] = [];
const ledgerIds: string[] = [];
const db = await pool.connect();

try {
  // Recover cleanly if an earlier interrupted run stopped before its finally block.
  const staleClients = (await db.query("SELECT id FROM clients WHERE name LIKE 'Scope client %'")).rows.map(row => row.id);
  if (staleClients.length) {
    for (const field of ['newClients', 'prospectClients', 'viewingClients', 'rejectClients', 'closeClients']) {
      await db.query(`UPDATE pipelines SET "${field}"=array_remove("${field}", client_id) FROM unnest($1::text[]) client_id`, [staleClients]);
    }
    await db.query('DELETE FROM company_clients WHERE client_id = ANY($1::text[])', [staleClients]);
    await db.query('DELETE FROM clients WHERE id = ANY($1::text[])', [staleClients]);
  }
  const staleUsers = (await db.query("SELECT user_id FROM company_users WHERE name LIKE 'Scope staff %'")).rows.map(row => row.user_id);
  if (staleUsers.length) {
    const staleLedgerIds = (await db.query('SELECT id FROM user_ledger_entries WHERE user_id = ANY($1::text[])', [staleUsers])).rows.map(row => row.id);
    if (staleLedgerIds.length) {
      await db.query('DELETE FROM account_ledger_entries WHERE source_id = ANY($1::text[])', [staleLedgerIds]);
      await db.query('DELETE FROM money_transactions WHERE id = ANY($1::text[])', [staleLedgerIds]);
      await db.query('DELETE FROM user_ledger_entries WHERE id = ANY($1::text[])', [staleLedgerIds]);
    }
    await db.query('DELETE FROM company_users WHERE user_id = ANY($1::text[])', [staleUsers]);
    await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [staleUsers]);
  }
  await db.query("DELETE FROM shifts WHERE name LIKE 'Scope shift %'");
  await db.query("DELETE FROM company_holidays WHERE name LIKE 'Scope holiday %'");

  const companyMiddleware = (await import('../server/middleware/company-request')).default as any;
  const getUsers = (await import('../server/api/getuser.get')).default as any;
  const createShift = (await import('../server/api/users/shifts.post')).default as any;
  const createHoliday = (await import('../server/api/users/holidays.post')).default as any;
  const listHolidays = (await import('../server/api/users/holidays.get')).default as any;
  const createCredit = (await import('../server/api/users/credit-ledger.post')).default as any;
  const listCredit = (await import('../server/api/users/credit-ledger.get')).default as any;
  const listLedger = (await import('../server/api/users/ledger.get')).default as any;
  const updateMembership = (await import('../server/api/clients/membership.put')).default as any;
  const updatePipeline = (await import('../server/api/clients/pipeline.put')).default as any;

  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    sessionData = { ...sessionData, companyId: fixture.id, role: fixture.id === REEZC ? 'admin' : 'manager' };
    const scoped = scopeOrganizationModelReads(prisma, fixture.id, fixture.authorized) as any;

    const userId = randomUUID();
    const email = `scope-${fixture.name.toLowerCase()}-${userId.slice(0, 8)}@example.invalid`;
    await scoped.user.create({ data: { id: userId, email, password: 'test-only-password' } });
    await scoped.companyUser.create({
      data: {
        company: { connect: { id: fixture.id } },
        user: { connect: { id: userId } },
        name: `Scope staff ${fixture.name}`,
        phone: `91111000${index}`,
        role: 'user',
        status: true,
        deleted: false,
      },
    });
    userIds.push(userId);

    const users = await getUsers(eventFor('GET', `/api/getuser?companyId=${fixture.id}`, null, fixture.id, fixture.authorized));
    assert.ok(users.some((user: any) => user.id === userId));

    const shiftBody = {
      companyId: fixture.id,
      name: `Scope shift ${fixture.name}`,
      startTime: '09:00',
      endTime: '18:00',
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      overtimeMode: 'NONE',
      holidayPaid: true,
    };
    const shiftEvent = eventFor('POST', '/api/users/shifts', shiftBody, fixture.id, fixture.authorized);
    await companyMiddleware(shiftEvent);
    const shift = await createShift(shiftEvent);
    shiftIds.push(shift.shift.id);
    assert.equal(shift.shift.companyId, fixture.id);

    const holidayDate = `2035-0${index + 1}-1${index}`;
    const holidayBody = { companyId: fixture.id, date: holidayDate, name: `Scope holiday ${fixture.name}` };
    const holidayEvent = eventFor('POST', '/api/users/holidays', holidayBody, fixture.id, fixture.authorized);
    await companyMiddleware(holidayEvent);
    const holiday = await createHoliday(holidayEvent);
    holidayIds.push(holiday.holiday.id);
    assert.equal(holiday.holiday.companyId, fixture.id);

    const creditBody = {
      companyId: fixture.id,
      userId,
      type: 'CREDIT',
      amount: 40 + index,
      paymentMode: 'CASH',
      note: `Scope user credit ${fixture.name}`,
      transactionDate: new Date().toISOString().slice(0, 10),
    };
    const creditEvent = eventFor('POST', '/api/users/credit-ledger', creditBody, fixture.id, fixture.authorized);
    await companyMiddleware(creditEvent);
    const credit = await createCredit(creditEvent);
    ledgerIds.push(credit.id);
    const storedLedger = await db.query(
      `SELECT ule.company_id, ule.user_id, mt.company_id money_company
         FROM user_ledger_entries ule JOIN money_transactions mt ON mt.id=ule.id WHERE ule.id=$1`,
      [credit.id],
    );
    assert.equal(storedLedger.rows[0].company_id, fixture.id);
    assert.equal(storedLedger.rows[0].user_id, userId);
    assert.equal(storedLedger.rows[0].money_company, fixture.id);
    assert.equal(
      (await db.query('SELECT company_id FROM account_ledger_entries WHERE source_id=$1 LIMIT 1', [credit.id])).rows[0].company_id,
      fixture.id,
    );

    const clientId = randomUUID();
    await scoped.client.create({
      data: {
        id: clientId,
        name: `Scope client ${fixture.name}`,
        phone: `+9192222000${index}`,
        email: `client-${fixture.name.toLowerCase()}-${clientId.slice(0, 8)}@example.invalid`,
        companies: {
          create: {
            company: { connect: { id: fixture.id } },
            clientNumber: -Math.floor(Math.random() * 1_000_000_000),
            points: 5 + index,
          },
        },
      },
    });
    clientIds.push(clientId);

    const membershipBody = {
      companyId: fixture.id,
      clientId,
      name: `Scope client ${fixture.name} updated`,
      phone: `+9192222000${index}`,
      email: `updated-${fixture.name.toLowerCase()}-${clientId.slice(0, 8)}@example.invalid`,
    };
    const membershipEvent = eventFor('PUT', '/api/clients/membership', membershipBody, fixture.id, fixture.authorized);
    await companyMiddleware(membershipEvent);
    await updateMembership(membershipEvent);

    const pipelineBody = { companyId: fixture.id, clientId, stage: index === 0 ? 'prospect' : index === 1 ? 'viewing' : 'close' };
    const pipelineEvent = eventFor('PUT', '/api/clients/pipeline', pipelineBody, fixture.id, fixture.authorized);
    await companyMiddleware(pipelineEvent);
    await updatePipeline(pipelineEvent);
    const membership = await db.query('SELECT company_id, points, pipeline_status FROM company_clients WHERE company_id=$1 AND client_id=$2', [fixture.id, clientId]);
    assert.equal(membership.rows[0].company_id, fixture.id);
    assert.equal(membership.rows[0].pipeline_status, pipelineBody.stage);
  }

  sessionData = { ...sessionData, companyId: REEZC, role: 'admin' };
  const headScoped = scopeOrganizationModelReads(prisma, REEZC, [REEZC, PUTTUR]) as any;
  const headStaff = await headScoped.companyUser.findMany({ where: { userId: { in: userIds } } });
  assert.deepEqual(new Set(headStaff.map((row: any) => row.userId)), new Set([userIds[0], userIds[1]]));
  const headClients = await headScoped.companyClient.findMany({ where: { clientId: { in: clientIds } } });
  assert.deepEqual(new Set(headClients.map((row: any) => row.clientId)), new Set([clientIds[0], clientIds[1]]));

  const branchScoped = scopeOrganizationModelReads(prisma, PUTTUR, [PUTTUR]) as any;
  assert.deepEqual((await branchScoped.companyUser.findMany({ where: { userId: { in: userIds } } })).map((row: any) => row.userId), [userIds[1]]);
  assert.deepEqual((await branchScoped.companyClient.findMany({ where: { clientId: { in: clientIds } } })).map((row: any) => row.clientId), [clientIds[1]]);

  const holidayList = await listHolidays(eventFor('GET', '/api/users/holidays?year=2035', null, REEZC, [REEZC, PUTTUR], '*'));
  assert.ok(holidayList.holidays.some((row: any) => row.id === holidayIds[0] && row.companyId === REEZC));
  assert.ok(holidayList.holidays.some((row: any) => row.id === holidayIds[1] && row.companyId === PUTTUR));
  assert.ok(!holidayList.holidays.some((row: any) => row.id === holidayIds[2]));

  const creditList = await listCredit(eventFor('GET', '/api/users/credit-ledger', null, REEZC, [REEZC, PUTTUR], '*'));
  assert.ok(creditList.some((row: any) => row.userId === userIds[0] && row.companyId === REEZC));
  assert.ok(creditList.some((row: any) => row.userId === userIds[1] && row.companyId === PUTTUR));
  assert.ok(!creditList.some((row: any) => row.userId === userIds[2]));
  const fullLedger = await listLedger(eventFor('GET', '/api/users/ledger', null, REEZC, [REEZC, PUTTUR], '*'));
  assert.ok(fullLedger.some((row: any) => row.userId === userIds[0] && row.companyId === REEZC));
  assert.ok(fullLedger.some((row: any) => row.userId === userIds[1] && row.companyId === PUTTUR));

  const wrongUserCredit = eventFor('POST', '/api/users/credit-ledger', {
    companyId: PUTTUR, userId: userIds[0], type: 'CREDIT', amount: 1,
  }, PUTTUR, [REEZC, PUTTUR]);
  await assert.rejects(companyMiddleware(wrongUserCredit), (error: any) => error?.statusCode === 403);

  const wrongClientMembership = eventFor('PUT', '/api/clients/membership', {
    companyId: PUTTUR, clientId: clientIds[0], name: 'Denied', phone: '+919999999999',
  }, PUTTUR, [REEZC, PUTTUR]);
  await companyMiddleware(wrongClientMembership);
  await assert.rejects(updateMembership(wrongClientMembership), (error: any) => error?.statusCode === 404);

  sessionData = { ...sessionData, companyId: MARKIT, role: 'manager' };
  await assert.rejects(
    getUsers(eventFor('GET', `/api/getuser?companyId=${REEZC}`, null, MARKIT, [MARKIT])),
    (error: any) => error?.statusCode === 403,
  );

  console.log('PASS Users and Clients pages for reezc, puttur branch, and Markit: staff/client creation, company lists, shifts, holidays, credit+cash ledgers, CRM membership/pipeline, combined filters, and cross-company rejection');
} finally {
  if (clientIds.length) {
    for (const field of ['newClients', 'prospectClients', 'viewingClients', 'rejectClients', 'closeClients']) {
      await db.query(`UPDATE pipelines SET "${field}"=array_remove("${field}", client_id) FROM unnest($1::text[]) client_id WHERE company_id = ANY($2::text[])`, [clientIds, fixtures.map(f => f.id)]);
    }
    await db.query('DELETE FROM company_clients WHERE client_id = ANY($1::text[])', [clientIds]);
    await db.query('DELETE FROM clients WHERE id = ANY($1::text[])', [clientIds]);
  }
  if (ledgerIds.length) {
    await db.query('DELETE FROM account_ledger_entries WHERE source_id = ANY($1::text[])', [ledgerIds]);
    await db.query('DELETE FROM money_transactions WHERE id = ANY($1::text[])', [ledgerIds]);
    await db.query('DELETE FROM user_ledger_entries WHERE id = ANY($1::text[])', [ledgerIds]);
  }
  if (holidayIds.length) await db.query('DELETE FROM company_holidays WHERE id = ANY($1::text[])', [holidayIds]);
  if (shiftIds.length) await db.query('DELETE FROM shifts WHERE id = ANY($1::text[])', [shiftIds]);
  if (userIds.length) {
    await db.query('DELETE FROM company_users WHERE user_id = ANY($1::text[])', [userIds]);
    await db.query('DELETE FROM users WHERE id = ANY($1::text[])', [userIds]);
  }
  const leftovers = await db.query(
    `SELECT
      (SELECT count(*)::int FROM company_users WHERE name LIKE 'Scope staff %') staff,
      (SELECT count(*)::int FROM clients WHERE name LIKE 'Scope client %') clients,
      (SELECT count(*)::int FROM shifts WHERE name LIKE 'Scope shift %') shifts,
      (SELECT count(*)::int FROM company_holidays WHERE name LIKE 'Scope holiday %') holidays`,
  );
  assert.deepEqual(leftovers.rows[0], { staff: 0, clients: 0, shifts: 0, holidays: 0 });
  db.release();
  await pool.end();
  await prisma.$disconnect();
}
