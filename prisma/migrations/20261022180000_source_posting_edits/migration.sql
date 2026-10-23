-- Local preparation only. Do not apply without separate database authorization.
-- Contract is owned by AccountantManualJournal in schema.zmodel.
-- Patch the installed bodies instead of replacing them with older definitions:
-- native account selection, history baselines and purchase exclusions must survive.
DO $source_edits$
DECLARE spec record; definition text; original text; pointer text; reversal_pattern text;
 posting_pattern text; matches text[]; columns text[]; assignments text; statement text;
 target text; column_name text; signature regprocedure;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('accountant_v2_sync_erp(text,text,text,boolean)', 'prev.journal_id', 'erp-post', false),
  ('accountant_v2_sync_distributor(text,text)', 'prev.journal_id', 'posting', false),
  ('accountant_v2_sync_user(text,text)', 'prev.journal_id', 'user-post', false),
  ('accountant_v2_post_ecommerce(text,text,timestamp without time zone,jsonb,jsonb,jsonb)', 'prior.journal_id', 'ecommerce-post', true),
  ('accountant_v2_sync_unassigned_purchase(text,text)', 'prev->>''journalId''', 'source-po-post', true)
 ) AS functions(name, previous_journal, posting_suffix, optional)
 LOOP
  signature:=to_regprocedure(spec.name);
  IF signature IS NULL THEN
   IF spec.optional THEN CONTINUE; END IF;
   RAISE EXCEPTION 'Missing required source posting function %',spec.name;
  END IF;
  definition:=replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  IF strpos(definition,'source-posting-edits-v1')>0 THEN CONTINUE; END IF;
  original:=definition; pointer:=spec.previous_journal;

  -- Retain the old-date lock check preceding this block. Withdraw current lines
  -- before replacing them; soft deletion also handles deleted/zero sources.
  reversal_pattern:='rid:=''c''\|\|substr\(md5\([^;]+?;(.|\n)*?(?=\n[ ]*END IF;)';
  IF (SELECT count(*) FROM regexp_matches(definition,reversal_pattern,'g'))<>1 THEN
   RAISE EXCEPTION 'Unknown reversal body in %, refusing partial update',spec.name;
  END IF;
  definition:=regexp_replace(definition,reversal_pattern,
   'IF oldj.id IS NULL OR oldj.company_id IS DISTINCT FROM c THEN
      RAISE EXCEPTION ''Missing or foreign current source journal'';
    END IF;
    UPDATE accountant_v2_manual_journals SET deleted_at=now(),updated_at=now()
      WHERE company_id=c AND id=oldj.id;
    UPDATE accountant_v2_manual_journal_lines SET deleted_at=now(),updated_at=now()
      WHERE company_id=c AND journal_id=oldj.id;');

  -- Keep a pointer even when withdrawing a source, so restoring it reuses the
  -- same journal rather than allocating another journal/number.
  posting_pattern:='jid:=''c''\|\|substr\(md5\([^;]+?:'||spec.posting_suffix||'''\),1,24\);';
  IF (SELECT count(*) FROM regexp_matches(definition,posting_pattern,'g'))<>1 THEN
   RAISE EXCEPTION 'Unknown posting identity in %',spec.name;
  END IF;
  statement:=substring(definition FROM posting_pattern);
  definition:=replace(definition,statement,
    'jid:=COALESCE('||pointer||','||substr(statement,6,length(statement)-6)||');');
  -- The branch below follows the prior-journal block, not the earlier validation.
  posting_pattern:='(WHERE company_id=c AND journal_id=oldj.id;\n[ ]*END IF;)\n[ ]*(jid:=NULL;\n[ ]*)?';
  IF (SELECT count(*) FROM regexp_matches(definition,posting_pattern,'g'))<>1 THEN
   RAISE EXCEPTION 'Unknown source withdrawal branch in %',spec.name;
  END IF;
  definition:=regexp_replace(definition,posting_pattern,
    '\1'||E'\n '||'jid:='||pointer||';'||E'\n ');

  -- Reuse header and line IDs, restoring them on conflict. Match only the two
  -- posting INSERTs left after removing the automatic reversal block.
  FOREACH target IN ARRAY ARRAY['accountant_v2_manual_journals','accountant_v2_manual_journal_lines'] LOOP
   posting_pattern:='INSERT INTO '||target||'\(([^)]+?)\)\n[ ]*VALUES\((.|\n)*?;';
   IF (SELECT count(*) FROM regexp_matches(definition,posting_pattern,'g'))<>1 THEN
    RAISE EXCEPTION 'Unknown % insert in %',target,spec.name;
   END IF;
   matches:=regexp_match(definition,posting_pattern);
   statement:=substring(definition FROM '('||posting_pattern||')');
   columns:=string_to_array(matches[1],','); assignments:='';
   FOREACH column_name IN ARRAY columns LOOP
    column_name:=trim(column_name);
    IF column_name IN ('id','company_id','created_at','created_by_id','published_at','entry_number','journal_id') THEN CONTINUE; END IF;
    IF assignments<>'' THEN assignments:=assignments||','; END IF;
    assignments:=assignments||column_name||'=EXCLUDED.'||column_name;
   END LOOP;
   definition:=replace(definition,statement,left(statement,length(statement)-1)||
    ' ON CONFLICT(id) DO UPDATE SET '||assignments||',deleted_at=NULL'||
    ' WHERE '||target||'.company_id=EXCLUDED.company_id;');
  END LOOP;
  IF definition ~ '''(ERP_REVERSAL|DISTRIBUTOR_REVERSAL|USER_REVERSAL|ECOMMERCE_REVERSAL|PURCHASE_ORDER_SOURCE_REVERSAL)''' THEN
   RAISE EXCEPTION 'Automatic reversal remains in %',spec.name;
  END IF;
  -- Notes/currency changes must also refresh an ERP posting, even if amounts
  -- and account mappings did not change. Other sources already sign these fields.
  IF spec.posting_suffix='erp-post' THEN
   IF strpos(definition,'IF prev.signature=sig THEN RETURN 0; END IF;')=0 THEN
    RAISE EXCEPTION 'Unknown ERP idempotency guard';
   END IF;
   definition:=replace(definition,'IF prev.signature=sig THEN RETURN 0; END IF;',
    'sig:=sig||jsonb_build_object(''sourceNote'',COALESCE(doc->>''notes'',doc->>''note'',''''),''sourceCurrency'',COALESCE(doc->>''currency'',''INR''));
     IF prev.signature=sig THEN RETURN 0; END IF;');
  END IF;
  -- Do not add a new audit flow. Existing source/projection metadata is retained.
  definition:=replace(definition,E'\nBEGIN\n',E'\n-- source-posting-edits-v1\nBEGIN\n');
  IF definition=original OR strpos(definition,'source-posting-edits-v1')=0 THEN
   RAISE EXCEPTION 'Source posting update did not apply to %',spec.name;
  END IF;
  EXECUTE definition;
 END LOOP;
END $source_edits$;
