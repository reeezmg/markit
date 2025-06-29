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

  const query = getQuery(event)
  const startDate = query.startDate ? new Date(query.startDate) : null
  const endDate = query.endDate ? new Date(query.endDate) : null

  const entries = await prisma.entry.findMany({
    where: {
      companyId: session.data.companyId,
      ...(startDate && endDate && {
        bill: {
          createdAt: {
            gte: new Date(Date.UTC(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
            0, 0, 0, 0
          )).toISOString(),
           lte: new Date(Date.UTC(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
            23, 59, 59, 999
          )).toISOString()
          },
          deleted:false
        }
      })
    },
    select: {
      id: true,
      name: true,
      value: true,
      qty: true,
      rate: true,
      userName: true,
      category:{
        select:{
          name:true
        }
      },
      companyUser: {
        select: {
          name: true,
        }
      }
    }
  })
console.log(entries)
  const processed = {}
  const entryGroups = {}

  for (const entry of entries) {
    const name = entry.companyUser?.name || 'Unknown'

    if (!processed[name]) {
      processed[name] = { count: 0, total: 0 }
      entryGroups[name] = []
    }

    processed[name].count += 1
    processed[name].total += entry.value || 0
    entryGroups[name].push(entry)
  }

  const labels = Object.keys(processed)
  const countData = labels.map(name => processed[name].count)
  const salesData = labels.map(name => processed[name].total)

  return { labels, countData, salesData, entryGroups }
})
