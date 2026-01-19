import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const { id: billId } = getQuery(event)

  if (!billId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'billId is required',
    })
  }

  const client = await pool.connect()

  try {
    const query = `
      SELECT
        b.id,
        b.created_at       AS "createdAt",
        b.invoice_number   AS "invoiceNumber",
        b.subtotal,
        b.discount,
        b.grand_total      AS "grandTotal",
        b.payment_method  AS "paymentMethod",
        b.split_payments  AS "splitPayments",

        json_build_object(
          'name', cl.name,
          'phone', cl.phone
        ) AS client,

        json_build_object(
          'companyName', co.name,
          'companyPhone', co.phone,
          'description', co.description,
          'thankYouNote', co.thank_you_note,
          'refundPolicy', co.refund_policy,
          'returnPolicy', co.return_policy,
          'gstin', co.gstin,
          'accHolderName', co.acc_holder_name,
          'upiId', co.upi_id,
          'address', json_build_object(
            'name', ad.name,
            'street', ad.street,
            'locality', ad.locality,
            'landmark', ad.landmark,
            'city', ad.city,
            'state', ad.state,
            'pincode', ad.pincode,
            'formattedAddress', ad.formatted_address
          )
        ) AS company,

        COALESCE(
          json_agg(
            json_build_object(
              'barcode', e.barcode,
              'name', e.name,
              'category', cat.name,
              'hsn', cat.hsn,
              'qty', e.qty,
              'rate', e.rate,
              'discount', e.discount,
              'tax', e.tax,
              'value', e.value
            )
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS entries

      FROM bills b
      JOIN companies co ON co.id = b.company_id
      LEFT JOIN addresses ad ON ad.company_id = co.id AND ad.active = true
      LEFT JOIN clients cl ON cl.id = b.client_id
      LEFT JOIN entries e ON e.bill_id = b.id
      LEFT JOIN categories cat ON cat.id = e.category_id

      WHERE b.id = $1
        AND b.deleted = false

      GROUP BY b.id, cl.id, co.id, ad.id
    `

    const { rows } = await client.query(query, [billId])

    if (!rows.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found',
      })
    }

    const sale = rows[0]
    const company = sale.company
    console.log('SALE ENTRIES:', sale.entries)
    /* 🧾 FINAL PRINT DATA (MATCHES buildPrintDataFromSale) */
    return {
      invoiceNumber: sale.invoiceNumber,
      phone: company.companyPhone,
      description: company.description,
      thankYouNote: company.thankYouNote,
      refundPolicy: company.refundPolicy,
      returnPolicy: company.returnPolicy,
      date: new Date(sale.createdAt).toISOString(),

      entries: sale.entries.map((e: any) => {
        const discountVal =
          Number(e.discount) < 0
            ? Number(e.discount)
            : Number(e.discount) > 0
            ? `${Number(e.discount)}%`
            : 0
        return {
          description: e.barcode ? e.name : e.category,
          hsn: e.hsn || '',
          qty: Number(e.qty || 1),
          mrp: Number(e.rate || 0),
          discount: discountVal,
          tax: Number(e.tax || 0),
          value: Number(e.qty || 1) * Number(e.rate || 0),
          size: e.size || '',
          barcode: e.barcode,
          tvalue: Number(e.value || 0),
        }
      }),

      subtotal: Number(sale.subtotal || 0),
      discount: Number(sale.discount || 0),
      grandTotal: Number(sale.grandTotal || 0),
      paymentMethod: sale.paymentMethod,

      ...(sale.paymentMethod === 'Split' && {
        splitPayments: sale.splitPayments || [],
      }),

      companyName: company.companyName,
      companyAddress: company.address || {},
      gstin: company.gstin || '',
      accHolderName: company.accHolderName || '',
      upiId: company.upiId || '',

      clientName: sale.client?.name || '',
      clientPhone: sale.client?.phone || '',

      tqty: sale.entries.reduce(
        (sum: number, e: any) => sum + Number(e.qty || 1),
        0
      ),

      tvalue: sale.entries.reduce(
        (sum: number, e: any) =>
          sum + Number(e.qty || 1) * Number(e.rate || 0),
        0
      ),

      ttvalue: sale.entries.reduce(
        (sum: number, e: any) => sum + Number(e.value || 0),
        0
      ),

      tdiscount: sale.entries.reduce((sum: number, e: any) => {
        const qty = Number(e.qty || 1)
        const rate = Number(e.rate || 0)
        const d = Number(e.discount || 0)
        if (d < 0) return sum + Math.abs(d) * qty
        return sum + ((rate * d) / 100) * qty
      }, 0),
    }
    
  } finally {
    client.release()
  }
})
