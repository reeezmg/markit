import { outwardTaxReport } from '~/server/utils/report-gst-source';
import { taxAccountingReport, reportWindow } from '~/server/utils/report-accounting';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';
import { defineEventHandler, getQuery, createError } from 'h3';
import { pool } from '~/server/db';

export default defineEventHandler(async (event) => {
  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event);
  const companyId = await getReadCompanyId(event);
  const cleanup = session.data.cleanup ?? false;

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  /* =====================================================
     DATE FILTER
  ===================================================== */

  const query = getQuery(event);

  const { from: startDate, to: endDate } = reportWindow(query);

  const client = await pool.connect();

  try {
    const [itcRes] = await Promise.all([
      /* =====================================================
         TABLE 4 — ITC FROM PRODUCT PURCHASES
         Source: distributor_credits where money_transaction_id IS NULL
                 (AMOUNT-type credits are cash inflows, not goods inward)
         Tax: per-item via PO products → variants → items.
              Only items with v.tax > 0 generate ITC.
      ===================================================== */

      client.query(
        `
        SELECT
          COALESCE(SUM(COALESCE(i.initial_qty, 0) * COALESCE(v.p_price, 0) * COALESCE(v.tax, 0) / 100), 0) AS total_itc,
          COALESCE(SUM(COALESCE(i.initial_qty, 0) * COALESCE(v.p_price, 0)), 0) AS taxable_value,
          COALESCE(SUM(COALESCE(i.initial_qty, 0) * COALESCE(v.p_price, 0) * (1 + COALESCE(v.tax, 0) / 100)), 0) AS total_inward_value
        FROM distributor_credits dc
        JOIN purchase_orders po ON po.id = dc.purchase_order_id
        JOIN products        p  ON p.purchaseorder_id = po.id
        JOIN variants        v  ON v.product_id = p.id
        JOIN items           i  ON i.variant_id = v.id
        WHERE dc.company_id           = $1
          AND dc.money_transaction_id IS NULL
          AND dc.created_at           BETWEEN $2 AND $3
          AND COALESCE(v.tax, 0)      > 0
        `,
        [companyId, startDate.toISOString(), endDate.toISOString()]
      ),
    ]);

    /* =====================================================
       EXTRACT ROWS
    ===================================================== */

    const itc = itcRes.rows[0];

    const outward = await outwardTaxReport(client, companyId, startDate, endDate, cleanup);
    const outwardTaxableValue = outward.rateSummary
      .filter((r) => r.taxRate !== 0)
      .reduce((s, r) => s + r.taxableValue, 0);
    const outwardTax = outward.kpi.totalTax;
    const outwardCgst = Math.round(outwardTax * 50) / 100;
    const outwardSgst = Math.round((outwardTax - outwardCgst) * 100) / 100;

    const totalItc = Number(itc.total_itc || 0);
    const itcCgst = totalItc / 2;
    const itcSgst = totalItc / 2;

    const accounting = await taxAccountingReport(client, companyId, startDate, endDate);
    return {
      accounting,
      unallocatedInvoiceValue: outward.kpi.unallocatedInvoiceValue,
      outwardTaxable: {
        taxableValue: outwardTaxableValue,
        cgst: outwardCgst,
        sgst: outwardSgst,
        totalTax: outwardTax,
      },
      nilRated: {
        taxableValue: outward.rateSummary
          .filter((r) => r.taxRate === 0)
          .reduce((s, r) => s + r.taxableValue, 0),
      },
      itc: {
        totalItc,
        cgst: itcCgst,
        sgst: itcSgst,
        taxableValue: Number(itc.taxable_value || 0),
        totalInwardValue: Number(itc.total_inward_value || 0),
      },
      netPayable: {
        cgst: Math.max(0, outwardCgst - itcCgst),
        sgst: Math.max(0, outwardSgst - itcSgst),
      },
    };
  } finally {
    client.release();
  }
});
