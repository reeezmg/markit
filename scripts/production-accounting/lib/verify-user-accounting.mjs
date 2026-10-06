export async function verifyUserAccounting(db,companyId){
 const settings=(await db.query('SELECT enabled FROM accountant_v2_user_settings WHERE company_id=$1',[companyId])).rows[0];
 // The caller uses READ ONLY, so an attempted repair fails instead of changing data.
 const repeated=(await db.query('SELECT COALESCE(sum(accountant_v2_sync_user(company_id,ledger_id)),0)::int n FROM accountant_v2_user_sources WHERE company_id=$1 AND revision>0',[companyId])).rows[0].n;
 const mismatches=(await db.query(`WITH expected AS(
 SELECT s.source_key,s.accounts->>(v->>'role') account_id,sum((v->>'amount')::numeric) amount
 FROM accountant_v2_user_sources s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.signature->'lines','[]')) v
 WHERE s.company_id=$1 GROUP BY 1,2),actual AS(
 SELECT s.source_key,l.account_id,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END) amount
 FROM accountant_v2_user_sources s JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id AND j.status='PUBLISHED' AND j.deleted_at IS NULL
 JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id AND l.deleted_at IS NULL
 WHERE s.company_id=$1 GROUP BY 1,2)
 SELECT COALESCE(e.source_key,a.source_key) source_key FROM expected e FULL JOIN actual a USING(source_key,account_id) WHERE COALESCE(e.amount,0)<>COALESCE(a.amount,0)`,[companyId])).rows;
 const counts=(await db.query(`SELECT count(*) FILTER(WHERE signature->>'excluded'='true')::int AS "historicalBaselines",count(*) FILTER(WHERE journal_id IS NOT NULL)::int AS "currentJournals" FROM accountant_v2_user_sources WHERE company_id=$1`,[companyId])).rows[0];
 return {enabled:!!settings?.enabled,repeatChanges:repeated,mismatches,...counts,passed:!!settings?.enabled&&repeated===0&&mismatches.length===0};
}
