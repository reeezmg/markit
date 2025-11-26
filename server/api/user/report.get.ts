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

const startDate = query.startDate ? new Date(query.startDate as string) : undefined
const endDate = query.endDate ? new Date(query.endDate as string) : undefined

  const entries = await prisma.entry.findMany({
    where: {
      companyId: session.data.companyId,
      ...(startDate && endDate && {
        bill: {
          createdAt: {
            gte: new Date(startDate),
           lte: new Date(endDate)
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
