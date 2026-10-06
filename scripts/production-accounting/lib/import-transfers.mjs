import { createHash } from 'node:crypto';
import { cents, money } from './legacy-cash-bank-plan.mjs';
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const id = (value) => 'c' + hash(value).slice(0, 24);
const resource = 'transfer-history-import';
const opposite = (side) => (side === 'DEBIT' ? 'CREDIT' : 'DEBIT');

// Caller owns the transaction; preview and tests roll everything back.
export async function importTransfers(
  db,
  companyId,
  { through, mappings = {}, verifyOnly = false } = {}
) {
  if (!verifyOnly) {
    await db.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [companyId]);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))", [companyId]);
    await db.query("SELECT pg_advisory_xact_lock(hashtext('account-transfer:'||$1))", [companyId]);
  }
  const company = (await db.query('SELECT currency FROM companies WHERE id=$1', [companyId]))
    .rows[0];
  const setup = (
    await db.query(
      'SELECT accounts FROM accountant_v2_erp_settings WHERE company_id=$1 AND enabled',
      [companyId]
    )
  ).rows[0];
  if (!company || !setup) throw Error('Connect ERP accounting first: ' + companyId);
  const currency = company.currency || 'INR';
  const balances = async () =>
    Object.fromEntries(
      (
        await db.query(
          `SELECT l.account_id, sum(CASE l.side WHEN 'DEBIT' THEN round(l.amount*j.exchange_rate,2) ELSE -round(l.amount*j.exchange_rate,2) END)::text AS amount FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id AND j.company_id=l.company_id WHERE j.company_id=$1 AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL GROUP BY l.account_id`,
          [companyId]
        )
      ).rows.map((r) => [r.account_id, cents(r.amount)])
    );
  const existingNative = (await db.query("SELECT source_id FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='ACCOUNT_TRANSFER' AND deleted_at IS NULL",[companyId])).rows;
  const existingTransfers = (await db.query('SELECT id,reference_number FROM accountant_v2_account_transfers WHERE company_id=$1 AND deleted_at IS NULL',[companyId])).rows;
  const before = await balances(),
    expected = {};
  const rows = (
    await db.query(
      `SELECT id,company_id,from_type::text,to_type::text,from_account_id,to_account_id,amount::text,note,created_at::text AS date FROM account_transfers WHERE company_id=$1 AND created_at<($2::date+interval '1 day') ORDER BY created_at,id ${
        verifyOnly ? '' : 'FOR UPDATE'
      }`,
      [companyId, through]
    )
  ).rows;
  let nextNumber =
    Number(
      (
        await db.query('SELECT count(*) FROM accountant_v2_account_transfers WHERE company_id=$1', [
          companyId,
        ])
      ).rows[0].count
    ) + 1;
  const result = {
    companyId,
    total: rows.length,
    created: 0,
    unchanged: 0,
    replacedJournals: 0,
    rows: [],
    balanceChanges: [],
  };
  const accountRows = (
    await db.query(
      'SELECT id,account_type::text,is_active,deleted_at,code FROM accountant_v2_accounting_accounts WHERE company_id=$1',
      [companyId]
    )
  ).rows;
  const accounts = new Map(accountRows.map((a) => [a.id, a]));
  const bankMappings = (
    await db.query(
      "SELECT DISTINCT role,account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND role LIKE 'bank:%'",
      [companyId]
    )
  ).rows;
  const loadLines = async (journalId) =>
    (
      await db.query(
        `SELECT account_id,side::text,amount::text FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=$2 AND deleted_at IS NULL ORDER BY account_id,side`,
        [companyId, journalId]
      )
    ).rows;
  const normalize = (lines) =>
    lines.map((l) => [l.account_id, l.side, cents(l.amount).toString()].join(':')).sort();
  const checkLines = (actual, wanted, label) => {
    if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(wanted))) throw Error(label);
  };
  async function post(journalId, sourceType, sourceId, row, lines, reversedFrom = null) {
    await db.query('SELECT accountant_v2_distributor_check_date($1,$2::timestamp,true)', [
      companyId,
      row.date,
    ]);
    await db.query(
      `INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at) VALUES($1,$2,$3,$4::timestamp,$5,$6,$7,$8,'PUBLISHED',now(),true,$9,$10,$11,now())`,
      [
        journalId,
        companyId,
        'TRH-' + journalId,
        row.date,
        'ACCOUNT_TRANSFER:' + row.id,
        row.note || 'Imported account transfer',
        currency,
        row.amount,
        sourceType,
        sourceId,
        reversedFrom,
      ]
    );
    for (const [index, line] of lines.entries()) {
      await db.query(
        `INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,updated_at) VALUES($1,$2,$3,$4,$5::"AccountantJournalEntrySide",$6,$7,now())`,
        [
          id(journalId + ':' + index),
          companyId,
          journalId,
          line.account_id,
          line.side,
          line.amount,
          row.note || 'Historical transfer',
        ]
      );
      expected[line.account_id] =
        (expected[line.account_id] || 0n) + cents(line.amount) * (line.side === 'DEBIT' ? 1n : -1n);
    }
  }
  for (const row of rows) {
    if (cents(row.amount) <= 0n) throw Error('Invalid transfer amount: ' + row.id);
    const transferId = id(companyId + ':legacy-transfer:' + row.id),
      journalId = id(transferId + ':journal'),
      key = 'ACCOUNT_TRANSFER:' + row.id;
    const previous = (
      await db.query(
        `SELECT "after" FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource=$2 AND "resourceId"=$3 AND action='imported'`,
        [companyId, resource, row.id]
      )
    ).rows;
    if (previous.length > 1) throw Error('Duplicate import metadata: ' + row.id);
    const prior = previous[0]?.after;
    if(!prior && (existingNative.some(j=>j.source_id===row.id||j.source_id===transferId) || existingTransfers.some(t=>t.id===row.id||t.id===transferId||t.reference_number===row.id))) throw Error('Transfer already represented without import metadata: '+row.id);

    if (prior && prior.fingerprint !== hash(row))
      throw Error('Previously imported source changed: ' + row.id);
    const old = (
      await db.query(
        `SELECT *,journal_date::text AS source_date FROM accountant_v2_manual_journals WHERE company_id=$1 AND source_type='LEGACY_CASH_BANK_HISTORY' AND reference_number=$2 AND deleted_at IS NULL`,
        [companyId, key]
      )
    ).rows;
    if (old.length > 1) throw Error('Multiple old journals: ' + row.id);
    const oldJournal = old[0],
      oldLines = oldJournal ? await loadLines(oldJournal.id) : [];
    if (oldJournal) {
      if (
        oldJournal.status !== 'PUBLISHED' ||
        oldJournal.currency !== currency ||
        Number(oldJournal.exchange_rate) !== 1 ||
        oldJournal.source_date !== row.date
      )
        throw Error('Historical journal date/currency/status differs: ' + row.id);
      if (
        !(
          await db.query(
            `SELECT id FROM accountant_v2_accountant_audit WHERE company_id=$1 AND resource='legacy-cash-bank-import' AND action='imported' AND "resourceId"=$2 AND "after"->>'source'=$3`,
            [companyId, oldJournal.id, key]
          )
        ).rowCount
      )
        throw Error('Missing historical import provenance: ' + row.id);
    }
    async function resolveAccount(type, bankId, side) {
      let target;
      if (type === 'CASH') target = mappings.cash || setup.accounts.cash;
      else if (type === 'BANK' && !bankId) target = mappings.bank || setup.accounts.bank;
      else if (type === 'BANK') {
        if (
          !(
            await db.query('SELECT id FROM bank_accounts WHERE company_id=$1 AND id=$2', [
              companyId,
              bankId,
            ])
          ).rowCount
        )
          throw Error('Bank belongs to another company: ' + bankId);
        const matches = bankMappings.filter((m) => m.role === 'bank:' + bankId);
        target = mappings.banks?.[bankId] || (matches.length === 1 ? matches[0].account_id : null);
      } else if (type === 'INVESTMENT') {
        // Old transfers have no investor identity. Keep the proven historical
        // counterpart unless an explicit investment account mapping was supplied.
        const candidates = oldLines.filter(
          (l) => l.side === side && accounts.get(l.account_id)?.code === 'LCB-CLEARING'
        );
        target = mappings.investment || (candidates.length === 1 ? candidates[0].account_id : null);
      }
      const a = accounts.get(target);
      const types =
        type === 'CASH'
          ? ['CASH']
          : type === 'BANK'
          ? ['BANK']
          : ['EQUITY', 'OTHER_LIABILITY', 'OTHER_CURRENT_ASSET', 'OTHER_ASSET'];
      if (!a || (!prior && !a.is_active) || a.deleted_at || !types.includes(a.account_type))
        throw Error('Provide valid account mapping for ' + type + ':' + (bankId || 'primary'));
      return target;
    }
    const from = await resolveAccount(row.from_type, row.from_account_id, 'CREDIT'),
      to = await resolveAccount(row.to_type, row.to_account_id, 'DEBIT');
    if (from === to) throw Error('Transfer resolves to the same account: ' + row.id);
    const desired = [
      { account_id: from, side: 'CREDIT', amount: row.amount },
      { account_id: to, side: 'DEBIT', amount: row.amount },
    ];
    if (oldJournal) {
      if (
        oldLines.length !== 2 ||
        oldLines.some((l) => cents(l.amount) !== cents(row.amount)) ||
        new Set(oldLines.map((l) => l.side)).size !== 2
      )
        throw Error('Historical transfer lines differ: ' + row.id);
      for (const line of oldLines)
        if (
          !desired.some((d) => d.account_id === line.account_id && d.side === line.side) &&
          accounts.get(line.account_id)?.code !== 'LCB-CLEARING'
        )
          throw Error('Unexpected historical counterpart: ' + row.id);
    }
    const reversalId = oldJournal ? id(transferId + ':reversal') : null;
    if (prior) {
      if (
        prior.transferId !== transferId ||
        prior.journalId !== journalId ||
        prior.reversalId !== reversalId
      )
        throw Error('Import links changed: ' + row.id);
      const transfer = (
        await db.query(
          `SELECT *,transfer_date::text AS source_date FROM accountant_v2_account_transfers WHERE company_id=$1 AND id=$2 AND deleted_at IS NULL`,
          [companyId, transferId]
        )
      ).rows[0];
      if (
        !transfer ||
        transfer.from_account_id !== from ||
        transfer.to_account_id !== to ||
        cents(transfer.amount) !== cents(row.amount) ||
        transfer.source_date !== row.date ||
        transfer.currency !== currency ||
        Number(transfer.exchange_rate) !== 1 ||
        transfer.description !== row.note ||
        transfer.reference_number !== row.id
      )
        throw Error('Imported transfer changed: ' + row.id);
      const posted = (
        await db.query(
          `SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=$2 AND source_type='ACCOUNT_TRANSFER' AND source_id=$3 AND status='PUBLISHED' AND deleted_at IS NULL AND journal_date=$4::timestamp AND currency=$5 AND exchange_rate=1`,
          [companyId, journalId, transferId, row.date, currency]
        )
      ).rows;
      if (posted.length !== 1) throw Error('Imported journal missing or changed: ' + row.id);
      checkLines(await loadLines(journalId), desired, 'Imported posting changed: ' + row.id);
      if (reversalId) {
        const reversal = (
          await db.query(
            `SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND id=$2 AND reversed_from_id=$3 AND status='PUBLISHED' AND deleted_at IS NULL AND journal_date=$4::timestamp AND currency=$5 AND exchange_rate=1 AND source_type='TRANSFER_HISTORY_MIGRATION_REVERSAL'`,
            [companyId, reversalId, oldJournal.id, row.date, currency]
          )
        ).rows;
        if (reversal.length !== 1) throw Error('Missing migration reversal: ' + row.id);
        checkLines(
          await loadLines(reversalId),
          oldLines.map((l) => ({ ...l, side: opposite(l.side) })),
          'Migration reversal changed: ' + row.id
        );
      }
      result.unchanged++;
    } else {
      if (verifyOnly) throw Error('Transfer history has not been imported: ' + row.id);
      if (
        oldJournal &&
        (
          await db.query(
            'SELECT id FROM accountant_v2_manual_journals WHERE company_id=$1 AND reversed_from_id=$2 AND deleted_at IS NULL',
            [companyId, oldJournal.id]
          )
        ).rowCount
      )
        throw Error('Historical journal already reversed: ' + row.id);
      await db.query(
        `INSERT INTO accountant_v2_account_transfers(id,company_id,transfer_number,transfer_date,from_account_id,to_account_id,amount,currency,exchange_rate,reference_number,description,updated_at) VALUES($1,$2,$3,$4::timestamp,$5,$6,$7,$8,1,$9,$10,now())`,
        [
          transferId,
          companyId,
          'TRF-' + String(nextNumber++).padStart(5, '0'),
          row.date,
          from,
          to,
          row.amount,
          currency,
          row.id,
          row.note,
        ]
      );
      if (oldJournal) {
        await post(
          reversalId,
          'TRANSFER_HISTORY_MIGRATION_REVERSAL',
          oldJournal.id,
          row,
          oldLines.map((l) => ({ ...l, side: opposite(l.side) })),
          oldJournal.id
        );
        result.replacedJournals++;
      }
      await post(journalId, 'ACCOUNT_TRANSFER', transferId, row, desired);
      await db.query(
        `INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at) VALUES($1,$2,'transfer-history-import','imported',$3,$4,$5::jsonb,now())`,
        [
          id(transferId + ':audit'),
          companyId,
          resource,
          row.id,
          JSON.stringify({
            fingerprint: hash(row),
            transferId,
            journalId,
            reversalId,
            source: key,
            sourceRow: row,
          }),
        ]
      );
      result.created++;
    }
    result.rows.push({
      id: row.id,
      transferId,
      journalId,
      fromAccountId: from,
      toAccountId: to,
      amount: row.amount,
      status: prior ? 'unchanged' : 'imported',
    });
  }
  if (
    (
      await db.query(
        `SELECT id FROM accountant_v2_accountant_audit a WHERE company_id=$1 AND resource=$2 AND action='imported' AND NOT EXISTS(SELECT 1 FROM account_transfers t WHERE t.company_id=a.company_id AND t.id=a."resourceId")`,
        [companyId, resource]
      )
    ).rowCount
  )
    throw Error('Previously imported transfer was deleted');
  if (!verifyOnly) {
    await db.query('SET CONSTRAINTS ALL IMMEDIATE');
    await db.query('SET CONSTRAINTS ALL DEFERRED');
  }
  const after = await balances();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const delta = (after[key] || 0n) - (before[key] || 0n);
    if (delta !== (expected[key] || 0n)) throw Error('Unexpected account movement: ' + key);
    if (delta) result.balanceChanges.push({ accountId: key, amount: money(delta) });
  }
  return result;
}
