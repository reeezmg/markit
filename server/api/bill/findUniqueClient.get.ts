import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  /* --------------------------------
     AUTH
  -------------------------------- */
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  /* --------------------------------
     QUERY PARAMS
  -------------------------------- */
  const query = getQuery(event)
  const phone = query.phone as string | undefined

  if (!phone) {
    throw createError({
      statusCode: 400,
      statusMessage: 'phone is required',
    })
  }

  const client = await pool.connect()

  try {
    /* --------------------------------
       SQL
    -------------------------------- */
    const res = await client.query(
      `
      SELECT
        c.id,
        c.name,
        c.email,
        c.phone,
        c.status,
        c.pipeline_status AS "pipelineStatus",
        cc.points
      FROM clients c
      INNER JOIN company_clients cc
        ON cc.client_id = c.id
       AND cc.company_id = $1
      WHERE c.phone = $2
        AND c.deleted = false
      LIMIT 1;
      `,
      [companyId, phone]
    )

    if (res.rows.length === 0) {
      return null
    }

    const row = res.rows[0]

    /* --------------------------------
       TRANSFORM (Prisma-like shape)
    -------------------------------- */
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      companies: [
        {
          points: Number(row.points || 0),
        },
      ],
    }
  } finally {
    client.release()
  }
})
