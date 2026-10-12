import { createError } from 'h3';
import { normalizeExpenseParty } from '../../utils/expense-party';

export async function validateExpenseParty(db: any, companyId: string, body: any, previous?: any) {
  if (body.expensecategoryId && !(await db.query('SELECT id FROM expense_categories WHERE company_id=$1 AND id=$2 FOR SHARE', [companyId, body.expensecategoryId])).rowCount) {
    throw createError({ statusCode: 400, statusMessage: 'Expense category does not belong to this company' });
  }
  let party;
  try { party = normalizeExpenseParty(body, previous); }
  catch (error: any) { throw createError({ statusCode: 400, statusMessage: error.message }); }
  const check = party.userId
    ? ['SELECT user_id FROM company_users WHERE company_id=$1 AND user_id=$2 AND deleted=false FOR SHARE', party.userId]
    : party.distributorId
      ? ['SELECT distributor_id FROM distributor_companies WHERE company_id=$1 AND distributor_id=$2 FOR SHARE', party.distributorId]
      : party.clientId
        ? ['SELECT client_id FROM company_clients WHERE company_id=$1 AND client_id=$2 FOR SHARE', party.clientId] : null;
  if (check && !(await db.query(check[0], [companyId, check[1]])).rowCount) {
    throw createError({ statusCode: 400, statusMessage: 'Expense party does not belong to this company' });
  }
  return party;
}

/** Force native posting to notice a party-only edit and enforce its period locks.
 * The native sync replaces this one-use signature marker when it reposts.
 */
export async function markExpensePartyChange(db: any, companyId: string, id: string, before: any, after: any) {
  if (['userId', 'distributorId', 'clientId'].every(key => (before[key] || null) === after[key])) return;
  await db.query(`UPDATE accountant_v2_erp_sources
    SET signature=signature || '{"expensePartyChanged":true}'::jsonb
    WHERE company_id=$1 AND source_key='expense:'||$2 AND journal_id IS NOT NULL`, [companyId, id]);
}

/** Keep native expense amounts/posting and enrich only the current source journal.
 * Flush deferred posting first so commit cannot replace these party dimensions.
 * Linked DP expenses have no ERP journal and must never post a second payment.
 */
export async function syncExpensePartyLines(db: any, companyId: string, ids: string[]) {
  await db.query('SET CONSTRAINTS ALL IMMEDIATE');
  await db.query(`UPDATE accountant_v2_manual_journal_lines l SET
      distributor_id=e.distributor_id,
      source_parties=(COALESCE(l.source_parties,'{}'::jsonb)-'user'-'client'-'distributor') ||
        CASE WHEN e.from_id IS NOT NULL THEN jsonb_build_object('user',jsonb_build_object('id',e.from_id,'name',cu.name))
          WHEN e.distributor_id IS NOT NULL THEN jsonb_build_object('distributor',jsonb_build_object('id',e.distributor_id,'name',d.name))
          WHEN e.client_id IS NOT NULL THEN jsonb_build_object('client',jsonb_build_object('id',e.client_id,'name',cl.name))
          ELSE '{}'::jsonb END
    FROM expenses e
    JOIN accountant_v2_erp_sources s ON s.company_id=e.company_id AND s.source_key='expense:'||e.id
    JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=e.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
    LEFT JOIN company_users cu ON cu.company_id=e.company_id AND cu.user_id=e.from_id
    LEFT JOIN distributors d ON d.id=e.distributor_id
    LEFT JOIN clients cl ON cl.id=e.client_id
    WHERE e.company_id=$1 AND e.id=ANY($2::text[]) AND l.company_id=e.company_id
      AND l.journal_id=s.journal_id AND l.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM distributor_payments dp WHERE dp.company_id=e.company_id AND dp.expense_id=e.id)`, [companyId, ids]);
}
