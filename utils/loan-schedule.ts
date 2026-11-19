export type LoanScheduleRow = { number: number; date: string; principal: number; interest: number };
export type LoanTerms = {
    amount: number; annualRate: number; periods: number; frequencyMonths: number;
    startDate: string; firstDueDate: string;
    method: 'ANNUITY' | 'EQUAL_PRINCIPAL' | 'INTEREST_ONLY' | 'MANUAL';
};
export function loanCents(value: unknown) {
    const n = Number(value), result = Math.round(n * 100);
    if (!Number.isFinite(n) || !Number.isSafeInteger(result) || Math.abs(n * 100 - result) > 0.00001)
        throw new Error('Amounts must have at most two decimals and be within range');
    return result;
}
export function loanDate(value: string) {
    const d = new Date(value + 'T00:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
        throw new Error('Enter a valid date');
    return d;
}
export function loanMonth(date: string, months: number) {
    const d = loanDate(date), anchor = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(anchor, last));
    return d.toISOString().slice(0, 10);
}
export function loanNextDay(date: string) {
    const d = loanDate(date); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
export function validateLoanSchedule(terms: LoanTerms, rows: LoanScheduleRow[]) {
    loanDate(terms.startDate); loanDate(terms.firstDueDate);
    const amount = loanCents(terms.amount);
    if (amount <= 0 || amount > 1e12) throw new Error('Borrowed amount must be positive and at most 10 billion');
    if (!Number.isFinite(terms.annualRate) || terms.annualRate < 0 || terms.annualRate > 100)
        throw new Error('Annual interest rate must be between 0 and 100%');
    if (!rows.length || rows.length > 600) throw new Error('A schedule needs 1 to 600 instalments');
    let principal = 0, previous = terms.startDate;
    const result = rows.map((row, i) => {
        loanDate(row.date);
        if (row.date <= previous) throw new Error('Instalment dates must increase and follow the borrowing date');
        previous = row.date;
        const p = loanCents(row.principal), interest = loanCents(row.interest);
        if (p > 1e12 || interest > 1e12) throw new Error('Instalment amounts exceed the supported range');
        if (p < 0 || interest < 0 || p + interest <= 0) throw new Error('Each instalment needs nonnegative principal and interest and a positive total');
        if (terms.annualRate === 0 && interest !== 0) throw new Error('An interest-free loan cannot have scheduled interest');
        principal += p;
        return { number: i + 1, date: row.date, principal: p / 100, interest: interest / 100 };
    });
    if (principal !== amount) throw new Error('Scheduled principal must equal the amount borrowed');
    if (result[0].date !== terms.firstDueDate) throw new Error('First schedule date must equal the first due date');
    return result;
}
/** Fixed nominal annual rate, divided into regular monthly/quarterly/yearly periods.
 * Stub periods, daily interest and lender-specific rounding use an imported schedule.
 */
export function computeLoanSchedule(terms: LoanTerms): LoanScheduleRow[] {
    if (!Number.isInteger(terms.periods) || terms.periods < 1 || terms.periods > 600 || ![1, 3, 12].includes(terms.frequencyMonths))
        throw new Error('Choose 1 to 600 monthly, quarterly or yearly instalments');
    if (!['ANNUITY', 'EQUAL_PRINCIPAL', 'INTEREST_ONLY'].includes(terms.method)) throw new Error('Enter or import a manual schedule');
    if (terms.firstDueDate !== loanMonth(terms.startDate, terms.frequencyMonths))
        throw new Error('For a computed schedule the first due date must be one regular period after borrowing; use a manual schedule for irregular periods');
    const original = loanCents(terms.amount), rate = terms.annualRate / 100 * terms.frequencyMonths / 12;
    const payment = rate === 0 ? original / terms.periods : original * rate / (1 - Math.pow(1 + rate, -terms.periods));
    let remaining = original;
    const rows = Array.from({ length: terms.periods }, (_, index) => {
        const interest = Math.round(remaining * rate);
        const principal = index === terms.periods - 1 ? remaining
            : terms.method === 'INTEREST_ONLY' ? 0
            : Math.min(remaining, Math.round(terms.method === 'EQUAL_PRINCIPAL' ? original / terms.periods : payment - interest));
        if (principal < 0 || (principal === 0 && terms.method !== 'INTEREST_ONLY')) throw new Error('Amount is too small for this number of instalments');
        remaining -= principal;
        return { number: index + 1, date: loanMonth(terms.firstDueDate, index * terms.frequencyMonths), principal: principal / 100, interest: interest / 100 };
    });
    return validateLoanSchedule(terms, rows);
}
export function importLoanSchedule(csv: string): LoanScheduleRow[] {
    const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    if (lines.shift()?.trim().toLowerCase() !== 'date,principal,interest') throw new Error('CSV header must be date,principal,interest');
    return lines.filter(line => line.trim()).map((line, index) => {
        const parts = line.split(',').map(v => v.trim());
        if (parts.length !== 3 || !parts[1] || !parts[2]) throw new Error(`Invalid CSV line ${index + 2}`);
        return { number: index + 1, date: parts[0], principal: Number(parts[1]), interest: Number(parts[2]) };
    });
}
export function loanPosition(schedule: LoanScheduleRow[], events: any[], asOf: string) {
    const live = events.filter(e => String(e.event_date).slice(0, 10) <= asOf);
    const reversed = new Set(live.filter(e => e.kind === 'PAYMENT_REVERSAL').map(e => e.details.originalId));
    const payments = live.filter(e => ['PAYMENT', 'SETTLEMENT'].includes(e.kind) && !reversed.has(e.id));
    const settlement = payments.find(e => e.kind === 'SETTLEMENT');
    const rows = schedule.map(row => {
        const allocations = payments.flatMap(e => e.details.allocations || []).filter(a => a.number === row.number);
        const principalPaid = allocations.reduce((s, a) => s + loanCents(a.principal), 0);
        const interestPaid = allocations.reduce((s, a) => s + loanCents(a.interest), 0);
        const principalDue = Math.max(0, loanCents(row.principal) - principalPaid) / 100;
        const interestDue = settlement && row.date > settlement.event_date ? 0 : Math.max(0, loanCents(row.interest) - interestPaid) / 100;
        return { ...row, principalPaid: principalPaid / 100, interestPaid: interestPaid / 100, principalDue, interestDue,
            totalDue: (loanCents(principalDue) + loanCents(interestDue)) / 100,
            status: principalDue === 0 && interestDue === 0 ? 'PAID' : row.date < asOf ? 'OVERDUE' : row.date === asOf ? 'DUE' : 'UPCOMING' };
    });
    const sum = (list: typeof rows, key: 'principalDue' | 'interestDue') => list.reduce((s, r) => s + loanCents(r[key]), 0) / 100;
    return { rows, principal: sum(rows, 'principalDue'), interestDue: sum(rows.filter(r => r.date <= asOf), 'interestDue'),
        futureInterest: sum(rows.filter(r => r.date > asOf), 'interestDue'),
        overdue: rows.filter(r => r.date < asOf).reduce((s, r) => s + loanCents(r.totalDue), 0) / 100,
        nextDue: rows.find(r => r.totalDue > 0)?.date || null };
}
