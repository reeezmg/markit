import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await requireAuthSession(event)

  const { rows } = await pool.query(
    `
      SELECT c.id, c.name, c.email, c.phone
      FROM clients c
      INNER JOIN company_clients cc ON cc.client_id = c.id
      WHERE cc.company_id = $1 AND COALESCE(c.deleted, false) = false
      ORDER BY c.name ASC NULLS LAST, c.email ASC NULLS LAST
      LIMIT 200
    `,
    [session.data.companyId]
  )

  return rows
})
