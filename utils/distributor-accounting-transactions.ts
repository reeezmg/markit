export function distributorAccountingTransactions(data: any) {
  const groups = new Map<string, any>();
  for (const line of data.ledger || []) {
    if (!groups.has(line.id)) {
      const source = data.sources?.find((s: any) => s.journal_id === line.id);
      const event = data.events?.find((e: any) => e.source_key === source?.source_key);
      groups.set(line.id, { id: line.id, entryNumber: line.entry_number, date: line.journal_date, reference: line.reference_number || event?.reference || line.entry_number,
        type: line.source_type === 'DISTRIBUTOR_REVERSAL' ? 'REVERSAL' : event?.kind || 'JOURNAL',
        description: line.notes || event?.description || '', sourceKey: source?.source_key,
        debit: 0, credit: 0, lines: [] });
    }
    const row = groups.get(line.id);
    row.lines.push(line);
    if (line.account_type === 'ACCOUNTS_PAYABLE') row[line.side === 'DEBIT' ? 'debit' : 'credit'] += Math.round(Number(line.amount) * 100);
  }
  // Preserve API order within a date (journal creation order), including reversals.
  let balance = 0;
  return [...groups.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(row => {
    balance += row.credit - row.debit;
    return { ...row, debit: row.debit / 100, credit: row.credit / 100, due: balance / 100 };
  });
}
