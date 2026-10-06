import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createError } from 'h3';
import { recalculateUserLedgerBalances } from './user-ledger';

const metadata = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name, model]));
const roots = new Set(['Bill', 'Product', 'Brand', 'Category', 'Subcategory', 'Collection', 'ShippingBox',
  'PurchaseOrder', 'PurchaseReturn', 'Expense', 'ExpenseCategory', 'DistributorPayment', 'DistributorCredit', 'DistributorCompany', 'Account', 'CompanyUser', 'CompanyClient', 'Shift', 'AttendanceAdjustment', 'SalaryConfig', 'PayrollAdjustment', 'PayrollCycle', 'SalaryPayment', 'UserLedgerEntry', 'CompanyHoliday']);
const documents = new Set(['Bill', 'PurchaseOrder', 'PurchaseReturn', 'Expense', 'DistributorPayment', 'DistributorCredit', 'MoneyTransaction', 'PayrollCycle', 'PayrollCycleLine', 'SalaryPayment', 'PayrollAdjustment', 'UserLedgerEntry']);
const excluded = new Set(['Company', 'User', 'Client', 'Distributor', 'CompanyUser', 'CompanyClient', 'DistributorCompany', 'BankAccount', 'CashAccount', 'AccountLedgerEntry', 'Investment', 'AccountTransfer']);
const q = (value: string) => '"' + value.replaceAll('"', '""') + '"';
const meta = (name: string) => metadata.get(name)!;
const table = (name: string) => q(meta(name).dbName || name);
const membershipId: Record<string, string> = { DistributorCompany: 'distributorId', CompanyUser: 'userId', CompanyClient: 'clientId' };
const col = (name: string, field: string) => q(meta(name).fields.find(f => f.name === (membershipId[name] && field === 'id' ? membershipId[name] : field))?.dbName || field);
const has = (name: string, field: string) => meta(name).fields.some(f => f.name === field);
const select = (name: string) => meta(name).fields.filter(f => f.kind !== 'object').map(f => `${q(f.dbName || f.name)} AS ${q(f.name)}`).join(', ') + (membershipId[name] ? ', ' + col(name, membershipId[name]) + ' AS id' : '');
const key = (model: string, id: string) => `${model}:${id}`;
type Node = { model: string; row: any };
export type TransferInput = { model: string; id: string; sourceCompanyId: string; companyId: string;
  fingerprint?: string; includeLinked?: boolean; mappings?: Record<string, string> };
function fail(message: string, statusCode = 409): never { throw createError({ statusCode, statusMessage: message }); }

async function rows(db: any, model: string, where: string, args: any[], lock = false) {
  return (await db.query(`SELECT ${select(model)} FROM ${table(model)} WHERE ${where} ORDER BY ${col(model, 'id')}${lock ? ' FOR UPDATE' : ''}`, args)).rows;
}

