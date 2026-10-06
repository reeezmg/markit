import {defineEventHandler,getQuery} from 'h3';
import {pool} from '~/server/db';
import {getReadCompanyIds} from '~/server/utils/organizationReadScope';
import {accountingReport,reportWindow} from '~/server/utils/report-accounting';
export default defineEventHandler(async event=>{
 const ids=await getReadCompanyIds(event),{from,to}=reportWindow(getQuery(event));
 return accountingReport(pool,ids,from,to);
});
