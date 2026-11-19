import { randomUUID } from 'node:crypto';
import { normalizeSalesWorkflow } from '../../utils/sales-workflow';
export async function readSalesWorkflow(db: any, companyId: string) {
    const row = (await db.query(`SELECT preference_value FROM general_preferences WHERE company_id=$1 AND page_name='sales-workflow' AND preference_key='defaults' AND active=true`, [companyId])).rows[0];
    return normalizeSalesWorkflow(row?.preference_value);
}
/** Caller holds the company lock and transaction; no history or journals change. */
export async function saveSalesWorkflow(db: any, companyId: string, value: { includeInvoicing?: boolean; includeAfterSales?: boolean }) {
    const current = await readSalesWorkflow(db, companyId);
    await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
        SELECT $2,company_id,'sales-workflow','defaults-backup',preference_value,true FROM general_preferences
        WHERE company_id=$1 AND page_name='sales-workflow' AND preference_key='defaults'
        ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [companyId, randomUUID()]);
    const preferences = normalizeSalesWorkflow({ ...current, ...value });
    await db.query(`INSERT INTO general_preferences(id,company_id,page_name,preference_key,preference_value,active)
        VALUES($1,$2,'sales-workflow','defaults',$3::jsonb,true)
        ON CONFLICT(company_id,page_name,preference_key) DO UPDATE SET preference_value=EXCLUDED.preference_value,active=true`, [randomUUID(), companyId, JSON.stringify(preferences)]);
    return preferences;
}