/** Discover dependent rows from actual schema relations; never reassign a shared identity. */
export async function transferGraph(db: any, input: TransferInput, lock = false) {
  if (!roots.has(input.model)) fail('This record does not support a company transfer', 400);
  if (input.sourceCompanyId === input.companyId) fail('Choose a different company', 400);
  const root = (await rows(db, input.model, `${col(input.model, 'id')} = $1 AND ${col(input.model, 'companyId')} = $2`, [input.id, input.sourceCompanyId], lock))[0];
  if (!root || root.companyId !== input.sourceCompanyId) fail('Record ownership changed; reload the form');
  if (input.model === 'CompanyUser') {
    const target = await rows(db, 'CompanyUser', `${col('CompanyUser', 'userId')}=$1 AND ${col('CompanyUser', 'companyId')}=$2`, [input.id, input.companyId], lock);
    if (target.length) fail('This staff member is already linked to the destination company. Edit that membership instead.');
    if (root.role === 'admin' && root.status && !root.deleted) {
      const admins = await db.query("SELECT count(*) FROM company_users WHERE company_id=$1 AND role='admin' AND status=true AND deleted=false", [input.sourceCompanyId]);
      if (Number(admins.rows[0].count) <= 1) fail('At least one active admin must remain in the source company');
    }
  }
  const nodes = new Map<string, Node>();
  const queue: Node[] = [{ model: input.model, row: root }];
  while (queue.length) {
    const node = queue.shift()!;
    const nodeKey = key(node.model, node.row.id);
    if (nodes.has(nodeKey)) continue;
    if (node.row.companyId && node.row.companyId !== input.sourceCompanyId) fail('Linked records have inconsistent ownership');
    nodes.set(nodeKey, node);
    if (node.model === 'CompanyClient') {
      for (const child of metadata.values()) {
        if (excluded.has(child.name) || !has(child.name, 'id') || !has(child.name, 'companyId') || !has(child.name, 'clientId')) continue;
        for (const row of await rows(db, child.name, `${col(child.name, 'companyId')}=$1 AND ${col(child.name, 'clientId')}=$2`, [input.sourceCompanyId, node.row.clientId], lock)) queue.push({ model: child.name, row });
      }
    }
    if (node.model === 'UserLedgerEntry' && node.row.sourceType === 'MANUAL') {
      for (const row of await rows(db, 'MoneyTransaction', `${col('MoneyTransaction', 'companyId')}=$1 AND id=$2`, [input.sourceCompanyId, node.row.id], lock)) queue.push({ model: 'MoneyTransaction', row });
    }
    // Payroll payment/cycle links are scalar fields, so discover them explicitly.
    if (node.model === 'SalaryPayment' || node.model === 'UserCreditTransaction' || node.model === 'PayrollAdjustment') {
      for (const [field, model] of Object.entries({ moneyTransactionId: 'MoneyTransaction', cycleId: 'PayrollCycle', cycleLineId: 'PayrollCycleLine' })) {
        if (node.row[field]) for (const row of await rows(db, model, `${col(model, 'id')}=$1`, [node.row[field]], lock)) queue.push({ model, row });
      }
    }
    if (node.model === 'PayrollCycle' || node.model === 'PayrollCycleLine' || node.model === 'MoneyTransaction') {
      const field = node.model === 'PayrollCycle' ? 'cycleId' : node.model === 'PayrollCycleLine' ? 'cycleLineId' : 'moneyTransactionId';
      for (const row of await rows(db, 'SalaryPayment', `${col('SalaryPayment', field)}=$1`, [node.row.id], lock)) queue.push({ model: 'SalaryPayment', row });
      if (field !== 'moneyTransactionId') for (const row of await rows(db, 'UserCreditTransaction', `${col('UserCreditTransaction', field)}=$1`, [node.row.id], lock)) queue.push({ model: 'UserCreditTransaction', row });
      if (field === 'cycleId') for (const row of await rows(db, 'PayrollAdjustment', `${col('PayrollAdjustment', field)}=$1`, [node.row.id], lock)) queue.push({ model: 'PayrollAdjustment', row });
    }
    // Return lines keep these references as scalars rather than foreign keys.
    const returnField = ({ Item: 'itemId', Variant: 'variantId', Category: 'categoryId' } as Record<string, string>)[node.model];
    if (returnField) {
      for (const row of await rows(db, 'PurchaseReturnItem', `${col('PurchaseReturnItem', returnField)} = $1`, [node.row.id], lock)) {
        queue.push({ model: 'PurchaseReturnItem', row });
      }
    }
    // Dependents, including companyless detail rows, travel with their parent.
    for (const child of metadata.values()) {
      if (excluded.has(child.name) || !child.fields.some(f => f.name === 'id')) continue;
      for (const relation of child.fields.filter(f => f.kind === 'object' && f.type === node.model && f.relationFromFields?.length)) {
        const values = relation.relationToFields!.map(f => node.row[f]);
        if (values.some(v => v == null)) continue;
        const where = relation.relationFromFields!.map((f, i) => `${col(child.name, f)} = $${i + 1}`).join(' AND ');
        for (const row of await rows(db, child.name, where, values, lock)) queue.push({ model: child.name, row });
      }
    }
    // A linked document must move as a whole, including sibling rows/payments.
    for (const relation of meta(node.model).fields.filter(f => f.kind === 'object' && documents.has(f.type) && f.relationFromFields?.length === 1)) {
      const id = node.row[relation.relationFromFields![0]];
      if (id) for (const row of await rows(db, relation.type, `${col(relation.type, 'id')} = $1`, [id], lock)) queue.push({ model: relation.type, row });
    }
  }
  // Ledgers use logical source IDs, not foreign keys.
  const sourceIds = [...nodes.values()].map(n => n.row.id);
  if (sourceIds.length) for (const model of ['UserLedgerEntry']) {
    for (const row of await rows(db, model, `${col(model, 'companyId')} = $1 AND ${col(model, 'sourceId')} = ANY($2::text[])`, [input.sourceCompanyId, sourceIds], lock)) nodes.set(key(model, row.id), { model, row });
  }
  const requirements = new Map<string, { key: string; model: string; sourceId: string; label: string; options: any[] }>();
  async function requireMapping(model: string, id: string, label: string, idField = 'id') {
    if (!id || nodes.has(key(model, id))) return;
    const mapKey = key(model, id);
    if (requirements.has(mapKey)) return;
    if (idField === 'id') {
      const source = (await rows(db, model, `${col(model, 'id')} = $1`, [id], lock))[0];
      if (!source) fail(`Related ${model} no longer exists`);
      if (source.companyId == null || source.companyId === input.companyId) return;
      if (source.companyId !== input.sourceCompanyId) fail('A related record belongs to another organization');
      label = `${model}: ${source.name || source.barcode || source.code || id}`;
    }
    const candidates = idField === 'id'
      ? await rows(db, model, `${col(model, 'companyId')} = $1`, [input.companyId])
      : (await db.query(`SELECT ${select(model)} FROM ${table(model)} WHERE ${col(model, 'companyId')} = $1`, [input.companyId])).rows;
    requirements.set(mapKey, { key: mapKey, model, sourceId: id, label,
      options: candidates.map((r: any) => ({ value: r[idField], label: r.name || r.barcode || r.code || r[idField] })) });
  }
  for (const node of nodes.values()) {
    for (const relation of meta(node.model).fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) {
      if (relation.type === 'CompanyUser') {
        const field = relation.relationFromFields!.find(f => f !== 'companyId');
        if (field && node.row[field]) await requireMapping('CompanyUser', node.row[field], `Staff (${node.row[field]})`, 'userId');
      } else if (relation.relationFromFields!.length === 1 && relation.type !== 'Company' && has(relation.type, 'companyId')) {
        const id = node.row[relation.relationFromFields![0]];
        if (id) await requireMapping(relation.type, id, `${relation.type} (${id})`);
      }
    }
    // Purchase-return item references and ledger account IDs are scalar references in the schema.
    if (node.model === 'PurchaseReturnItem') for (const [field, model] of Object.entries({ itemId: 'Item', variantId: 'Variant', categoryId: 'Category' })) {
      if (node.row[field]) await requireMapping(model, node.row[field], `${model} (${node.row[field]})`);
    }
    if (node.model === 'SalaryPayment' && node.row.bankAccountId) await requireMapping('BankAccount', node.row.bankAccountId, 'Payment bank');
    if (node.model === 'PayrollCycle') for (const id of [...node.row.includeUserIds, ...node.row.excludeUserIds]) await requireMapping('CompanyUser', id, `Staff (${id})`, 'userId');
    if (node.model === 'UserLedgerEntry' && node.row.userId) await requireMapping('CompanyUser', node.row.userId, `Staff (${node.row.userId})`, 'userId');
  }
  const snapshot = [...nodes.values()].sort((a, b) => key(a.model, a.row.id).localeCompare(key(b.model, b.row.id)));
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return { nodes, requirements: [...requirements.values()], fingerprint };
}

