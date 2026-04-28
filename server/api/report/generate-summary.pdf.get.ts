import { GoogleGenAI } from '@google/genai'
import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { gatherSummary, normalizeSummaryWindow, type SummaryResponse } from '~/server/utils/reportSummary'
import { pool } from '~/server/db'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  const companyId = session.data.companyId

  if (!companyId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (session.data.type !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  const query = getQuery(event)
  const aiEnabled = query.ai !== 'false'
  const window = normalizeSummaryWindow(
    (query.from as string | undefined) ?? null,
    (query.to as string | undefined) ?? null
  )

  const [summary, company] = await Promise.all([
    gatherSummary({
      companyId,
      from: window.from,
      to: window.to,
      cleanup: session.data.cleanup ?? false,
    }),
    fetchCompanyHeader(companyId),
  ])

  const insights = aiEnabled ? await generateInsights(summary) : null

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('BUSINESS SUMMARY', pageWidth / 2, y, { align: 'center' })
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(company.name || 'Company', margin, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)

  const headerLines = [
    compactLine([company.street, company.locality]),
    compactLine([company.city, company.state, company.pincode]),
    company.phone ? `Phone: ${company.phone}` : '',
    company.gstin ? `GSTIN: ${company.gstin}` : '',
    `Period: ${formatHumanDate(summary.window.from)} to ${formatHumanDate(summary.window.to)}`,
    `Generated: ${new Date().toLocaleString('en-GB')}`,
  ].filter(Boolean)

  for (const line of headerLines) {
    doc.text(line, margin, y)
    y += 4.5
  }

  doc.setTextColor(0, 0, 0)
  y += 2

  const sections: Array<{ title: string; head: string[][]; body: string[][] }> = [
    {
      title: 'KPI Summary',
      head: [['Metric', 'Value']],
      body: [
        ['Opening Balance', rs(summary.balances.total.opening)],
        ['  • Cash', rs(summary.balances.cash.opening)],
        ['  • Bank', rs(summary.balances.bank.opening)],
        ['Total Sales', rs(summary.sales.total)],
        ['Discount', rs(summary.sales.discount)],
        ['Tax Collected', rs(summary.sales.tax)],
        ['Net Profit', rs(summary.profit.netProfit)],
        ['Total Expense', rs(summary.expenses.total)],
        ['Stock Value (MRP)', rs(summary.stock.atMrp)],
        ['Stock Value (Cost)', rs(summary.stock.atCost)],
        ['Closing Balance', rs(summary.balances.total.closing)],
        ['  • Cash', rs(summary.balances.cash.closing)],
        ['  • Bank', rs(summary.balances.bank.closing)],
      ],
    },
    {
      title: 'Sales Breakdown',
      head: [['Metric', 'Value']],
      body: [
        ['Cash', rs(summary.sales.byPaymentMethod.Cash)],
        ['UPI', rs(summary.sales.byPaymentMethod.UPI)],
        ['Card', rs(summary.sales.byPaymentMethod.Card)],
        ['Credit', rs(summary.sales.byPaymentMethod.Credit)],
        ['Top Category', topLabel(summary.sales.topCategories[0])],
      ],
    },
    {
      title: 'Pending Credit Bills',
      head: [['Metric', 'Value']],
      body: [
        ['Open Bills', String(summary.pendingCreditBills.length)],
        ['Total Pending', rs(summary.pendingCreditBills.reduce((sum, bill) => sum + bill.grandTotal, 0))],
      ],
    },
    {
      title: 'Expenses',
      head: [['Metric', 'Value']],
      body: [
        ['Total', rs(summary.expenses.total)],
        ['Cash', rs(summary.expenses.byPaymentMode.CASH)],
        ['UPI', rs(summary.expenses.byPaymentMode.UPI)],
        ['Card', rs(summary.expenses.byPaymentMode.CARD)],
        ['Bank', rs(summary.expenses.byPaymentMode.BANK)],
        ['Cheque', rs(summary.expenses.byPaymentMode.CHEQUE)],
        ['Top Category', expenseLabel(summary.expenses.byCategory[0])],
      ],
    },
    {
      title: 'Cash Flow',
      head: [['Bucket', 'Component', 'Amount']],
      body: [
        ['Cash in', 'Sales', rs(summary.cashFlow.inflows.sales)],
        ['Cash in', 'Money received', rs(summary.cashFlow.inflows.moneyReceived)],
        ['Cash in', 'Investments in', rs(summary.cashFlow.inflows.investmentsIn)],
        ['Cash in', 'Total inflows', rs(summary.cashFlow.inflows.total)],
        ['Cash out', 'Expenses', rs(summary.cashFlow.outflows.expenses)],
        ['Cash out', 'Distributor payments', rs(summary.cashFlow.outflows.distributorPayments)],
        ['Cash out', 'Money given', rs(summary.cashFlow.outflows.moneyGiven)],
        ['Cash out', 'Investments out', rs(summary.cashFlow.outflows.investmentsOut)],
        ['Cash out', 'Total outflows', rs(summary.cashFlow.outflows.total)],
        ['Net', 'Net change (closing − opening)', rs(summary.cashFlow.netChange)],
      ],
    },
    {
      title: 'P&L Decomposition',
      head: [['Metric', 'Value', '% of sales']],
      body: (() => {
        const sales = summary.profit.totalSales || 0
        const pct = (n: number) => (sales > 0 ? `${((n / sales) * 100).toFixed(2)}%` : '–')
        const grossRatio = sales > 0 ? summary.profit.netProfitBeforeExpense / sales : 0
        const breakeven = grossRatio > 0 ? summary.profit.totalExpenses / grossRatio : 0
        return [
          ['Sales', rs(summary.profit.totalSales), '100.00%'],
          ['COGS', rs(summary.profit.totalCOGS), pct(summary.profit.totalCOGS)],
          ['Gross Profit', rs(summary.profit.netProfitBeforeExpense), pct(summary.profit.netProfitBeforeExpense)],
          ['Operating Expenses', rs(summary.profit.totalExpenses), pct(summary.profit.totalExpenses)],
          ['Net Profit', rs(summary.profit.netProfit), `${summary.profit.marginPct.toFixed(2)}%`],
          ['Break-even Sales', rs(breakeven), 'expenses ÷ gross-margin ratio'],
        ]
      })(),
    },
    {
      title: 'Investments & Money Transactions',
      head: [['Metric', 'Value']],
      body: [
        ['Investment In', rs(summary.investments.in)],
        ['Investment Out', rs(summary.investments.out)],
        ['Investment Net', rs(summary.investments.net)],
        ['Money In', rs(summary.moneyTransactions.in.total)],
        ['Money Out', rs(summary.moneyTransactions.out.total)],
        ['Money Net', rs(summary.moneyTransactions.net)],
      ],
    },
    {
      title: 'Trend & Forecast Stats',
      head: [['Metric', 'Value']],
      body: (() => {
        const series = summary.timeSeries
        const n = series.length
        if (n < 2) {
          return [
            ['Daily slope', '–'],
            ['Fit (R²)', '–'],
            ['Avg daily profit', '–'],
            ['Volatility (σ)', '–'],
            ['Best day', '–'],
            ['Worst day', '–'],
            ['Projected next 30-day net profit', rs(summary.forecast.reduce((sum, row) => sum + row.projectedProfit, 0))],
          ]
        }
        const ys = series.map(p => p.profit)
        const meanY = ys.reduce((s, v) => s + v, 0) / n
        let num = 0, denX = 0, denY = 0
        for (let i = 0; i < n; i++) {
          const dx = i - (n - 1) / 2
          const dy = ys[i] - meanY
          num += dx * dy
          denX += dx * dx
          denY += dy * dy
        }
        const slope = denX === 0 ? 0 : num / denX
        const r = denX === 0 || denY === 0 ? 0 : num / Math.sqrt(denX * denY)
        const r2 = r * r
        const volatility = Math.sqrt(ys.reduce((s, v) => s + (v - meanY) * (v - meanY), 0) / n)
        let best = series[0], worst = series[0]
        for (const point of series) {
          if (point.profit > best.profit) best = point
          if (point.profit < worst.profit) worst = point
        }
        return [
          ['Daily slope', `${slope >= 0 ? '+' : ''}${rs(slope)}/day`],
          ['Fit (R²)', `${(r2 * 100).toFixed(2)}%`],
          ['Avg daily profit', rs(meanY)],
          ['Volatility (σ)', rs(volatility)],
          ['Best day', `${rs(best.profit)} (${best.date})`],
          ['Worst day', `${rs(worst.profit)} (${worst.date})`],
          ['Projected next 30-day net profit', rs(summary.forecast.reduce((sum, row) => sum + row.projectedProfit, 0))],
        ]
      })(),
    },
  ]

  for (const section of sections) {
    if (y > 250) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(section.title, margin, y)
    y += 3

    autoTable(doc, {
      startY: y,
      head: section.head,
      body: section.body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      margin: { left: margin, right: margin },
    })

    y = (doc as any).lastAutoTable.finalY + 6
  }

  if (y > 210) {
    doc.addPage()
    y = margin
  }

  y = drawDistributorSection(doc, summary, y, margin, pageWidth)

  if (aiEnabled) {
    if (y > 240) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('AI Insights', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const insightText = insights || 'Insights unavailable.'
    const lines = doc.splitTextToSize(insightText, pageWidth - margin * 2)
    doc.text(lines, margin, y)
  }

  const pdf = Buffer.from(doc.output('arraybuffer'))
  setHeader(event, 'Content-Type', 'application/pdf')
  setHeader(event, 'Content-Disposition', 'attachment; filename="business-summary.pdf"')
  return pdf
})

async function fetchCompanyHeader(companyId: string) {
  const result = await pool.query(
    `
    SELECT c.name, c.phone, c.gstin, a.street, a.locality, a.city, a.state, a.pincode
    FROM companies c
    LEFT JOIN addresses a ON a.company_id = c.id
    WHERE c.id = $1
    LIMIT 1
    `,
    [companyId]
  )

  return result.rows[0] || {}
}

async function generateInsights(summary: SummaryResponse) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const ai = new GoogleGenAI({ apiKey })
  const promptPayload = {
    window: summary.window,
    sales: {
      total: formatInsightMoney(summary.sales.total),
      discount: formatInsightMoney(summary.sales.discount),
      tax: formatInsightMoney(summary.sales.tax),
      byPaymentMethod: {
        Cash: formatInsightMoney(summary.sales.byPaymentMethod.Cash),
        UPI: formatInsightMoney(summary.sales.byPaymentMethod.UPI),
        Card: formatInsightMoney(summary.sales.byPaymentMethod.Card),
        Credit: formatInsightMoney(summary.sales.byPaymentMethod.Credit),
        Split: {
          Cash: formatInsightMoney(summary.sales.byPaymentMethod.Split.Cash),
          UPI: formatInsightMoney(summary.sales.byPaymentMethod.Split.UPI),
          Card: formatInsightMoney(summary.sales.byPaymentMethod.Split.Card),
          Credit: formatInsightMoney(summary.sales.byPaymentMethod.Split.Credit),
        },
      },
      topCategories: summary.sales.topCategories.slice(0, 3).map((category) => ({
        name: category.name,
        qty: category.qty,
        sales: formatInsightMoney(category.sales),
        share: `${category.share.toFixed(2)}%`,
      })),
    },
    pendingCreditBills: summary.pendingCreditBills.slice(0, 3).map((bill) => ({
      clientName: bill.clientName,
      clientPhone: bill.clientPhone,
      grandTotal: formatInsightMoney(bill.grandTotal),
    })),
    expenses: {
      total: formatInsightMoney(summary.expenses.total),
      topCategory: summary.expenses.byCategory[0]
        ? {
            name: summary.expenses.byCategory[0].name,
            total: formatInsightMoney(summary.expenses.byCategory[0].total),
            share: `${summary.expenses.byCategory[0].share.toFixed(2)}%`,
          }
        : null,
    },
    profit: {
      totalSales: formatInsightMoney(summary.profit.totalSales),
      totalCOGS: formatInsightMoney(summary.profit.totalCOGS),
      netProfitBeforeExpense: formatInsightMoney(summary.profit.netProfitBeforeExpense),
      totalExpenses: formatInsightMoney(summary.profit.totalExpenses),
      netProfit: formatInsightMoney(summary.profit.netProfit),
      marginPct: `${summary.profit.marginPct.toFixed(2)}%`,
    },
    stock: {
      atMrp: formatInsightMoney(summary.stock.atMrp),
      atCost: formatInsightMoney(summary.stock.atCost),
      skuCount: summary.stock.skuCount,
      totalUnits: summary.stock.totalUnits,
    },
    distributors: {
      totalWeOwe: formatInsightMoney(summary.distributors.totalWeOwe),
      totalOwedToUs: formatInsightMoney(summary.distributors.totalOwedToUs),
      largestDue: summary.distributors.weOwe[0]
        ? {
            name: summary.distributors.weOwe[0].name,
            due: formatInsightMoney(summary.distributors.weOwe[0].due),
          }
        : null,
      largestReceivable: summary.distributors.owedToUs[0]
        ? {
            name: summary.distributors.owedToUs[0].name,
            due: formatInsightMoney(summary.distributors.owedToUs[0].due),
          }
        : null,
    },
    moneyTransactions: {
      in: {
        total: formatInsightMoney(summary.moneyTransactions.in.total),
        byParty: Object.fromEntries(
          Object.entries(summary.moneyTransactions.in.byParty).map(([party, amount]) => [party, formatInsightMoney(amount)])
        ),
      },
      out: {
        total: formatInsightMoney(summary.moneyTransactions.out.total),
        byParty: Object.fromEntries(
          Object.entries(summary.moneyTransactions.out.byParty).map(([party, amount]) => [party, formatInsightMoney(amount)])
        ),
      },
      net: formatInsightMoney(summary.moneyTransactions.net),
    },
    forecast: {
      projected30DayProfit: formatInsightMoney(summary.forecast.reduce((sum, row) => sum + row.projectedProfit, 0)),
    },
    closingBalance: formatInsightMoney(summary.balances.total.closing),
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [{
            text: JSON.stringify(promptPayload),
          }],
        },
      ],
      config: {
        systemInstruction: 'You are a retail business analyst. The owner runs a small or medium store in India. Given the JSON of their last period, write 3 short paragraphs under 220 words total: (a) what is working well, (b) red flags and inefficiencies in cost, expense, inventory, or credit, (c) two concrete actions to lift profit next period. Use plain English, no jargon, no markdown. Refer to money only in Indian rupees with Indian numbering words such as thousand and lakh. Never use million or billion.',
      },
    })

    return response.text?.trim() || null
  } catch {
    return null
  }
}

