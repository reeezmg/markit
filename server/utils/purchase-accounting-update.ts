import { randomUUID } from 'node:crypto';

/** Synchronize an existing purchase before deferred distributor posting runs.
 * The caller owns the source transaction; failures roll back the purchase too.
 */
export async function updatePurchaseAccounting(db: any, companyId: string, poId: string) {
  await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:' || $1))", [companyId]);
  const sourceKey = `purchase:${poId}`;
  // Use the installed projection: preserves PO-header authority and exclusions.
  const event = (await db.query(`SELECT e.*,to_jsonb(e) signature,cfg.contact_id FROM (
    SELECT distributor_id,source_key,kind,event_date,amount,tax,mode,bank_id,description,reference
    FROM accountant_v2_distributor_events WHERE company_id=$1 AND source_key=$2 AND kind='PURCHASE'
  ) e JOIN accountant_v2_distributor_settings cfg ON cfg.company_id=$1 AND cfg.distributor_id=e.distributor_id AND cfg.enabled`, [companyId, sourceKey])).rows;
  if (event.length !== 1) return false; // New/unconnected/reassigned sources use native posting.
  const e = event[0];
  // The native signature contains the event fields, without distributor_id.
  const signature = { ...e.signature };
  delete signature.distributor_id;
  const old = (await db.query(`SELECT *,signature=$4::jsonb unchanged FROM accountant_v2_distributor_sources
    WHERE company_id=$1 AND distributor_id=$2 AND source_key=$3 FOR UPDATE`, [companyId, e.distributor_id, sourceKey, JSON.stringify(signature)])).rows[0];
  if (!old?.journal_id || old.signature?.kind !== 'PURCHASE') return false;
  if (old.unchanged) return true;
  const journal = (await db.query(`SELECT * FROM accountant_v2_manual_journals
    WHERE company_id=$1 AND id=$2 FOR UPDATE`, [companyId, old.journal_id])).rows[0];
  if (!journal || journal.source_type !== 'DISTRIBUTOR' || journal.status !== 'PUBLISHED' || journal.deleted_at) {
    throw new Error('The linked purchase accounting entry is unavailable');
  }
  const amount = Number(e.amount), tax = Number(e.tax);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(tax) || tax < 0 || tax > amount) throw new Error('Invalid purchase amount or tax');
  // Respect both periods when moving a purchase date, just like native posting.
  await db.query('SELECT accountant_v2_distributor_check_date($1,$2,false)', [companyId, e.event_date]);
  await db.query('SELECT accountant_v2_distributor_check_date($1,$2,false)', [companyId, journal.journal_date]);
  const accounts = old.accounts || {};
  const parts = amount === 0 ? [] : [
    { account: accounts.payable, side: 'CREDIT', amount },
    ...(amount > tax ? [{ account: accounts.stock, side: 'DEBIT', amount: Math.round((amount - tax) * 100) / 100 }] : []),
    ...(tax > 0 ? [{ account: accounts.tax, side: 'DEBIT', amount: tax }] : []),
  ];
  for (const part of parts) {
    if (!part.account || !(await db.query(`SELECT 1 FROM accountant_v2_accounting_accounts
      WHERE company_id=$1 AND id=$2 AND is_active AND deleted_at IS NULL`, [companyId, part.account])).rowCount) {
      throw new Error('Configure active company accounts before editing the purchase');
    }
  }
  const previousLines = (await db.query(`SELECT * FROM accountant_v2_manual_journal_lines
    WHERE company_id=$1 AND journal_id=$2 ORDER BY id`, [companyId, journal.id])).rows;
  const revision = Number(old.revision) + 1;
  await db.query(`UPDATE accountant_v2_manual_journals SET journal_date=$3,reference_number=$4,
    notes=$5,total=$6,source_id=$7,updated_at=now() WHERE company_id=$1 AND id=$2`,
  [companyId, journal.id, e.event_date, e.reference, `PURCHASE: ${e.description}`, amount, `${e.distributor_id}:${sourceKey}:${revision}`]);
  await db.query('DELETE FROM accountant_v2_manual_journal_lines WHERE company_id=$1 AND journal_id=$2', [companyId, journal.id]);
  for (const part of parts) await db.query(`INSERT INTO accountant_v2_manual_journal_lines
    (id,company_id,journal_id,account_id,side,amount,description,party_id,distributor_id,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
  [randomUUID(), companyId, journal.id, part.account, part.side, part.amount, e.reference, e.contact_id, e.distributor_id]);
  // The trigger will see exactly this signature and leave the updated row alone.
  await db.query(`UPDATE accountant_v2_distributor_sources SET signature=$4::jsonb,revision=$5
    WHERE company_id=$1 AND distributor_id=$2 AND source_key=$3`, [companyId, e.distributor_id, sourceKey, JSON.stringify(signature), revision]);
  await db.query(`INSERT INTO accountant_v2_accountant_audit
    (id,company_id,"userId",action,resource,"resourceId","after",updated_at)
    VALUES($1,$2,COALESCE(nullif(current_setting('app.accountant_user',true),''),'purchase-source'),'update',
      'distributor-accounting',$3,$4::jsonb,now())`,
  [randomUUID(), companyId, `${e.distributor_id}:${sourceKey}`,
    JSON.stringify({ journalId: journal.id, previousJournalId: journal.id, revision, source: signature, accounts, lines: parts,
      previous: { journal, lines: previousLines, source: old.signature } })]);
  return true;
}
