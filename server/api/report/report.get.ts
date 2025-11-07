// ~/server/api/report-non-markit.get.ts
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
    const [salesRes, expensesRes, profitRes, categoryRes] = await Promise.all([
      // Sales query - only non-markit bills
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
          AND b.payment_status = 'PAID'
          AND b.is_markit = false  -- Only non-markit bills
          AND b.created_at BETWEEN $2 AND $3;
        `,
        [companyId, startDate, endDate]
      ),

      // Expenses query - unchanged (expenses typically aren't markit-related)
      client.query(
        `
        SELECT
          COALESCE(SUM(e.total_amount), 0) AS total_expenses,
          COALESCE(SUM(CASE WHEN e.payment_mode = 'CASH' THEN e.total_amount ELSE 0 END), 0) AS cash_expenses,
          COALESCE(SUM(CASE WHEN e.payment_mode = 'CARD' THEN e.total_amount ELSE 0 END), 0) AS card_expenses,
          COALESCE(SUM(CASE WHEN e.payment_mode = 'BANK_TRANSFER' THEN e.total_amount ELSE 0 END), 0) AS bank_transfer_expenses,
          COALESCE(SUM(CASE WHEN e.payment_mode = 'UPI' THEN e.total_amount ELSE 0 END), 0) AS upi_expenses,
          COALESCE(SUM(CASE WHEN e.payment_mode = 'CHEQUE' THEN e.total_amount ELSE 0 END), 0) AS cheque_expenses
        FROM expenses e
        WHERE e.company_id = $1
          AND e.expense_date BETWEEN $2 AND $3
        `,
        [companyId, startDate, endDate]
      ),

      // Profit query - only non-markit bills
      client.query(
        `
        SELECT
          (SELECT COALESCE(SUM(b.subtotal),0) - COALESCE(SUM(b.grand_total),0)
           FROM bills b
           WHERE b.company_id = $1
             AND b.deleted = false
             AND b.is_markit = false  -- Only non-markit bills
             AND b.created_at BETWEEN $2 AND $3
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
          AND b.is_markit = false  -- Only non-markit bills
          AND b.created_at BETWEEN $2 AND $3;
        `,
        [companyId, startDate, endDate]
      ),

      // ✅ Revenue by Category - only non-markit bills
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
          AND b.payment_status = 'PAID'
          AND b.is_markit = false  -- Only non-markit bills
          AND b.created_at BETWEEN $2 AND $3
        GROUP BY c.name
        ORDER BY total DESC;
        `,
        [companyId, startDate, endDate]
      )
    ]);

    const sales = salesRes.rows[0];
    const expenses = expensesRes.rows[0];
    const profitRow = profitRes.rows[0];
    const categoryRows = categoryRes.rows;

    // Sales by payment
    const cashSales = Number(sales.cash_sales);
    const upiSales = Number(sales.upi_sales);
    const cardSales = Number(sales.card_sales);

    // Expenses
    const totalExpenses = Number(expenses.total_expenses);
    const cashExpenses = Number(expenses.cash_expenses);
    const upiExpenses = Number(expenses.upi_expenses);
    const cardExpenses = Number(expenses.card_expenses);
    const bankTransferExpenses = Number(expenses.bank_transfer_expenses);
    const chequeExpenses = Number(expenses.cheque_expenses);

    // Balances
    const cashBalance = cashSales - cashExpenses;
    const bankBalance = (upiSales + cardSales) - (upiExpenses + cardExpenses + bankTransferExpenses + chequeExpenses);
    const totalBalance = cashBalance + bankBalance;

    // Profit
    const totalDiscount = Number(profitRow.total_discount);
    const profitBeforeDiscount = Number(profitRow.profit_before_discount);
    const totalProfit = (profitBeforeDiscount - totalDiscount) - totalExpenses;

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
        Credit: Number(sales.credit_sales),
      },
      totalExpenses: Number(expenses.total_expenses),
      expensesByPaymentMethod: {
        Cash: cashExpenses,
        Card: cardExpenses,
        BankTransfer: bankTransferExpenses,
        UPI: upiExpenses,
        Cheque: chequeExpenses,
      },
      balances: {
        totalBalance,
        cashBalance,
        bankBalance
      },
      profit: totalProfit,
      revenueByCategory,
      categorySales
    };
  } finally {
    client.release();
  }
});