export const investmentPages = [
    ['overview', 'Overview'],
    ['investors', 'Investors'],
    ['capital', 'Capital & loans'],
    ['allocate', 'Allocate profit'],
    ['payouts', 'Profit payouts'],
    ['settings', 'Settings'],
] as const;
export const investmentToday = () => new Date().toLocaleDateString('en-CA');
export const investmentMoney = (amount: unknown, currency = 'INR') =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(
        Number(amount || 0)
    );
export const investmentKinds: Record<string, string> = {
    CAPITAL_IN: 'Capital received',
    CAPITAL_OUT: 'Capital returned',
    PROFIT_ALLOCATE: 'Profit allocated',
    PROFIT_PAY: 'Profit paid',
    LOAN_IN: 'Loan received',
    LOAN_OUT: 'Loan repaid',
};
export function investmentLedger(events: any[]) {
    const balances = new Map<
        string,
        { capital: number; profit: number; loan: number }
    >();
    return events.map((e) => {
        const balance = balances.get(e.investor_id) || {
            capital: 0,
            profit: 0,
            loan: 0,
        };
        const posted = e.journal_status === 'PUBLISHED' && !e.journal_deleted;
        const kind = e.kind === 'REVERSAL' ? e.details.originalKind : e.kind;
        const amount = posted
            ? Math.round(Number(e.amount) * 100) *
              (e.kind === 'REVERSAL' ? -1 : 1)
            : 0;
        if (kind === 'CAPITAL_IN') balance.capital += amount;
        if (kind === 'CAPITAL_OUT') balance.capital -= amount;
        if (kind === 'PROFIT_ALLOCATE') balance.profit += amount;
        if (kind === 'PROFIT_PAY') balance.profit -= amount;
        if (kind === 'LOAN_IN') balance.loan += amount;
        if (kind === 'LOAN_OUT') balance.loan -= amount;
        balances.set(e.investor_id, balance);
        return {
            ...e,
            date: String(e.event_date).slice(0, 10),
            posted,
            movementKind: kind,
            label: `${e.kind === 'REVERSAL' ? 'Reversal: ' : ''}${
                investmentKinds[kind] || kind
            }`,
            capital: balance.capital / 100,
            profit: balance.profit / 100,
            loan: balance.loan / 100,
            reversed: events.some((r) => r.reversed_id === e.id),
        };
    });
}
