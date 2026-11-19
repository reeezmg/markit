import { createError, defineEventHandler, readBody, setHeader } from 'h3';
import { pool } from '../../db';
import { sidebarActor, saveSidebarPreferences } from '../../utils/sidebar-navigation';
import { normalizeSidebarPreferences } from '../../../utils/sidebar-navigation';
export default defineEventHandler(async event => {
  const actor = await sidebarActor(event, true);
  let preferences;
  try { preferences = normalizeSidebarPreferences(await readBody(event), true); }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }); }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (!(await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [actor.companyId])).rows.length) throw createError({ statusCode: 404, statusMessage: 'Company not found.' });
    const saved = await saveSidebarPreferences(db, actor.companyId, preferences);
    await db.query('COMMIT'); setHeader(event, 'Cache-Control', 'no-store');
    return { preferences: saved, canManage: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
});
