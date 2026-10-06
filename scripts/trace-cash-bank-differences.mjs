import 'dotenv/config';import {Pool} from 'pg';import fs from 'node:fs';
const preview=JSON.parse(fs.readFileSync('legacy-cash-bank-preview.json','utf8'));
const pool=new Pool({connectionString:process.env.DATABASE_URL});const db=await pool.connect();const report={through:preview.through,companies:[]};
try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema))throw Error('schema');await db.query(`SET LOCAL search_path TO "${schema}"`);
for(const c of preview.companies){
 const ids=[c.accounts.cash.id,c.accounts.bank.id];const reused=[...new Set(c.reused.flatMap(r=>r.journalIds))];
 const sources=(await db.query(`SELECT s.source_key,s.distributor_id,d.name AS distributor,s.journal_id,j.reference_number,j.journal_date::text AS date,
 e.kind,e.mode,e.amount::text AS source_amount,e.description,
 l.account_id,a.name AS account,l.side::text,l.amount::text,
 p.payment_type::text,p.payment_no,p.expense_id,p.purchase_order_id,p.purchase_return_id,p.remarks,
 cr.money_transaction_id
 FROM accountant_v2_distributor_sources s JOIN distributors d ON d.id=s.distributor_id
 JOIN accountant_v2_manual_journals j ON j.id=s.journal_id AND j.company_id=s.company_id
 JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id AND l.company_id=j.company_id
 JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id
 LEFT JOIN accountant_v2_distributor_events e ON e.company_id=s.company_id AND e.distributor_id=s.distributor_id AND e.source_key=s.source_key
 LEFT JOIN distributor_payments p ON p.company_id=s.company_id AND s.source_key='payment:'||p.id
 LEFT JOIN distributor_credits cr ON cr.company_id=s.company_id AND s.source_key='credit:'||cr.id
 WHERE s.company_id=$1 AND l.account_id=ANY($2::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$3::timestamp ORDER BY j.journal_date,j.id`,[c.companyId,ids,preview.through])).rows;
 const unlinked=sources.filter(s=>!reused.includes(s.journal_id));
 const details=[];
 for(const s of unlinked){const id=s.source_key.slice(s.source_key.indexOf(':')+1);const related=[id,s.expense_id,s.money_transaction_id].filter(Boolean);
 const legacy=(await db.query(`SELECT id,account_type::text,account_id,source_type::text,source_id,direction::text,amount::text,entry_date::text,note FROM account_ledger_entries WHERE company_id=$1 AND source_id=ANY($2::text[]) ORDER BY entry_date`,[c.companyId,related])).rows;
 details.push({...s,legacy});}
 const conflicts=[];for(const conflict of c.conflicts.filter(x=>x.source)){
 const id=conflict.source.slice(conflict.source.indexOf(':')+1);
 const rows=(await db.query(`SELECT l.id,l.account_type::text,l.source_type::text,l.source_id,l.direction::text,l.amount::text,l.entry_date::text,l.note,p.payment_no,p.payment_type::text,p.expense_id,p.purchase_return_id,d.name AS distributor
 FROM account_ledger_entries l LEFT JOIN distributor_payments p ON p.company_id=l.company_id AND (p.id=l.source_id OR p.expense_id=l.source_id)
 LEFT JOIN distributors d ON d.id=p.distributor_id
 WHERE l.company_id=$1 AND (l.source_id=$2 OR l.source_id IN (SELECT id FROM distributor_payments WHERE company_id=$1 AND expense_id=$2) OR l.source_id IN(SELECT expense_id FROM distributor_payments WHERE company_id=$1 AND id=$2)) ORDER BY l.entry_date`,[c.companyId,id])).rows;
 conflicts.push({...conflict,rows});}
 const totals=(await db.query(`SELECT j.source_type,l.account_id,a.name AS account,sum(CASE l.side WHEN 'DEBIT' THEN l.amount ELSE -l.amount END)::text AS net,count(*) FROM accountant_v2_manual_journal_lines l JOIN accountant_v2_manual_journals j ON j.id=l.journal_id JOIN accountant_v2_accounting_accounts a ON a.id=l.account_id WHERE j.company_id=$1 AND l.account_id=ANY($2::text[]) AND j.status='PUBLISHED' AND j.deleted_at IS NULL AND l.deleted_at IS NULL AND j.journal_date<=$3::timestamp GROUP BY j.source_type,l.account_id,a.name`,[c.companyId,ids,preview.through])).rows;
 report.companies.push({company:c.company,companyId:c.companyId,unlinked:details,conflicts,totals});
}await db.query('ROLLBACK');fs.writeFileSync('cash-bank-difference-trace.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}finally{db.release();await pool.end();}

