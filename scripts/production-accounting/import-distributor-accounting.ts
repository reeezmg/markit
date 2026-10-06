import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
dotenv.config({quiet:true});
const { prisma }=await import('../../server/prisma');
const {runAccountant,context,accountantPrisma}=await import('../../server/utils/accountant/context');
const {distributorAccountingPreview,configureDistributorAccounting,importDistributorAccounting}=await import('../../server/utils/accountant/distributors');
const apply=process.argv.includes('--apply');
const companyIds=process.argv.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10));
if(!companyIds.length) throw new Error('Supply explicit --company=<id> arguments; no implicit all-company writes');
const report:any[]=[];
class PreviewRollback extends Error {
  constructor(readonly result: any) { super('Rollback dry-run changes'); }
}
try {
  for(const companyId of companyIds) {
    const company=await prisma.company.findUniqueOrThrow({where:{id:companyId},select:{name:true,bankName:true,accountNo:true,ifsc:true,accHolderName:true,upiId:true}});
    const suppliers=await prisma.distributorCompany.findMany({where:{companyId},select:{distributorId:true}});
    for(const s of suppliers) {
      const result=await runAccountant({companyId,userId:'distributor-history-import',role:'admin'},async()=> {
        let p=await distributorAccountingPreview(s.distributorId);
        const before={legacyBalance:p.legacyBalance,postedBalance:p.postedBalance};
        const reconstructedPurchases=p.events.filter((e:any)=>e.description==='Paid purchase (legacy purchase side missing)')
          .map((e:any)=>({sourceKey:e.source_key,reference:e.reference,date:e.event_date,amount:Number(e.amount)}));
        const missingJournals=p.events.filter((e:any)=>!p.sources.some((source:any)=>source.source_key===e.source_key))
          .map((e:any)=>({sourceKey:e.source_key,kind:e.kind,amount:Number(e.amount)}));
        const mappings:Record<string,string>={...p.mappings};
        // Explicit migration policy: existing standard GL accounts; never copy bank/cash opening balances.
        for(const [role,code] of Object.entries({payable:'2100',stock:'1200',cash:'1001',tax:'1210',opening:'2220'})) {
          if(!mappings[role]) {
            const a=p.accounts.find((a:any)=>a.code===code);
            if(!a) throw new Error(`Missing active standard account ${code} in ${company.name}`);
            mappings[role]=a.id;
          }
        }
        for(const role of ['bank',...p.banks.map((b:any)=>`bank:${b.id}`)]) {
          if(mappings[role]) continue;
          const name=role==='bank'?'Primary Bank':`${p.banks.find((b:any)=>role===`bank:${b.id}`)!.name} (${role.slice(-6)})`;
          let bank=p.accounts.find((a:any)=>a.accountType==='BANK'&&(a.name===name || (role==='bank' ? a.isPrimary || a.name==='Distributor payments - primary bank' : a.name===`Distributor bank - ${name}`)));
          if(apply&&!bank) bank=await accountantPrisma.accountingAccount.create({data:{name,accountType:'BANK',category:'ASSET',
            ...(role==='bank'?{bankName:company.bankName,accountNumber:company.accountNo,routingNumber:company.ifsc}:{}),
            description:role==='bank'?[company.accHolderName && `Account holder: ${company.accHolderName}`,company.upiId && `UPI: ${company.upiId}`,'Linked to company primary bank; no opening balance imported.'].filter(Boolean).join('\n'):'Mapped from legacy distributor transactions; no bank opening balance imported.'}});
          mappings[role]=bank?.id || `CREATE: ${name}`;
        }
        let changed=0;
        if(apply) {
          await configureDistributorAccounting(s.distributorId,mappings);
          p=await importDistributorAccounting(s.distributorId);changed=p.changed;
          const [repeat]=await context().db.$queryRawUnsafe<any[]>('SELECT accountant_v2_sync_distributor($1,$2) AS changed',companyId,s.distributorId);
          if(Number(repeat.changed)!==0) throw new Error('Import is not repeatable; supplier transaction rolled back');
          const unbalanced=await context().db.$queryRawUnsafe<any[]>(`SELECT j.id FROM accountant_v2_manual_journals j
            JOIN accountant_v2_manual_journal_lines l ON l.journal_id=j.id
            WHERE j.company_id=$1 AND j.source_type IN ('DISTRIBUTOR','DISTRIBUTOR_REVERSAL')
            AND EXISTS(SELECT 1 FROM accountant_v2_manual_journal_lines supplier_line WHERE supplier_line.journal_id=j.id AND supplier_line.distributor_id=$2)
            GROUP BY j.id HAVING sum(CASE WHEN l.side='DEBIT' THEN l.amount ELSE -l.amount END)<>0`,companyId,s.distributorId);
          if(unbalanced.length) throw new Error('Unbalanced distributor journals; supplier transaction rolled back');
        }
        const result={company:company.name,companyId,distributor:p.distributor.name,distributorId:s.distributorId,
          before,missingJournals,reconstructedPurchases,
          sources:p.events.length,changed,legacyBalance:p.legacyBalance,expectedBalance:p.expectedBalance,
          postedBalance:p.postedBalance,legacyDifference:p.legacyDifference,errors:p.errors,warnings:p.warnings,
          mappings:Object.fromEntries(Object.entries(mappings).map(([role,id])=>[role,p.accounts.find((a:any)=>a.id===id)?.name || id]))};
        if(!apply) throw new PreviewRollback(result);
        return result;
      }).catch(error=>{if(error instanceof PreviewRollback)return error.result;throw error;});
      report.push(result);
    }
  }
  writeFileSync(process.argv.find(a=>a.startsWith('--report='))?.slice(9) || `distributor-accounting-${apply?'import':'preview'}.json`,JSON.stringify({applied:apply,at:new Date().toISOString(),report},null,2));
  console.log(JSON.stringify({applied:apply,suppliers:report.length,sources:report.reduce((s,r)=>s+r.sources,0),changed:report.reduce((s,r)=>s+r.changed,0),differences:report.filter(r=>r.legacyDifference).map(r=>({company:r.company,distributor:r.distributor,difference:r.legacyDifference})),errors:report.flatMap(r=>r.errors)},null,2));
} finally {await prisma.$disconnect();}
