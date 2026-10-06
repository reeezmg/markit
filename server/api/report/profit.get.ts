import {defineEventHandler,getQuery} from 'h3';
import {pool} from '~/server/db';
import {getReadCompanyIds} from '~/server/utils/organizationReadScope';
import {reportWindow} from '~/server/utils/report-accounting';
import {profitReport} from '~/server/utils/report-profit';
export default defineEventHandler(async event=>{
 const session=await useAuthSession(event),ids=await getReadCompanyIds(event),{from,to}=reportWindow(getQuery(event));
 return profitReport(pool,ids,from,to,session.data.cleanup??false);
});
