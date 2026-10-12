export type ExpenseParty = { id: string; kind: 'user' | 'distributor' | 'client'; name: string; key?: string };

export function expensePartyFields(party?: ExpenseParty | null) {
  return {
    userId: party?.kind === 'user' ? party.id : null,
    distributorId: party?.kind === 'distributor' ? party.id : null,
    clientId: party?.kind === 'client' ? party.id : null,
  };
}

export function expensePartyFromRow(row: any): ExpenseParty | null {
  if (row?.party) return row.party;
  if (row?.userId) return { kind: 'user', id: row.userId, name: row.user?.name || row.userId, key: `user:${row.userId}` };
  return null;
}

/** Older API callers may omit party fields; editing must preserve those links. */
export function normalizeExpenseParty(body: any, previous: any = {}) {
  const fields = ['userId', 'distributorId', 'clientId'] as const;
  const supplied = fields.some(key => Object.prototype.hasOwnProperty.call(body, key));
  const source = supplied ? body : previous;
  const result = Object.fromEntries(fields.map(key => [key, source[key] || null])) as Record<typeof fields[number], string | null>;
  if (Object.values(result).filter(Boolean).length > 1) throw new Error('Select only one expense party');
  for (const value of Object.values(result)) {
    if (value !== null && (typeof value !== 'string' || !value.trim())) throw new Error('Invalid expense party');
  }
  return result;
}
