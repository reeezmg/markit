import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  if (!session?.data?.companyId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized: Company ID missing in session',
    })
  }

  const cleanup = (session.data as any).cleanup ?? false
  const query = getQuery(event)

const startDate = query.startDate ? new Date(query.startDate as string) : undefined
const endDate = query.endDate ? new Date(query.endDate as string) : undefined

  const entries = await prisma.entry.findMany({
    where: {
      companyId: session.data.companyId,
      bill: {
        deleted: false,
        ...(!cleanup && { precedence: { not: true } }),
        ...(startDate && endDate && {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          },
        }),
      }
    },
    select: {
      id: true,
      billId: true,
      name: true,
      value: true,
      qty: true,
      rate: true,
      return: true,
      userName: true,
      category:{
        select:{
          name:true
        }
      },
      bill: {
        select: {
          discount: true
        }
      },
      companyUser: {
        select: {
          name: true,
        }
      }
    }
  })

  const processed: Record<string, { count: number; total: number }> = {}
  const entryGroups: Record<string, any[]> = {}

  // Group by bill to distribute bill-level discount across non-return entries.
  const entriesByBill: Record<string, typeof entries> = {}
  for (const entry of entries) {
    if (!entriesByBill[entry.billId]) entriesByBill[entry.billId] = []
    entriesByBill[entry.billId].push(entry)
  }

  for (const billId of Object.keys(entriesByBill)) {
    const billEntries = entriesByBill[billId]
    const salesEntries = billEntries.filter((entry) => !entry.return)

    const salesValueTotal = salesEntries.reduce(
      (sum, entry) => sum + Number(entry.value || 0),
      0
    )

    let cappedBillDiscount = 0
    if (salesValueTotal > 0) {
      const rawDiscount = Number(salesEntries[0]?.bill?.discount || 0)
      const billDiscountAmount =
        rawDiscount < 0
          ? Math.abs(rawDiscount)
          : (salesValueTotal * rawDiscount) / 100
      cappedBillDiscount = Math.min(billDiscountAmount, salesValueTotal)
    }

    for (const entry of billEntries) {
      const name = entry.companyUser?.name || 'Unknown'
      if (!processed[name]) {
        processed[name] = { count: 0, total: 0 }
        entryGroups[name] = []
      }

      const entryValue = Number(entry.value || 0)
      let netValue = 0

      if (entry.return) {
        // Returns reduce sales; keep them visible as negative values.
        netValue = -entryValue
      } else if (salesValueTotal > 0) {
        const discountShare = (entryValue / salesValueTotal) * cappedBillDiscount
        netValue = entryValue - discountShare
      } else {
        netValue = entryValue
      }

      processed[name].count += 1
      processed[name].total += netValue
      entryGroups[name].push({
        ...entry,
        value: Number(netValue.toFixed(2))
      })
    }
  }

  const labels = Object.keys(processed)
  const countData = labels.map(name => processed[name].count)
  const salesData = labels.map(name => Number(processed[name].total.toFixed(2)))
  return { labels, countData, salesData, entryGroups }
})
