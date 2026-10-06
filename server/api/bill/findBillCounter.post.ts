import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { pool } from '~/server/db'

export default eventHandler(async (event) => {
  const session = await useCompanyRequestSession(event)
  const body = await readBody(event)
  const { companyId } = body

  // Atomically increment and return — guarantees each caller gets a unique number
  const res = await pool.query(
    `UPDATE companies SET bill_counter = bill_counter + 1 WHERE id = $1 RETURNING bill_counter`,
    [companyId]
  )
  const billCounter = res.rows[0]?.bill_counter


  return billCounter
})
