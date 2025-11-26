// ~/server/api/report.get.ts
import { defineEventHandler } from 'h3';
import { pool } from '~/server/db';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = session.data.companyId;

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const client = await pool.connect();
  try {
    const [
      itemsResult,
      expensesResult,
      salesResult,
      discountsResult,
      taxResult,
      profitResult,
      activeItemsResult,
      itemsWithImagesResult,
      salesByMethodResult 
    ] = await Promise.all([
      // total items
      client.query(
        `SELECT COALESCE(SUM(qty), 0) AS total_items
         FROM items
         WHERE company_id = $1`,
        [companyId]
      ),

      // total expenses
      client.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_expenses
         FROM expenses
         WHERE company_id = $1`,
        [companyId]
      ),

      // total sales (grandTotal in bills)
      client.query(
        `SELECT COALESCE(SUM(grand_total), 0) AS total_sales
         FROM bills
         WHERE company_id = $1
           AND deleted = false
           AND payment_status = 'PAID'`,
        [companyId]
      ),

      // total discounts
      client.query(
        `SELECT COALESCE(SUM(discount), 0) AS total_discounts
         FROM bills
         WHERE company_id = $1
           AND deleted = false
           AND payment_status = 'PAID'`,
        [companyId]
      ),

      // total tax (sum entries.value * entries.tax/100)
      client.query(
        `SELECT COALESCE(SUM((e.value * e.tax) / 100), 0) AS total_tax
         FROM entries e
         INNER JOIN bills b ON e.bill_id = b.id
         WHERE b.company_id = $1
           AND b.deleted = false
           AND b.payment_status = 'PAID'`,
        [companyId]
      ),

      // profit calculation
      client.query(
        `
        SELECT
          (SELECT COALESCE(SUM(b.subtotal),0) - COALESCE(SUM(b.grand_total),0)
           FROM bills b
           WHERE b.company_id = $1
             AND b.deleted = false
             AND b.payment_status = 'PAID') AS total_discount,

          COALESCE(SUM(
            CASE 
              WHEN e.qty > 0 AND b.payment_status = 'PAID' THEN
                CASE 
                  WHEN e.return = true 
                  THEN -(ABS((e.rate - COALESCE(v.p_price, (e.rate * (1 - (COALESCE(c.margin,100)::numeric / 100.0)))))) * e.qty)
                  ELSE ((e.rate - COALESCE(v.p_price, (e.rate * (1 - (COALESCE(c.margin,100)::numeric / 100.0)))))) * e.qty
                END
              ELSE 0
            END
          ),0) AS profit_before_discount
        FROM entries e
        INNER JOIN bills b ON e.bill_id = b.id
        LEFT JOIN variants v ON e.variant_id = v.id
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status = 'PAID';
        `,
        [companyId]
      ),

      // total items where product.status = true
      client.query(
        `SELECT COALESCE(SUM(i.qty), 0) AS total_active_items
         FROM items i
         INNER JOIN variants v ON i.variant_id = v.id
         INNER JOIN products p ON v.product_id = p.id
         WHERE i.company_id = $1
           AND p.status = true`,
        [companyId]
      ),

      // total items where variant has at least one image
      client.query(
        `SELECT COALESCE(SUM(i.qty), 0) AS total_items_with_images
         FROM items i
         INNER JOIN variants v ON i.variant_id = v.id
         WHERE i.company_id = $1
           AND array_length(v.images, 1) > 0`,
        [companyId]
      ),

      client.query(
        `
        SELECT
            -- Total Sales (normal payments + split payments)
            COALESCE(SUM(CASE WHEN b.payment_method != 'Split' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(sp.amount), 0) AS total_sales,

            -- Cash Sales
            COALESCE(SUM(CASE WHEN b.payment_method = 'Cash' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'Cash' THEN sp.amount ELSE 0 END), 0) AS cash_sales,

            -- UPI Sales
            COALESCE(SUM(CASE WHEN b.payment_method = 'UPI' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'UPI' THEN sp.amount ELSE 0 END), 0) AS upi_sales,

            -- Card Sales
            COALESCE(SUM(CASE WHEN b.payment_method = 'Card' THEN b.grand_total ELSE 0 END), 0)
            + COALESCE(SUM(CASE WHEN sp.method = 'Card' THEN sp.amount ELSE 0 END), 0) AS card_sales,

            -- Credit Sales
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
            AND b.payment_status = 'PAID';
        `,
        [companyId]
        )

    ]);

    // Extract results
    const totalItems = Number(itemsResult.rows[0].total_items);
    const totalExpenses = Number(expensesResult.rows[0].total_expenses);
    const totalSales = Number(salesResult.rows[0].total_sales);
    const totalDiscounts = Number(discountsResult.rows[0].total_discounts);
    const totalTax = Number(taxResult.rows[0].total_tax);

    const profitRow = profitResult.rows[0];
    const profitBeforeDiscount = Number(profitRow.profit_before_discount);
    const profitDiscount = Number(profitRow.total_discount);
    const totalProfit =
      (profitBeforeDiscount - profitDiscount) - totalExpenses;

    const totalActiveItems = Number(activeItemsResult.rows[0].total_active_items);
    const totalItemsWithImages = Number(itemsWithImagesResult.rows[0].total_items_with_images);

    return {
      totalItems,
      totalActiveItems,
      totalItemsWithImages,
      totalExpenses,
      totalSales,
      totalDiscounts,
      totalTax,
      totalProfit,
      sales:{
        total:salesByMethodResult.total_sales,
        cash:salesByMethodResult.cash_sales,
        upi:salesByMethodResult.upi_sales,
        card:salesByMethodResult.card_sales,
        credit:salesByMethodResult.credit_sales,
      }
    };
  } finally {
    client.release();
  }
});
