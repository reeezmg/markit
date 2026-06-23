import crypto from 'crypto'

export type UserCreditTxnType = 'CREDIT' | 'PAYMENT'
export type UserCreditSourceType = 'MANUAL' | 'BILL' | 'PAYROLL'

export function creditAmountFromBill(payload: any) {
  if (payload?.paymentMethod === 'Split' && Array.isArray(payload?.splitPayments)) {
    return payload.splitPayments
      .filter((payment: any) => payment?.method === 'Credit')
      .reduce((sum: number, payment: any) => sum + Number(payment?.amount || 0), 0)
  }
  return Number(payload?.grandTotal || 0)
}

export async function upsertUserCreditTransaction(
  client: any,
  input: {
    companyId: string
    userId: string
    type: UserCreditTxnType
    sourceType: UserCreditSourceType
    sourceId?: string | null
    amount: number
    note?: string | null
    transactionDate?: Date | string | null
    cycleId?: string | null
    cycleLineId?: string | null
  },
) {
  const amount = Number(input.amount || 0)
  if (!input.companyId || !input.userId || amount <= 0) return null

  const when = input.transactionDate ? new Date(input.transactionDate) : new Date()
  const id = crypto.randomUUID()

  const res = await client.query(
    `
    INSERT INTO user_credit_transactions (
      id,
      company_id,
      user_id,
      type,
      source_type,
      source_id,
      amount,
      note,
      transaction_date,
      cycle_id,
      cycle_line_id,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4::"UserCreditTxnType", $5::"UserCreditSourceType", $6, $7, $8, $9, $10, $11, now(), now())
    ON CONFLICT (company_id, source_type, source_id, type)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      amount = EXCLUDED.amount,
      note = EXCLUDED.note,
      transaction_date = EXCLUDED.transaction_date,
      cycle_id = EXCLUDED.cycle_id,
      cycle_line_id = EXCLUDED.cycle_line_id,
      updated_at = now()
    RETURNING id
    `,
    [
      id,
      input.companyId,
      input.userId,
      input.type,
      input.sourceType,
      input.sourceId || null,
      amount,
      input.note || null,
      when,
      input.cycleId || null,
      input.cycleLineId || null,
    ],
  )

  return res.rows[0] || null
}

export async function deleteUserCreditTransactionForSource(
  client: any,
  input: {
    companyId: string
    sourceType: UserCreditSourceType
    sourceId: string
    type?: UserCreditTxnType
  },
) {
  await client.query(
    `
    DELETE FROM user_credit_transactions
    WHERE company_id = $1
      AND source_type = $2::"UserCreditSourceType"
      AND source_id = $3
      ${input.type ? 'AND type = $4::"UserCreditTxnType"' : ''}
    `,
    input.type
      ? [input.companyId, input.sourceType, input.sourceId, input.type]
      : [input.companyId, input.sourceType, input.sourceId],
  )
}
