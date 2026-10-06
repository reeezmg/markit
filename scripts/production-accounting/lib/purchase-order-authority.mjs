import {readFileSync} from 'node:fs';

// Opt-in per source ID. Preserve the installed projection, including existing exclusions.
export async function installPurchaseOrderAuthority(db) {
  const exists=(await db.query("SELECT to_regclass('accountant_v2_distributor_events_before_po_authority') AS name")).rows[0].name;
  if(!exists){
    const definition=(await db.query("SELECT pg_get_viewdef('accountant_v2_distributor_events'::regclass,true) AS definition")).rows[0].definition;
    await db.query(`CREATE VIEW accountant_v2_distributor_events_before_po_authority AS ${definition}`);
  }
  await db.query(readFileSync(new URL('./purchase-order-authority.sql',import.meta.url),'utf8'));
}
