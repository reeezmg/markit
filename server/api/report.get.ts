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

const startDate = query.startDate ? new Date(JSON.parse(query.startDate)) : undefined
const endDate = query.endDate ? new Date(JSON.parse(query.endDate)) : undefined


  // Fetch all data in parallel
  const [
    bills,
    expenses,
    entries
  ] = await Promise.all([
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


  // Calculate revenue metrics
  const paidBills = bills.filter(bill => bill.paymentStatus === 'PAID')
  const totalRevenue = paidBills.reduce((sum, bill) => sum + (bill.grandTotal ?? 0), 0)

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


  return {
    totalRevenue,
    totalExpenses,
    categorySales,
    revenueByCategory,
    recentUnpaidBills,
    totalUnpaid,
    bills,
    expenses,
    entries,
    totalProfit,
  }
})