import { defineEventHandler, getQuery, createError } from 'h3'
import { prisma } from '~/server/prisma'
import { calculateNetSalesByKey } from '~/server/utils/user-sales'

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

  const companyUsers = await prisma.companyUser.findMany({
    where: {
      companyId: session.data.companyId,
      deleted: false,
      status: true,
    },
    select: {
      userId: true,
      name: true,
      code: true,
    },
    orderBy: [{ name: 'asc' }, { code: 'asc' }],
  })

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
          userId: true,
          name: true,
          code: true,
        }
      }
    }
  })

  const payrollWhere =
    startDate && endDate
      ? {
          cycle: {
            periodStart: { gte: startDate },
            periodEnd: { lte: endDate },
          },
        }
      : {}

  const [payrollLines, salaryPayments, attendances] = await Promise.all([
    prisma.payrollCycleLine.findMany({
      where: {
        companyId: session.data.companyId,
        ...payrollWhere,
      },
      select: {
        userId: true,
        baseSalary: true,
        commissionAmount: true,
        netPay: true,
        presentDays: true,
        absentDays: true,
        halfDays: true,
      },
    }),
    prisma.salaryPayment.findMany({
      where: {
        companyId: session.data.companyId,
        ...(startDate && endDate && {
          paymentDate: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      select: {
        userId: true,
        amount: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        companyId: session.data.companyId,
        ...(startDate && endDate && {
          date: {
            gte: startDate,
            lte: endDate,
          },
        }),
      },
      select: {
        userId: true,
        status: true,
      },
    }),
  ])

  const entryGroups: Record<string, any[]> = {}
  const processed = calculateNetSalesByKey(entries, (entry) => entry.companyUser?.userId || 'Unknown')

  for (const userId of Object.keys(processed)) {
    entryGroups[userId] = processed[userId].entries.map(({ entry, netValue }) => ({
      ...entry,
      value: netValue,
    }))
  }

  const payrollByUser = new Map<string, any>()
  for (const line of payrollLines) {
    const current = payrollByUser.get(line.userId) || {
      salaryEarned: 0,
      commissionEarned: 0,
      netSalaryEarned: 0,
      payrollPresentDays: 0,
      payrollAbsentDays: 0,
      payrollHalfDays: 0,
    }
    current.salaryEarned += Number(line.baseSalary || 0)
    current.commissionEarned += Number(line.commissionAmount || 0)
    current.netSalaryEarned += Number(line.netPay || 0)
    current.payrollPresentDays += Number(line.presentDays || 0)
    current.payrollAbsentDays += Number(line.absentDays || 0)
    current.payrollHalfDays += Number(line.halfDays || 0)
    payrollByUser.set(line.userId, current)
  }

  const paidByUser = new Map<string, number>()
  for (const payment of salaryPayments) {
    paidByUser.set(payment.userId, (paidByUser.get(payment.userId) || 0) + Number(payment.amount || 0))
  }

  const attendanceByUser = new Map<string, any>()
  for (const attendance of attendances) {
    const current = attendanceByUser.get(attendance.userId) || {
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      attendanceRows: 0,
    }
    current.attendanceRows += 1
    if (attendance.status === 'PRESENT') current.presentDays += 1
    else if (attendance.status === 'HALF_DAY') {
      current.presentDays += 0.5
      current.absentDays += 0.5
      current.halfDays += 1
    } else if (attendance.status === 'ABSENT' || attendance.status === 'LEAVE') {
      current.absentDays += 1
    }
    attendanceByUser.set(attendance.userId, current)
  }

  const userSummaries = companyUsers.map((user) => {
    const sales = processed[user.userId]
    const payroll = payrollByUser.get(user.userId) || {}
    const attendance = attendanceByUser.get(user.userId) || {}
    return {
      userId: user.userId,
      name: user.name || 'Unknown',
      code: user.code || '',
      count: sales?.count || 0,
      sales: Number((sales?.total || 0).toFixed(2)),
      salaryEarned: Number((payroll.salaryEarned || 0).toFixed(2)),
      netSalaryEarned: Number((payroll.netSalaryEarned || 0).toFixed(2)),
      salaryPaid: Number((paidByUser.get(user.userId) || 0).toFixed(2)),
      commissionEarned: Number((payroll.commissionEarned || 0).toFixed(2)),
      presentDays: Number((payroll.payrollPresentDays ?? attendance.presentDays ?? 0).toFixed(2)),
      absentDays: Number((payroll.payrollAbsentDays ?? attendance.absentDays ?? 0).toFixed(2)),
      halfDays: Number((payroll.payrollHalfDays ?? attendance.halfDays ?? 0).toFixed(2)),
      attendanceRows: attendance.attendanceRows || 0,
    }
  })

  const labels = userSummaries.map(user => user.name)
  const countData = userSummaries.map(user => user.count)
  const salesData = userSummaries.map(user => user.sales)
  return { labels, countData, salesData, entryGroups, userSummaries }
})
