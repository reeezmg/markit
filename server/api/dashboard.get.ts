import { prisma } from '~/server/prisma';
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  console.log("here")
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

const startDate = query.startDate ? new Date(JSON.parse(query.startDate)) : undefined
const endDate = query.endDate ? new Date(JSON.parse(query.endDate)) : undefined


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
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
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
        createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
        deleted: false
      },
      include: {
        client: true,
        address: true,
        entries: {
          select: {
            rate: true,
            qty: true,
            tax:true
          },
        },
      }
    }),
    prisma.expense.findMany({
      where: { 
        companyId,
         expenseDate: {
            gte: new Date(startDate), 
            lte: new Date(endDate)
          }
       },
      include: { expensecategory: true }
    }),
    prisma.entry.findMany({
      where: {
        bill: {
          companyId,
          deleted: false,
           createdAt: {
              gte: new Date(startDate), 
              lte: new Date(endDate)
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

 bills.sort((a, b) => {
  return Number(a.invoiceNumber) - Number(b.invoiceNumber)
})


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
  const categorySales = [...salesMap.values()]
  .map(c => ({ ...c, sales: Number(c.sales.toFixed(2)) }))
  .sort((a, b) => b.sales - a.sales);

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
    value: total.toFixed(2)
  }))

  // Unpaid bills
  const unpaidBills = bills.filter(b => b.paymentStatus !== 'PAID');

  const totalUnpaid = unpaidBills.reduce((sum, b) => {
    if (b.paymentMethod === 'Split' && b.splitPayments) {
      // Add only the credit portion from split
      const creditAmount = b.splitPayments
        .filter(sp => sp.method === 'Credit')
        .reduce((cSum, sp) => cSum + (sp.amount ?? 0), 0);
      return sum + creditAmount;
    } else {
      // For Credit (non-split) or other unpaid → full grandTotal
      return sum + (b.grandTotal ?? 0);
    }
  }, 0);
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


const profitData = entries.map(entry => {
  // skip if qty invalid, return=true, or bill not paid
  if (!entry.qty || entry.qty <= 0 || entry.return || entry.bill?.paymentStatus !== 'PAID') {
    return null;
  }

  const salePricePerUnit = (entry.value ?? 0) / entry.qty;

  // If variant has purchase price, use it; otherwise use category margin
  let purchasePrice: number | null;
  if (entry.variant != null) {
    purchasePrice = entry.variant.pprice;
  } else {
    const margin = entry.category?.margin ?? 0; // percentage
    purchasePrice = salePricePerUnit * (1 - margin / 100);
  }

  const profitPerUnit = salePricePerUnit - purchasePrice!;
  const totalProfit = profitPerUnit * entry.qty;
  // console.log('totalProfit', totalProfit, salePricePerUnit, purchasePrice);

  return {
    entryId: entry.id,
    profitPerUnit,
    totalProfit,
  };
}).filter(Boolean);

// Total profit
const totalProfit = profitData.reduce((sum, item) => sum + (item.totalProfit || 0), 0);


// Profit by category
const profitByCategoryMap = new Map<string, { name: string; profit: number }>();
for (const entry of entries) {
  // skip if no variant, qty invalid, return=true, or bill not paid
  if (!entry.variant || !entry.qty || entry.qty <= 0 || entry.return || entry.bill?.paymentStatus !== 'PAID') continue;

  const categoryName = entry.category?.name || 'Uncategorized';
  const salePricePerUnit = (entry.value ?? 0) / entry.qty;

  let purchasePrice: number | null;
  if (entry.variant != null) {
    purchasePrice = entry.variant.pprice;
  } else {
    const margin = entry.category?.margin ?? 0;
    purchasePrice = salePricePerUnit * (1 - margin / 100);
  }

  const profit = (salePricePerUnit - purchasePrice!) * entry.qty;

  if (!profitByCategoryMap.has(categoryName)) {
    profitByCategoryMap.set(categoryName, { name: categoryName, profit: 0 });
  }
  profitByCategoryMap.get(categoryName)!.profit += profit;
}

const profitByCategory = Array.from(profitByCategoryMap.values())
  .sort((a, b) => b.profit - a.profit);


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
    entries,
    totalProfit,
    // profitByCategory,
    // profitData,
  }
})