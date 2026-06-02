import { defineEventHandler, readBody, createError } from 'h3'
import { pool } from '~/server/db'

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Credit']

type PaymentSplit = {
  method: string
  amount: number
}

type BillRow = {
  id: string
  invoiceNumber: number | null
  createdAt: Date
  grandTotal: number
  paymentMethod: string | null
  splitPayments: PaymentSplit[] | string | null
}

const toCents = (value: unknown) => Math.round(Number(value || 0) * 100)
const fromCents = (value: number) => Math.round(value) / 100

function parseSplitPayments(raw: BillRow['splitPayments']): PaymentSplit[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getPaymentMap(bill: BillRow) {
  const map = new Map<string, number>()
  const grandTotalCents = toCents(bill.grandTotal)

  if (bill.paymentMethod === 'Split') {
    for (const split of parseSplitPayments(bill.splitPayments)) {
      if (!PAYMENT_METHODS.includes(split?.method)) continue
      map.set(split.method, (map.get(split.method) || 0) + toCents(split.amount))
    }
  } else if (bill.paymentMethod && PAYMENT_METHODS.includes(bill.paymentMethod)) {
    map.set(bill.paymentMethod, grandTotalCents)
  }

  const currentTotal = Array.from(map.values()).reduce((sum, amount) => sum + amount, 0)
  if (map.size && currentTotal !== grandTotalCents) {
    const firstMethod = Array.from(map.keys())[0]
    map.set(firstMethod, (map.get(firstMethod) || 0) + grandTotalCents - currentTotal)
  }

  return map
}

function buildOutputPayment(map: Map<string, number>, targetMethod: string) {
  const positive = PAYMENT_METHODS
    .map((method) => ({ method, amountCents: map.get(method) || 0 }))
    .filter((row) => row.amountCents > 0)

  if (positive.length <= 1) {
    const method = positive[0]?.method || targetMethod
    return {
      paymentMethod: method,
      splitPayments: null as PaymentSplit[] | null,
    }
  }

  return {
    paymentMethod: 'Split',
    splitPayments: positive.map((row) => ({
      method: row.method,
      amount: fromCents(row.amountCents),
    })),
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const companyId = String(body.companyId || '')
  const sourceMethods = Array.isArray(body.sourceMethods)
    ? body.sourceMethods.filter((method: string) => PAYMENT_METHODS.includes(method))
    : []
  const targetMethod = String(body.targetMethod || '')
  const requestedAmountCents = toCents(body.amount)
  const dryRun = body.dryRun !== false
  const timePref = body.timePref === 'newest' ? 'newest' : 'oldest'
  const valuePref = body.valuePref === 'highest' ? 'highest' : 'lowest'
  const startDate = body.startDate ? new Date(body.startDate) : new Date(0)
  const endDate = body.endDate ? new Date(body.endDate) : new Date()

  if (!companyId) {
    throw createError({ statusCode: 400, statusMessage: 'companyId is required' })
  }
  if (!sourceMethods.length) {
    throw createError({ statusCode: 400, statusMessage: 'Select at least one source payment method' })
  }
  if (!PAYMENT_METHODS.includes(targetMethod)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid target payment method is required' })
  }
  if (sourceMethods.includes(targetMethod)) {
    throw createError({ statusCode: 400, statusMessage: 'Target method cannot also be a source method' })
  }
  if (requestedAmountCents <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Amount must be greater than zero' })
  }

  const client = await pool.connect()

  try {
    const res = await client.query(
      `
      SELECT
        id,
        invoice_number AS "invoiceNumber",
        created_at AS "createdAt",
        grand_total AS "grandTotal",
        payment_method AS "paymentMethod",
        split_payments AS "splitPayments"
      FROM bills
      WHERE company_id = $1
        AND deleted = false
        AND precedence IS NOT TRUE
        AND created_at BETWEEN $2 AND $3
        AND (
          payment_method = ANY($4::text[])
          OR (
            payment_method = 'Split'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(split_payments::jsonb) = 'array'
                  THEN split_payments::jsonb
                  ELSE '[]'::jsonb
                END
              ) AS split_item
              WHERE split_item ->> 'method' = ANY($4::text[])
                AND COALESCE(NULLIF(split_item ->> 'amount', '')::numeric, 0) > 0
            )
          )
        )
      ORDER BY
        ${valuePref === 'lowest' ? 'grand_total ASC' : 'grand_total DESC'},
        ${timePref === 'oldest' ? 'created_at ASC' : 'created_at DESC'},
        id ASC
      `,
      [companyId, startDate, endDate, sourceMethods]
    )

    let remainingCents = requestedAmountCents
    let totalAvailableCents = 0
    const plan: any[] = []

    for (const bill of res.rows as BillRow[]) {
      const paymentMap = getPaymentMap(bill)
      const availableCents = sourceMethods.reduce((sum, method) => sum + (paymentMap.get(method) || 0), 0)
      totalAvailableCents += availableCents
      if (availableCents <= 0 || remainingCents <= 0) continue

      let moveCents = Math.min(availableCents, remainingCents)
      const movedFrom: PaymentSplit[] = []

      for (const method of sourceMethods) {
        if (moveCents <= 0) break
        const sourceCents = paymentMap.get(method) || 0
        if (sourceCents <= 0) continue

        const takeCents = Math.min(sourceCents, moveCents)
        paymentMap.set(method, sourceCents - takeCents)
        paymentMap.set(targetMethod, (paymentMap.get(targetMethod) || 0) + takeCents)
        movedFrom.push({ method, amount: fromCents(takeCents) })
        moveCents -= takeCents
        remainingCents -= takeCents
      }

      const movedCents = movedFrom.reduce((sum, row) => sum + toCents(row.amount), 0)
      if (movedCents <= 0) continue

      const output = buildOutputPayment(paymentMap, targetMethod)

      plan.push({
        billId: bill.id,
        invoiceNumber: bill.invoiceNumber,
        grandTotal: Number(bill.grandTotal || 0),
        oldPaymentMethod: bill.paymentMethod,
        oldSplitPayments: parseSplitPayments(bill.splitPayments),
        movedAmount: fromCents(movedCents),
        movedFrom,
        movedTo: targetMethod,
        newPaymentMethod: output.paymentMethod,
        newSplitPayments: output.splitPayments,
      })
    }

    const shiftedAmountCents = requestedAmountCents - remainingCents

    if (!dryRun && plan.length) {
      const updatesJson = JSON.stringify(
        plan.map((row) => ({
          billId: row.billId,
          paymentMethod: row.newPaymentMethod,
          splitPayments: row.newPaymentMethod === 'Split' ? row.newSplitPayments : null,
        }))
      )

      await client.query('BEGIN')
      try {
        await client.query(
          `
          WITH updates AS (
            SELECT *
            FROM jsonb_to_recordset(CAST($1 AS jsonb))
              AS u("billId" text, "paymentMethod" text, "splitPayments" jsonb)
          )
          UPDATE bills AS b
          SET
            payment_method = updates."paymentMethod",
            split_payments = CASE
              WHEN updates."paymentMethod" = 'Split' THEN updates."splitPayments"
              ELSE NULL
            END,
            updated_at = now()
          FROM updates
          WHERE b.id = updates."billId"
            AND b.company_id = $2
            AND b.deleted = false
          `,
          [updatesJson, companyId]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }

    return {
      success: true,
      dryRun,
      requestedAmount: fromCents(requestedAmountCents),
      shiftedAmount: fromCents(shiftedAmountCents),
      remainingAmount: fromCents(remainingCents),
      totalAvailableSourceAmount: fromCents(totalAvailableCents),
      affectedBillsCount: plan.length,
      sourceMethods,
      targetMethod,
      plan,
    }
  } finally {
    client.release()
  }
})
