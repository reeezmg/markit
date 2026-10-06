-- Session-local helper. Each source is atomic; failures are collected and block the batch.
-- Index the immutable cash-migration candidates once. Per-document scans of all
-- company journals/audits become prohibitively expensive on large histories.
DROP TABLE IF EXISTS pg_temp.erp_history_migration_journals;
CREATE TEMP TABLE erp_history_migration_journals AS
SELECT j.id journal_id,j.company_id,j.reference_number,
 COALESCE(bool_or(audit."after"->>'source'=j.reference_number),false) has_provenance,
 bool_or(reversal.id IS NOT NULL) has_existing_reversal
FROM accountant_v2_manual_journals j
LEFT JOIN accountant_v2_accountant_audit audit ON audit.company_id=j.company_id
 AND audit."resourceId"=j.id AND audit.resource='legacy-cash-bank-import' AND audit.action='imported'
LEFT JOIN accountant_v2_manual_journals reversal ON reversal.reversed_from_id=j.id AND reversal.deleted_at IS NULL
WHERE j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.status='PUBLISHED' AND j.deleted_at IS NULL
GROUP BY j.id,j.company_id,j.reference_number;
CREATE INDEX erp_history_migration_journals_source_idx
 ON erp_history_migration_journals(company_id,reference_number,journal_id);
ANALYZE erp_history_migration_journals;

CREATE OR REPLACE FUNCTION pg_temp.import_erp_history_source(c text,kind text,sid text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE changed integer; reversed integer:=0; key text:=lower(kind)||':'||sid;
 legacy_key text:=kind||':'||sid; current_journal text; oldj record; rid text; existing record; historical_party jsonb;
BEGIN
 -- The bill itself records the historical client even if its present-day membership
 -- was removed. Snapshot that source identity; do not recreate company membership.
 IF kind='BILL' AND EXISTS(SELECT 1 FROM accountant_v2_erp_sources WHERE company_id=c AND source_key=key AND signature->>'excluded'='true') THEN
   SELECT jsonb_build_object('client',jsonb_build_object('id',cl.id,'name',COALESCE(NULLIF(cl.name,''),cl.id))) INTO historical_party
   FROM bills b JOIN clients cl ON cl.id=b.client_id WHERE b.id=sid AND b.company_id=c
   AND NOT EXISTS(SELECT 1 FROM company_clients cc WHERE cc.company_id=c AND cc.client_id=b.client_id);
   IF historical_party IS NOT NULL THEN
     UPDATE accountant_v2_erp_sources SET signature=signature||jsonb_build_object('parties',historical_party) WHERE company_id=c AND source_key=key;
     INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
     VALUES('c'||substr(md5(c||key||':historical-party'),1,24),c,'erp-history-import','snapshot','erp-history',key,jsonb_build_object('historicalSourceParties',historical_party,'reason','Client recorded on historical bill; current company membership absent'),now()) ON CONFLICT(id) DO NOTHING;
   END IF;
 END IF;
 changed:=accountant_v2_sync_erp(c,kind,sid,true);
 SELECT journal_id INTO current_journal FROM accountant_v2_erp_sources WHERE company_id=c AND source_key=key;
 FOR oldj IN SELECT j.* FROM pg_temp.erp_history_migration_journals candidate
   JOIN accountant_v2_manual_journals j ON j.id=candidate.journal_id
   WHERE candidate.company_id=c AND candidate.reference_number=legacy_key
   AND j.company_id=c AND j.source_type='LEGACY_CASH_BANK_HISTORY' AND j.reference_number=legacy_key
   AND j.status='PUBLISHED' AND j.deleted_at IS NULL
 LOOP
   rid:='c'||substr(md5(c||oldj.id||':erp-history-replacement'),1,24);
   SELECT * INTO existing FROM accountant_v2_manual_journals WHERE id=rid;
   IF FOUND THEN
     IF existing.company_id<>c OR existing.reversed_from_id<>oldj.id OR existing.status<>'PUBLISHED' OR existing.deleted_at IS NOT NULL THEN
       RAISE EXCEPTION 'Historical replacement reversal changed: %',rid;
     END IF;
     IF EXISTS(SELECT account_id FROM accountant_v2_manual_journal_lines WHERE company_id=c AND journal_id IN(oldj.id,rid) AND deleted_at IS NULL GROUP BY account_id HAVING sum(CASE side WHEN 'DEBIT' THEN amount ELSE -amount END)<>0) THEN
       RAISE EXCEPTION 'Historical replacement reversal no longer cancels original: %',rid;
     END IF;
     CONTINUE;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_temp.erp_history_migration_journals WHERE company_id=c AND reference_number=legacy_key AND journal_id=oldj.id AND has_provenance) THEN
     RAISE EXCEPTION 'Missing migration provenance for %',oldj.id;
   END IF;
   IF EXISTS(SELECT 1 FROM pg_temp.erp_history_migration_journals WHERE company_id=c AND reference_number=legacy_key AND journal_id=oldj.id AND has_existing_reversal) THEN
     RAISE EXCEPTION 'Migration journal already reversed outside ERP history import: %',oldj.id;
   END IF;
   PERFORM accountant_v2_distributor_check_date(c,oldj.journal_date,true);
   INSERT INTO accountant_v2_manual_journals(id,company_id,entry_number,journal_date,reference_number,notes,currency,exchange_rate,total,status,published_at,is_system_generated,source_type,source_id,reversed_from_id,updated_at)
   VALUES(rid,c,'ERP-HR-'||rid,oldj.journal_date,legacy_key,'Replace cash/bank migration with full ERP source posting',oldj.currency,oldj.exchange_rate,oldj.total,'PUBLISHED',now(),true,'ERP_HISTORY_MIGRATION_REVERSAL',oldj.id,oldj.id,now());
   INSERT INTO accountant_v2_manual_journal_lines(id,company_id,journal_id,account_id,side,amount,description,party_id,project_id,distributor_id,source_parties,updated_at)
   SELECT 'c'||substr(md5(rid||id),1,24),c,rid,account_id,(CASE side WHEN 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END)::"AccountantJournalEntrySide",amount,'Replaced by full ERP accounting',party_id,project_id,distributor_id,source_parties,now()
   FROM accountant_v2_manual_journal_lines WHERE journal_id=oldj.id AND company_id=c AND deleted_at IS NULL;
   INSERT INTO accountant_v2_accountant_audit(id,company_id,"userId",action,resource,"resourceId","after",updated_at)
   VALUES('c'||substr(md5(rid||':audit'),1,24),c,'erp-history-import','superseded','legacy-cash-bank-import',oldj.id,jsonb_build_object('source',legacy_key,'erpSource',key,'journalId',current_journal,'reversalId',rid),now());
   reversed:=reversed+1;
 END LOOP;
 RETURN jsonb_build_object('id',sid,'kind',kind,'source',key,'changed',changed,'reversed',reversed,'journalId',current_journal);
EXCEPTION WHEN OTHERS THEN
 RETURN jsonb_build_object('id',sid,'kind',kind,'source',key,'error',SQLERRM,'code',SQLSTATE);
END $$;
