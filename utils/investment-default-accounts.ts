/** Shared by company setup and on-demand investor/loan form initialization. */
export const investmentDefaultAccounts = [
    ['Investor Capital', '3000', 'EQUITY', 'EQUITY'],
    ['Investor Profit Payable', 'INV-PROFIT-PAYABLE', 'OTHER_CURRENT_LIABILITY', 'LIABILITY'],
    ['Investor Loans Payable', 'INV-LOANS-PAYABLE', 'OTHER_LIABILITY', 'LIABILITY'],
    ['Cash', '1001', 'CASH', 'ASSET'],
    ['Current Loan Liability', 'LOAN-CURRENT', 'OTHER_CURRENT_LIABILITY', 'LIABILITY'],
    ['Loan Interest Expense', 'LOAN-INTEREST', 'EXPENSE', 'EXPENSE'],
    ['Loan Fees Expense', 'LOAN-FEES', 'EXPENSE', 'EXPENSE'],
] as const;
export const investmentDefaultCodes = {
    investments: { capitalAccountId: '3000', profitAccountId: 'INV-PROFIT-PAYABLE', loanAccountId: 'INV-LOANS-PAYABLE', counterAccountId: '1001', payoutAccountId: '1001' },
    loans: { bank: '1001', longTerm: 'INV-LOANS-PAYABLE', shortTerm: 'LOAN-CURRENT', interestExpense: 'LOAN-INTEREST', feesExpense: 'LOAN-FEES' },
};
