import { createError } from 'h3'
import { pool } from '~/server/db'
import { readPrintSettings } from '~/server/utils/printTemplateSettings'
import { activeTemplate } from '~/utils/print-templates'
import { receiptTableFields, tableCellValue } from '~/utils/receipt-table'
import { readLabelVariables } from './labelVariables'
import { prisma } from '~/server/prisma'
import { invoiceBalance, isInvoice } from '../../utils/invoice-flow'
import { receiptEntryAmounts, receiptEntryTotals } from '../../utils/receipt-entry-amounts'

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
        b.discount_type AS "discountType", b.adjustment,
        b.redeemed_points AS "redeemedPoints", b.coupon_value AS "couponValue",
        COALESCE((SELECT cc.points FROM company_clients cc WHERE cc.company_id=b.company_id AND cc.client_id=b.client_id),0) AS "availablePoints",
        COALESCE((SELECT cardinality(vi.unit)>1 FROM variant_inputs vi WHERE vi.company_id=b.company_id),false) AS "showUnit",
        (SELECT COALESCE(json_agg(json_build_object(
          'id',cv.id,'couponId',cp.id,'couponNumber',cp.code,'code',cp.code,'type',cp.type,
          'discountValue',cp.discount_value,'maxDiscountAmount',cp.max_discount_amount,
          'minOrderValue',cp.min_order_value,'endDate',cp.end_date,'usageLimit',cv.usage_limit,
          'generatedFromBillId',cv.generated_from_bill_id)),'[]'::json)
         FROM coupon_clients cv JOIN coupons cp ON cp.id=cv.coupon_id AND cp.company_id=b.company_id
         WHERE cv.generated_from_bill_id=b.id AND cv.client_id=b.client_id) AS "generatedCoupons",
        b.notes,b.terms_and_conditions AS "termsAndConditions",
        b.grand_total      AS "grandTotal",
        b.payment_method  AS "paymentMethod",
        b.payment_status AS "paymentStatus",b.type,b.is_markit AS "isMarkit",
        b.invoice_code AS "invoiceCode",to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",
        b.invoice_payment_terms AS "invoicePaymentTerms",b.subject,
        (SELECT COALESCE(json_agg(json_build_object('amount',p.amount,'status',p.status,'deleted',p.deleted)),'[]'::json)
         FROM payments p WHERE p.bill_id=b.id AND p.company_id=b.company_id AND p.status='POS_CREDIT_RECEIPT' AND p.deleted=false) AS payments,
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
              'size',e.size,'return',e.return,
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
      ...(isInvoice(sale) ? { billingMode:'invoice',invoiceCode:sale.invoiceCode,dueDate:sale.dueDate,
        invoicePaymentTerms:sale.invoicePaymentTerms,subject:sale.subject,...invoiceBalance(sale) } : {}),
      companyId: sale.companyId,
      notes: sale.notes || '', termsAndConditions: sale.termsAndConditions || '',
      isTaxIncluded: company.isTaxIncluded,
      printTemplate,
      showUnit: Boolean(sale.showUnit),
      couponValue: Number(sale.couponValue || 0),
      redeemedPoints: Number(sale.redeemedPoints || 0),
      availablePoints: Number(sale.availablePoints || 0),
      generatedCoupons: sale.generatedCoupons || [],
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
          ...receiptEntryAmounts(e),
          unit: e.unit || 'Nos',
          mrp: Number(e.rate || 0),
          discount: discountVal,
          tax: Number(e.tax || 0),
          size: e.size || '',
          barcode: e.barcode,
        }
      }),

      subtotal: Number(sale.subtotal || 0),
      discount: sale.discountType === 'surcharge' ? `+${Math.abs(Number(sale.discount) || 0)}` : Number(sale.discount || 0),
      adjustment: Number(sale.adjustment || 0),
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

      ...receiptEntryTotals(sale.entries),
    }
    
  } finally {
    client.release()
  }
}
