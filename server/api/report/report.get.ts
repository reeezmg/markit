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
    ? new Date(query.startDate as string)
    : new Date(0)

  const endDate = query.endDate
    ? new Date(query.endDate as string)
    : new Date()



  const client = await pool.connect()

  try {

    /* =====================================================
       BASE OPENING (RUN FIRST — Needed for calc)
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



    /* =====================================================
       BASE VALUES
    ===================================================== */

    let baseCash = 0
    let baseBank = 0

    if (
      company.cash &&
      company.opening_cash_date &&
      new Date(company.opening_cash_date) <= startDate
    ) {
      baseCash = Number(company.cash)
    }

    if (
      company.bank &&
      company.opening_bank_date &&
      new Date(company.opening_bank_date) <= startDate
    ) {
      baseBank = Number(company.bank)
    }

    const isZeroOpening =
  Number(company.cash || 0) === 0 &&
  Number(company.bank || 0) === 0
  
let cashOpening = 0
let bankOpening = 0

if (!isZeroOpening) {
    /* =====================================================
       PARALLEL — BEFORE PERIOD QUERIES
    ===================================================== */

    const [

      /* ---------- CASH SALES ---------- */
      cashSalesBeforeRes,

      /* ---------- CASH EXPENSE ---------- */
      cashExpensesBeforeRes,

      /* ---------- CASH DISTRIBUTOR ---------- */
      cashDistributorBeforeRes,

      /* ---------- CASH MONEY ---------- */
      cashMoneyBeforeRes,

      /* ---------- CASH TRANSFER ---------- */
      cashTransferBeforeRes,

      /* ---------- BANK SALES ---------- */
      bankSalesBeforeRes,

      /* ---------- BANK EXPENSE ---------- */
      bankExpensesBeforeRes,

      /* ---------- BANK DISTRIBUTOR ---------- */
      bankDistributorBeforeRes,

      /* ---------- BANK MONEY ---------- */
      bankMoneyBeforeRes,

      /* ---------- BANK TRANSFER ---------- */
      bankTransferBeforeRes

    ] = await Promise.all([



      /* =====================================================
         CASH SALES BEFORE
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         CASH EXPENSE BEFORE
      ===================================================== */

      client.query(
        `
        SELECT COALESCE(SUM(total_amount),0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode = 'CASH'
          AND UPPER(status) = 'PAID'
          AND expense_date < $2
        `,
        [companyId, startDate]
      ),



      /* =====================================================
         CASH DISTRIBUTOR BEFORE
      ===================================================== */

      client.query(
        `
        SELECT COALESCE(SUM(amount),0) AS total
        FROM distributor_payments
        WHERE company_id = $1
          AND payment_type = 'CASH'
          AND created_at < $2
        `,
        [companyId, startDate]
      ),



      /* =====================================================
         CASH MONEY BEFORE
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         CASH TRANSFER BEFORE
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         BANK SALES BEFORE
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         BANK EXPENSE BEFORE
      ===================================================== */

      client.query(
        `
        SELECT COALESCE(SUM(total_amount),0) AS total
        FROM expenses
        WHERE company_id = $1
          AND payment_mode IN ('UPI','CARD','BANK','CHEQUE')
          AND UPPER(status) = 'PAID'
          AND expense_date < $2
        `,
        [companyId, startDate]
      ),



      /* =====================================================
         BANK DISTRIBUTOR BEFORE
      ===================================================== */

      client.query(
        `
        SELECT COALESCE(SUM(amount),0) AS total
        FROM distributor_payments
        WHERE company_id = $1
          AND payment_type = 'BANK'
          AND created_at < $2
        `,
        [companyId, startDate]
      ),



      /* =====================================================
         BANK MONEY BEFORE
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         BANK TRANSFER BEFORE
      ===================================================== */

      client.query(
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

    ])



    /* =====================================================
       NUMBERS
    ===================================================== */

    const cashSalesBefore =
      Number(cashSalesBeforeRes.rows[0].total || 0)

    const cashExpensesBefore =
      Number(cashExpensesBeforeRes.rows[0].total || 0)

    const cashDistributorBefore =
      Number(cashDistributorBeforeRes.rows[0].total || 0)

    const cashMoneyNetBefore =
      Number(cashMoneyBeforeRes.rows[0].net || 0)

    const cashTransferNetBefore =
      Number(cashTransferBeforeRes.rows[0].net || 0)



    const bankSalesBefore =
      Number(bankSalesBeforeRes.rows[0].total || 0)

    const bankExpensesBefore =
      Number(bankExpensesBeforeRes.rows[0].total || 0)

    const bankDistributorBefore =
      Number(bankDistributorBeforeRes.rows[0].total || 0)

    const bankMoneyNetBefore =
      Number(bankMoneyBeforeRes.rows[0].net || 0)

    const bankTransferNetBefore =
      Number(bankTransferBeforeRes.rows[0].net || 0)



    /* =====================================================
       OPENINGS
    ===================================================== */

   
  cashOpening =
    baseCash +
    cashSalesBefore -
    cashExpensesBefore -
    cashDistributorBefore +
    cashMoneyNetBefore +
    cashTransferNetBefore

  bankOpening =
    baseBank +
    bankSalesBefore -
    bankExpensesBefore -
    bankDistributorBefore +
    bankMoneyNetBefore +
    bankTransferNetBefore
  }

        /* =====================================================
       PARALLEL — PERIOD QUERIES
    ===================================================== */

    const [

      /* ---------- SALES ---------- */
      salesRes,

      /* ---------- BRAND ---------- */
      brandRes,

      /* ---------- CREDIT SALES ---------- */
      creditSalesRes,

      /* ---------- EXPENSE ---------- */
      expenseRes,

      /* ---------- PURCHASE ---------- */
      purchaseRes,

      /* ---------- CATEGORY ---------- */
      categoryRes,

      /* ---------- TRANSFERS ---------- */
      transferRes,

      /* ---------- MONEY TRANSACTIONS ---------- */
      transactionRes

    ] = await Promise.all([



      /* =====================================================
         SALES
      ===================================================== */

      client.query(
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

          COALESCE(SUM(
            CASE WHEN b.payment_method = 'Cash'
            THEN b.grand_total ELSE 0 END
          ),0)
          + COALESCE(SUM(
            CASE WHEN sp.method = 'Cash'
            THEN sp.amount ELSE 0 END
          ),0) AS cash_sales,

          COALESCE(SUM(
            CASE WHEN b.payment_method = 'UPI'
            THEN b.grand_total ELSE 0 END
          ),0)
          + COALESCE(SUM(
            CASE WHEN sp.method = 'UPI'
            THEN sp.amount ELSE 0 END
          ),0) AS upi_sales,

          COALESCE(SUM(
            CASE WHEN b.payment_method = 'Card'
            THEN b.grand_total ELSE 0 END
          ),0)
          + COALESCE(SUM(
            CASE WHEN sp.method = 'Card'
            THEN sp.amount ELSE 0 END
          ),0) AS card_sales

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
      ),



      /* =====================================================
         BRAND SALES
      ===================================================== */

      client.query(
        `
        SELECT 
          COALESCE(br.name, 'Unbranded') AS name,
          ROUND(SUM(e.value)::numeric,2) AS total,
          COALESCE(SUM(e.qty),0) AS qty

        FROM entries e

        JOIN bills b 
          ON e.bill_id = b.id

        LEFT JOIN variants v 
          ON e.variant_id = v.id

        LEFT JOIN products p 
          ON v.product_id = p.id

        LEFT JOIN brands br 
          ON p.brand_id = br.id

        WHERE b.company_id = $1
          AND b.deleted = false
          AND b.payment_status = 'PAID'
          AND b.is_markit = false
          AND b.created_at BETWEEN $2 AND $3

        GROUP BY br.name
        ORDER BY total DESC
        `,
        [companyId, startDate, endDate]
      ),



      /* =====================================================
         CREDIT SALES
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         EXPENSES
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         PURCHASE / DISTRIBUTOR
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         CATEGORY SALES
      ===================================================== */

      client.query(
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
      ),



      /* =====================================================
         TRANSFERS
      ===================================================== */

      client.query(
        `
        SELECT

          SUM(
            CASE WHEN from_type = 'CASH'
            THEN amount ELSE 0 END
          ) AS cash_debit,

          SUM(
            CASE WHEN to_type = 'CASH'
            THEN amount ELSE 0 END
          ) AS cash_credit,

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
      ),



      /* =====================================================
         MONEY TRANSACTIONS
      ===================================================== */

      client.query(
        `
        SELECT

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

    ])
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
    const brands = brandRes.rows



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
      (
        Number(exp.cash || 0) +
        Number(purchase.cash || 0)
      ) +
      transactionCashNet +
      transferCashNet

    const bankBalance =
      bankOpening +
      (
        Number(sales.upi_sales || 0) +
        Number(sales.card_sales || 0)
      ) -
      (
        Number(exp.upi || 0) +
        Number(exp.card || 0) +
        Number(exp.bank || 0) +
        Number(exp.cheque || 0) +
        Number(purchase.upi || 0) +
        Number(purchase.card || 0) +
        Number(purchase.bank || 0) +
        Number(purchase.cheque || 0)
      ) +
      transactionBankNet +
      transferBankNet

    const totalBalance =
      cashBalance + bankBalance



    /* =====================================================
       FINAL RETURN
    ===================================================== */

    return {

      /* ---------- SALES ---------- */

      totalSales: Number(sales.total_sales || 0),

      totalCreditSales: Number(
        creditRow.total_credit_sales || 0
      ),

      salesByPaymentMethod: {
        Cash: Number(sales.cash_sales || 0),
        UPI: Number(sales.upi_sales || 0),
        Card: Number(sales.card_sales || 0),
        Credit: Number(
          creditRow.total_credit_sales || 0
        )
      },



      /* ---------- EXPENSES ---------- */

      totalExpenses: Number(exp.total_expense || 0),

      expensesByPaymentMethod: {
        Cash: Number(exp.cash || 0),
        Card: Number(exp.card || 0),
        BankTransfer: Number(exp.bank || 0),
        UPI: Number(exp.upi || 0),
        Cheque: Number(exp.cheque || 0)
      },



      /* ---------- PURCHASE ---------- */

      totalPurchaseExpense: Number(
        purchase.total_purchase || 0
      ),

      purchaseExpensesByPaymentMethod: {
        Cash: Number(purchase.cash || 0),
        Card: Number(purchase.card || 0),
        BankTransfer: Number(purchase.bank || 0),
        UPI: Number(purchase.upi || 0),
        Cheque: Number(purchase.cheque || 0)
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
      })),



      /* ---------- BRAND ---------- */

      brandSales: brands.map(r => ({
        name: r.name,
        qty: Number(r.qty),
        sales: Number(r.total)
      }))

    }

  } finally {
    client.release()
  }
})
