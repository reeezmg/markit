import crypto from 'crypto'

export type UserLedgerEntryType =
  | 'OPENING'
  | 'PAYROLL_ACCRUAL'
  | 'SALARY_PAYMENT'
  | 'USER_CREDIT_BILL'
  | 'CREDIT_BILL_PAYMENT'
  | 'ADJUSTMENT'

export type UserLedgerDirection = 'DEBIT' | 'CREDIT'

export type UserLedgerSourceType =
  | 'MANUAL'
  | 'OPENING'
  | 'PAYROLL_CYCLE'
  | 'PAYROLL_LINE'
  | 'SALARY_PAYMENT'
  | 'BILL'
  | 'PAYROLL'
  | 'ADJUSTMENT'

export function creditAmountFromBill(payload: any) {
  if (payload?.paymentMethod === 'Split' && Array.isArray(payload?.splitPayments)) {
    return payload.splitPayments
      .filter((payment: any) => payment?.method === 'Credit')
      .reduce((sum: number, payment: any) => sum + Number(payment?.amount || 0), 0)
  }
  return Number(payload?.grandTotal || 0)
}

const enumCast = {
  type: '"UserLedgerEntryType"',
  direction: '"UserLedgerDirection"',
  sourceType: '"UserLedgerSourceType"',
}

export function ledgerSignedAmount(direction: UserLedgerDirection, amount: number) {
  return direction === 'CREDIT' ? amount : -amount
}

export async function recalculateUserLedgerBalances(
  client: any,
  input: { companyId: string; userId: string },
) {
  await client.query(
    `
    WITH ordered AS (
      SELECT
        id,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END)
          OVER (ORDER BY created_at ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
      FROM user_ledger_entries
      WHERE company_id = $1
        AND user_id = $2
    )
    UPDATE user_ledger_entries ule
    SET balance_after = ordered.balance
    FROM ordered
    WHERE ule.id = ordered.id
    `,
    [input.companyId, input.userId],
  )
}

export async function upsertUserLedgerEntry(
  client: any,
  input: {
    companyId: string
    userId: string
    type: UserLedgerEntryType
    direction: UserLedgerDirection
    amount: number
    sourceType: UserLedgerSourceType
    sourceId?: string | null
    note?: string | null
    createdAt?: Date | string | null
  },
) {
  const amount = Number(input.amount || 0)
  if (!input.companyId || !input.userId || amount <= 0) return null

  const when = input.createdAt ? new Date(input.createdAt) : new Date()
  const id = crypto.randomUUID()

  const existing = await client.query(
    `
    SELECT user_id
    FROM user_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::${enumCast.sourceType}
      AND source_id IS NOT DISTINCT FROM $3
      AND type = $4::${enumCast.type}
    LIMIT 1
    `,
    [input.companyId, input.sourceType, input.sourceId || null, input.type],
  )

  const res = await client.query(
    `
    INSERT INTO user_ledger_entries (
      id,
      company_id,
      user_id,
      type,
      direction,
      amount,
      source_type,
      source_id,
      note,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4::${enumCast.type}, $5::${enumCast.direction}, $6, $7::${enumCast.sourceType}, $8, $9, $10, now())
    ON CONFLICT (company_id, source_type, source_id, type)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      direction = EXCLUDED.direction,
      amount = EXCLUDED.amount,
      note = EXCLUDED.note,
      created_at = EXCLUDED.created_at,
      updated_at = now()
    RETURNING id
    `,
    [
      id,
      input.companyId,
      input.userId,
      input.type,
      input.direction,
      amount,
      input.sourceType,
      input.sourceId || null,
      input.note || null,
      when,
    ],
  )

  const userIds = new Set<string>([input.userId])
  if (existing.rows[0]?.user_id) userIds.add(existing.rows[0].user_id)
  for (const userId of userIds) {
    await recalculateUserLedgerBalances(client, {
      companyId: input.companyId,
      userId,
    })
  }

  return res.rows[0] || null
}

export async function deleteUserLedgerEntryForSource(
  client: any,
  input: {
    companyId: string
    sourceType: UserLedgerSourceType
    sourceId: string
    type?: UserLedgerEntryType
    userId?: string | null
  },
) {
  const existing = await client.query(
    `
    SELECT DISTINCT user_id
    FROM user_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::${enumCast.sourceType}
      AND source_id = $3
      ${input.type ? `AND type = $4::${enumCast.type}` : ''}
    `,
    input.type
      ? [input.companyId, input.sourceType, input.sourceId, input.type]
      : [input.companyId, input.sourceType, input.sourceId],
  )

  await client.query(
    `
    DELETE FROM user_ledger_entries
    WHERE company_id = $1
      AND source_type = $2::${enumCast.sourceType}
      AND source_id = $3
      ${input.type ? `AND type = $4::${enumCast.type}` : ''}
    `,
    input.type
      ? [input.companyId, input.sourceType, input.sourceId, input.type]
      : [input.companyId, input.sourceType, input.sourceId],
  )

  const userIds = new Set<string>(existing.rows.map((row: any) => row.user_id))
  if (input.userId) userIds.add(input.userId)
  for (const userId of userIds) {
    await recalculateUserLedgerBalances(client, { companyId: input.companyId, userId })
  }
}

export async function recalculateManyUserLedgerBalances(
  client: any,
  companyId: string,
  userIds: Iterable<string>,
) {
  for (const userId of new Set(userIds)) {
    if (userId) await recalculateUserLedgerBalances(client, { companyId, userId })
  }
}
