import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { accountantContext } from '../server/utils/accountant/context';
import { ecommerceAccountingRouter, ecommerceRoles } from '../server/utils/accountant/ecommerce';
import { createEcommOrder } from '../server/utils/ecomm-order-create';
import { cancelEcommOrder } from '../server/utils/ecomm-order-cancel';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = await pool.connect();
const schema = `ecommerce_test_${randomUUID().replaceAll('-', '')}`;
const migration = (name: string) => readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
async function sql(text: string, args: any[] = []) {
  await db.query('SAVEPOINT test_step');
  try {
    const r = await db.query(text, args);
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
    await db.query('RELEASE SAVEPOINT test_step');
    return r;
  } catch (e) { await db.query('ROLLBACK TO SAVEPOINT test_step'); throw e; }
}
const adapter = { $queryRawUnsafe: async (text: string, ...args: any[]) => (await db.query(text, args)).rows,
  $executeRawUnsafe: async (text: string, ...args: any[]) => (await db.query(text, args)).rowCount };
async function event(id: string, body: any, companyId = 'a') {
  await db.query('SAVEPOINT api_step');
  try {
    let result: any;
    await accountantContext.run({ companyId, userId: 'tester', role: 'accountant', db: adapter }, async () => {
      const res: any = { json: (v: any) => { result = v; return res; }, status: () => res };
      await ecommerceAccountingRouter.dispatch('POST', `/orders/${id}/events`, { user: { companyId, userId: 'tester', role: 'accountant' }, body, params: {}, query: {} }, res);
    });
    await db.query('SET CONSTRAINTS ALL IMMEDIATE'); await db.query('SET CONSTRAINTS ALL DEFERRED');
    await db.query('RELEASE SAVEPOINT api_step'); return result;
  } catch (e) { await db.query('ROLLBACK TO SAVEPOINT api_step'); throw e; }
}
const request = (action: string, extra: any = {}) => ({ requestId: randomUUID(), action, date: '2099-01-01', reference: 'Test evidence', ...extra });
const balance = async (role: string) => Number((await db.query(`SELECT COALESCE(sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END),0) AS n FROM accountant_v2_manual_journal_lines WHERE company_id='a' AND account_id=$1`, [role])).rows[0].n);
try {
  await db.query('BEGIN'); await db.query(`CREATE SCHEMA "${schema}"`); await db.query(`SET LOCAL search_path TO "${schema}"`);
  await db.query(`CREATE TABLE companies(id text PRIMARY KEY,currency text DEFAULT 'INR'); INSERT INTO companies(id) VALUES('a'),('b');
    CREATE TABLE clients(id text PRIMARY KEY,name text); CREATE TABLE company_clients(company_id text,client_id text,points int DEFAULT 0);
    CREATE TABLE company_users(company_id text,user_id text,name text); CREATE TABLE accounts(id text PRIMARY KEY,company_id text,name text);
    CREATE TABLE bills(id text PRIMARY KEY,company_id text,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),invoice_number int DEFAULT 1,client_id text,user_id text,credit_user_id text,account_id text,grand_total numeric,subtotal numeric,discount numeric DEFAULT 0,tax numeric DEFAULT 0,delivery_fee numeric DEFAULT 0,cod_charge numeric DEFAULT 0,redeemed_points numeric DEFAULT 0,bill_points int DEFAULT 0,payment_method text,payment_status text DEFAULT 'PENDING',split_payments jsonb,deleted boolean DEFAULT false,is_markit boolean DEFAULT false,type text DEFAULT 'STANDARD',status text DEFAULT 'PENDING',notes text);
    CREATE TABLE ecomm_orders(id text PRIMARY KEY,company_id text,bill_id text,client_id text,checkout_id text,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now(),order_number int DEFAULT 1,status text DEFAULT 'PLACED',payment_status text DEFAULT 'PENDING',payment_method text);
    CREATE TABLE ecomm_checkouts(id text PRIMARY KEY,company_id text,status text,payment_status text);
    CREATE TABLE items(id text PRIMARY KEY,company_id text,qty int,sold_qty int,updated_at timestamp DEFAULT now());
    CREATE TABLE variants(id text PRIMARY KEY,p_price numeric); INSERT INTO variants VALUES('v',40);
    CREATE TABLE entries(id text PRIMARY KEY,company_id text,bill_id text,variant_id text,item_id text,qty numeric,value numeric,tax numeric,return boolean DEFAULT false);
    CREATE TABLE expenses(id text PRIMARY KEY,company_id text,created_at timestamp,expense_date timestamp,expense_number int,from_id text,total_amount numeric,tax_amount numeric,recoverable_tax_amount numeric,payment_mode text,status text,note text,currency text);
    CREATE TABLE distributor_payments(id text PRIMARY KEY,company_id text,expense_id text);`);
  await db.query(migration('20260926120000_accountant_v2'));
  await db.query(`CREATE FUNCTION accountant_v2_distributor_check_date(c text,d timestamp,banking boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    IF EXISTS(SELECT 1 FROM accountant_v2_transaction_locks WHERE company_id=c AND is_locked AND lock_date>=d) THEN RAISE EXCEPTION 'Locked'; END IF; END $$;`);
  await db.query(migration('20260927150000_erp_accounting'));
  await db.query(migration('20260927170000_erp_party_links'));
  await db.query(migration('20261001120000_document_status_history'));
  await db.query(migration('20261001130000_ecommerce_accounting'));
  const mappings: any = {};
  for (const [role, spec] of Object.entries(ecommerceRoles)) {
    mappings[role] = role;
    const category = ['sales','deliveryIncome','codIncome'].includes(role) ? 'INCOME' : ['cogs','shippingExpense','gatewayExpense','loyaltyExpense'].includes(role) ? 'EXPENSE' : ['outputTax','refundPayable','expensePayable'].includes(role) ? 'LIABILITY' : 'ASSET';
    await db.query('INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES($1,\'a\',$1,$2,$3,now())', [role, spec.type, category]);
  }
  await db.query(`INSERT INTO accountant_v2_ecommerce_settings(company_id,enabled,activated_at,accounts) VALUES('a',true,'2000-01-01',$1::jsonb);
  `, [JSON.stringify(mappings)]);
  await db.query(`INSERT INTO accountant_v2_erp_settings(company_id,enabled,activated_at,accounts) VALUES('a',true,'2000-01-01',$1::jsonb)`, [JSON.stringify(mappings)]);
  async function order(id: string, method = 'COD', paid = false) {
    await sql(`INSERT INTO items(id,company_id,qty,sold_qty) VALUES($1,'a',8,2);
    `, [id]);
    await sql(`INSERT INTO bills(id,company_id,grand_total,subtotal,tax,delivery_fee,cod_charge,payment_method,payment_status) VALUES($1,'a',148,118,18,20,10,$2,$3);
    `, [id, method, paid ? 'PAID' : 'PENDING']);
    await sql(`INSERT INTO entries VALUES($1,'a',$1,'v',$1,2,118,18,false)`, [id]);
    await sql(`INSERT INTO ecomm_orders(id,company_id,bill_id) VALUES($1,'a',$1)`, [id]);
  }
  await order('cod');
  assert.equal(await balance('receivable'), 148); assert.equal(await balance('sales'), -100);
  assert.equal(await balance('deliveryIncome'), -20); assert.equal(await balance('codIncome'), -10);
  assert.equal(await balance('outputTax'), -18); assert.equal(await balance('cogs'), 80); assert.equal(await balance('bank'), 0);
  await sql("UPDATE variants SET p_price=60 WHERE id='v'; UPDATE bills SET notes='cost changed' WHERE id='cod'");
  assert.equal(await balance('cogs'), 80, 'Later purchase-price changes do not restate sold cost');
  await sql("INSERT INTO variants VALUES('v2',30); UPDATE entries SET variant_id='v2' WHERE id='cod'");
  assert.equal(await balance('cogs'), 60, 'Replacing the sold variant uses that variant cost');
  await sql("UPDATE entries SET variant_id='v' WHERE id='cod'; UPDATE variants SET p_price=40 WHERE id='v'");
  assert.equal(await balance('cogs'), 80);
  const before = (await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals')).rows[0].n;
  await sql("UPDATE bills SET notes='edited' WHERE id='cod'");
  assert.equal((await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals')).rows[0].n, before);
  await sql("UPDATE bills SET payment_status='PAID' WHERE id='cod'; UPDATE ecomm_orders SET status='DELIVERED',payment_status='PAID' WHERE id='cod'");
  assert.equal(await balance('codClearing'), 148); assert.equal(await balance('receivable'), 0); assert.equal(await balance('bank'), 0);
  const settlement = request('SETTLEMENT', { funding: 'codClearing', amount: 148, fee: 12, tax: 2 });
  await event('cod', settlement); await event('cod', settlement);
  assert.equal(await balance('bank'), 136); assert.equal(await balance('shippingExpense'), 10); assert.equal(await balance('inputTax'), 2); assert.equal(await balance('codClearing'), 0);
  await assert.rejects(event('cod', { ...settlement, amount: 147 }), /different entry/);
  await assert.rejects(event('cod', request('SETTLEMENT', { funding: 'codClearing', amount: 1 })), /exceeds/);
  await assert.rejects(event('cod', request('REFUND', { funding: 'bank', amount: 1 })), /exceeds/);
  await assert.rejects(event('cod', request('COST', { amount: 1 }), 'b'), /not found/);
  await event('cod', request('RETURN', { items: [{ entryId: 'cod', qty: 1 }], refundDelivery: true }));
  assert.equal(await balance('refundPayable'), -79); assert.equal(await balance('cogs'), 40); assert.equal(await balance('sales'), -50);
  assert.equal((await db.query("SELECT qty FROM items WHERE id='cod'")).rows[0].qty, 9);
  await event('cod', request('REFUND', { funding: 'bank', amount: 79 }));
  assert.equal(await balance('refundPayable'), 0); assert.equal(await balance('bank'), 57);
  await event('cod', request('RETURN', { items: [{ entryId: 'cod', qty: 1 }], refundDelivery: true, refundCod: true }));
  assert.equal(await balance('refundPayable'), -69); assert.equal(await balance('sales'), 0); assert.equal(await balance('outputTax'), 0); assert.equal(await balance('cogs'), 0);
  await assert.rejects(event('cod', request('RETURN', { items: [{ entryId: 'cod', qty: 1 }] })), /quantities/);
  await assert.rejects(sql("UPDATE bills SET grand_total=147 WHERE id='cod'"), /accounted returns/);
  await order('online', 'UPI', true);
  assert.equal(await balance('gatewayClearing'), 148);
  await sql("UPDATE bills SET status='CANCELED' WHERE id='online'; UPDATE ecomm_orders SET status='CANCELLED' WHERE id='online'");
  assert.equal(await balance('gatewayClearing'), 148); assert.equal(await balance('refundPayable'), -217);
  await event('online', request('REFUND', { funding: 'gatewayClearing', amount: 148 }));
  assert.equal(await balance('gatewayClearing'), 0);
  await order('unpaid');
  await sql("UPDATE bills SET status='CANCELED' WHERE id='unpaid'; UPDATE ecomm_orders SET status='CANCELLED' WHERE id='unpaid'");
  assert.equal(await balance('receivable'), 0);
  await order('manual');
  await sql("INSERT INTO clients VALUES('client-a','Customer A'),('client-b','Customer B'); INSERT INTO company_clients(company_id,client_id) VALUES('a','client-a'),('b','client-b'); UPDATE bills SET client_id='client-a' WHERE id='manual'");
  assert.equal((await db.query("SELECT signature->'metadata'->'parties'->'client'->>'name' AS name FROM accountant_v2_erp_sources WHERE source_key='ecommerce-sale:manual'")).rows[0].name, 'Customer A');
  await assert.rejects(sql("UPDATE bills SET client_id='client-b' WHERE id='manual'"), /does not belong/);
  await event('manual', request('RECEIPT', { funding: 'codClearing', amount: 48 }));
  assert.equal((await db.query("SELECT payment_status FROM bills WHERE id='manual'")).rows[0].payment_status, 'PENDING');
  await event('manual', request('RECEIPT', { funding: 'codClearing', amount: 100 }));
  assert.equal((await db.query("SELECT payment_status FROM bills WHERE id='manual'")).rows[0].payment_status, 'PAID');
  assert.equal(await balance('codClearing'), 148, 'Manual collection must not be collected again by automatic paid settlement');
  await sql("UPDATE bills SET grand_total=160,delivery_fee=32 WHERE id='manual'");
  assert.equal(await balance('codClearing'), 148, 'Increasing a paid invoice must not invent an additional collection');
  assert.equal(await balance('receivable'), 12);
  await sql("UPDATE bills SET grand_total=148,delivery_fee=20 WHERE id='manual'");
  await event('manual', request('CHARGE', { category: 'deliveryIncome', amount: 12, tax: 2 }));
  assert.equal(await balance('receivable'), 12);
  await event('manual', request('RECEIPT', { funding: 'codClearing', amount: 12 }));
  assert.equal(await balance('codClearing'), 160);
  await event('manual', request('COST', { funding: 'expensePayable', category: 'shippingExpense', amount: 12, tax: 2 }));
  assert.equal(await balance('expensePayable'), -12);
  const costBefore = await balance('shippingExpense');
  await event('manual', request('COST_PAYMENT', { funding: 'bank', amount: 12 }));
  assert.equal(await balance('expensePayable'), 0);
  assert.equal(await balance('shippingExpense'), costBefore, 'Paying an accrued courier cost must not expense it twice');
  await assert.rejects(event('manual', request('COST_PAYMENT', { funding: 'bank', amount: 1 })), /exceeds/);
  await assert.rejects(event('manual', request('RECEIPT', { funding: 'codClearing', amount: 1 })), /exceeds/);
  await sql("INSERT INTO bills(id,company_id,grand_total,subtotal,payment_method,created_at) VALUES('legacy','a',10,10,'COD','1900-01-01'); INSERT INTO ecomm_orders(id,company_id,bill_id,created_at) VALUES('legacy','a','legacy','1900-01-01')");
  assert.equal((await db.query("SELECT count(*)::int n FROM accountant_v2_erp_sources WHERE source_key='ecommerce-sale:legacy'")).rows[0].n, 0, 'Historical orders are not silently imported');
  const cashBefore = await balance('cash');
  await sql("INSERT INTO bills(id,company_id,grand_total,subtotal,payment_method,payment_status,type) VALUES('pos','a',10,10,'Cash','PAID','BILL')");
  assert.equal(await balance('cash'), cashBefore + 10, 'Ordinary POS posting remains connected');
  const countBefore = (await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals')).rows[0].n;
  await sql("UPDATE accountant_v2_ecommerce_settings SET enabled=false WHERE company_id='a'");
  await order('disabled');
  assert.equal((await db.query('SELECT count(*)::int n FROM accountant_v2_manual_journals')).rows[0].n, countBefore, 'Disabled connection never posts ecommerce money');
  await sql("UPDATE accountant_v2_ecommerce_settings SET enabled=true WHERE company_id='a'");
  const unbalanced = await db.query(`SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0`);
  assert.equal(unbalanced.rowCount, 0);
  // Exercise the real stock-control flush: ecommerce COGS and item changes must
  // land together, without a compensating inventory-adjustment journal.
  await sql(`CREATE TABLE products(id text PRIMARY KEY,company_id text,name text,purchaseorder_id text);
    CREATE TABLE accountant_v2_distributor_sources(company_id text,distributor_id text,source_key text,accounts jsonb,journal_id text);
    ALTER TABLE variants ADD COLUMN company_id text DEFAULT 'a', ADD COLUMN product_id text DEFAULT 'p';
    ALTER TABLE items ADD COLUMN variant_id text DEFAULT 'v';
    INSERT INTO products VALUES('p','a','Product',NULL);
    INSERT INTO accountant_v2_accounting_accounts(id,company_id,name,account_type,category,updated_at) VALUES('opening','a','Opening','EQUITY','EQUITY',now()),('adjust','a','Adjustment','EXPENSE','EXPENSE',now());`);
  await sql(migration('20260929110000_stock_control'));
  await sql("INSERT INTO accountant_v2_stock_control(company_id,stock_account_id,opening_account_id,adjustment_account_id,enabled) VALUES('a','stock','opening','adjust',true); SELECT accountant_v2_sync_stock('a')");
  const stockBefore = await balance('stock');
  const adjustmentsBefore = await balance('adjust');
  await sql(`UPDATE items SET qty=qty-1,sold_qty=sold_qty+1 WHERE id='manual';
    INSERT INTO bills(id,company_id,grand_total,subtotal,payment_method,payment_status) VALUES('stock-sale','a',118,118,'COD','PENDING');
    INSERT INTO entries VALUES('stock-entry','a','stock-sale','v','manual',1,118,0,false);
    INSERT INTO ecomm_orders(id,company_id,bill_id,status) VALUES('stock-sale','a','stock-sale','DELIVERED');`);
  assert.equal(await balance('stock'), stockBefore - 40);
  assert.equal(await balance('adjust'), adjustmentsBefore, 'Native sale must not produce an inventory adjustment');
  await event('stock-sale', request('RETURN', { items: [{ entryId: 'stock-entry', qty: 1 }] }));
  assert.equal(await balance('stock'), stockBefore);
  assert.equal(await balance('adjust'), adjustmentsBefore, 'Native received return must not produce an inventory adjustment');
  // Run production order writers against the same real PostgreSQL triggers and
  // Accountant handlers. Additional fixture columns mirror their schema contract.
  await sql(`CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PAID');
    CREATE TYPE "OrderType" AS ENUM ('STANDARD'); CREATE TYPE "OrderStatus" AS ENUM ('PENDING');
    ALTER TABLE companies ADD COLUMN is_tax_included boolean DEFAULT true, ADD COLUMN points_value numeric DEFAULT 100;
    ALTER TABLE clients ADD COLUMN deleted boolean DEFAULT false;
    ALTER TABLE products ADD COLUMN status boolean DEFAULT true, ADD COLUMN category_id text;
    ALTER TABLE variants ADD COLUMN status boolean DEFAULT true, ADD COLUMN name text DEFAULT 'Test variant',
      ADD COLUMN s_price numeric DEFAULT 118, ADD COLUMN d_price numeric DEFAULT 118,
      ADD COLUMN tax numeric DEFAULT 18, ADD COLUMN images jsonb DEFAULT '[]',
      ADD COLUMN weight numeric DEFAULT 100, ADD COLUMN size_label text;
    ALTER TABLE items ADD COLUMN size text, ADD COLUMN barcode text;
    ALTER TABLE bills ADD COLUMN address_id text, ADD COLUMN coupon_value int;
    ALTER TABLE entries ADD COLUMN name text, ADD COLUMN rate numeric, ADD COLUMN discount numeric,
      ADD COLUMN size text, ADD COLUMN barcode text, ADD COLUMN category_id text;
    ALTER TABLE ecomm_orders ADD COLUMN subtotal numeric, ADD COLUMN discount numeric, ADD COLUMN delivery_fee numeric,
      ADD COLUMN tax numeric, ADD COLUMN grand_total numeric, ADD COLUMN items jsonb,
      ADD COLUMN shipping_address jsonb, ADD COLUMN notes text, ADD COLUMN meta jsonb;
    CREATE TABLE ecomm_order_status_history(id text,company_id text,order_id text,status text,raw_status text,source text,note text,awb text);
    CREATE TABLE coupon_usages(coupon_id text,bill_id text);
    CREATE TABLE coupons(id text,audience_type text);
    CREATE TABLE ecomm_order_requests(order_id text,company_id text,type text,status text,updated_at timestamp);`);
  const orderBalance = async (id: string, role: string) => Number((await db.query(`SELECT COALESCE(sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END),0) n
    FROM accountant_v2_manual_journal_lines WHERE company_id='a' AND account_id=$1 AND source_parties->'ecommerceOrder'->>'id'=$2`, [role, id])).rows[0].n);
  const initialQty = Number((await db.query("SELECT qty FROM items WHERE id='manual'")).rows[0].qty);
  const realOrder = await createEcommOrder(db, 'a', 'tester', {
    client: { id: 'client-a' }, address: { pincode: '682001' },
    items: [{ itemId: 'manual', quantity: 1 }], paymentMethod: 'COD', deliveryFee: 20,
  });
  await sql('SELECT 1'); // Flush the transaction's actual deferred posting order.
  assert.equal(realOrder.grandTotal, 138);
  assert.equal(await orderBalance(realOrder.orderId, 'receivable'), 138);
  assert.equal(await orderBalance(realOrder.orderId, 'sales'), -100);
  assert.equal(await orderBalance(realOrder.orderId, 'deliveryIncome'), -20);
  assert.equal(await orderBalance(realOrder.orderId, 'outputTax'), -18);
  assert.equal(await orderBalance(realOrder.orderId, 'cogs'), 40);
  assert.equal((await db.query('SELECT paid_at FROM bills WHERE id=$1', [realOrder.billId])).rows[0].paid_at, null);
  await event(realOrder.orderId, request('RECEIPT', { funding: 'codClearing', amount: 138 }));
  const paidBill = (await db.query('SELECT payment_status,paid_at FROM bills WHERE id=$1', [realOrder.billId])).rows[0];
  assert.equal(paidBill.payment_status, 'PAID'); assert.ok(paidBill.paid_at);
  assert.equal((await db.query('SELECT payment_status FROM ecomm_orders WHERE id=$1', [realOrder.orderId])).rows[0].payment_status, 'PAID');
  assert.equal(await orderBalance(realOrder.orderId, 'receivable'), 0);
  assert.equal(await orderBalance(realOrder.orderId, 'codClearing'), 138, 'Actual writer plus collection trigger must not double collect');
  await event(realOrder.orderId, request('SETTLEMENT', { funding: 'codClearing', amount: 138, fee: 12, tax: 2 }));
  assert.equal(await orderBalance(realOrder.orderId, 'bank'), 126);
  await sql("UPDATE ecomm_orders SET status='DELIVERED' WHERE id=$1", [realOrder.orderId]);
  const realEntry = (await db.query('SELECT id FROM entries WHERE bill_id=$1', [realOrder.billId])).rows[0].id;
  await event(realOrder.orderId, request('RETURN', { items: [{ entryId: realEntry, qty: 1 }], refundDelivery: true }));
  await event(realOrder.orderId, request('REFUND', { funding: 'bank', amount: 138 }));
  for (const role of ['receivable','sales','deliveryIncome','outputTax','cogs','codClearing','refundPayable']) {
    assert.equal(await orderBalance(realOrder.orderId, role), 0, `Completed return clears ${role}`);
  }
  assert.equal(await orderBalance(realOrder.orderId, 'bank'), -12, 'Courier fee remains after full customer refund');
  assert.equal(Number((await db.query("SELECT qty FROM items WHERE id='manual'")).rows[0].qty), initialQty);
  assert.equal((await db.query('SELECT paid_at FROM bills WHERE id=$1', [realOrder.billId])).rows[0].paid_at.getTime(), paidBill.paid_at.getTime());
  const cancelled = await createEcommOrder(db, 'a', 'tester', {
    client: { id: 'client-a' }, address: { pincode: '682001' },
    items: [{ itemId: 'manual', quantity: 1 }], paymentMethod: 'ONLINE', paymentStatus: 'PAID', deliveryFee: 20,
  });
  await sql('SELECT 1');
  assert.equal(await orderBalance(cancelled.orderId, 'gatewayClearing'), 138);
  await cancelEcommOrder(db, 'a', cancelled.orderId);
  await sql('SELECT 1');
  assert.equal(await orderBalance(cancelled.orderId, 'refundPayable'), -138);
  assert.equal(await orderBalance(cancelled.orderId, 'gatewayClearing'), 138);
  await event(cancelled.orderId, request('REFUND', { funding: 'gatewayClearing', amount: 138 }));
  assert.equal(await orderBalance(cancelled.orderId, 'refundPayable'), 0);
  assert.equal(await orderBalance(cancelled.orderId, 'gatewayClearing'), 0);
  assert.equal(Number((await db.query("SELECT qty FROM items WHERE id='manual'")).rows[0].qty), initialQty);
  await assert.rejects(cancelEcommOrder(db, 'a', cancelled.orderId), /already cancelled/);
  assert.equal(await balance('adjust'), adjustmentsBefore, 'Real create/cancel/return writers must not create compensating stock adjustments');
  assert.equal((await db.query(`SELECT journal_id FROM accountant_v2_manual_journal_lines GROUP BY journal_id
    HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0`)).rowCount, 0);
  console.log('Production order writers passed: COD create → receipt → settlement → delivered → return → refund; prepaid create → cancel → refund.');
  await sql("INSERT INTO accountant_v2_transaction_locks(id,company_id,module,lock_date,is_locked,reason,locked_by_id,updated_at) VALUES('lock','a','ALL','2099-01-02',true,'Test lock','tester',now())");
  await assert.rejects(event('cod', request('REFUND', { funding: 'bank', amount: 1 })), /Locked/);
  console.log('Ecommerce accounting passed: COD/online, revenue/fees/tax/COGS, actual settlements, partial returns/restock, refunds, cancellation, idempotency, tenant isolation, date locks and balanced journals. All fixtures rolled back.');
} finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
