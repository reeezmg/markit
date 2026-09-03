import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { createEcommOrder, type CreateOrderInput } from '~/server/utils/ecomm-order-create'

/**
 * Create an ecommerce order by hand — the counterpart to storefront checkout.
 *
 * The work itself lives in `server/utils/ecomm-order-create.ts` so it can be
 * exercised against the real schema inside a transaction that rolls back; this
 * handler owns only the session, the transaction and the session counter.
 *
 * POST /api/ecommerce-cms/orders/create
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data?.companyId as string | undefined
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<CreateOrderInput>(event)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await createEcommOrder(client, companyId, session.data?.id ?? null, body)
    await client.query('COMMIT')

    // The client counter lives in the session too, so it stays in step with
    // whatever the seller does next. Only after the commit — a rolled-back
    // customer must not consume a number in the session.
    // The cast mirrors /api/counter/increment, which writes the same field: the
    // session carries clientCounter at runtime but AuthSession does not declare
    // it, so a plain object literal is rejected.
    if (result.clientCounter !== null) {
      await session.update({ clientCounter: result.clientCounter } as any)
    }

    return { ok: true, ...result }
  } catch (e: any) {
    await client.query('ROLLBACK')
    if (e?.statusCode) throw e
    throw createError({ statusCode: 500, statusMessage: e?.message || 'Could not create the order' })
  } finally {
    client.release()
  }
})
