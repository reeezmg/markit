import { randomUUID } from 'node:crypto'
import { readCrmSettings, type CrmDb } from './crm'

/** Internal alerts only. Caller owns the company transaction and advisory lock. */
export async function processCrmReminders(db:CrmDb,company:string){
  const {settings}=await readCrmSettings(db,company)
  if(!settings.automations.taskReminders)return {notified:0}
  const due=(await db.query(`SELECT a.id,a.subject,a.owner_id,a.contact_id,a.deal_id FROM crm_activities a
    JOIN company_users cu ON cu.company_id=a.company_id AND cu.user_id=a.owner_id AND cu.status=true AND cu.deleted=false AND cu.role::text IN('admin','manager','user','biller','accountant')
    WHERE a.company_id=$1 AND a.status='OPEN' AND a.archived=false AND a.kind<>'NOTE' AND a.due_at<=now()+interval '1 hour'
    AND a.reminded_at IS NULL ORDER BY a.due_at,a.id LIMIT 100 FOR UPDATE OF a SKIP LOCKED`,[company])).rows
  for(const activity of due){
    await db.query(`INSERT INTO notifications(id,"companyId",type,title,message,"actionPath",metadata,"updatedAt")
      VALUES($1,$2,'SYSTEM_ALERT','CRM follow-up due',$3,'/crm/activities',$4::jsonb,now())`,[randomUUID(),company,activity.subject,JSON.stringify({crmActivityId:activity.id,ownerId:activity.owner_id})])
    await db.query('UPDATE crm_activities SET reminded_at=now() WHERE company_id=$1 AND id=$2',[company,activity.id])
  }
  return {notified:due.length}
}