const counters: Record<string, [string, string]> = {
  Bill: ['invoiceNumber', 'billCounter'], PurchaseOrder: ['purchaseOrderNo', 'purchaseCounter'],
  PurchaseReturn: ['returnNo', 'returnCounter'], Expense: ['expenseNumber', 'expenseCounter'],
  DistributorPayment: ['paymentNo', 'distributorPaymentCounter'], DistributorCredit: ['creditNo', 'distributorCreditCounter'],
  Account: ['accountNumber', 'accountCounter'],
};

export async function executeCompanyTransfer(db: any, input: TransferInput) {
  // Company locks serialize numbering and transfers in either direction.
  await db.query('SELECT id FROM companies WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE', [[input.sourceCompanyId, input.companyId]]);
  const graph = await transferGraph(db, input, true);
  if (graph.fingerprint !== input.fingerprint) fail('Linked data changed; preview the transfer again');
  if (graph.nodes.size > 1 && !input.includeLinked) fail('Confirm all linked records before transferring');
  for (const requirement of graph.requirements) {
    if (!requirement.options.some(o => o.value === input.mappings?.[requirement.key])) fail(`Select a destination for ${requirement.label}`);
    const field = requirement.model === 'CompanyUser' ? 'userId' : 'id';
    const target = await db.query(`SELECT ${col(requirement.model, 'companyId')} FROM ${table(requirement.model)} WHERE ${col(requirement.model, field)} = $1 AND ${col(requirement.model, 'companyId')} = $2 FOR SHARE`, [input.mappings![requirement.key], input.companyId]);
    if (!target.rowCount) fail('A destination record changed ownership. Preview again.');
  }
  const mapping = (model: string, id: string) => input.mappings?.[key(model, id)] || id;
  if (input.model === 'CompanyUser') {
    const root = graph.nodes.get(key(input.model, input.id))!.row;
    const number = (await db.query('UPDATE companies SET user_code_counter=user_code_counter+1 WHERE id=$1 RETURNING user_code_counter-1 AS number', [input.companyId])).rows[0].number;
    const values = { ...root, companyId: input.companyId, code: number, delegatedHeadOfficeId: null };
    const fields = meta('CompanyUser').fields.filter(f => f.kind !== 'object');
    await db.query(`INSERT INTO ${table('CompanyUser')} (${fields.map(f => col('CompanyUser', f.name)).join(',')}) VALUES (${fields.map((_, i) => '$'+(i+1)).join(',')})`, fields.map(f => values[f.name]));
  }
  const users: any[] = [];
  // Shared identities get a destination link, without moving their other-company data.
  for (const { row } of graph.nodes.values()) {
    if (row.distributorId) await db.query('INSERT INTO distributor_companies (distributor_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.distributorId, input.companyId]);
    if (row.clientId) await db.query('INSERT INTO company_clients (client_id, company_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.clientId, input.companyId]);
  }
  for (const node of graph.nodes.values()) {
    if (membershipId[node.model]) continue;
    const changes: Record<string, any> = {};
    if (has(node.model, 'companyId')) changes.companyId = input.companyId;
    for (const relation of meta(node.model).fields.filter(f => f.kind === 'object' && f.relationFromFields?.length)) {
      if (relation.type === 'CompanyUser') {
        const field = relation.relationFromFields!.find(f => f !== 'companyId');
        if (field && node.row[field]) changes[field] = mapping('CompanyUser', node.row[field]);
      } else if (relation.type !== 'Company' && relation.relationFromFields!.length === 1) {
        const field = relation.relationFromFields![0];
        if (node.row[field] && input.mappings?.[key(relation.type, node.row[field])]) changes[field] = mapping(relation.type, node.row[field]);
      }
    }
    if (node.model === 'PurchaseReturnItem') for (const [field, model] of Object.entries({ itemId: 'Item', variantId: 'Variant', categoryId: 'Category' })) {
      if (node.row[field]) changes[field] = mapping(model, node.row[field]);
    }
    if (node.model === 'Entry' && node.row.itemId && !graph.nodes.has(key('Item', node.row.itemId))) {
      const itemId = mapping('Item', node.row.itemId);
      const amount = Number(node.row.qty || 0) * (node.row.return ? -1 : 1);
      await db.query('UPDATE items SET qty = COALESCE(qty,0) + $2, sold_qty = COALESCE(sold_qty,0) - $2 WHERE id = $1', [node.row.itemId, amount]);
      const updated = await db.query('UPDATE items SET qty = COALESCE(qty,0) - $2, sold_qty = COALESCE(sold_qty,0) + $2 WHERE id = $1 AND company_id = $3 AND ($2 <= 0 OR COALESCE(qty,0) >= $2) RETURNING variant_id', [itemId, amount, input.companyId]);
      if (!updated.rowCount) fail('Destination stock is insufficient');
      changes.itemId = itemId;
      changes.variantId = updated.rows[0].variant_id;
    }
    if (node.model === 'PurchaseReturnItem' && node.row.barcode?.trim() && node.row.itemId && !graph.nodes.has(key('Item', node.row.itemId))) {
      const itemId = mapping('Item', node.row.itemId);
      const amount = Number(node.row.qty || 0);
      await db.query('UPDATE items SET qty = COALESCE(qty,0) + $2 WHERE id = $1', [node.row.itemId, amount]);
      const updated = await db.query('UPDATE items SET qty = COALESCE(qty,0) - $2 WHERE id = $1 AND company_id = $3 AND COALESCE(qty,0) >= $2 RETURNING variant_id', [itemId, amount, input.companyId]);
      if (!updated.rowCount) fail('Destination stock is insufficient');
      changes.itemId = itemId;
      changes.variantId = updated.rows[0].variant_id;
    }
    if (node.model === 'Bill' && node.row.clientId && !graph.nodes.has(key('CompanyClient', node.row.clientId))) {
      const delta = Number(node.row.billPoints || 0) - Number(node.row.redeemedPoints || 0);
      for (const [companyId, amount] of [[input.sourceCompanyId, -delta], [input.companyId, delta]]) {
        const result = await db.query('UPDATE company_clients SET points = points + $3 WHERE company_id = $1 AND client_id = $2 AND points + $3 >= 0 RETURNING client_id', [companyId, node.row.clientId, amount]);
        if (!result.rowCount) fail('The transfer would make a customer points balance negative');
      }
    }
    if (counters[node.model]) {
      const [field, counter] = counters[node.model];
      const result = await db.query(`UPDATE companies SET ${col('Company', counter)} = ${col('Company', counter)} + 1 WHERE id = $1 RETURNING ${col('Company', counter)} - 1 AS number`, [input.companyId]);
      changes[field] = result.rows[0].number;
    }
    if (node.model === 'UserLedgerEntry') {
      changes.userId = mapping('CompanyUser', node.row.userId);
      users.push({ companyId: input.sourceCompanyId, userId: node.row.userId }, { companyId: input.companyId, userId: changes.userId });
    }
    if (node.model === 'SalaryPayment' && node.row.bankAccountId) changes.bankAccountId = mapping('BankAccount', node.row.bankAccountId);
    if (node.model === 'PayrollCycle') for (const field of ['includeUserIds', 'excludeUserIds']) changes[field] = node.row[field].map((id: string) => mapping('CompanyUser', id));
    const entries = Object.entries(changes);
    if (entries.length) await db.query(`UPDATE ${table(node.model)} SET ${entries.map(([field], i) => `${col(node.model, field)} = $${i + 2}`).join(', ')} WHERE id = $1`, [node.row.id, ...entries.map(([, value]) => value)]);
  }
  for (const user of users) await recalculateUserLedgerBalances(db, user);
  if (input.model === 'DistributorCompany') {
    const root = graph.nodes.get(key(input.model, input.id))!.row;
    await db.query('UPDATE distributor_companies SET opening_due = COALESCE(opening_due,0) + $3 WHERE distributor_id = $1 AND company_id = $2', [input.id, input.companyId, root.openingDue || 0]);
    await db.query('DELETE FROM distributor_companies WHERE distributor_id = $1 AND company_id = $2', [input.id, input.sourceCompanyId]);
  }
  if (input.model === 'CompanyUser') {
    // Old capital history keeps a composite FK to the original staff identity.
    // Retire that membership instead of moving/deleting the archive's identity.
    const archivedInvestment = await db.query('SELECT 1 FROM investments WHERE company_id=$1 AND "userId"=$2 LIMIT 1', [input.sourceCompanyId, input.id]);
    if (archivedInvestment.rowCount) {
      await db.query('UPDATE company_users SET deleted=true, status=false WHERE company_id=$1 AND user_id=$2', [input.sourceCompanyId, input.id]);
    } else {
      await db.query('DELETE FROM company_users WHERE company_id=$1 AND user_id=$2', [input.sourceCompanyId, input.id]);
    }
  }
  if (input.model === 'CompanyClient') {
    const root = graph.nodes.get(key(input.model, input.id))!.row;
    const number = (await db.query('UPDATE companies SET client_counter=client_counter+1 WHERE id=$1 RETURNING client_counter-1 AS number', [input.companyId])).rows[0].number;
    await db.query('UPDATE company_clients SET points=points+$3, client_number=COALESCE(client_number,$4), pipeline_status=$5 WHERE company_id=$1 AND client_id=$2', [input.companyId, input.id, root.points, number, root.pipelineStatus]);
    const stages = ['new', 'prospect', 'viewing', 'reject', 'close'];
    for (const stage of stages) {
      const field = q(`${stage}Clients`);
      await db.query(`UPDATE pipelines SET ${field}=array_remove(${field},$2) WHERE company_id=$1`, [input.sourceCompanyId, input.id]);
      await db.query(`UPDATE pipelines SET ${field}=array_remove(${field},$2)${stage === root.pipelineStatus ? ' || ARRAY[$2]::text[]' : ''} WHERE company_id=$1`, [input.companyId, input.id]);
    }
    await db.query('DELETE FROM company_clients WHERE company_id=$1 AND client_id=$2', [input.sourceCompanyId, input.id]);
  }
  return { companyId: input.companyId, moved: graph.nodes.size };
}
