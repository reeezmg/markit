import { appendCompanyWhere } from '~/utils/companyWhere';
import { Prisma } from '@prisma/client';
import { createError } from 'h3';
import { prisma } from '~/server/prisma';

const models = new Map(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));
const delegateName = (name: string) => name[0].toLowerCase() + name.slice(1);
const owned = (name: string) => models.get(name)?.fields.some(f => f.name === 'companyId');
const ownershipParent = (name: string) => owned(name) ? undefined : models.get(name)?.fields.find(f =>
  f.kind === 'object' && !f.isList && f.isRequired && owned(f.type) && f.relationFromFields?.length === 1);
const reads = new Set(['findMany', 'findFirst', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']);
const writes = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert']);
const legacyArchives = new Set(['AccountLedgerEntry', 'MoneyTransaction', 'AccountTransfer', 'Investment', 'BankAccount', 'CashAccount']);
const archiveMutations = new Set([...writes, 'createManyAndReturn', 'updateManyAndReturn']);
const archiveWriteDenied = () => createError({ statusCode: 410, statusMessage: 'Legacy Accounts is read-only. Use Accountant for new financial entries.' });
const denied = () => createError({ statusCode: 403, statusMessage: 'Record or related data belongs to another company' });

function scopeRelations(modelName: string, args: any, ids: string[]): any {
  const result = { ...args };
  for (const operation of ['include', 'select']) {
    if (!args[operation]) continue;
    result[operation] = { ...args[operation] };
    for (const field of models.get(modelName)?.fields.filter(f => f.kind === 'object') ?? []) {
      const selected = args[operation][field.name];
      if (!selected) continue;
      let nested = selected === true ? {} : selected;
      if (field.isList && owned(field.type)) nested = { ...nested, where: { AND: [nested.where ?? {}, { companyId: { in: ids } }] } };
      result[operation][field.name] = selected === true && !Object.keys(nested).length ? true : scopeRelations(field.type, nested, ids);
    }
  }
  return result;
}

async function validateData(modelName: string, data: any, ids: string[], parentCompany?: string, db: any = prisma): Promise<void> {
  if (!data) return;
  if (legacyArchives.has(modelName)) throw archiveWriteDenied();
  if (Array.isArray(data)) { for (const row of data) await validateData(modelName, row, ids, parentCompany, db); return; }
  const linkedCompany = Object.values(data).flatMap((value: any) => Object.values(value?.connect ?? {}))
    .find((value: any) => value && typeof value === 'object' && typeof value.companyId === 'string') as any;
  const companyId = data.companyId?.set ?? data.companyId ?? data.company?.connect?.id ?? linkedCompany?.companyId ?? parentCompany;
  if (companyId && (typeof companyId !== 'string' || !ids.includes(companyId))) throw denied();
  for (const field of models.get(modelName)?.fields ?? []) {
    if (field.kind !== 'object' || !data[field.name]) continue;
    const relation = data[field.name];
    if (legacyArchives.has(field.type) && ['create', 'createMany', 'update', 'updateMany', 'upsert', 'connectOrCreate', 'delete', 'deleteMany'].some(operation => relation[operation])) throw archiveWriteDenied();
    if (field.type === 'Company') {
      if (relation.connect?.id && !ids.includes(relation.connect.id)) throw denied();
      continue;
    }
    for (const key of ['connect', 'set', 'disconnect', 'delete']) {
      const value = relation[key];
      if (!value || typeof value === 'boolean') continue;
      for (const where of Array.isArray(value) ? value : [value]) {
        if (!owned(field.type)) continue;
        const row = await (db as any)[delegateName(field.type)].findUnique({ where, select: { companyId: true } });
        if (!row || !ids.includes(row.companyId) || (companyId && row.companyId !== companyId)) throw denied();
      }
    }
    if (relation.create) await validateData(field.type, relation.create, ids, companyId, db);
    if (relation.createMany?.data) await validateData(field.type, relation.createMany.data, ids, companyId, db);
    if (relation.update) for (const value of Array.isArray(relation.update) ? relation.update : [relation.update]) {
      const update = value.data ?? value;
      const destination = update.companyId?.set ?? update.companyId ?? update.company?.connect?.id;
      if (destination && destination !== companyId) {
        throw createError({ statusCode: 409, statusMessage: 'Use a confirmed company transfer to change ownership' });
      }
      if (value.where && owned(field.type)) {
        const row = await db[delegateName(field.type)].findUnique({ where: value.where, select: { companyId: true } });
        if (!row || !ids.includes(row.companyId) || (companyId && row.companyId !== companyId)) throw denied();
      }
      await validateData(field.type, value.data ?? value, ids, companyId, db);
    }
    for (const operation of ['connectOrCreate', 'upsert']) {
      for (const value of relation[operation] ? (Array.isArray(relation[operation]) ? relation[operation] : [relation[operation]]) : []) {
        if (value.where && owned(field.type)) {
          const row = await db[delegateName(field.type)].findUnique({ where: value.where, select: { companyId: true } });
          if (row && (!ids.includes(row.companyId) || (companyId && row.companyId !== companyId))) throw denied();
        }
        if (value.update?.companyId !== undefined || value.update?.company) throw createError({ statusCode: 409, statusMessage: 'Use a confirmed company transfer to change ownership' });
        await validateData(field.type, value.create, ids, companyId, db);
        await validateData(field.type, value.update, ids, companyId, db);
      }
    }
    for (const operation of ['updateMany', 'deleteMany']) {
      for (const value of relation[operation] ? (Array.isArray(relation[operation]) ? relation[operation] : [relation[operation]]) : []) {
        if (value.data?.companyId !== undefined || value.data?.company) throw createError({ statusCode: 409, statusMessage: 'Use a confirmed company transfer to change ownership' });
        // Prisma confines nested bulk operations to the already-authorized parent.
        // Querying this filter globally would reject valid `where: {}` updates.
        await validateData(field.type, value.data, ids, companyId, db);
      }
    }
  }
  for (const relation of models.get(modelName)?.fields.filter(f => f.kind === 'object' && f.relationFromFields?.length === 1) ?? []) {
    const scalar = relation.relationFromFields![0];
    const id = data[scalar]?.set ?? data[scalar];
    if (!id || relation.type === 'Company' || !owned(relation.type)) continue;
    const row = await (db as any)[delegateName(relation.type)].findUnique({ where: { [relation.relationToFields![0]]: id }, select: { companyId: true } });
    if (!row || !ids.includes(row.companyId) || (companyId && row.companyId !== companyId)) throw denied();
  }
}

/** Restrict access, never broaden explicit filters. */
export function scopeOrganizationModelReads<T extends object>(client: T, activeId: string, ids: string[]): T {
  return new Proxy(client, {
    get(target, key, receiver) {
      const delegate = Reflect.get(target, key, receiver);
      const model = [...models.values()].find(m => delegateName(m.name) === key);
      if (!model || !delegate) return delegate;
      return new Proxy(delegate, {
        get(targetDelegate, operation, innerReceiver) {
          const method = Reflect.get(targetDelegate, operation, innerReceiver);
          if (typeof operation !== 'string' || typeof method !== 'function' || (!reads.has(operation) && !writes.has(operation) && !(legacyArchives.has(model.name) && archiveMutations.has(operation)))) return method;
          return async (args: any = {}) => {
            if (legacyArchives.has(model.name) && archiveMutations.has(operation)) throw archiveWriteDenied();
            const run = async (db: any) => {
            let owner: string | undefined;
            const isOwned = owned(model.name);
            const parent = ownershipParent(model.name);
            if (writes.has(operation)) {
              if (model.name === 'CompanyUser' && ['update', 'delete', 'updateMany', 'deleteMany', 'upsert'].includes(operation)) {
                const members = await db.companyUser.findMany({ where: { AND: [(args.where?.companyId_userId ?? args.where ?? {}), { companyId: { in: ids } }] } });
                const change = args.data ?? args.update ?? {};
                const removing = operation.startsWith('delete') || (change.deleted?.set ?? change.deleted) === true || (change.status?.set ?? change.status) === false || ((change.role?.set ?? change.role) && (change.role?.set ?? change.role) !== 'admin');
                if (removing) for (const companyId of [...new Set(members.map((m: any) => m.companyId))].sort()) {
                  await db.$queryRawUnsafe('SELECT id FROM companies WHERE id=$1 FOR UPDATE', companyId);
                  const admins = await db.companyUser.count({ where: { companyId, role: 'admin', status: true, deleted: false } });
                  const removed = members.filter((m: any) => m.companyId === companyId && m.role === 'admin' && m.status && !m.deleted).length;
                  if (removed && admins <= removed) throw createError({ statusCode: 409, statusMessage: 'At least one active admin must remain in this company' });
                }
              }
              if (operation === 'updateMany' && (args.data?.companyId !== undefined || args.data?.company)) {
                throw createError({ statusCode: 409, statusMessage: 'Use a confirmed company transfer to change ownership' });
              }
              if ((isOwned || parent) && args.where && !operation.endsWith('Many')) {
                const existing = await (db as any)[key].findUnique({ where: args.where, select: isOwned ? { companyId: true } : { [parent!.name]: { select: { companyId: true } } } });
                owner = isOwned ? existing?.companyId : existing?.[parent!.name]?.companyId;
                if (existing && (!owner || !ids.includes(owner))) throw denied();
                const update = args.data ?? args.update;
                const destination = update?.companyId?.set ?? update?.companyId ?? update?.company?.connect?.id;
                if (owner && destination && owner !== destination) throw createError({ statusCode: 409, statusMessage: 'Preview and confirm the company transfer first' });
              }
              if (!owner && parent) {
                const data = args.data ?? args.create;
                const parentId = data?.[parent.relationFromFields![0]] ?? data?.[parent.name]?.connect?.id;
                if (parentId) {
                  const record = await db[delegateName(parent.type)].findUnique({ where: { id: parentId }, select: { companyId: true } });
                  if (!record || !ids.includes(record.companyId)) throw denied();
                  owner = record.companyId;
                }
              }
              await validateData(model.name, args.data ?? args.create, ids, owner ?? activeId, db);
              if (args.update) await validateData(model.name, args.update, ids, owner ?? activeId, db);
            }
            const cap = isOwned ? { companyId: { in: ids } }
              : parent ? { [parent.name]: { companyId: { in: ids } } }
              : model.name === 'Company' ? { id: { in: ids } }
              : model.name === 'Distributor' ? { companies: { some: { companyId: { in: ids } } } } : null;
            const filtered = cap && (reads.has(operation) || ['update', 'updateMany', 'delete', 'deleteMany'].includes(operation))
              ? { ...args, where: appendCompanyWhere(args.where, cap) } : args;
            return db[key][operation](scopeRelations(model.name, filtered, ids));
            };
            return writes.has(operation)
              ? (client as any).$transaction(run, { isolationLevel: 'Serializable' })
              : run(client);
          };
        },
      });
    },
  });
}
