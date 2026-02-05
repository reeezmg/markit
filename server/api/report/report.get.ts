import { defineEventHandler, getQuery, createError } from 'h3'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {

  /* =====================================================
     AUTH
  ===================================================== */

  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }



  /* =====================================================
     DATE FILTER
  ===================================================== */

  const query = getQuery(event)

  const startDate = query.startDate
    ? new Date(JSON.parse(query.startDate as string))
    : new Date(0)

  const endDate = query.endDate
    ? new Date(JSON.parse(query.endDate as string))
    : new Date()



  const client = await pool.connect()

  try {

    /* =====================================================
       BASE OPENING CASH & BANK
    ===================================================== */

    const baseRes = await client.query(
      `
      SELECT 
        cash,
        bank,
        opening_cash_date,
        opening_bank_date
      FROM companies
      WHERE id = $1
      `,
      [companyId]
    )

    const company = baseRes.rows[0] || {}



    /* ---------- BASE CASH ---------- */

    let baseCash = 0

    if (
      company.cash &&
      company.opening_cash_date &&
      new Date(company.opening_cash_date) <= startDate
    ) {
      baseCash = Number(company.cash)
    }



    /* ---------- BASE BANK ---------- */

    let baseBank = 0

    if (
      company.bank &&
      company.opening_bank_date &&
      new Date(company.opening_bank_date) <= startDate
    ) {
      baseBank = Number(company.bank)
    }



    /* =====================================================
       CASH OPENING
    ===================================================== */

    const cashBaseOpening = baseCash || 0



    /* ---------- CASH SALES ---------- */

    const cashSalesBeforeRes = await client.query(
      `
      WITH split AS (
        SELECT (elem->>'amount')::numeric AS amount
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON true
        WHERE b.company_id = $1
          AND b.payment_method = 'Split'
          AND (elem->>'method') = 'Cash'
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at < $2
      )

      SELECT
        COALESCE(SUM(
          CASE 
            WHEN payment_method = 'Cash'
            THEN grand_total ELSE 0 END
        ),0)
        +
        COALESCE((SELECT SUM(amount) FROM split),0)
        AS total

      FROM bills
      WHERE company_id = $1
        AND deleted = false
        AND payment_status IN ('PAID','PENDING')
        AND is_markit = false
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const cashSalesBefore =
      Number(cashSalesBeforeRes.rows[0].total || 0)



    /* ---------- CASH EXPENSES ---------- */

    const cashExpensesBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(total_amount),0) AS total
      FROM expenses
      WHERE company_id = $1
        AND payment_mode = 'CASH'
        AND UPPER(status) = 'PAID'
        AND expense_date < $2
      `,
      [companyId, startDate]
    )

    const cashExpensesBefore =
      Number(cashExpensesBeforeRes.rows[0].total || 0)



    /* ---------- CASH DISTRIBUTOR PAYMENTS ---------- */

    const cashDistributorBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(amount),0) AS total
      FROM distributor_payments
      WHERE company_id = $1
        AND payment_type = 'CASH'
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const cashDistributorBefore =
      Number(cashDistributorBeforeRes.rows[0].total || 0)



    /* ---------- CASH MONEY TRANSACTIONS ---------- */

    const cashMoneyBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN direction = 'RECEIVED'
          THEN amount
          ELSE -amount
        END
      ),0) AS net
      FROM money_transactions
      WHERE company_id = $1
        AND payment_mode = 'CASH'
        AND status = 'PAID'
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const cashMoneyNetBefore =
      Number(cashMoneyBeforeRes.rows[0].net || 0)



    /* ---------- CASH TRANSFERS ---------- */

    const cashTransferBeforeRes = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE WHEN to_type = 'CASH'
          THEN amount ELSE 0 END
        ),0)
        -
        COALESCE(SUM(
          CASE WHEN from_type = 'CASH'
          THEN amount ELSE 0 END
        ),0)
        AS net
      FROM account_transfers
      WHERE company_id = $1
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const cashTransferNetBefore =
      Number(cashTransferBeforeRes.rows[0].net || 0)



    /* ---------- FINAL CASH OPENING ---------- */

    const cashOpening =
      cashBaseOpening +
      cashSalesBefore -
      cashExpensesBefore -
      cashDistributorBefore +
      cashMoneyNetBefore +
      cashTransferNetBefore

          /* =====================================================
       BANK OPENING
    ===================================================== */

    const bankBaseOpening = baseBank || 0



    /* ---------- BANK SALES ---------- */

    const bankSalesBeforeRes = await client.query(
      `
      WITH split AS (
        SELECT (elem->>'amount')::numeric AS amount
        FROM bills b
        JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(b.split_payments::jsonb) = 'array'
            THEN b.split_payments::jsonb
            ELSE '[]'::jsonb
          END
        ) elem ON true
        WHERE b.company_id = $1
          AND b.payment_method = 'Split'
          AND (elem->>'method') IN ('UPI','Card')
          AND b.deleted = false
          AND b.payment_status IN ('PAID','PENDING')
          AND b.is_markit = false
          AND b.created_at < $2
      )

      SELECT
        COALESCE(SUM(
          CASE 
            WHEN payment_method IN ('UPI','Card')
            THEN grand_total ELSE 0 END
        ),0)
        +
        COALESCE((SELECT SUM(amount) FROM split),0)
        AS total

      FROM bills
      WHERE company_id = $1
        AND deleted = false
        AND payment_status IN ('PAID','PENDING')
        AND is_markit = false
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const bankSalesBefore =
      Number(bankSalesBeforeRes.rows[0].total || 0)



    /* ---------- BANK EXPENSES ---------- */

    const bankExpensesBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(total_amount),0) AS total
      FROM expenses
      WHERE company_id = $1
        AND payment_mode IN ('UPI','CARD','BANK','CHEQUE')
        AND UPPER(status) = 'PAID'
        AND expense_date < $2
      `,
      [companyId, startDate]
    )

    const bankExpensesBefore =
      Number(bankExpensesBeforeRes.rows[0].total || 0)



    /* ---------- BANK DISTRIBUTOR PAYMENTS ---------- */

    const bankDistributorBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(amount),0) AS total
      FROM distributor_payments
      WHERE company_id = $1
        AND payment_type = 'BANK'
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const bankDistributorBefore =
      Number(bankDistributorBeforeRes.rows[0].total || 0)



    /* ---------- BANK MONEY TRANSACTIONS ---------- */

    const bankMoneyBeforeRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE
          WHEN direction = 'RECEIVED'
          THEN amount
          ELSE -amount
        END
      ),0) AS net
      FROM money_transactions
      WHERE company_id = $1
        AND payment_mode = 'BANK'
        AND status = 'PAID'
        AND account_id IS NULL
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const bankMoneyNetBefore =
      Number(bankMoneyBeforeRes.rows[0].net || 0)



    /* ---------- BANK TRANSFERS ---------- */

    const bankTransferBeforeRes = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN to_type = 'BANK'
              AND to_account_id IS NULL
            THEN amount ELSE 0
          END
        ),0)
        -
        COALESCE(SUM(
          CASE
            WHEN from_type = 'BANK'
              AND from_account_id IS NULL
            THEN amount ELSE 0
          END
        ),0)
        AS net
      FROM account_transfers
      WHERE company_id = $1
        AND created_at < $2
      `,
      [companyId, startDate]
    )

    const bankTransferNetBefore =
      Number(bankTransferBeforeRes.rows[0].net || 0)



    /* ---------- FINAL BANK OPENING ---------- */

    const bankOpening =
      bankBaseOpening +
      bankSalesBefore -
      bankExpensesBefore -
      bankDistributorBefore +
      bankMoneyNetBefore +
      bankTransferNetBefore



    /* =====================================================
       PERIOD SALES
    ===================================================== */

    const salesRes = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE WHEN b.payment_method NOT IN ('Split','Credit')
          THEN b.grand_total ELSE 0 END
        ),0)
        +
        COALESCE(SUM(
          CASE WHEN sp.method != 'Credit'
          THEN sp.amount ELSE 0 END
        ),0) AS total_sales,

        COALESCE(SUM(CASE WHEN b.payment_method = 'Cash' THEN b.grand_total ELSE 0 END),0)
        + COALESCE(SUM(CASE WHEN sp.method = 'Cash' THEN sp.amount ELSE 0 END),0) AS cash_sales,

        COALESCE(SUM(CASE WHEN b.payment_method = 'UPI' THEN b.grand_total ELSE 0 END),0)
        + COALESCE(SUM(CASE WHEN sp.method = 'UPI' THEN sp.amount ELSE 0 END),0) AS upi_sales,

        COALESCE(SUM(CASE WHEN b.payment_method = 'Card' THEN b.grand_total ELSE 0 END),0)
        + COALESCE(SUM(CASE WHEN sp.method = 'Card' THEN sp.amount ELSE 0 END),0) AS card_sales

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
        AND b.payment_status IN ('PAID','PENDING')
        AND b.is_markit = false
        AND b.created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       CREDIT SALES
    ===================================================== */

    const creditSalesRes = await client.query(
      `
      SELECT COALESCE(SUM(
        CASE WHEN payment_method = 'Credit'
        THEN grand_total ELSE 0 END
      ),0) AS total_credit_sales
      FROM bills
      WHERE company_id = $1
        AND deleted = false
        AND payment_status IN ('PAID','PENDING')
        AND is_markit = false
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       EXPENSES
    ===================================================== */

    const expenseRes = await client.query(
      `
      SELECT
        SUM(total_amount) AS total_expense,

        SUM(CASE WHEN payment_mode = 'CASH' THEN total_amount ELSE 0 END) AS cash,
        SUM(CASE WHEN payment_mode = 'UPI' THEN total_amount ELSE 0 END) AS upi,
        SUM(CASE WHEN payment_mode = 'CARD' THEN total_amount ELSE 0 END) AS card,
        SUM(CASE WHEN payment_mode = 'BANK' THEN total_amount ELSE 0 END) AS bank,
        SUM(CASE WHEN payment_mode = 'CHEQUE' THEN total_amount ELSE 0 END) AS cheque

      FROM expenses
      WHERE company_id = $1
        AND UPPER(status) = 'PAID'
        AND expense_date BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       PURCHASE (DISTRIBUTOR PAYMENTS)
    ===================================================== */

    const purchaseRes = await client.query(
      `
      SELECT
        SUM(CASE WHEN payment_type = 'CASH' THEN amount ELSE 0 END) AS cash,
        SUM(CASE WHEN payment_type = 'UPI' THEN amount ELSE 0 END) AS upi,
        SUM(CASE WHEN payment_type = 'CARD' THEN amount ELSE 0 END) AS card,
        SUM(CASE WHEN payment_type = 'BANK' THEN amount ELSE 0 END) AS bank,
        SUM(CASE WHEN payment_type = 'CHEQUE' THEN amount ELSE 0 END) AS cheque,
        SUM(amount) AS total_purchase
      FROM distributor_payments
      WHERE company_id = $1
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )

        /* =====================================================
       CATEGORY SALES
    ===================================================== */

    const categoryRes = await client.query(
      `
      SELECT 
        COALESCE(c.name, 'Uncategorized') AS name,
        ROUND(SUM(e.value)::numeric,2) AS total,
        COALESCE(SUM(e.qty),0) AS qty
      FROM entries e
      JOIN bills b ON e.bill_id = b.id
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.payment_status = 'PAID'
        AND b.is_markit = false
        AND b.created_at BETWEEN $2 AND $3
      GROUP BY c.name
      ORDER BY total DESC
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       TRANSFERS — PERIOD
    ===================================================== */

    const transferRes = await client.query(
      `
      SELECT

        /* ---------- CASH ---------- */

        SUM(
          CASE WHEN from_type = 'CASH'
          THEN amount ELSE 0 END
        ) AS cash_debit,

        SUM(
          CASE WHEN to_type = 'CASH'
          THEN amount ELSE 0 END
        ) AS cash_credit,


        /* ---------- PRIMARY BANK ---------- */

        SUM(
          CASE 
            WHEN from_type != 'CASH'
              AND (from_account_id IS NULL OR from_account_id = '')
            THEN amount ELSE 0 END
        ) AS bank_debit,

        SUM(
          CASE 
            WHEN to_type != 'CASH'
              AND (to_account_id IS NULL OR to_account_id = '')
            THEN amount ELSE 0 END
        ) AS bank_credit

      FROM account_transfers
      WHERE company_id = $1
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       MONEY TRANSACTIONS — PERIOD
    ===================================================== */

    const transactionRes = await client.query(
      `
      SELECT

        /* ---------- CASH ---------- */

        SUM(
          CASE 
            WHEN payment_mode = 'CASH'
              AND direction = 'GIVEN'
            THEN amount ELSE 0 END
        ) AS cash_debit,

        SUM(
          CASE 
            WHEN payment_mode = 'CASH'
              AND direction = 'RECEIVED'
            THEN amount ELSE 0 END
        ) AS cash_credit,


        /* ---------- PRIMARY BANK ---------- */

        SUM(
          CASE 
            WHEN payment_mode != 'CASH'
              AND direction = 'GIVEN'
              AND (account_id IS NULL OR account_id = '')
            THEN amount ELSE 0 END
        ) AS bank_debit,

        SUM(
          CASE 
            WHEN payment_mode != 'CASH'
              AND direction = 'RECEIVED'
              AND (account_id IS NULL OR account_id = '')
            THEN amount ELSE 0 END
        ) AS bank_credit

      FROM money_transactions
      WHERE company_id = $1
        AND status = 'PAID'
        AND created_at BETWEEN $2 AND $3
      `,
      [companyId, startDate, endDate]
    )



    /* =====================================================
       EXTRACT ROWS
    ===================================================== */

    const sales = salesRes.rows[0]
    const creditRow = creditSalesRes.rows[0]
    const exp = expenseRes.rows[0]
    const purchase = purchaseRes.rows[0]
    const transfers = transferRes.rows[0]
    const transactions = transactionRes.rows[0]
    const categories = categoryRes.rows



    /* =====================================================
       NET CALCULATIONS
    ===================================================== */

    const transferCashNet =
      Number(transfers.cash_credit || 0) -
      Number(transfers.cash_debit || 0)

    const transferBankNet =
      Number(transfers.bank_credit || 0) -
      Number(transfers.bank_debit || 0)

    const transactionCashNet =
      Number(transactions.cash_credit || 0) -
      Number(transactions.cash_debit || 0)

    const transactionBankNet =
      Number(transactions.bank_credit || 0) -
      Number(transactions.bank_debit || 0)



    /* =====================================================
       FINAL BALANCES
    ===================================================== */

    const cashBalance =
      cashOpening +
      Number(sales.cash_sales) -
      (Number(exp.cash) + Number(purchase.cash)) +
      transactionCashNet +
      transferCashNet

    const bankBalance =
      bankOpening +
      (Number(sales.upi_sales) + Number(sales.card_sales)) -
      (
        Number(exp.upi) +
        Number(exp.card) +
        Number(exp.bank) +
        Number(exp.cheque) +
        Number(purchase.upi) +
        Number(purchase.card) +
        Number(purchase.bank) +
        Number(purchase.cheque)
      ) +
      transactionBankNet +
      transferBankNet

    const totalBalance = cashBalance + bankBalance



    /* =====================================================
       FINAL RETURN (FULL — NOTHING SKIPPED)
    ===================================================== */

    return {

      /* ---------- SALES ---------- */

      totalSales: Number(sales.total_sales),

      totalCreditSales: Number(
        creditRow.total_credit_sales || 0
      ),

      salesByPaymentMethod: {
        Cash: Number(sales.cash_sales),
        UPI: Number(sales.upi_sales),
        Card: Number(sales.card_sales),
        Credit: Number(
          creditRow.total_credit_sales || 0
        )
      },



      /* ---------- EXPENSES ---------- */

      totalExpenses: Number(exp.total_expense),

      expensesByPaymentMethod: {
        Cash: Number(exp.cash),
        Card: Number(exp.card),
        BankTransfer: Number(exp.bank),
        UPI: Number(exp.upi),
        Cheque: Number(exp.cheque)
      },



      /* ---------- PURCHASE ---------- */

      totalPurchaseExpense: Number(
        purchase.total_purchase || 0
      ),

      purchaseExpensesByPaymentMethod: {
        Cash: Number(purchase.cash),
        Card: Number(purchase.card),
        BankTransfer: Number(purchase.bank),
        UPI: Number(purchase.upi),
        Cheque: Number(purchase.cheque)
      },



      /* ---------- TRANSFERS ---------- */

      transfers: {
        cash: {
          debit: Number(transfers.cash_debit || 0),
          credit: Number(transfers.cash_credit || 0),
          net: transferCashNet
        },
        bank: {
          debit: Number(transfers.bank_debit || 0),
          credit: Number(transfers.bank_credit || 0),
          net: transferBankNet
        }
      },



      /* ---------- TRANSACTIONS ---------- */

      transactions: {
        cash: {
          debit: Number(transactions.cash_debit || 0),
          credit: Number(transactions.cash_credit || 0),
          net: transactionCashNet
        },
        bank: {
          debit: Number(transactions.bank_debit || 0),
          credit: Number(transactions.bank_credit || 0),
          net: transactionBankNet
        }
      },



      /* ---------- BALANCES ---------- */

      balances: {
        opening: {
          cash: cashOpening,
          bank: bankOpening,
          total: cashOpening + bankOpening
        },
        cashBalance,
        bankBalance,
        totalBalance
      },



      /* ---------- CATEGORY ---------- */

      revenueByCategory: categories.map(r => ({
        name: r.name,
        value: Number(r.total)
      })),

      categorySales: categories.map(r => ({
        name: r.name,
        qty: Number(r.qty),
        sales: Number(r.total)
      }))
    }

  } finally {
    client.release()
  }
})
