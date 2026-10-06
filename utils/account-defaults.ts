export type AccountDefaultField = { label: string; types?: string[]; exclude?: string[] };
const field = (label: string, ...types: string[]): AccountDefaultField => ({ label, types });
const money = (label: string) => field(label, 'CASH', 'BANK');
export const accountDefaultGroups: Record<string, { title: string; fields: Record<string, AccountDefaultField> }> = {
  purchase: { title: 'Purchase & supplier payments', fields: {
    payable: field('Accounts payable', 'ACCOUNTS_PAYABLE'), stock: field('Stock / inventory', 'STOCK'),
    tax: field('Recoverable purchase tax', 'OTHER_CURRENT_ASSET'), cash: field('Cash payments', 'CASH'),
    bank: field('Bank payments', 'BANK'), opening: field('Opening balance offset', 'EQUITY', 'OTHER_CURRENT_LIABILITY'),
  } },
  investments: { title: 'Investments', fields: {
    capitalAccountId: field('Investor equity', 'EQUITY'), profitAccountId: field('Profit payable', 'OTHER_CURRENT_LIABILITY'),
    loanAccountId: field('Investor loan', 'OTHER_LIABILITY'), counterAccountId: money('Capital & loan receipts / payments'),
    payoutAccountId: money('Profit payouts'),
  } },
  receive: { title: 'Receive / Pay money', fields: { moneyAccountId: money('Receive into') } },
  pay: { title: 'Pay money', fields: { moneyAccountId: money('Pay from') } },
  transfers: { title: 'Account transfers', fields: {
    fromAccountId: field('Transfer from', 'CASH', 'BANK', 'PAYMENT_CLEARING_ACCOUNT', 'CREDIT_CARD'),
    toAccountId: field('Transfer to', 'CASH', 'BANK', 'PAYMENT_CLEARING_ACCOUNT', 'CREDIT_CARD'),
  } },
  assets: { title: 'Fixed assets', fields: {
    assetAccountId: field('Asset account', 'FIXED_ASSET'), accumulatedDepAccountId: field('Accumulated depreciation', 'FIXED_ASSET'),
    depreciationExpenseAccountId: field('Depreciation expense', 'EXPENSE'), proceedsAccountId: money('Disposal proceeds'),
    gainLossAccountId: { label: 'Disposal gain / loss', types: ['INCOME', 'OTHER_INCOME', 'EXPENSE', 'OTHER_EXPENSE'] },
  } },
};
export function acceptsDefaultAccount(field: AccountDefaultField, account: { accountType: string }) {
  return (!field.types?.length || field.types.includes(account.accountType)) && !field.exclude?.includes(account.accountType);
}
