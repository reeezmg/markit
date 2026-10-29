import { z } from 'zod';
import { createError } from 'h3';
import { context, logActivity } from './accountant/context';
import { configureDistributorAccounting, importDistributorAccounting } from './accountant/distributors';
import { accountDefaultGroups, acceptsDefaultAccount } from '../../utils/account-defaults';

const text = z.string().trim().max(250).default('');
const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Enter a valid opening date').default('');
const input = z.object({
  id: z.string().optional(), name: z.string().trim().min(1, 'Enter a distributor name').max(250),
  status: z.boolean().default(true), accHolderName: text, bankName: text, accountNo: text, ifsc: text, upiId: text, gstin: text,
  phoneNo: text, street: text, locality: text, landmark: text, houseDetails: text, city: text, state: text, pincode: text,
  openingDue: z.number().finite().refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Opening due must have at most two decimals').default(0),
  openingDueDate: date, accountingAccounts: z.record(z.string().min(1)).optional(),
});
export const canManageDistributorAccounts = (role: string) => ['admin', 'manager', 'accountant'].includes(role);
const missing = () => createError({ statusCode: 404, statusMessage: 'Distributor not found in this company' });
async function membership(id: string, lock = false) {
  const { db, companyId } = context();
  if (lock) {
    const rows = await db.$queryRawUnsafe('SELECT distributor_id FROM distributor_companies WHERE company_id=$1 AND distributor_id=$2 FOR UPDATE', companyId, id);
    if (!rows.length) throw missing();
  }
  const row = await db.distributorCompany.findUnique({ where: { distributorId_companyId: { companyId, distributorId: id } }, include: { distributor: { include: { address: true } } } });
  if (!row) throw missing();
  return row;
}
async function accountingChoices(id?: string) {
  const { db, companyId } = context();
  const [accounts, saved, mappings, settings] = await Promise.all([
    db.accountantAccountingAccount.findMany({ where: { companyId, isActive: true, deletedAt: null }, select: { id: true, name: true, code: true, accountType: true }, orderBy: { name: 'asc' } }),
    db.accountantAudit.findFirst({ where: { companyId, resource: 'account-defaults', action: 'configured', resourceId: 'purchase', deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { after: true } }),
    id ? db.accountantDistributorMapping.findMany({ where: { companyId, distributorId: id } }) : [],
    id ? db.accountantDistributorSettings.findUnique({ where: { companyId_distributorId: { companyId, distributorId: id } } }) : null,
  ]);
  const companyDefaults = saved?.after || {};
  const recorded = Object.fromEntries(mappings.map((m: any) => [m.role, m.accountId]));
  return { accounts, mappings: { ...companyDefaults, ...recorded }, enabled: Boolean(settings?.enabled) };
}

/** Read-only: opening the form never creates a supplier, mapping or journal. */
export async function loadDistributorForm(id?: string) {
  const { role } = context();
  const row = id ? await membership(id) : null;
  const canManageAccounts = canManageDistributorAccounts(role);
  return { distributor: row?.distributor || null, openingDue: row?.openingDue ?? 0,
    openingDueDate: row?.openingDueDate || null, distributorNumber: row?.distributorNumber ?? null,
    canManageAccounts, ...(canManageAccounts ? await accountingChoices(id) : { accounts: [], mappings: {}, enabled: false }) };
}

/** Caller owns one transaction for profile, stable address, membership and posting. */
export async function saveDistributorForm(body: unknown) {
  const values = input.parse(body);
  const { db, companyId, userId, role } = context();
  if (values.accountingAccounts && !canManageDistributorAccounts(role)) {
    throw createError({ statusCode: 403, statusMessage: 'An admin, manager or accountant must save accounting selections' });
  }
  if (canManageDistributorAccounts(role) && !values.accountingAccounts) {
    throw createError({ statusCode: 400, statusMessage: 'Select the distributor accounting accounts before saving' });
  }
  const previous = values.id ? await membership(values.id, true) : null;
  const profile = Object.fromEntries(['name', 'status', 'accHolderName', 'bankName', 'accountNo', 'ifsc', 'upiId', 'gstin'].map(key => [key, values[key as keyof typeof values]]));
  const address = Object.fromEntries(['phoneNo', 'street', 'locality', 'landmark', 'houseDetails', 'city', 'state', 'pincode'].map(key => [key, values[key as keyof typeof values]]));
  const opening = { openingDue: values.openingDue, openingDueDate: values.openingDueDate ? new Date(values.openingDueDate) : null };
  // Validate every displayed role before changing any supplier data.
  let beforeAccounting: any = null;
  if (values.accountingAccounts) {
    beforeAccounting = await accountingChoices(values.id);
    for (const [key, field] of Object.entries(accountDefaultGroups.purchase.fields)) {
      const account = beforeAccounting.accounts.find((a: any) => a.id === values.accountingAccounts![key]);
      if (!account || !acceptsDefaultAccount(field, account)) {
        throw createError({ statusCode: 400, statusMessage: `Select an active company account for ${field.label}` });
      }
    }
  }
  let distributor;
  if (previous) {
    distributor = await db.distributor.update({ where: { id: values.id }, data: profile });
    // Update the existing address; never create another address on an ordinary edit.
    await db.address.upsert({ where: { distributorId: distributor.id }, update: address, create: { ...address, distributorId: distributor.id } });
    await db.distributorCompany.update({ where: { distributorId_companyId: { companyId, distributorId: distributor.id } }, data: opening });
  } else {
    const [counter] = await db.$queryRawUnsafe('UPDATE companies SET distributor_counter=distributor_counter+1 WHERE id=$1 RETURNING distributor_counter-1 AS number', companyId);
    distributor = await db.distributor.create({ data: { ...profile, address: { create: address },
      companies: { create: { companyId, distributorNumber: counter.number, ...opening } } } });
  }
  if (values.accountingAccounts) {
    if (beforeAccounting.enabled) await configureDistributorAccounting(distributor.id, values.accountingAccounts);
    else await importDistributorAccounting(distributor.id, values.accountingAccounts);
    const settings = await db.accountantDistributorSettings.findUnique({ where: { companyId_distributorId: { companyId, distributorId: distributor.id } } });
    if (settings?.contactId) await db.accountantContact.updateMany({ where: { id: settings.contactId, companyId }, data: { name: values.name, phone: values.phoneNo || null, isActive: values.status } });
  }
  await logActivity({ companyId, userId, resource: 'distributor-profile', resourceId: distributor.id, action: previous ? 'update' : 'create',
    meta: JSON.parse(JSON.stringify({ before: previous, beforeAccounting: beforeAccounting && { enabled: beforeAccounting.enabled, mappings: beforeAccounting.mappings },
      profile, opening, accountingAccounts: values.accountingAccounts })) });
  return { success: true, id: distributor.id, distributor, accountingEnabled: Boolean(values.accountingAccounts) };
}
