-- Attach the source B2B customer account to ERP journals without creating duplicate receivables.
CREATE OR REPLACE FUNCTION accountant_v2_erp_parties(c text, kind text, doc jsonb, previous jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb:='{}'; role text; ident text; label text;
BEGIN
 FOR role,ident IN SELECT * FROM (VALUES
   ('client',CASE WHEN kind='BILL' THEN doc->>'client_id' END),
   ('user',doc->>CASE WHEN kind='BILL' THEN 'user_id' ELSE 'from_id' END),
   ('creditUser',CASE WHEN kind='BILL' THEN doc->>'credit_user_id' END),
   ('creditAccount',CASE WHEN kind='BILL' THEN doc->>'account_id' END)
 ) AS links(role,ident) LOOP
   IF ident IS NULL OR ident='' THEN CONTINUE; END IF;
   -- Preserve the original label when the source still refers to the same person.
   IF previous->role->>'id'=ident THEN
     result:=result||jsonb_build_object(role,previous->role); CONTINUE;
   END IF;
   IF role='creditAccount' THEN
     SELECT name INTO label FROM accounts WHERE id=ident AND company_id=c;
   ELSIF role='client' THEN
     SELECT cl.name INTO label FROM company_clients cc JOIN clients cl ON cl.id=cc.client_id
       WHERE cc.company_id=c AND cc.client_id=ident;
   ELSE
     SELECT cu.name INTO label FROM company_users cu WHERE cu.company_id=c AND cu.user_id=ident;
   END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'ERP % does not belong to this company',role; END IF;
   result:=result||jsonb_build_object(role,jsonb_build_object('id',ident,'name',COALESCE(NULLIF(label,''),ident)));
 END LOOP;
 RETURN result;
END $$;


DO $$
DECLARE s record; party jsonb;
BEGIN
 FOR s IN SELECT x.company_id,x.source_key,x.journal_id,a.id,a.name
 FROM accountant_v2_erp_sources x JOIN bills b ON b.company_id=x.company_id AND x.source_key='bill:'||b.id
 JOIN accounts a ON a.id=b.account_id AND a.company_id=b.company_id WHERE x.journal_id IS NOT NULL LOOP
  party:=jsonb_build_object('creditAccount',jsonb_build_object('id',s.id,'name',s.name));
  UPDATE accountant_v2_erp_sources SET signature=jsonb_set(signature,'{parties}',COALESCE(signature->'parties','{}')||party)
    WHERE company_id=s.company_id AND source_key=s.source_key;
  UPDATE accountant_v2_manual_journal_lines SET source_parties=COALESCE(source_parties,'{}')||party
    WHERE company_id=s.company_id AND journal_id=s.journal_id;
 END LOOP;
END $$;
