import { Prisma } from '@prisma/client';
import { createError, type H3Event } from 'h3';

/** Recheck and hold ownership of referenced rows for the duration of a SQL write. */
export async function lockCompanyRequest(event: H3Event, db: any) {
  const checks = event.context.companyScopeChecks ?? [];
  for (const check of [...checks].sort((a, b) => `${a.model}:${a.id}`.localeCompare(`${b.model}:${b.id}`))) {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name[0].toLowerCase() + m.name.slice(1) === check.model);
    if (!model) throw createError({ statusCode: 400, statusMessage: 'Unknown related record' });
    const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
    const field = model.fields.find(f => f.name === 'companyId')!;
    const result = await db.query(`SELECT ${quote(field.dbName || field.name)} AS owner FROM ${quote(model.dbName || model.name)} WHERE id = $1 FOR SHARE`, [check.id]);
    if (result.rows[0]?.owner !== check.companyId) throw createError({ statusCode: 409, statusMessage: 'Record ownership changed. Reload and try again.' });
  }
}
