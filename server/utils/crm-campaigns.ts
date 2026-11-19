import type { H3Event } from 'h3'
import { crmRequireManager, crmError, type CrmActor } from './crm-access'
import { crmTableReady } from './crm'
import { pool } from '../db'

export async function crmCampaigns(event:H3Event,actor:CrmActor,path:string[]){
  crmRequireManager(actor)
  for(const table of ['ecomm_marketing_campaigns','ecomm_marketing_automations','ecomm_marketing_jobs','ecomm_marketing_audit'])if(!await crmTableReady(pool,table))throw crmError('Email marketing database setup is pending.',503)
  // Set only after company access, current membership, manager role and origin checks.
  // Existing writers retain their recipient consent and delivery rules.
  event.context.crmActor=actor
  event.context.params={...event.context.params,id:path[1]}
  if(!path[1]&&event.method==='GET')return (await import('../api/ecommerce-cms/marketing/index.get')).default(event)
  if(!path[1]&&event.method==='POST')return (await import('../api/ecommerce-cms/marketing/campaigns.post')).default(event)
  if(path[1]==='automations'&&event.method==='PUT')return (await import('../api/ecommerce-cms/marketing/automations.put')).default(event)
  if(path[1]&&path[2]==='queue'&&event.method==='POST')return (await import('../api/ecommerce-cms/marketing/campaigns/[id]/queue.post')).default(event)
  if(path[1]&&path[2]==='cancel'&&event.method==='POST')return (await import('../api/ecommerce-cms/marketing/campaigns/[id]/cancel.post')).default(event)
  throw crmError('Campaign action not found.',404)
}
