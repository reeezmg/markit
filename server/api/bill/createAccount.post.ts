import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const {
    name,
    phone,
    address,
    companyId,
  } = body || {}

  if (!name || !companyId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'name and companyId are required',
    })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const accountId = uuidv4()
    const addressId = address ? uuidv4() : null

    /* ----------------------------
       CREATE ACCOUNT
    ---------------------------- */
    await client.query(
      `
      INSERT INTO accounts (
        id,
        name,
        phone,
        company_id
      ) VALUES ($1, $2, $3, $4)
      `,
      [accountId, name, phone, companyId]
    )

    /* ----------------------------
       CREATE ADDRESS (OPTIONAL)
    ---------------------------- */
    if (address) {
      await client.query(
        `
        INSERT INTO addresses (
          id,
          street,
          locality,
          city,
          state,
          pincode,
          account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          addressId,
          address.street || null,
          address.locality || null,
          address.city || null,
          address.state || null,
          address.pincode || null,
          accountId
        ]
      )
    }

    await client.query('COMMIT')

    return {
      id: accountId,
      success: true,
    }
  } catch (err: any) {
    await client.query('ROLLBACK')
    console.error('Create account failed:', err)

    throw createError({
      statusCode: 500,
      statusMessage: err.message || 'Failed to create account',
    })
  } finally {
    client.release()
  }
})
