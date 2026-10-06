import { z } from 'zod';
import { Router, badRequest, notFound } from './router';
import { context, accountantPrisma } from './context';
import { erpAccountingSettings, erpRoles } from './erp';
import { planEcommerceReturn } from '../../../utils/ecommerce-accounting';

export const ecommerceAccountingRouter = Router();
const extraRoles: Record<string, { type: string; code: string; name: string; category: string }> = {
  codClearing: { type: 'PAYMENT_CLEARING_ACCOUNT', code: 'EC-COD', name: 'COD held by couriers', category: 'ASSET' },
  gatewayClearing: { type: 'PAYMENT_CLEARING_ACCOUNT', code: 'EC-GATEWAY', name: 'Online payments awaiting settlement', category: 'ASSET' },
  deliveryIncome: { type: 'INCOME', code: 'EC-DELIVERY', name: 'Delivery charges collected', category: 'INCOME' },
  codIncome: { type: 'INCOME', code: 'EC-COD-INCOME', name: 'COD charges collected', category: 'INCOME' },
  refundPayable: { type: 'OTHER_CURRENT_LIABILITY', code: 'EC-REFUNDS', name: 'Customer refunds due', category: 'LIABILITY' },
  shippingExpense: { type: 'EXPENSE', code: 'EC-SHIPPING', name: 'Courier and return shipping costs', category: 'EXPENSE' },
  gatewayExpense: { type: 'EXPENSE', code: 'EC-GATEWAY-FEE', name: 'Payment gateway fees', category: 'EXPENSE' },
  loyaltyExpense: { type: 'EXPENSE', code: 'EC-LOYALTY', name: 'Redeemed loyalty rewards', category: 'EXPENSE' },
};
export const ecommerceRoles = { ...Object.fromEntries(Object.entries(erpRoles).filter(([key]) => key !== 'expense')), ...extraRoles };
async function settings() {
  const { db, companyId } = context();
  const erp = await erpAccountingSettings();
  await accountantPrisma.accountingAccount.createMany({ data: Object.values(extraRoles).map(r => ({ name: r.name, code: r.code, accountType: r.type, category: r.category, isSystem: true })), skipDuplicates: true });
  const [cfg] = await db.$queryRawUnsafe('SELECT * FROM accountant_v2_ecommerce_settings WHERE company_id=$1', companyId);
  const accounts = await accountantPrisma.accountingAccount.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  const mappings = { ...erp.mappings, ...cfg?.accounts };
  for (const [role, spec] of Object.entries(extraRoles)) mappings[role] ||= accounts.find((a: any) => a.code === spec.code)?.id || '';
  return { enabled: !!cfg?.enabled, activatedAt: cfg?.activated_at, mappings, roles: ecommerceRoles, accounts };
}
async function source(orderId: string) {
  const { db, companyId } = context();
  const [order] = await db.$queryRawUnsafe('SELECT * FROM ecomm_orders WHERE id=$1 AND company_id=$2', orderId, companyId);
  if (!order) throw notFound('Order');
  await db.$queryRawUnsafe('SELECT accountant_v2_sync_ecommerce($1,$2)', companyId, orderId);
  const [sale] = await db.$queryRawUnsafe('SELECT * FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2', companyId, `ecommerce-sale:${orderId}`);
  if (!sale?.signature?.metadata) throw badRequest('This order is outside the ecommerce accounting activation period. Historical orders require a reviewed import.');
  return { order, sale };
}
async function state(orderId: string) {
  const { db, companyId } = context();
  const { order, sale } = await source(orderId);
  const balances = await db.$queryRawUnsafe(`SELECT l.account_id, sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)::text AS balance
    FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id
    WHERE l.company_id=$1 AND l.source_parties->'ecommerceOrder'->>'id'=$2 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id`, companyId, orderId);
  const events = await db.$queryRawUnsafe(`SELECT source_key,signature,journal_id,revision FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key LIKE 'ecommerce-event:%' AND signature->'metadata'->>'orderId'=$2 ORDER BY signature->>'date',source_key`, companyId, orderId);
  const balance = (role: string) => Number(balances.find((b: any) => b.account_id === sale.accounts[role])?.balance || 0);
  return { order, sale, events, balances: Object.fromEntries(Object.keys(sale.accounts).map(role => [role, balance(role)])) };
}
ecommerceAccountingRouter.get('/settings', async (_req, res) => res.json(await settings()));
ecommerceAccountingRouter.put('/settings', async (req, res) => {
  const { db, companyId } = context();
  const { mappings } = z.object({ mappings: z.record(z.string().min(1)) }).parse(req.body);
  const current = await settings();
  for (const [role, spec] of Object.entries(ecommerceRoles)) if (!current.accounts.some((a: any) => a.id === mappings[role] && a.accountType === spec.type)) throw badRequest(`Select an active company account for ${role}`);
  if (new Set(Object.keys(ecommerceRoles).map(role => mappings[role])).size !== Object.keys(ecommerceRoles).length) throw badRequest('Use a separate account for each ecommerce role');
  await db.$executeRawUnsafe(`INSERT INTO accountant_v2_ecommerce_settings(company_id,accounts) VALUES($1,$2::jsonb) ON CONFLICT(company_id) DO UPDATE SET accounts=EXCLUDED.accounts`, companyId, JSON.stringify(mappings));
  res.json(await settings());
});
ecommerceAccountingRouter.post('/enable', async (req, res) => {
  const { db, companyId } = context();
  const b = z.object({ mappings: z.record(z.string().min(1)) }).parse(req.body);
  const current = await settings();
  for (const [role, spec] of Object.entries(ecommerceRoles)) if (!current.accounts.some((a: any) => a.id === b.mappings[role] && a.accountType === spec.type)) throw badRequest(`Select an active company account for ${role}`);
  // Same-type accounts must remain distinct so per-order receivable/clearing balances cannot alias.
  const mapped = Object.keys(ecommerceRoles).map(r => b.mappings[r]);
  if (new Set(mapped).size !== mapped.length) throw badRequest('Use a separate account for each ecommerce role');
  if (current.enabled) throw badRequest('Ecommerce accounting is already enabled; existing order mappings are retained');
  await db.$executeRawUnsafe(`INSERT INTO accountant_v2_ecommerce_settings(company_id,enabled,accounts,activated_at) VALUES($1,true,$2::jsonb,now())
    ON CONFLICT(company_id) DO UPDATE SET enabled=true,accounts=EXCLUDED.accounts,activated_at=EXCLUDED.activated_at`, companyId, JSON.stringify(b.mappings));
  await db.$executeRawUnsafe(`INSERT INTO accountant_v2_erp_sources(company_id,source_key,signature)
    SELECT company_id,'ecommerce-sale:'||id,'{"excluded":true}'::jsonb FROM ecomm_orders WHERE company_id=$1 ON CONFLICT DO NOTHING`, companyId);
  res.json(await settings());
});
ecommerceAccountingRouter.get('/orders', async (req, res) => {
  const { db, companyId } = context();
  const { search, page } = z.object({ search: z.string().max(100).default(''), page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  res.json(await db.$queryRawUnsafe(`SELECT o.id,o.order_number AS "orderNumber",o.status,o.payment_status AS "paymentStatus",o.grand_total AS "grandTotal",
      s.signature->>'excluded' AS excluded,s.journal_id AS "journalId"
    FROM ecomm_orders o LEFT JOIN accountant_v2_erp_sources s ON s.company_id=o.company_id AND s.source_key='ecommerce-sale:'||o.id
    WHERE o.company_id=$1 AND ($2='' OR o.order_number::text ILIKE $3 OR o.id=$2) ORDER BY o.created_at DESC,o.id LIMIT 30 OFFSET $4`, companyId, search, `%${search}%`, (page - 1) * 30));
});
ecommerceAccountingRouter.get('/orders/:id', async (req, res) => res.json(await state(req.params.id)));

const money = z.coerce.number().finite().nonnegative().max(1e12).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Use at most two decimal places');
const eventSchema = z.object({
  requestId: z.string().uuid(), action: z.enum(['SETTLEMENT', 'REFUND', 'COST', 'COST_PAYMENT', 'CHARGE', 'RECEIPT', 'RETURN']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: money.default(0), fee: money.default(0), tax: money.default(0),
  funding: z.enum(['codClearing', 'gatewayClearing', 'cash', 'bank', 'expensePayable']).default('gatewayClearing'),
  category: z.enum(['shippingExpense', 'gatewayExpense', 'sales', 'deliveryIncome', 'codIncome']).default('shippingExpense'),
  moneyAccountId: z.string().min(1).optional(), reference: z.string().trim().min(1).max(150), note: z.string().trim().max(1000).default(''),
  items: z.array(z.object({ entryId: z.string().min(1), qty: z.number().int().positive() })).default([]),
  refundDelivery: z.boolean().default(false), refundCod: z.boolean().default(false),
});
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
ecommerceAccountingRouter.post('/orders/:id/events', async (req, res) => {
  const b = eventSchema.parse(req.body), { db, companyId, userId } = context();
  const day = new Date(`${b.date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== b.date) throw badRequest('Invalid date');
  const key = `ecommerce-event:${b.requestId}`, canonical = JSON.stringify({ orderId: req.params.id, ...b });
  const [prior] = await db.$queryRawUnsafe('SELECT * FROM accountant_v2_erp_sources WHERE company_id=$1 AND source_key=$2', companyId, key);
  if (prior) {
    if (prior.signature?.metadata?.request !== canonical) throw badRequest('Request ID already belongs to a different entry');
    res.json({ journalId: prior.journal_id, reused: true }); return;
  }
  const s = await state(req.params.id), maps = { ...s.sale.accounts }, balance = s.balances;
  const [last] = await db.$queryRawUnsafe(`SELECT max(j.journal_date)::date::text AS date FROM accountant_v2_manual_journals j
    JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
    WHERE j.company_id=$1 AND l.source_parties->'ecommerceOrder'->>'id'=$2 AND j.status='PUBLISHED' AND j.deleted_at IS NULL`, companyId, req.params.id);
  if (last?.date && b.date < last.date) throw badRequest('Use a date on or after the latest accounting entry for this order');
  if (b.moneyAccountId) {
    const account = await accountantPrisma.accountingAccount.findFirst({ where: { id: b.moneyAccountId, isActive: true } });
    if (!account || !['CASH', 'BANK'].includes(account.accountType)) throw badRequest('Choose an active company cash/bank account');
    maps[account.accountType === 'CASH' ? 'cash' : 'bank'] = account.id;
    if (b.action === 'SETTLEMENT' && account.accountType !== 'BANK') throw badRequest('Settlement must select a bank account');
    if (['cash','bank'].includes(b.funding) && b.funding.toUpperCase() !== account.accountType) throw badRequest('Money account does not match the selected funding method');
  }
  const lines: { role: string; amount: number }[] = [];
  const add = (role: string, amount: number) => { if (round(amount)) lines.push({ role, amount: round(amount) }); };
  let extra: any = {};
  if (b.action === 'RETURN') {
    if (!['DELIVERED','RETURNED'].includes(s.order.status)) throw badRequest('Receive returns only for a delivered order');
    let plan;
    try { plan = planEcommerceReturn(s.sale.signature.metadata, s.events.map((e: any) => e.signature.metadata), b); }
    catch (error: any) { throw badRequest(error.message); }
    lines.push(...plan.lines); extra = plan.metadata;
    for (const item of plan.items) {
      const moved = await db.$queryRawUnsafe(`UPDATE items SET qty=COALESCE(qty,0)+$1,sold_qty=GREATEST(0,COALESCE(sold_qty,0)-$1),updated_at=now()
        WHERE id=$2 AND company_id=$3 RETURNING id`, item.qty, item.itemId, companyId);
      if (!moved.length) throw badRequest('A returned stock item no longer exists in this company');
    }
    const [rewards] = await db.$queryRawUnsafe('SELECT COALESCE(bill_points,0) AS earned FROM bills WHERE id=$1 AND company_id=$2 FOR UPDATE', s.order.bill_id, companyId);
    const pointDelta = plan.metadata.restoredPoints - Number(rewards?.earned || 0);
    if (pointDelta) {
      const updated = await db.$queryRawUnsafe('UPDATE company_clients SET points=GREATEST(0,COALESCE(points,0)+$1) WHERE company_id=$2 AND client_id=$3 RETURNING client_id', pointDelta, companyId, s.order.client_id);
      if (!updated.length) throw badRequest('Customer loyalty account is missing for this return');
    }
    if (Number(rewards?.earned || 0)) await db.$executeRawUnsafe('UPDATE bills SET bill_points=0,updated_at=now() WHERE id=$1 AND company_id=$2', s.order.bill_id, companyId);
  } else {
    if (b.amount <= 0) throw badRequest('Enter a positive amount');
    if (b.action === 'SETTLEMENT') {
      if (!['codClearing','gatewayClearing'].includes(b.funding) || b.amount > round(balance[b.funding] || 0)) throw badRequest('Settlement exceeds the amount held for this order');
      if (b.fee > b.amount || b.tax > b.fee) throw badRequest('Fees/tax exceed the settlement amount');
      add('bank', b.amount - b.fee); add(b.funding === 'codClearing' ? 'shippingExpense' : 'gatewayExpense', b.fee - b.tax); add('inputTax', b.tax); add(b.funding, -b.amount);
    } else if (b.action === 'REFUND') {
      if (b.funding === 'expensePayable' || b.amount > round(-(balance.refundPayable || 0))) throw badRequest('Refund exceeds the recorded customer refund due');
      add('refundPayable', b.amount); add(b.funding, -b.amount);
    } else if (b.action === 'COST') {
      if (!['shippingExpense','gatewayExpense'].includes(b.category) || b.tax > b.amount) throw badRequest('Choose a cost category and valid recoverable tax');
      add(b.category, b.amount - b.tax); add('inputTax', b.tax); add(b.funding, -b.amount);
    } else if (b.action === 'COST_PAYMENT') {
      if (b.funding === 'expensePayable' || b.amount > round(-(balance.expensePayable || 0))) throw badRequest('Payment exceeds the recorded unpaid costs for this order');
      add('expensePayable', b.amount); add(b.funding, -b.amount);
    } else if (b.action === 'CHARGE') {
      if (!['sales','deliveryIncome','codIncome'].includes(b.category) || b.tax > b.amount) throw badRequest('Choose an income category and valid output tax');
      if (['CANCELLED','CANCELED'].includes(s.order.status)) throw badRequest('Cannot add charges to a cancelled order');
      add('receivable', b.amount); add(b.category, -(b.amount - b.tax)); add('outputTax', -b.tax);
    } else {
      if (b.funding === 'expensePayable' || b.amount > round(balance.receivable || 0)) throw badRequest('Receipt exceeds the customer amount due');
      add(b.funding, b.amount); add('receivable', -b.amount);
      extra.receiptAmount = b.amount;
    }
    if (['REFUND','COST','COST_PAYMENT'].includes(b.action) && ['codClearing','gatewayClearing'].includes(b.funding) && b.amount > round(balance[b.funding] || 0)) throw badRequest('Insufficient money held by the courier/gateway');
  }
  await db.$queryRawUnsafe("SELECT set_config('app.status_actor',$1,true)", `user:${userId}`);
  await db.$queryRawUnsafe("SELECT set_config('app.ecommerce_event_date',$1,true)", b.date);
  await db.$queryRawUnsafe('SELECT accountant_v2_post_ecommerce($1,$2,$3::timestamp,$4::jsonb,$5::jsonb,$6::jsonb)', companyId, key, b.date,
    JSON.stringify(lines), JSON.stringify(maps), JSON.stringify({ ...extra, orderId: req.params.id, action: b.action, reference: b.reference, note: b.note, request: canonical, parties: s.sale.signature.metadata.parties }));
  if (b.action === 'RECEIPT' && round(balance.receivable) === b.amount && s.order.payment_status === 'PENDING') {
    await db.$executeRawUnsafe("UPDATE bills SET payment_status='PAID',updated_at=now() WHERE id=$1 AND company_id=$2 AND payment_status='PENDING'", s.order.bill_id, companyId);
    await db.$executeRawUnsafe("UPDATE ecomm_orders SET payment_status='PAID',updated_at=now() WHERE id=$1 AND company_id=$2 AND payment_status='PENDING'", s.order.id, companyId);
    if (s.order.checkout_id) await db.$executeRawUnsafe("UPDATE ecomm_checkouts SET payment_status='PAID',status='PAID',updated_at=now() WHERE id=$1 AND company_id=$2 AND payment_status='PENDING'", s.order.checkout_id, companyId);
  }
  await db.$queryRawUnsafe('SELECT accountant_v2_sync_ecommerce($1,$2)', companyId, req.params.id);
  res.json(await state(req.params.id));
});
