import { createError, getHeader, getQuery, getRequestURL, setHeader, type H3Event } from 'h3'
import { pool } from '../db'
import { assertCompanyAccess } from './companyRequestScope'
import { crmManager, crmStaff } from '../../utils/crm'

export type CrmActor={companyId:string;userId:string;role:string;manager:boolean}
export async function crmActor(event:H3Event):Promise<CrmActor>{
  const session=await requireAuthSession(event)
  const member=(await pool.query(`SELECT role FROM company_users WHERE company_id=$1 AND user_id=$2 AND status=true AND deleted=false`,[session.data.companyId,session.data.id])).rows[0]
  if(!member||!crmStaff(member.role))throw createError({statusCode:403,statusMessage:'Active company staff access is required for CRM.'})
  const companyId=getHeader(event,'x-company-id')||getQuery(event).companyId||session.data.companyId
  if(typeof companyId!=='string')throw createError({statusCode:400,statusMessage:'Select one CRM company.'})
  await assertCompanyAccess(event,companyId)
  if(event.method!=='GET'&&getHeader(event,'origin')!==getRequestURL(event).origin)throw createError({statusCode:403,statusMessage:'Open CRM from this Markit site before saving.'})
  setHeader(event,'Cache-Control','no-store')
  return {companyId,userId:session.data.id,role:member.role,manager:crmManager(member.role)}
}
export function crmRequireManager(actor:CrmActor){if(!actor.manager)throw createError({statusCode:403,statusMessage:'A company administrator or manager is required.'})}
export function crmCanEdit(actor:CrmActor,row:any){return actor.manager||row.owner_id===actor.userId||row.created_by===actor.userId}
export const crmError=(message:string,statusCode=400)=>createError({statusCode,statusMessage:message.replace(/[\r\n]/g,' ')})
export const crmInput=<T>(work:()=>T):T=>{try{return work()}catch(error:any){throw crmError(error.message)}}
