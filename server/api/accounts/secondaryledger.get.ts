import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const query = getQuery(event)
  const bankId = query.bankId as string

  if (!bankId) {
    throw createError({ statusCode: 400, statusMessage: 'Bank ID required' })
  }

  const from = query.from
    ? new Date(query.from as string)
    : new Date('1970-01-01')

  const to = query.to
    ? new Date(query.to as string)
    : new Date()

  const client = await pool.connect()

  try {
    const rows: any[] = []

    /* =================================================
       BANK INFO + BASE OPENING
    ================================================== */
    const bankRes = await client.query(
      `
      SELECT id, bank_name, acc_holder_name, account_no, ifsc, upi_id, opening_balance
      FROM bank_accounts
      WHERE id = $1 AND company_id = $2
      `,
      [bankId, companyId]
    )

    const b = bankRes.rows[0]
    if (!b) throw createError({ statusCode: 404, statusMessage: 'Bank not found' })

    const baseOpening = Number(b.opening_balance || 0)

    const bankInfo = {
      id: b.id,
      type: 'SECONDARY',
      bankName: b.bank_name,
      accHolderName: b.acc_holder_name,
      accountNo: b.account_no,
      ifsc: b.ifsc,
      upiId: b.upi_id,
    }

    /* =================================================
       OPENING BALANCE (FAST SUMS)
    ================================================== */
    let moneyNetBefore = 0
    let transferNetBefore = 0

    // MONEY TRANSACTIONS (THIS BANK ONLY)
    {
      const r = await client.query(
        `
        SELECT COALESCE(SUM(
          CASE
            WHEN direction = 'RECEIVED' THEN amount
            ELSE -amount
          END
        ), 0) AS net
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND status = 'PAID'
          AND account_id = $2
          AND created_at < $3
        `,
        [companyId, bankId, from]
      )

      moneyNetBefore = Number(r.rows[0].net || 0)
    }

    // ACCOUNT TRANSFERS (THIS BANK ONLY)
    {
      const r = await client.query(
        `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN to_type = 'BANK' AND to_account_id = $2
              THEN amount ELSE 0 END
          ), 0)
          -
          COALESCE(SUM(
            CASE
              WHEN from_type = 'BANK' AND from_account_id = $2
              THEN amount ELSE 0 END
          ), 0) AS net
        FROM account_transfers
        WHERE company_id = $1
          AND created_at < $3
          AND (
            from_account_id = $2
            OR
            to_account_id = $2
          )
        `,
        [companyId, bankId, from]
      )

      transferNetBefore = Number(r.rows[0].net || 0)
    }

    const openingBalance =
      baseOpening +
      moneyNetBefore +
      transferNetBefore

    /* =================================================
       OPENING ROW
    ================================================== */
    rows.push({
      date: from,
      source: 'OPENING',
      ref: '-',
      description: 'Opening Balance',
      debit: 0,
      credit: openingBalance,
    })

    /* =================================================
       LEDGER ROWS (THIS BANK ONLY)
    ================================================== */

    // MONEY TRANSACTIONS
    {
      const r = await client.query(
        `
        SELECT
          created_at AS date,
          'TRANSACTION' AS source,
          id::text AS ref,
          direction || ' via bank' AS description,
          CASE WHEN direction = 'GIVEN' THEN amount ELSE 0 END AS debit,
          CASE WHEN direction = 'RECEIVED' THEN amount ELSE 0 END AS credit
        FROM money_transactions
        WHERE company_id = $1
          AND payment_mode = 'BANK'
          AND status = 'PAID'
          AND account_id = $2
          AND created_at BETWEEN $3 AND $4
        `,
        [companyId, bankId, from, to]
      )

      rows.push(...r.rows)
    }

    // ACCOUNT TRANSFERS
    {
      const r = await client.query(
        `
        SELECT
          created_at AS date,
          'TRANSFER' AS source,
          id::text AS ref,
          from_type || ' → ' || to_type AS description,
          CASE
            WHEN from_type = 'BANK' AND from_account_id = $2
            THEN amount ELSE 0 END AS debit,
          CASE
            WHEN to_type = 'BANK' AND to_account_id = $2
            THEN amount ELSE 0 END AS credit
        FROM account_transfers
        WHERE company_id = $1
          AND created_at BETWEEN $3 AND $4
          AND (
            from_account_id = $2
            OR
            to_account_id = $2
          )
        `,
        [companyId, bankId, from, to]
      )

      rows.push(...r.rows)
    }

    /* =================================================
       SORT + RUNNING BALANCE
    ================================================== */
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let balance = 0
    const ledger = rows.map(r => {
      balance += Number(r.credit) - Number(r.debit)
      return { ...r, runningBalance: balance }
    })

    return {
      bank: { ...bankInfo, openingBalance },
      from,
      to,
      ledger,
      closingBalance: balance,
    }
  } finally {
    client.release()
  }
})
