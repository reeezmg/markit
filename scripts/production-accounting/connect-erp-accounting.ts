import dotenv from 'dotenv';
import {writeFileSync} from 'node:fs';
dotenv.config({quiet:true});
const ids=[...new Set(process.argv.filter(a=>a.startsWith('--company=')).map(a=>a.slice(10)))];
if(!ids.length)throw new Error('Supply explicit --company=<id> arguments');
const apply=process.argv.includes('--apply');
const {prisma}=await import('../../server/prisma');
const {runAccountant}=await import('../../server/utils/accountant/context');
const {erpAccountingSettings,enableErpAccounting}=await import('../../server/utils/accountant/erp');
class Preview extends Error {constructor(readonly result:any){super('Preview rollback');}}
const report=[];
try {
 for(const companyId of ids){
  const company=await prisma.company.findUniqueOrThrow({where:{id:companyId},select:{name:true}});
  const result=await runAccountant({companyId,userId:'erp-accounting-setup',role:'admin'},async()=>{
   const state=apply?await enableErpAccounting():await erpAccountingSettings();
   const result={companyId,company:company.name,enabled:state.enabled,mappings:state.mappings};
   if(!apply)throw new Preview(result);
   return result;
  }).catch(e=>{if(e instanceof Preview)return e.result;throw e;});
  report.push(result);
 }
 writeFileSync(process.argv.find(a=>a.startsWith('--report='))?.slice(9) || `erp-accounting-${apply?'connection':'preview'}.json`,JSON.stringify({applied:apply,historyImported:false,report},null,2));
 console.log(JSON.stringify({applied:apply,companies:report.map(r=>r.company),historyImported:false}));
}finally{await prisma.$disconnect();}
