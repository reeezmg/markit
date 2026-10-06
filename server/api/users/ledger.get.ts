import { defineCompanyListHandler } from '~/server/utils/companyListHandler';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'

export default defineCompanyListHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const client = await pool.connect()
  try {
    const res = await client.query(
      `
      WITH ledger_totals AS (
        SELECT
          user_id,
          SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END) AS credit_total,
          SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END) AS debit_total
        FROM user_ledger_entries
        WHERE company_id = $1
        GROUP BY user_id
      ),
      latest AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          balance_after
        FROM user_ledger_entries
        WHERE company_id = $1
        ORDER BY user_id, created_at DESC, id DESC
      )
      SELECT
        cu.user_id AS "userId",
        cu.name,
        cu.code,
        COALESCE(lt.credit_total, 0) AS "totalCredit",
        COALESCE(lt.debit_total, 0) AS "totalDebit",
        COALESCE(l.balance_after, 0) AS balance,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ule.id,
              'type', ule.type,
              'direction', ule.direction,
              'sourceType', ule.source_type,
              'sourceId', ule.source_id,
              'amount', ule.amount,
              'balanceAfter', ule.balance_after,
              'note', ule.note,
              'createdAt', ule.created_at
            )
            ORDER BY ule.created_at DESC, ule.id DESC
          ) FILTER (WHERE ule.id IS NOT NULL),
          '[]'
        ) AS entries
      FROM company_users cu
      LEFT JOIN ledger_totals lt ON lt.user_id = cu.user_id
      LEFT JOIN latest l ON l.user_id = cu.user_id
      LEFT JOIN user_ledger_entries ule
        ON ule.company_id = cu.company_id
       AND ule.user_id = cu.user_id
      WHERE cu.company_id = $1
        AND cu.deleted = false
      GROUP BY cu.user_id, cu.name, cu.code, lt.credit_total, lt.debit_total, l.balance_after
      HAVING COUNT(ule.id) > 0
      ORDER BY cu.name NULLS LAST, cu.code NULLS LAST
      `,
      [companyId],
    )

    const linked = await client.query(`
      SELECT u.id, j.id AS "journalId", j.entry_number AS "entryNumber",
        CASE WHEN j.id IS NOT NULL THEN 'Posted'
          WHEN us.signature->>'excluded'='true' THEN 'Before connection'
          WHEN u.source_type='BILL' THEN 'No posted bill journal'
          ELSE COALESCE(us.signature->>'reason','Not connected') END AS "accountingStatus",
        COALESCE((SELECT json_agg(json_build_object('accountId',a.id,'account',a.name,'side',l.side,'amount',l.amount) ORDER BY l.side,l.id)
          FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id AND a.company_id=l.company_id
          WHERE l.company_id=u.company_id AND l.journal_id=j.id AND l.deleted_at IS NULL),'[]') AS "accountingLines"
      FROM user_ledger_entries u
      LEFT JOIN accountant_v2_user_sources us ON us.company_id=u.company_id AND us.source_key=accountant_v2_user_key(u.type::text,u.source_type::text,u.source_id,u.id)
      LEFT JOIN accountant_v2_erp_sources es ON es.company_id=u.company_id AND u.source_type='BILL' AND es.source_key='bill:'||u.source_id
      LEFT JOIN accountant_v2_user_sources cuts ON cuts.company_id=u.company_id AND u.source_type='PAYROLL' AND u.type='SALARY_PAYMENT'
        AND cuts.source_key='CREDIT_BILL_PAYMENT:PAYROLL:'||replace(u.source_id,':salary-settlement','')
      LEFT JOIN accountant_v2_manual_journals j ON j.company_id=u.company_id AND j.id=COALESCE(us.journal_id,es.journal_id,cuts.journal_id) AND j.status='PUBLISHED' AND j.deleted_at IS NULL
      WHERE u.company_id=$1`, [companyId]);
    const byId = new Map(linked.rows.map((row: any) => [row.id, row]));
    return res.rows.map((row: any) => ({...row, entries: row.entries.map((entry: any) => ({...entry, ...byId.get(entry.id)}))}))
  } finally {
    client.release()
  }
})
