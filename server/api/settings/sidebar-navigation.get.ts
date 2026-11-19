import { defineEventHandler, setHeader } from 'h3';
import { pool } from '../../db';
import { sidebarActor, readSidebarPreferences } from '../../utils/sidebar-navigation';
export default defineEventHandler(async event => {
  const actor = await sidebarActor(event);
  setHeader(event, 'Cache-Control', 'no-store');
  return { preferences: await readSidebarPreferences(pool, actor.companyId), canManage: actor.canManage };
});
