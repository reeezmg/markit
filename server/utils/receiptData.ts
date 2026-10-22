import { createError } from 'h3'
import { pool } from '~/server/db'
import { readPrintSettings } from '~/server/utils/printTemplateSettings'
import { activeTemplate } from '~/utils/print-templates'
import { receiptTableFields, tableCellValue } from '~/utils/receipt-table'
import { readLabelVariables } from './labelVariables'
import { prisma } from '~/server/prisma'

export async function readReceiptData(billId: string, companyIds: string[]) {
  const client = await pool.connect()

  try {
    const query = `
      SELECT
        b.id,
        b.company_id AS "companyId",
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
          'isTaxIncluded', co.is_tax_included,
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
              'itemId', e.item_id,
              'name', e.name,
              'category', cat.name,
              'hsn', cat.hsn,
              'qty', e.qty,
              'unit', COALESCE(v.unit, 'Nos'),
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
      LEFT JOIN variants v ON v.id = e.variant_id
      LEFT JOIN categories cat ON cat.id = e.category_id

      WHERE b.id = $1
        AND b.company_id = ANY($2::text[])
        AND b.deleted = false

      GROUP BY b.id, cl.id, co.id, ad.id
    `

    const { rows } = await client.query(query, [billId, companyIds])

    if (!rows.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bill not found',
      })
    }

    const sale = rows[0]
    const company = sale.company
    const printTemplate = activeTemplate(await readPrintSettings(sale.companyId), 'receipt')
    const relatedFields = printTemplate ? receiptTableFields(printTemplate) : []
    const related = relatedFields.length ? await readLabelVariables(prisma, sale.companyId,
      sale.entries.map((e: any) => e.itemId).filter(Boolean),
      sale.entries.filter((e: any) => !e.itemId).map((e: any) => e.barcode).filter(Boolean)) : []
    /* 🧾 FINAL PRINT DATA (MATCHES buildPrintDataFromSale) */
    return {
      companyId: sale.companyId,
      isTaxIncluded: company.isTaxIncluded,
      printTemplate,
      invoiceNumber: sale.invoiceNumber,
      phone: company.companyPhone,
      description: company.description,
      thankYouNote: company.thankYouNote,
      refundPolicy: company.refundPolicy,
      returnPolicy: company.returnPolicy,
      date: new Date(sale.createdAt).toISOString(),

      entries: sale.entries.map((e: any) => {
        const matches = related.filter(row => e.itemId ? row.itemId === e.itemId : row.barcode === e.barcode)
        const variables = matches.length === 1 ? matches[0].variables : {}
        const discountVal =
          Number(e.discount) < 0
            ? Number(e.discount)
            : Number(e.discount) > 0
            ? `${Number(e.discount)}%`
            : 0
        return {
          itemId: e.itemId,
          ...(relatedFields.length ? { labelVariablesLoaded: true, receiptTableValues: Object.fromEntries(relatedFields.map(key => [key, tableCellValue(variables, key, 0)])) } : {}),
          description: e.barcode ? e.name : e.category,
          hsn: e.hsn || '',
          qty: Number(e.qty || 1),
          unit: e.unit || 'Nos',
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
}
