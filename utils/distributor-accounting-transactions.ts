export function distributorAccountingTransactions(data: any) {
  const groups = new Map<string, any>();
  const currentSources = new Map<string, any>((data.sources || [])
    .filter((s: any) => s.journal_id).map((s: any) => [s.journal_id, s]));
  const sourceTypes = new Set(['PURCHASE', 'PAYMENT', 'RETURN', 'RECEIPT', 'OPENING']);
  for (const line of data.ledger || []) {
    const source = currentSources.get(line.id);
    const event = source && data.events?.find((e: any) => e.source_key === source.source_key
      && (!source.distributor_id || !e.distributor_id || source.distributor_id === e.distributor_id));
    // Distributor statements show the current source projection. Superseded
    // journals, cancellation history and unrelated journals are not transactions.
    if (!event || !sourceTypes.has(event.kind) || line.source_type === 'DISTRIBUTOR_REVERSAL') continue;
    if (!groups.has(line.id)) {
      groups.set(line.id, { id: line.id, entryNumber: line.entry_number, date: line.journal_date, reference: event.source_reference || event.reference || line.reference_number || source.source_key,
        type: event.source_kind || event.kind,
        description: line.notes || event?.description || '', sourceKey: source?.source_key,
        debit: 0, credit: 0, lines: [] });
    }
    const row = groups.get(line.id);
    row.lines.push(line);
    if (line.account_type === 'ACCOUNTS_PAYABLE') row[line.side === 'DEBIT' ? 'debit' : 'credit'] += Math.round(Number(line.amount) * 100);
  }
  // Preserve API order within a date for current source transactions.
  let balance = 0;
  return [...groups.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(row => {
    balance += row.credit - row.debit;
    return { ...row, debit: row.debit / 100, credit: row.credit / 100, due: balance / 100 };
  });
}
