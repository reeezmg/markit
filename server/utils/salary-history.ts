import { createError } from 'h3'
import { salaryDate, salaryMoney } from './salary-input'
import { shiftHoursOf, type DayInput, type SalaryCfgLike } from './payroll'
export type SalaryRate = SalaryCfgLike & { effectiveFrom: string }
export function salaryVersions(config: any): SalaryRate[] {
    if (Array.isArray(config?.rateHistory) && config.rateHistory.length) return config.rateHistory
    // Legacy payroll ignored effectiveFrom. Preserve that baseline when history begins.
    return config ? [{ effectiveFrom: '0001-01-01', period: config.period, amount: Number(config.amount), commissionPercentage: Number(config.commissionPercentage || 0) }] : []
}
export function salaryRateOn(config: any, date: string): SalaryRate | null {
    return [...salaryVersions(config)].reverse().find(rate => rate.effectiveFrom <= date) ?? null
}
export function appendSalaryRate(config: any, input: any, minimumDate: string) {
    const effectiveFrom = salaryDate(input?.effectiveFrom).toISOString().slice(0, 10)
    if (!['MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY'].includes(input.period)) throw createError({ statusCode: 400, statusMessage: 'Invalid salary period' })
    const amount = salaryMoney(input.amount, true), commissionPercentage = salaryMoney(input.commissionPercentage, true)
    if (commissionPercentage > 100) throw createError({ statusCode: 400, statusMessage: 'Commission must be between 0 and 100%' })
    const history = salaryVersions(config)
    if (effectiveFrom < minimumDate || (history.length && effectiveFrom <= history.at(-1)!.effectiveFrom)) throw createError({ statusCode: 409, statusMessage: `Choose an effective date on or after ${minimumDate}, later than the last salary version` })
    const rate: SalaryRate = { effectiveFrom, period: input.period, amount, commissionPercentage }
    return { period: rate.period, amount, commissionPercentage, effectiveFrom: new Date(`${effectiveFrom}T00:00:00Z`), rateHistory: [...history, rate].map(item => ({ effectiveFrom: item.effectiveFrom, period: item.period, amount: Number(item.amount), commissionPercentage: Number(item.commissionPercentage || 0) })) }
}
export function minimumSalaryDate(config: any, lastPayrollEnd?: Date | null, today = new Date().toISOString().slice(0, 10)) {
    const next = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
    const last = salaryVersions(config).at(-1)?.effectiveFrom
    return [today, last && last !== '0001-01-01' ? next(last) : today, lastPayrollEnd ? next(lastPayrollEnd.toISOString().slice(0, 10)) : today].sort().at(-1)!
}
export function historicalSalaryTotals(config: any, start: Date, end: Date, days: DayInput[], sales: { date: string; netValue: number }[]) {
    const byDate = new Map(days.map(day => [day.date, day]))
    let baseSalary = 0, commissionAmount = 0
    for (let at = +start; at <= +end; at += 86400000) {
        const date = new Date(at), key = date.toISOString().slice(0, 10), rate = salaryRateOn(config, key)
        if (!rate) continue
        const amount = Number(rate.amount), day = byDate.get(key)
        if (rate.period === 'MONTHLY') baseSalary += amount / new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
        else if (rate.period === 'WEEKLY') baseSalary += amount / 7
        else if (day && !day.isWeeklyOff) baseSalary += rate.period === 'HOURLY' ? amount * shiftHoursOf(day.shift) : amount
    }
    for (const sale of sales) commissionAmount += sale.netValue * Number(salaryRateOn(config, sale.date)?.commissionPercentage || 0) / 100
    return { baseSalary, commissionAmount }
}
