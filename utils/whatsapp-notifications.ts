export const notificationEvents = [
  ['quote_shared','Quote ready','Sales'],['sale_created','Sale / invoice saved','Sales'],
  ['order_confirmed','Order confirmed','Orders'],['order_dispatched','Order dispatched','Orders'],
  ['order_delivered','Order delivered','Orders'],['order_cancelled','Order cancelled','Orders'],['delivery_failed','Delivery attempt failed','Orders'],
  ['coverage_activated','Coverage activated','After-sales'],['installation_booked','Installation appointment','After-sales'],
  ['installation_completed','Installation completed','After-sales'],['maintenance_due','Maintenance reminder','After-sales'],
  ['appointment_booked','Service appointment / reschedule','After-sales'],['appointment_reminder','Appointment reminder','After-sales'],
  ['appointment_cancelled','Appointment cancelled','After-sales'],['claim_registered','Claim received','After-sales'],
  ['claim_decision','Claim decision','After-sales'],['repair_updated','Repair progress','After-sales'],
  ['service_completed','Service completed','After-sales'],['service_invoice','Service invoice issued','After-sales'],
  ['payment_due','Payment due / overdue','Payments'],['payment_received','Payment received','Payments'],
  ['payment_reversed','Payment reversed','Payments'],['return_completed','Return completed','After-sales'],
  ['replacement_completed','Replacement completed','After-sales'],['coverage_expiring','Coverage expiry reminder','After-sales'],
  ['feedback','Service feedback request','Follow-up'],
] as const
export type NotificationEvent = typeof notificationEvents[number][0]
export type NotificationRule = { enabled:boolean; templateId:string }
export type NotificationRules = Record<NotificationEvent,NotificationRule>
export const marketingEvent = (event:string) => event==='feedback'
export const eventLabel = (event:string) => notificationEvents.find(e=>e[0]===event)?.[1] || event
export function normalizeNotificationRules(input:any):NotificationRules {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter notification rules.')
  return Object.fromEntries(notificationEvents.map(([key])=>{
    const r=input[key]||{enabled:true,templateId:''}
    if(typeof r.enabled!=='boolean'||typeof r.templateId!=='string'||(r.templateId&&!/^\d{1,40}$/.test(r.templateId)))throw Error('Choose a valid template for '+eventLabel(key))
    return [key,{enabled:r.enabled,templateId:r.templateId}]
  })) as NotificationRules
}
export type NotificationFact={type:string;id:string;clientId:string;createdAt:string;valid:boolean;state:Record<string,any>;fields:Record<string,string>}
export type PlannedNotification={type:NotificationEvent;key:string;sourceType:string;sourceId:string;clientId:string;guard:Record<string,any>;availableAt:string;expiresAt:string}
const dayMs=86400000
export const notificationDay=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
const morning=(date:string)=>Date.parse(date+'T09:00:00+05:30')
export function planNotifications(f:NotificationFact,old:NotificationFact|undefined,now:Date,activatedAt:string):PlannedNotification[]{
  if(!f.valid||!f.clientId)return []
  const s=f.state,previous=old?.state||{},fresh=!old&&Date.parse(f.createdAt)>=Date.parse(activatedAt),events:PlannedNotification[]=[]
  const changed=(...keys:string[])=>!!old&&keys.some(k=>JSON.stringify(s[k])!==JSON.stringify(previous[k]))
  function emit(type:NotificationEvent,stamp:string,guard:Record<string,any>={},at=+now,expiry=at+2*dayMs){
    if(expiry<=+now)return
    events.push({type,key:[type,f.type,f.id,f.clientId,stamp].join(':'),sourceType:f.type,sourceId:f.id,clientId:f.clientId,guard,availableAt:new Date(at).toISOString(),expiresAt:new Date(expiry).toISOString()})
  }
  if(f.type==='bill'){
    if(fresh&&!s.orderId)emit(s.total<0?'return_completed':s.serviceJobId?'service_invoice':'sale_created','created')
    if(s.balance>0&&s.dueDate)for(const lead of [3,0,-7])emit('payment_due',s.dueDate+':'+lead,{dueDate:s.dueDate},morning(s.dueDate)-lead*dayMs)
    if(old&&s.paid&&previous.paid===false&&!s.hasReceipts)emit('payment_received','paid:'+s.updatedAt,{paid:true})
  }
  if(f.type==='payment'&&(fresh||changed('status'))){
    if(s.status==='POS_CREDIT_RECEIPT')emit('payment_received','received',{status:s.status})
    if(s.status==='POS_CREDIT_REVERSED')emit('payment_reversed','reversed',{status:s.status})
  }
  if(f.type==='quote'&&s.status==='SENT'&&(fresh||changed('status','revision')))emit('quote_shared',s.revision,{revision:s.revision,status:s.status})
  if(f.type==='order'&&(fresh||changed('status','awb'))){
    const event:Record<string,NotificationEvent>={PLACED:'order_confirmed',CONFIRMED:'order_confirmed',SHIPPED:'order_dispatched',DISPATCHED:'order_dispatched',IN_TRANSIT:'order_dispatched',OUT_FOR_DELIVERY:'order_dispatched',DELIVERED:'order_delivered',CANCELLED:'order_cancelled',CANCELED:'order_cancelled',NDR:'delivery_failed',UNDELIVERED:'delivery_failed',DELIVERY_FAILED:'delivery_failed',RETURNED:'return_completed',RTO_DELIVERED:'return_completed'}
    if(event[s.status])emit(event[s.status],s.status+':'+(s.awb||''),{status:s.status,awb:s.awb})
  }
  if(f.type==='order'&&s.paid&&(fresh||changed('paid')))emit('payment_received','paid',{paid:true})
  if(f.type==='unit'){
    const currentCoverage:any[]=s.coverageVersion?JSON.parse(s.coverageVersion):[],previousCoverage:any[]=previous.coverageVersion?JSON.parse(previous.coverageVersion):[]
    const addedCoverage=currentCoverage.some(a=>!previousCoverage.some(b=>JSON.stringify(a)===JSON.stringify(b)))
    if(s.status==='ACTIVE'&&addedCoverage&&(fresh||changed('coverageVersion')))emit('coverage_activated',s.coverageVersion,{status:s.status,coverageVersion:s.coverageVersion})
    if(s.installedOn&&(fresh||changed('installedOn')))emit('installation_completed',s.installedOn,{installedOn:s.installedOn,status:s.status})
    if((fresh||changed('status'))&&['RETURNED','REPLACED'].includes(s.status))emit(s.status==='RETURNED'?'return_completed':'replacement_completed',s.status,{status:s.status})
  }
  if(f.type==='agreement'){
    if(s.endsOn&&s.productStatus==='ACTIVE'&&['ACTIVE','EXPIRED'].includes(s.status))for(const lead of [30,7,0])emit('coverage_expiring',s.endsOn+':'+lead,{endsOn:s.endsOn,productId:s.productId},morning(s.endsOn)-lead*dayMs)
  }
  if(f.type==='occurrence'&&s.status==='DUE'&&s.productStatus==='ACTIVE'&&['ACTIVE','COMPLETED'].includes(s.agreementStatus))for(const lead of [7,0,-7])emit('maintenance_due',s.dueOn+':'+lead,{dueOn:s.dueOn,productId:s.productId},morning(s.dueOn)-lead*dayMs)
  if(f.type==='job'){
    if(s.kind==='CLAIM'&&(fresh||changed('status'))){
      if(s.status==='OPEN')emit('claim_registered','registered',{status:s.status})
      if(['APPROVED','REJECTED'].includes(s.status))emit('claim_decision',s.status,{status:s.status})
    }
    if(s.status==='IN_PROGRESS'&&(fresh||changed('status')))emit('repair_updated',s.status,{status:s.status})
    if(old&&s.status==='IN_PROGRESS'&&!changed('status')&&changed('assessment','resolution'))emit('repair_updated',s.updatedAt,{status:s.status,assessment:s.assessment,resolution:s.resolution})
    if(s.appointmentOn&&['OPEN','SCHEDULED','APPROVED','IN_PROGRESS'].includes(s.status)){
      if(fresh||changed('appointmentOn','assignedTo'))emit('appointment_booked',s.appointmentOn+':'+s.assignedTo,{appointmentOn:s.appointmentOn,assignedTo:s.assignedTo})
      emit('appointment_reminder',s.appointmentOn,{appointmentOn:s.appointmentOn},Date.parse(s.appointmentOn)-dayMs,Date.parse(s.appointmentOn))
    }
    if(s.status==='CANCELLED'&&old&&previous.status!=='CANCELLED'&&previous.appointmentOn)emit('appointment_cancelled',s.updatedAt,{status:s.status})
    if(['COMPLETED','RESOLVED'].includes(s.status)){
      if(fresh||changed('status')){
        emit('service_completed',s.status,{status:s.status})
        if(s.completedOn)emit('feedback',s.completedOn,{status:s.status},morning(s.completedOn)+dayMs,morning(s.completedOn)+7*dayMs)
      }
    }
  }
  if(f.type==='installation'){
    if(s.status==='SCHEDULED'&&!s.installedOn&&s.productStatus==='ACTIVE'){
      if(fresh||changed('appointmentOn','technician','status'))emit('installation_booked',s.appointmentOn+':'+s.technician,{appointmentOn:s.appointmentOn,technician:s.technician,status:s.status})
      emit('appointment_reminder',s.appointmentOn,{appointmentOn:s.appointmentOn,status:s.status},Date.parse(s.appointmentOn)-dayMs,Date.parse(s.appointmentOn))
    }
    if(s.status==='CANCELLED'&&old&&previous.status!=='CANCELLED')emit('appointment_cancelled',s.updatedAt,{status:s.status})
  }
  return events
}
export function notificationStillRelevant(event:PlannedNotification,f:NotificationFact|undefined,now:Date){
  if(!f?.valid||f.clientId!==event.clientId||Date.parse(event.expiresAt)<=+now)return false
  const s=f.state
  if(f.type==='job'&&s.productStatus&&s.productStatus!=='ACTIVE'&&event.type!=='appointment_cancelled')return false
  if(Object.entries(event.guard).some(([k,v])=>JSON.stringify(s[k])!==JSON.stringify(v)))return false
  if(event.type==='payment_due')return s.balance>0
  if(event.type==='quote_shared')return ['DRAFT','SENT'].includes(s.status)&&(!s.expiresOn||s.expiresOn>=notificationDay(now))
  if(event.type==='maintenance_due')return s.status==='DUE'&&s.productStatus==='ACTIVE'&&['ACTIVE','COMPLETED'].includes(s.agreementStatus)
  if(event.type==='coverage_activated')return s.status==='ACTIVE'&&!!s.coverageVersion
  if(event.type==='coverage_expiring')return s.productStatus==='ACTIVE'&&['ACTIVE','EXPIRED'].includes(s.status)
  if(['appointment_booked','appointment_reminder','installation_booked'].includes(event.type))return ['OPEN','SCHEDULED','APPROVED','IN_PROGRESS'].includes(s.status)&&(!s.productStatus||s.productStatus==='ACTIVE')&&!s.installedOn&&Date.parse(s.appointmentOn)>+now
  return true
}
