import { randomUUID } from 'node:crypto';
import { createError, getHeader, getRequestURL, type H3Event } from 'h3';
import { getReadCompanyId } from './organizationReadScope';
import { pool } from '../db';
import { normalizeSidebarPreferences, type SidebarPreferences } from '../../utils/sidebar-navigation';

export async function sidebarActor(event: H3Event, write = false) {
  const session = await requireAuthSession(event), companyId = await getReadCompanyId(event);
  const member = (await pool.query('SELECT role FROM company_users WHERE company_id=$1 AND user_id=$2 AND status=true AND deleted=false', [session.data.companyId, session.data.id])).rows[0];
  if (!member) throw createError({ statusCode: 403, statusMessage: 'Active company membership is required.' });
  const canManage = ['admin', 'manager'].includes(member.role);
  if (write && !canManage) throw createError({ statusCode: 403, statusMessage: 'Only administrators and managers can change sidebar settings.' });
  if (write && getHeader(event, 'origin') !== getRequestURL(event).origin) throw createError({ statusCode: 403, statusMessage: 'Open Settings on this Markit site before saving.' });
  return { companyId, canManage };
}
export async function readSidebarPreferences(db: any, companyId: string): Promise<SidebarPreferences> {
  const row = (await db.query("SELECT preference_value FROM general_preferences WHERE company_id=$1 AND page_name='sidebar-navigation' AND preference_key='defaults' AND active=true", [companyId])).rows[0];
  return normalizeSidebarPreferences(row?.preference_value);
}
/** Caller locks the selected company and owns the transaction. No schema changes. */
export async function saveSidebarPreferences(db: any, companyId: string, input: SidebarPreferences) {
  const current = await readSidebarPreferences(db, companyId);
  if (current.revision !== input.revision) throw createError({ statusCode: 409, statusMessage: 'Sidebar settings changed in another session. Reload before saving.' });
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    SELECT $2,company_id,'sidebar-navigation','defaults-backup',preference_value,true FROM general_preferences
    WHERE company_id=$1 AND page_name='sidebar-navigation' AND preference_key='defaults'
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [companyId, randomUUID()]);
  const preferences = { ...input, revision: current.revision + 1 };
  await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
    VALUES($1,$2,'sidebar-navigation','defaults',$3::jsonb,true)
    ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, JSON.stringify(preferences)]);
  return preferences;
}
