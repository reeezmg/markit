-- Payroll cuts are cumulative: a new cut on an older cycle is new activity.
DO $$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('accountant_v2_sync_user(text,text)'::regprocedure);
 definition:=replace(definition,
  'IF prev.signature->>''excluded''=''true'' THEN RETURN 0; END IF;',
  'IF prev.signature->>''excluded''=''true'' AND NOT (prev.signature ? ''baselineAmount'') THEN RETURN 0; END IF;');
 definition:=replace(definition,
  'IF doc.direction<>''CREDIT'' THEN RAISE EXCEPTION ''Invalid payroll credit settlement''; END IF;',
  'IF doc.direction<>''CREDIT'' THEN RAISE EXCEPTION ''Invalid payroll credit settlement''; END IF;
   amount:=GREATEST(amount-COALESCE((prev.signature->>''baselineAmount'')::numeric,0),0);');
 definition:=replace(definition,
  'sig:=jsonb_build_object(''date'',d',
  'SELECT COALESCE(jsonb_agg(value),''[]'') INTO lines FROM jsonb_array_elements(lines) WHERE (value->>''amount'')::numeric<>0;
   sig:=jsonb_build_object(''date'',d');
 definition:=replace(definition,
  'IF prev.signature=sig THEN RETURN 0; END IF;',
  'IF prev.signature ? ''baselineAmount'' THEN sig:=sig||jsonb_build_object(''baselineAmount'',prev.signature->''baselineAmount'',''excluded'',true); END IF;
   IF prev.signature=sig THEN RETURN 0; END IF;');
 EXECUTE definition;
END $$;
