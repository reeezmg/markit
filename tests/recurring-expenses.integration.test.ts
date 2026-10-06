import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createEvent, createError } from 'h3';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { processRecurringExpenses } from '../server/utils/recurring-expenses';
import { indiaExpenseDate, nextExpenseMonth } from '../utils/recurring-expenses';

dotenv.config({ quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the isolated integration test');
const schema = `recurring_test_${randomUUID().replaceAll('-', '')}`;
// Session-scoped search_path needs a direct connection, not Neon's transaction pooler.
const connection = new URL(process.env.DATABASE_URL);
connection.hostname = connection.hostname.replace('-pooler.', '.');
const admin = new Pool({ connectionString: connection.toString() });
const pool = new Pool({ connectionString: connection.toString(), options: `-c search_path=${schema}`, max: 4 });
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await pool.query(`CREATE TABLE companies(id text PRIMARY KEY,expense_counter int DEFAULT 1,currency text DEFAULT 'INR',status boolean DEFAULT true);
    CREATE TABLE expense_categories(id text PRIMARY KEY,company_id text,name text DEFAULT 'Test category');
    CREATE TABLE expenses(id text PRIMARY KEY,company_id text,expense_category_id text,expense_number int,expense_date timestamp,
      note text,currency text,payment_mode text,status text,total_amount float8,tax_amount float8,recoverable_tax_amount float8,created_at timestamp,updated_at timestamp);
    INSERT INTO companies(id) VALUES('a'),('b');
    INSERT INTO expense_categories(id,company_id) VALUES('cat-a','a'),('cat-b','b');
    CREATE FUNCTION reject_test_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.note='Reject' THEN RAISE EXCEPTION 'Test closed accounting period'; END IF; RETURN NEW; END; $$;
    CREATE CONSTRAINT TRIGGER test_expense_posting AFTER INSERT ON expenses DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION reject_test_expense();`);
  await pool.query(readFileSync(new URL('./fixtures/recurring-expenses.sql', import.meta.url), 'utf8'));
  const today = indiaExpenseDate();
  const day = Number(today.slice(8));
  async function schedule(id: string, company = 'a', category = 'cat-a', date = today, name = 'Rent', active = true) {
    await pool.query(`INSERT INTO recurring_expenses(id,company_id,category_id,name,total_amount,tax_amount,recoverable_tax_amount,next_due_date,day_of_month,active)
      VALUES($1,$2,$3,$4,118,18,0,$5::date,$6,$7)`, [id, company, category, name, date, Number(date.slice(8)), active]);
  }
  await schedule('one');
  await schedule('other-company', 'b', 'cat-b');
  await schedule('paused', 'a', 'cat-a', today, 'Paused', false);
  await schedule('future', 'a', 'cat-a', nextExpenseMonth(today, day));
  const runs = await Promise.all([processRecurringExpenses(pool, 'a'), processRecurringExpenses(pool, 'a')]);
  assert.equal(runs.reduce((sum, r) => sum + r.created, 0), 1, 'overlapping runs create once');
  let expense = (await pool.query('SELECT * FROM expenses')).rows;
  assert.equal(expense.length, 1);
  assert.equal(expense[0].status, 'Pending');
  assert.equal(expense[0].recoverable_tax_amount, 0);
  assert.equal(expense[0].expense_number, 1);
  assert.equal((await processRecurringExpenses(pool, 'a')).created, 0, 'retry is a no-op');
  // Deleting the generated expense retains the occurrence receipt and prevents recreation.
  await pool.query('DELETE FROM expenses');
  await pool.query("UPDATE recurring_expenses SET next_due_date=$1::date WHERE id='one'", [today]);
  assert.equal((await processRecurringExpenses(pool, 'a')).created, 0);
  assert.equal((await pool.query('SELECT expense_id FROM recurring_expense_occurrences')).rows[0].expense_id, null);
  assert.equal((await processRecurringExpenses(pool)).created, 1, 'global cron visits other companies');
  // Catch up each missed month, preserving the original due dates.
  const prior = new Date(`${today}T00:00:00Z`);
  prior.setUTCDate(1); prior.setUTCMonth(prior.getUTCMonth() - 2);
  await schedule('catchup', 'a', 'cat-a', prior.toISOString().slice(0, 10));
  assert.equal((await processRecurringExpenses(pool, 'a')).created, 3);
  await schedule('broken', 'a', 'cat-a', today, 'Reject');
  await schedule('wrong-category', 'a', 'cat-b');
  const counterBefore = (await pool.query("SELECT expense_counter FROM companies WHERE id='a'")).rows[0].expense_counter;
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args); };
  try {
    const failed = await processRecurringExpenses(pool, 'a');
    assert.equal(failed.failed, 2);
    assert.equal(failed.created, 0);
    assert.equal(failed.remaining, 2);
  } finally { console.error = originalError; }
  assert.equal(errors.length, 2);
  assert.equal((await pool.query("SELECT expense_counter FROM companies WHERE id='a'")).rows[0].expense_counter, counterBefore);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM recurring_expense_occurrences WHERE schedule_id IN ('broken','wrong-category')")).rows[0].n, 0);
  await pool.query("UPDATE recurring_expenses SET name='Fixed' WHERE id='broken'");
  await pool.query("UPDATE recurring_expenses SET active=false WHERE id='wrong-category'");
  assert.equal((await processRecurringExpenses(pool, 'a')).created, 1, 'failed commit retries successfully');
  // Exercise real HTTP handlers with test authentication and an isolated database.
  const applicationPool = (await import('../server/db')).pool;
  const originalConnect = applicationPool.connect;
  const originalQuery = applicationPool.query;
  Object.assign(globalThis, { requireAuthSession: async () => ({ data: { id: 'tester', companyId: 'a' } }) });
  (applicationPool as any).connect = pool.connect.bind(pool);
  (applicationPool as any).query = pool.query.bind(pool);
  const oldSecret = process.env.CRON_SECRET;
  try {
    const create = (await import('../server/api/accounts/recurring-expenses/index.post')).default;
    const update = (await import('../server/api/accounts/recurring-expenses/[id].put')).default;
    const toggle = (await import('../server/api/accounts/recurring-expenses/[id].patch')).default;
    const list = (await import('../server/api/accounts/recurring-expenses/index.get')).default;
    const cron = (await import('../server/api/cron/recurring-expenses.get')).default;
    async function call(handler: any, method: string, body: any = {}, id?: string, company = 'a', authorization = '') {
      const text = JSON.stringify(body);
      const req: any = Readable.from([Buffer.from(text)]);
      req.headers = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)), 'x-company-id': company, authorization };
      req.method = method; req.url = '/api/accounts/recurring-expenses';
      const event = createEvent(req, { setHeader() {}, getHeader() {} } as any);
      event.context.params = id ? { id } : {};
      event.context.authorizedCompanyIds = Promise.resolve(['a']);
      return handler(event);
    }
    const body = { name: 'API rent', categoryId: 'cat-a', totalAmount: 200, taxAmount: 0,
      recoverableTaxAmount: 0, nextDueDate: today, dayOfMonth: day, active: false };
    const added = await call(create, 'POST', body);
    assert.ok(added.id);
    await call(update, 'PUT', { ...body, totalAmount: 250 }, added.id);
    const listed = await call(list, 'GET');
    assert.equal(listed.find((r: any) => r.id === added.id).totalAmount, 250);
    assert.ok(listed.every((r: any) => r.id !== 'other-company'));
    await assert.rejects(call(create, 'POST', { ...body, categoryId: 'cat-b' }), { statusCode: 400 });
    await assert.rejects(call(list, 'GET', {}, undefined, 'b'), { statusCode: 403 });
    await assert.rejects(call(update, 'PUT', body, 'other-company'), { statusCode: 404 });
    await assert.rejects(call(toggle, 'PATCH', { active: false }, 'other-company'), { statusCode: 404 });
    await call(toggle, 'PATCH', { active: true }, added.id);
    assert.equal((await processRecurringExpenses(pool, 'a')).created, 1);
    await assert.rejects(call(update, 'PUT', body, added.id), { statusCode: 400 });
    delete process.env.CRON_SECRET;
    await assert.rejects(call(cron, 'GET'), { statusCode: 401 });
    process.env.CRON_SECRET = 'test-secret-for-recurring-expenses';
    await assert.rejects(call(cron, 'GET', {}, undefined, 'a', 'Bearer incorrect'), { statusCode: 401 });
    assert.equal((await call(cron, 'GET', {}, undefined, 'a', `Bearer ${process.env.CRON_SECRET}`)).created, 0);
    Object.assign(globalThis, { requireAuthSession: async () => { throw createError({ statusCode: 401 }); } });
    await assert.rejects(call(list, 'GET'), { statusCode: 401 });
  } finally {
    applicationPool.connect = originalConnect;
    applicationPool.query = originalQuery;
    if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret;
  }
  console.log('Recurring expense integration passed: concurrency, isolation, catch-up, deletion, deferred rollback and retries');
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
