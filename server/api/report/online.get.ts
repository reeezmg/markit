// ~/server/api/report/markit.get.ts
import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = session.data.companyId;

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const query = getQuery(event);

  const startDate = query.startDate ? new Date(JSON.parse(query.startDate)) : new Date(0);
  const endDate = query.endDate ? new Date(JSON.parse(query.endDate)) : new Date();

  const client = await pool.connect();
  try {
    const [salesRes, categoryRes, billsCountRes] = await Promise.all([
      // Sales query - only for is_markit = true
      client.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN b.payment_method != 'Split' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(sp.amount), 0) AS total_sales,

          COALESCE(SUM(CASE WHEN b.payment_method = 'Cash' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'Cash' THEN sp.amount ELSE 0 END), 0) AS cash_sales,

          COALESCE(SUM(CASE WHEN b.payment_method = 'UPI' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'UPI' THEN sp.amount ELSE 0 END), 0) AS upi_sales,

          COALESCE(SUM(CASE WHEN b.payment_method = 'Card' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'Card' THEN sp.amount ELSE 0 END), 0) AS card_sales,

          COALESCE(SUM(CASE WHEN b.payment_method = 'Credit' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'Credit' THEN sp.amount ELSE 0 END), 0) AS credit_sales
        FROM bills b
        LEFT JOIN LATERAL (
            SELECT 
              (elem->>'method') AS method,
              (elem->>'amount')::numeric AS amount
            FROM jsonb_array_elements(
              CASE 
                WHEN jsonb_typeof(b.split_payments::jsonb) = 'array' 
                THEN b.split_payments::jsonb 
                ELSE '[]'::jsonb 
              END
            ) elem
        ) sp ON b.payment_method = 'Split'
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.is_markit = true
          AND b.payment_status = 'PAID'
          AND b.created_at BETWEEN $2 AND $3;
        `,
        [companyId, startDate, endDate]
      ),

      // ✅ Revenue by Category - only for is_markit = true
      client.query(
        `
        SELECT 
          COALESCE(c.name, 'Uncategorized') AS name,
          ROUND(SUM(e.value)::numeric, 2) AS total
        FROM entries e
        INNER JOIN bills b ON e.bill_id = b.id
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.is_markit = true
          AND b.payment_status = 'PAID'
          AND b.created_at BETWEEN $2 AND $3
        GROUP BY c.name
        ORDER BY total DESC;
        `,
        [companyId, startDate, endDate]
      ),

      // ✅ Bill count query - only for is_markit = true
      client.query(
        `
        SELECT COUNT(*) as bill_count
        FROM bills b
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.is_markit = true
          AND b.payment_status = 'PAID'
          AND b.created_at BETWEEN $2 AND $3;
        `,
        [companyId, startDate, endDate]
      )
    ]);

    const sales = salesRes.rows[0];
    const categoryRows = categoryRes.rows;
    const billCount = billsCountRes.rows[0].bill_count;

    // Sales by payment method
    const cashSales = Number(sales.cash_sales);
    const upiSales = Number(sales.upi_sales);
    const cardSales = Number(sales.card_sales);
    const creditSales = Number(sales.credit_sales);

    // ✅ Revenue & Sales by Category
    const revenueByCategory = categoryRows.map(r => ({
      name: r.name,
      value: Number(r.total)
    }));

    const categorySales = categoryRows.map(r => ({
      name: r.name,
      sales: Number(r.total)
    }));

    return {
      totalSales: Number(sales.total_sales),
      salesByPaymentMethod: {
        Cash: cashSales,
        UPI: upiSales,
        Card: cardSales,
        Credit: creditSales,
      },
      revenueByCategory,
      categorySales,
      billCount: Number(billCount) // ✅ Added bill count to response
    };
  } finally {
    client.release();
  }
});