import { createError } from 'h3'
import { salesViews } from '../../utils/sales-view'

/** Expressions shared by rows, totals, sort and filters. Collections never add to sales. */
export function salesViewSql(value: unknown, total = 'b.grand_total') {
  const view = value ?? 'all'
  if (!salesViews.some(option => option.value === view)) throw createError({ statusCode: 400, statusMessage: 'Select a valid sales view.' })
  const invoice = `b.invoice_code IS NOT NULL AND COALESCE(b.type::text,'BILL')='BILL' AND b.is_markit IS NOT TRUE AND b.credit_user_id IS NULL`
  const collected = `COALESCE((SELECT sum(p.amount::numeric) FROM payments p WHERE p.company_id=b.company_id AND p.bill_id=b.id AND p.deleted=false AND p.status='POS_CREDIT_RECEIPT'),0)`
  const credit = `CASE WHEN b.payment_method='Credit' THEN COALESCE(${total},0)::numeric
    WHEN b.payment_method='Split' THEN COALESCE((SELECT sum(COALESCE(NULLIF(part->>'amount',''),'0')::numeric)
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.split_payments::jsonb)='array' THEN b.split_payments::jsonb ELSE '[]'::jsonb END) part WHERE part->>'method'='Credit'),0) ELSE 0 END`
  const balance = `GREATEST(0,CASE WHEN b.payment_method IN ('Credit','Split') THEN (${credit})-(${collected})
    WHEN b.payment_status='PAID' THEN 0 ELSE COALESCE(${total},0)::numeric END)`
  const received = `GREATEST(0,COALESCE(${total},0)::numeric-(${balance}))`
  const overdue = `(b.due_date<(now() AT TIME ZONE 'Asia/Kolkata')::date AND (${balance})>0)`
  const filter = view === 'invoices' ? ` AND (${invoice})`
    : view === 'paynow' ? ` AND b.invoice_code IS NULL`
    : view === 'unpaid' ? ` AND b.credit_user_id IS NULL AND (${balance})>0` : ''
  return { filter, credit, collected, balance, received, overdue }
}