function compactLine(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(', ')
}

function topLabel(row?: SummaryResponse['sales']['topCategories'][number]) {
  if (!row) return '-'
  return `${row.name} (${rs(row.sales)})`
}

function expenseLabel(row?: SummaryResponse['expenses']['byCategory'][number]) {
  if (!row) return '-'
  return `${row.name} (${rs(row.total)})`
}

function distributorLabel(row?: SummaryResponse['distributors']['weOwe'][number]) {
  if (!row) return '-'
  return `${row.name} (${rs(row.due)})`
}

function drawDistributorSection(doc: jsPDF, summary: SummaryResponse, y: number, margin: number, pageWidth: number) {
  const gap = 6
  const colWidth = (pageWidth - margin * 2 - gap) / 2
  const leftX = margin
  const rightX = margin + colWidth + gap
  const totalRows = Math.max(summary.distributors.weOwe.length, summary.distributors.owedToUs.length)

  if (y > 250) {
    doc.addPage()
    y = margin
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Distributors', margin, y)
  y += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text('Payables and receivables split into two aligned lists.', margin, y)
  y += 8

  const leftFinalY = drawDistributorMiniTable(
    doc,
    'We Owe',
    summary.distributors.totalWeOwe,
    summary.distributors.weOwe,
    leftX,
    y,
    colWidth,
  )

  const rightFinalY = drawDistributorMiniTable(
    doc,
    'Owed To Us',
    summary.distributors.totalOwedToUs,
    summary.distributors.owedToUs,
    rightX,
    y,
    colWidth,
  )

  const finalY = Math.max(leftFinalY, rightFinalY) + 6

  if (totalRows === 0) {
    return finalY
  }

  return finalY
}

function drawDistributorMiniTable(
  doc: jsPDF,
  title: string,
  total: number,
  rows: SummaryResponse['distributors']['weOwe'],
  x: number,
  y: number,
  width: number
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  doc.text(title, x, y)
  y += 5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(rs(total), x, y)
  y += 5

  autoTable(doc, {
    startY: y,
    margin: { left: x, right: 14 },
    tableWidth: width,
    head: [['Distributor', 'Due']],
    body: rows.length
      ? rows.map((row) => [row.name, rs(row.due)])
      : [['No data', '-']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: width * 0.65 },
      1: { cellWidth: width * 0.35, halign: 'right' },
    },
  })

  return (doc as any).lastAutoTable.finalY
}

function formatHumanDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB')
}

function rs(value: number) {
  return `Rs ${Number(value || 0).toFixed(2)}`
}

function formatInsightMoney(value: number) {
  const amount = Number(value || 0)
  const formatted = rs(amount)
  const absolute = Math.abs(amount)

  if (absolute >= 100000) {
    return `${formatted} (${(amount / 100000).toFixed(2)} lakh)`
  }

  if (absolute >= 1000) {
    return `${formatted} (${(amount / 1000).toFixed(2)} thousand)`
  }

  return formatted
}
