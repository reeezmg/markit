import { prisma } from '~/server/prisma';
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  // Get auth data from the request
  const session = await useAuthSession(event);
  const companyId = session.data.companyId 
  
  if (!companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  // Parse query parameters for date filtering
  const query = getQuery(event)
  const startDate = query.startDate ? new Date(query.startDate as string) : undefined
  const endDate = query.endDate ? new Date(query.endDate as string) : undefined

  // Fetch all data in parallel
  const [
    company,
    products,
    items,
    variants,
    bills,
    expenses,
    entries
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { address: true }
    }),
    prisma.product.findMany({
  where: {
    companyId,
    createdAt: {
      gte: startDate ? new Date(startDate) : undefined,
      lte: endDate ? new Date(endDate) : undefined,
    }
  }
}),
    prisma.item.findMany({
      where: { companyId }
    }),
    prisma.variant.findMany({
      where: { companyId }
    }),
    prisma.bill.findMany({
      where: { 
        companyId,
        deleted: false
      },
      include: {
        client: true,
        address: true,
        entries: {
          select: {
            rate: true,
            qty: true,
          },
        },
      }
    }),
    prisma.expense.findMany({
      where: { companyId },
      include: { expensecategory: true }
    }),
    prisma.entry.findMany({
      where: {
        bill: {
          companyId,
          deleted: false,
           createdAt: {
            gte: startDate ? new Date(startDate) : undefined,
            lte: endDate ? new Date(endDate) : undefined,
          }
        }
      },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
        category: true,
        bill: true,
      }
    })
  ])

  // Helper functions for computed values
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Calculate low stock entries
  const lowStockEntries = variants
    .filter(entry => (entry.qty ?? 0) < 5)
    .sort((a, b) => (a.qty ?? 0) - (b.qty ?? 0))
    .slice(0, 6)

  // Calculate recent transactions
  const recentTransactions = [...bills]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)

  // Calculate top products
  const productMap = new Map<string, { name: string; total: number }>()
  for (const entry of entries) {
    const name = entry.category?.name || 'Unknown'
    const key = name
  
    if (!productMap.has(key)) {
      productMap.set(key, { name, total: 0 })
    }
  
    productMap.get(key)!.total += entry.qty ?? 0
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  // Calculate category sales with date filtering
  const salesMap = new Map<string, { name: string; sales: number }>()
  for (const entry of entries) {
    if (entry.return) continue


    const name = entry.category?.name || 'Unknown'

    if (!salesMap.has(name)) {
      salesMap.set(name, { name, sales: 0 })
    }

    salesMap.get(name)!.sales += entry.value ?? 0
  }
  const categorySales = [...salesMap.values()].sort((a, b) => b.sales - a.sales)

  // Calculate counts
  const productsCount = products.length
  const itemsCount = items.length

  // Calculate revenue metrics
  const paidBills = bills.filter(bill => bill.paymentStatus === 'PAID')
  const totalRevenue = paidBills.reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0)

  const revenueGraph = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const total = paidBills
      .filter(b => new Date(b.createdAt).getMonth() + 1 === month)
      .reduce((sum, b) => sum + (b.grandTotal ?? 0), 0)
    return { month: monthNames[i], total }
  })

  // Calculate expenses
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.totalAmount ?? 0), 0)

  // Revenue by category
  const revenueByCategoryMap = new Map<string, number>()
  for (const entry of entries) {
    const name = entry.category?.name || 'Uncategorized'
    const value = entry.value ?? 0
    revenueByCategoryMap.set(name, (revenueByCategoryMap.get(name) ?? 0) + value)
  }
  const revenueByCategory = Array.from(revenueByCategoryMap.entries()).map(([name, total]) => ({
    name,
    value: total
  }))

  // Unpaid bills
  const unpaidBills = bills.filter(b => b.paymentStatus !== 'PAID')
  const totalUnpaid = unpaidBills.reduce((sum, b) => sum + (b.grandTotal ?? 0), 0)
  const recentUnpaidBills = unpaidBills.slice(0, 5)

  // Tax calculations
  const totalTaxCollected = entries.reduce((sum, entry) => {
    const qty = entry.qty ?? 0
    const rate = entry.rate ?? 0
    const taxPercent = entry.tax ?? 0
    const taxAmount = qty * rate * (taxPercent / 100)
    return sum + taxAmount
  }, 0)

  const billsOverTime = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const total = bills
      .filter(b => new Date(b.createdAt).getMonth() + 1 === month)
      .reduce((sum, b) => sum + (b.grandTotal ?? 0), 0)
    return { month: monthNames[i], total }
  })

  const taxByMonth = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const total = entries
      .filter(e => e.bill?.createdAt && new Date(e.bill.createdAt).getMonth() + 1 === month)
      .reduce((sum, e) => {
        const qty = e.qty ?? 0
        const rate = e.rate ?? 0
        const tax = e.tax ?? 0
        return sum + qty * rate * (tax / 100)
      }, 0)
    return {
      month: new Date(0, i).toLocaleString('default', { month: 'short' }),
      total
    }
  })

  // Outstanding customers
  const outstandingCustomersMap = new Map<string, { name: string; total: number; count: number }>()
  for (const bill of bills) {
    if (bill.paymentStatus !== 'PENDING') continue

    const key = bill.clientId ?? 'unknown Client ID'
    const name = bill.client?.name ?? 'unknown Client Name'

    if (!outstandingCustomersMap.has(key)) {
      outstandingCustomersMap.set(key, { name, total: 0, count: 0 })
    }

    const entry = outstandingCustomersMap.get(key)!
    entry.total += bill.grandTotal ?? 0
    entry.count += 1
  }
  const outstandingCustomers = Array.from(outstandingCustomersMap.values())
    .sort((a, b) => b.total - a.total)

  return {
    company,
    productsCount,
    itemsCount,
    totalRevenue,
    totalExpenses,
    revenueGraph,
    topProducts,
    categorySales,
    lowStockEntries,
    recentTransactions,
    revenueByCategory,
    billsOverTime,
    recentUnpaidBills,
    totalUnpaid,
    totalTaxCollected,
    taxByMonth,
    outstandingCustomers,
    products,
    bills,
    expenses,
    entries
  }
})