import { pool } from '~/server/db'

const VALID_COUNTERS: Record<string, { column: string; sessionKey: string }> = {
  expense: { column: 'expense_counter', sessionKey: 'expenseCounter' },
  distributor: { column: 'distributor_counter', sessionKey: 'distributorCounter' },
  distributorPayment: { column: 'distributor_payment_counter', sessionKey: 'distributorPaymentCounter' },
  distributorCredit: { column: 'distributor_credit_counter', sessionKey: 'distributorCreditCounter' },
  client: { column: 'client_counter', sessionKey: 'clientCounter' },
  account: { column: 'account_counter', sessionKey: 'accountCounter' },
  user: { column: 'user_code_counter', sessionKey: 'userCodeCounter' },
}

export default eventHandler(async (event) => {
  const session = await requireAuthSession(event)
  const body = await readBody(event)
  const { entity } = body

  const config = VALID_COUNTERS[entity]
  if (!config) {
    throw createError({ statusCode: 400, statusMessage: `Invalid entity: ${entity}` })
  }

  const companyId = session.data.companyId

  // Atomically increment and return the assigned number (counter - 1)
  const res = await pool.query(
    `UPDATE companies SET ${config.column} = ${config.column} + 1 WHERE id = $1 RETURNING ${config.column} - 1 AS num, ${config.column}`,
    [companyId]
  )

  const assignedNumber = res.rows[0]?.num
  const newCounter = res.rows[0]?.[config.column.replace(/_/g, '')]  // camelCase doesn't matter, pg returns snake

  // Update session with new counter value
  await session.update({ [config.sessionKey]: res.rows[0]?.[config.column] })

  return { number: assignedNumber }
})
