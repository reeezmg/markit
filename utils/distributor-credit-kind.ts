export type DistributorCreditKind = 'PRODUCT' | 'AMOUNT' | 'CHARGE';

/** Charge credits retain their expense account in the source posting snapshot. */
export function distributorCreditKind(moneyTransactionId: unknown, accounts?: Record<string, unknown>): DistributorCreditKind {
  return moneyTransactionId ? 'AMOUNT' : accounts?.expense ? 'CHARGE' : 'PRODUCT';
}

export function creditAccountRoles(kind: DistributorCreditKind, mode: string): string[] {
  return ['payable', kind === 'CHARGE' ? 'expense' : kind === 'PRODUCT' ? 'stock' : mode === 'CASH' ? 'cash' : 'bank'];
}

export function creditAccountSelection(kind: DistributorCreditKind, mode: string, accounts: Record<string, string> = {}) {
  return Object.fromEntries(creditAccountRoles(kind, mode).filter(role => accounts[role]).map(role => [role, accounts[role]]));
}
