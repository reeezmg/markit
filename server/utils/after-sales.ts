import { randomUUID, createHash } from 'node:crypto'
import { normalizeServiceConfiguration, serviceDay, serviceToday, serviceText, serviceMoney, validateServiceValues, nextServiceDue, addServiceDate, serviceActivation } from '../../utils/after-sales'
import { activateServiceAgreements, serviceError, serviceAudit, cancelCustomerProducts, afterSalesAvailable } from './after-sales-lifecycle'
import { normalizeServiceLines, serviceInvoiceItems } from '../../utils/service-items'
import { ensureServiceChargeCategory } from './after-sales-charge-category'
import { nextCustomerProductReference } from './customer-product-numbering'
import { validateServiceParts } from './after-sales-catalog'

export function serviceInput<T>(read: () => T): T { try { return read() } catch (e: any) { throw serviceError(e.message, 400) } }
export async function serviceStaffList(db: any, companyId: string) {
  return (await db.query(`SELECT cu.user_id AS id,COALESCE(NULLIF(BTRIM(cu.name),''),u.email) AS name
    FROM company_users cu JOIN users u ON u.id=cu.user_id
    WHERE cu.company_id=$1 AND cu.status=true AND cu.deleted=false AND u.cleanup=false
    ORDER BY name,cu.user_id`, [companyId])).rows
}
const fingerprint = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
// Carry-forward replacements retain the evidence on the original physical unit.
// Follow only recorded carry-forward links; a restart begins a separate history.
const serviceUnitHistory = `WITH RECURSIVE service_units AS (
  SELECT id FROM customer_products WHERE id=$1 AND company_id=$2
  UNION
  SELECT p.id FROM customer_products p JOIN service_units target ON p.replaced_by_id=target.id
  WHERE p.company_id=$2 AND EXISTS(SELECT 1 FROM service_audit audit
    WHERE audit.company_id=$2 AND audit.resource_id=p.id AND audit.action='REPLACE'
    AND audit.after->>'replacementId'=target.id AND audit.after->>'restart' IS DISTINCT FROM 'true')
)`
export async function configurationList(db: any, companyId: string, query: any) {
  const rows=(await db.query(`SELECT * FROM service_configurations WHERE company_id=$1 AND ($2='' OR kind=$2)
    AND ($3 OR NOT archived) AND name ILIKE $4 ORDER BY name,id LIMIT 500`, [companyId, String(query.kind || ''), query.includeArchived === 'true', '%' + String(query.q || '').slice(0, 200) + '%'])).rows
  const ids=String(query.includeIds||'').split(',').filter(Boolean).slice(0,100)
  if(!ids.length)return rows
  const selected=(await db.query('SELECT * FROM service_configurations WHERE company_id=$1 AND id=ANY($2::text[])',[companyId,ids])).rows
  return [...new Map([...rows,...selected].map((row:any)=>[row.id,row])).values()]
}
async function amendmentPreview(db: any, companyId: string, body: any) {
  const input = serviceInput(() => normalizeServiceConfiguration(body))
  const config = (await db.query('SELECT * FROM service_configurations WHERE id=$1 AND company_id=$2', [body.id, companyId])).rows[0]
  if (!config) throw serviceError('Configuration not found.', 404)
  if (config.kind !== input.kind || config.revision !== body.revision) throw serviceError('Configuration changed. Reload before saving.')
  const rows = (await db.query(`SELECT a.*,a.starts_on::text,a.ends_on::text,a.next_due::text,a.last_completed_on::text,p.purchased_on::text,p.delivered_on::text,p.installed_on::text,p.order_id,p.reference,p.client_id,p.name AS product_name,c.name AS customer_name,
    (SELECT count(*)::int FROM service_jobs j WHERE j.agreement_id=a.id AND j.company_id=a.company_id AND j.status IN('SCHEDULED','IN_PROGRESS')) AS booked_visits
    FROM customer_service_agreements a JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id
    JOIN clients c ON c.id=p.client_id WHERE a.configuration_id=$1 AND a.company_id=$2 AND a.status IN('ACTIVE','PENDING')
    ORDER BY a.id LIMIT 10001`, [body.id, companyId])).rows
  if (rows.length > 10000) throw serviceError('Amend agreements in smaller groups.')
  const agreements = rows.map((a: any) => {
    const starts=serviceActivation(input.rules,a)
    return {...a, proposedStartsOn:starts,
      proposedNextDue:a.kind==='MAINTENANCE'&&starts?nextServiceDue(input.rules,starts,serviceToday(),a.last_completed_on):null,
      proposedEndsOn:starts?(a.kind==='MAINTENANCE'?input.rules.endDate||null:addServiceDate(starts,input.rules.duration,input.rules.durationUnit)):null}
  })
  const token = fingerprint({ input, configRevision: config.revision, agreements: rows })
  return { config, input, agreements, token }
}
export async function previewConfiguration(db: any, companyId: string, body: any) {
  const { config, input, agreements, token } = await amendmentPreview(db, companyId, body)
  return { before: { name: config.name, rules: config.rules }, after: input, agreements, token }
}
export async function saveConfiguration(db: any, companyId: string, actor: string, body: any) {
  const input = serviceInput(() => normalizeServiceConfiguration(body))
  const id = body.id || randomUUID()
  const old = body.id ? (await db.query('SELECT * FROM service_configurations WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, companyId])).rows[0] : null
  if (body.id && !old) throw serviceError('Configuration not found.', 404)
  if (old && (!['FUTURE', 'SELECTED'].includes(body.applyTo) || body.revision !== old.revision || old.kind !== input.kind)) throw serviceError('Reload the configuration and choose whether to update existing agreements.')
  const reason = old ? serviceInput(() => serviceText(body.reason, 'Change reason', 2000, true)) : 'Configuration created'
  let selected: any[] = []
  if (old && body.applyTo === 'SELECTED') {
    const preview = await amendmentPreview(db, companyId, body)
    if (preview.token !== body.previewToken) throw serviceError('The affected agreements changed. Preview again before applying.')
    if (!Array.isArray(body.agreementIds) || !body.agreementIds.length || body.agreementIds.some((v: any) => typeof v !== 'string')) throw serviceError('Select existing agreements to amend.', 400)
    selected = preview.agreements.filter((a: any) => body.agreementIds.includes(a.id))
    if (selected.length !== new Set(body.agreementIds).size) throw serviceError('Selected agreements do not belong to this configuration.', 400)
  }
  const revision = old ? old.revision + 1 : 1
  const snapshot = { name: input.name, kind: input.kind, rules: input.rules }
  await db.query(`INSERT INTO service_configurations(id,company_id,kind,name,rules,revision,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,now())
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,rules=excluded.rules,revision=excluded.revision,updated_at=now() WHERE service_configurations.company_id=$2`,
  [id, companyId, input.kind, input.name, JSON.stringify(input.rules), revision])
  await db.query(`INSERT INTO service_configuration_revisions(id,company_id,configuration_id,revision,snapshot,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [randomUUID(), companyId, id, revision, JSON.stringify(snapshot), actor])
  for (const a of selected) {
    // Preserve booked work and completed evidence. Only unbooked, open occurrences are retired.
    await db.query(`UPDATE maintenance_occurrences o SET status='CANCELLED' WHERE o.agreement_id=$1 AND o.company_id=$2 AND o.status='DUE'
      AND NOT EXISTS(SELECT 1 FROM service_jobs j WHERE j.occurrence_id=o.id AND j.company_id=$2 AND j.status<>'CANCELLED')`, [a.id, companyId])
    const ends = a.proposedEndsOn
    await db.query(`UPDATE customer_service_agreements SET revision=$3,snapshot=$4::jsonb,ends_on=$5,next_due=$6,starts_on=$7,status=$8
      WHERE id=$1 AND company_id=$2`, [a.id, companyId, revision, JSON.stringify(snapshot), ends, a.proposedNextDue,a.proposedStartsOn,a.proposedStartsOn?'ACTIVE':'PENDING'])
    await serviceAudit(db, companyId, a.id, actor, 'AMENDED', reason, a.snapshot, snapshot)
    if (a.status === 'PENDING') await activateServiceAgreements(db, companyId, a.customer_product_id)
  }
  await serviceAudit(db, companyId, id, actor, old ? 'CONFIGURATION_UPDATED' : 'CONFIGURATION_CREATED', reason, old, { ...snapshot, revision, agreementIds: selected.map(a => a.id) })
  return { id, revision, amended: selected.length }
}
export async function archiveConfiguration(db: any, companyId: string, actor: string, body: any) {
  if (typeof body.archived !== 'boolean') throw serviceError('Choose archive or restore.', 400)
  const result = (await db.query('UPDATE service_configurations SET archived=$3,updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING id', [body.id, companyId, body.archived])).rows[0]
  if (!result) throw serviceError('Configuration not found.', 404)
  await serviceAudit(db, companyId, body.id, actor, body.archived ? 'ARCHIVED' : 'RESTORED', 'Configuration availability changed', null, { archived: body.archived })
  return result
}
export async function saveProductServiceLinks(db: any, companyId: string, productId: string, ids: any) {
  if (ids === undefined) return
  if (!await afterSalesAvailable(db)) {
    if (Array.isArray(ids) && !ids.length) return
    throw serviceError('After-sales requires the prepared database migration before use.', 503)
  }
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string')) throw serviceError('Select up to 100 service configurations.', 400)
  const unique = [...new Set(ids)]
  const owner = (await db.query('SELECT id FROM products WHERE id=$1 AND company_id=$2 FOR UPDATE', [productId, companyId])).rowCount
  if (!owner) throw serviceError('Product not found.', 404)
  const rows = (await db.query(`SELECT c.id,c.archived,EXISTS(SELECT 1 FROM product_service_links l WHERE l.product_id=$3 AND l.configuration_id=c.id AND l.company_id=$2) AS linked
    FROM service_configurations c WHERE c.company_id=$2 AND c.id=ANY($1::text[]) FOR SHARE OF c`, [unique, companyId, productId])).rows
  if (rows.length !== unique.length || rows.some((r: any) => r.archived && !r.linked)) throw serviceError('Select active configurations from this company.', 400)
  await db.query('DELETE FROM product_service_links WHERE product_id=$1 AND company_id=$2 AND NOT(configuration_id=ANY($3::text[]))', [productId, companyId, unique])
  for (const id of unique) await db.query(`INSERT INTO product_service_links(id,company_id,product_id,configuration_id) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,configuration_id) DO NOTHING`, [randomUUID(), companyId, productId, id])
}
export async function serviceProductList(db: any, companyId: string, query: any) {
  return (await db.query(`SELECT p.*,p.purchased_on::text,p.delivered_on::text,p.installed_on::text,c.name AS customer_name,c.phone,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'name',a.snapshot->>'name','status',a.status,'startsOn',a.starts_on,'endsOn',a.ends_on,'nextDue',a.next_due)) FROM customer_service_agreements a WHERE a.customer_product_id=p.id AND a.company_id=p.company_id),'[]') AS agreements
    FROM customer_products p JOIN clients c ON c.id=p.client_id WHERE p.company_id=$1 AND ($2='' OR p.client_id=$2)
    AND ($3='' OR p.bill_id=$3) AND ($4='' OR p.order_id=$4) AND concat_ws(' ',p.reference,p.serial_number,p.name,c.name,c.phone) ILIKE $5
    ORDER BY p.created_at DESC,p.id LIMIT 200`, [companyId, String(query.clientId || ''), String(query.billId || ''), String(query.orderId || ''), '%' + String(query.q || '').slice(0, 200) + '%'])).rows
}
export async function serviceProductDetail(db: any, companyId: string, id: string) {
  const product = (await db.query(`SELECT p.*,p.purchased_on::text,p.delivered_on::text,p.installed_on::text,c.name AS customer_name,c.phone
    FROM customer_products p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND p.company_id=$2`, [id, companyId])).rows[0]
  if (!product) throw serviceError('Client product not found.', 404)
  const agreements = (await db.query('SELECT *,starts_on::text,ends_on::text,next_due::text FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2 ORDER BY kind,id', [id, companyId])).rows
  const jobs = (await db.query(`SELECT j.*,j.completed_on::text,a.kind AS coverage_kind,COALESCE(j.snapshot->>'name',a.snapshot->>'name') AS agreement_name,b.invoice_code,b.payment_status,b.deleted AS bill_deleted
    FROM service_jobs j JOIN customer_service_agreements a ON a.id=j.agreement_id AND a.company_id=j.company_id
    LEFT JOIN bills b ON b.id=j.bill_id AND b.company_id=j.company_id WHERE a.customer_product_id=$1 AND j.company_id=$2 ORDER BY j.created_at DESC`, [id, companyId])).rows
  const readings = (await db.query(`${serviceUnitHistory}
    SELECT r.*,r.recorded_on::text FROM service_readings r WHERE r.customer_product_id IN(SELECT id FROM service_units)
    AND r.company_id=$2 ORDER BY r.recorded_on DESC,r.id`, [id, companyId])).rows
  const history = (await db.query(`${serviceUnitHistory}
    SELECT * FROM service_audit WHERE company_id=$2 AND (resource_id IN(SELECT id FROM service_units)
    OR resource_id IN(SELECT id FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2)
    OR resource_id IN(SELECT j.id FROM service_jobs j JOIN customer_service_agreements a ON a.id=j.agreement_id AND a.company_id=j.company_id
      WHERE a.customer_product_id=$1 AND j.company_id=$2)) ORDER BY created_at DESC LIMIT 200`, [id, companyId])).rows
  return { product, agreements, jobs, readings, history }
}
async function serviceCustomer(db: any, companyId: string, clientId: string) {
  if (!(await db.query('SELECT 1 FROM company_clients WHERE company_id=$1 AND client_id=$2', [companyId, clientId])).rowCount) throw serviceError('Select a client linked to this company.', 400)
}
export async function registerManualProduct(db: any, companyId: string, actor: string, body: any) {
  await serviceCustomer(db, companyId, body.clientId)
  const name = serviceInput(() => serviceText(body.name, 'Product name', 300, true)), purchased = serviceInput(() => serviceDay(body.purchasedOn))
  const evidence = serviceInput(() => serviceText(body.evidence, 'Purchase evidence', 2000, true))
  const key = serviceInput(() => serviceText(body.requestKey, 'Registration request ID', 128, true))
  const prior = (await db.query('SELECT id FROM customer_products WHERE company_id=$1 AND source_key=$2', [companyId, 'manual:' + key])).rows[0]
  if (prior) return prior
  if (!Array.isArray(body.configurationIds) || !body.configurationIds.length) throw serviceError('Select service configurations.', 400)
  const configs = (await db.query('SELECT * FROM service_configurations WHERE company_id=$1 AND id=ANY($2::text[]) AND NOT archived', [companyId, [...new Set(body.configurationIds)]])).rows
  if (configs.length !== new Set(body.configurationIds).size) throw serviceError('Select active configurations from this company.', 400)
  const id = randomUUID()
  const reference = await nextCustomerProductReference(db, companyId, id)
  await db.query(`INSERT INTO customer_products(id,company_id,client_id,reference,source_key,name,purchased_on,evidence,serial_number,delivered_on,installed_on)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, companyId, body.clientId, reference, 'manual:' + key, name, purchased, evidence,
    serviceInput(() => serviceText(body.serialNumber, 'Serial number', 200)) || null,
    body.deliveredOn ? serviceInput(() => serviceDay(body.deliveredOn)) : null, body.installedOn ? serviceInput(() => serviceDay(body.installedOn)) : null])
  for (const c of configs) await db.query(`INSERT INTO customer_service_agreements(id,company_id,customer_product_id,configuration_id,revision,kind,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(), companyId, id, c.id, c.revision, c.kind, JSON.stringify({ name: c.name, kind: c.kind, rules: c.rules })])
  await activateServiceAgreements(db, companyId, id)
  await serviceAudit(db, companyId, id, actor, 'MANUAL_REGISTRATION', evidence, null, { name, purchased })
  return { id }
}
export async function updateCustomerProduct(db: any, companyId: string, actor: string, body: any) {
  const detail = await serviceProductDetail(db, companyId, body.id)
  const reason = serviceInput(() => serviceText(body.reason, 'Change reason', 2000, true))
  if (body.action === 'RETURN' || body.action === 'CANCEL') {
    await cancelCustomerProducts(db, companyId, [body.id], actor, reason, body.action === 'RETURN' ? 'RETURNED' : 'CANCELLED')
  } else if (body.action === 'REPLACE') {
    if (detail.product.status !== 'ACTIVE') throw serviceError('Only an active client product can be replaced.', 400)
    const target = await serviceProductDetail(db, companyId, body.replacementId)
    if (target.product.client_id !== detail.product.client_id || target.product.id === body.id || target.product.status !== 'ACTIVE') throw serviceError('Select an active replacement belonging to the same client.', 400)
    if(target.jobs.length||target.readings.length) throw serviceError('Use a newly registered replacement without an existing service history.',400)
    if (body.restart !== true) {
      // Carry the original agreements to the replacement; its newly registered agreements are retired.
      await db.query(`UPDATE customer_service_agreements SET status='CANCELLED',next_due=NULL WHERE customer_product_id=$1 AND company_id=$2`, [target.product.id, companyId])
      await db.query(`UPDATE maintenance_occurrences SET status='CANCELLED' WHERE company_id=$2 AND status='DUE'
        AND agreement_id IN(SELECT id FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2)`, [target.product.id, companyId])
      for (const a of detail.agreements) {
        await db.query('UPDATE customer_service_agreements SET customer_product_id=$3 WHERE id=$1 AND company_id=$2', [a.id, companyId, target.product.id])
      }
    } else await cancelCustomerProducts(db, companyId, [body.id], actor, reason, 'REPLACED')
    await db.query(`UPDATE customer_products SET status='REPLACED',replaced_by_id=$3 WHERE id=$1 AND company_id=$2`, [body.id, companyId, target.product.id])
  } else if (body.action === 'READING') {
    const agreement=detail.agreements.find((a:any)=>a.id===body.agreementId)
    if(!agreement) throw serviceError('Select the agreement for these readings.',400)
    const values = serviceInput(() => validateServiceValues(agreement.snapshot.rules.fields, body.values || {}))
    await db.query(`INSERT INTO service_readings(id,company_id,customer_product_id,recorded_on,"values",created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
      [randomUUID(), companyId, body.id, serviceInput(() => serviceDay(body.recordedOn)), JSON.stringify({agreementId:agreement.id,definitions:agreement.snapshot.rules.fields,fields:values}), actor])
  } else if (body.action === 'DATES') {
    const installed = body.installedOn ? serviceInput(() => serviceDay(body.installedOn)) : null
    const delivered = body.deliveredOn ? serviceInput(() => serviceDay(body.deliveredOn)) : null
    await db.query('UPDATE customer_products SET installed_on=$3,delivered_on=$4,serial_number=$5 WHERE id=$1 AND company_id=$2',
      [body.id, companyId, installed, delivered, serviceInput(() => serviceText(body.serialNumber, 'Serial number', 200)) || null])
    await db.query(`UPDATE maintenance_occurrences o SET status='CANCELLED' WHERE o.company_id=$2 AND o.status='DUE'
      AND o.agreement_id IN(SELECT id FROM customer_service_agreements WHERE customer_product_id=$1 AND company_id=$2)
      AND NOT EXISTS(SELECT 1 FROM service_jobs j WHERE j.occurrence_id=o.id AND j.status<>'CANCELLED')`,[body.id,companyId])
    // Date corrections amend remaining dates explicitly; booked jobs keep their snapshot.
    await db.query(`UPDATE customer_service_agreements SET status='PENDING',starts_on=NULL,ends_on=NULL,next_due=NULL WHERE customer_product_id=$1 AND company_id=$2 AND status IN('ACTIVE','PENDING','EXPIRED')`, [body.id, companyId])
    await activateServiceAgreements(db, companyId, body.id)
  } else throw serviceError('Unknown client product action.', 400)
  await serviceAudit(db, companyId, body.id, actor, body.action, reason, detail.product, body)
  return { id: body.id }
}
export async function maintenanceList(db: any, companyId: string, query: any) {
  return (await db.query(`SELECT o.*,o.due_on::text,p.id AS customer_product_id,p.reference,p.name AS product_name,c.name AS customer_name,c.phone,
    o.snapshot->>'name' AS configuration_name,j.id AS job_id,j.status AS job_status
    FROM maintenance_occurrences o JOIN customer_service_agreements a ON a.id=o.agreement_id AND a.company_id=o.company_id
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=o.company_id JOIN clients c ON c.id=p.client_id
    LEFT JOIN service_jobs j ON j.occurrence_id=o.id AND j.company_id=o.company_id
    WHERE o.company_id=$1 AND a.status IN('ACTIVE','COMPLETED') AND p.status='ACTIVE' AND ($2='' OR o.status=$2)
    AND ($3='' OR p.client_id=$3) AND ($4='' OR p.bill_id=$4) AND ($5='' OR p.order_id=$5)
    AND concat_ws(' ',p.reference,p.serial_number,p.name,c.name,c.phone,o.snapshot->>'name',j.status) ILIKE $6
    ORDER BY o.due_on,o.id LIMIT 500`, [companyId, String(query.status || ''), String(query.clientId || ''), String(query.billId || ''), String(query.orderId || ''), '%' + String(query.q || '').trim().slice(0,200) + '%'])).rows
}
export async function processServices(db: any, companyId: string, today = serviceToday()) {
  serviceDay(today)
  await db.query(`UPDATE customer_service_agreements SET status='EXPIRED' WHERE company_id=$1 AND kind<>'MAINTENANCE' AND status='ACTIVE' AND ends_on<=$2::date`,[companyId,today])
  const rows = (await db.query(`SELECT *,starts_on::text,next_due::text,last_completed_on::text FROM customer_service_agreements
    WHERE company_id=$1 AND kind='MAINTENANCE' AND status='ACTIVE' AND next_due IS NOT NULL ORDER BY id FOR UPDATE`, [companyId])).rows
  let generated = 0, notified = 0
  for (const a of rows) {
    const r = a.snapshot.rules
    if (r.visitLimit != null && a.completed_visits >= r.visitLimit) {
      await db.query(`UPDATE customer_service_agreements SET status='COMPLETED',next_due=NULL WHERE id=$1 AND company_id=$2`, [a.id, companyId]); continue
    }
    const horizon = addServiceDate(today, Math.max(0, ...r.reminderDays), 'DAY')
    let outstanding=Number((await db.query("SELECT count(*)::int AS count FROM maintenance_occurrences WHERE agreement_id=$1 AND company_id=$2 AND status='DUE'",[a.id,companyId])).rows[0]?.count||0)
    let due = a.next_due
    for (let n = 0; due && due <= horizon && n < 500; n++) {
      if (r.endDate && due > r.endDate) break
      if(r.visitLimit!=null&&a.completed_visits+outstanding>=r.visitLimit)break
      const inserted = await db.query(`INSERT INTO maintenance_occurrences(id,company_id,agreement_id,due_on,snapshot) VALUES($1,$2,$3,$4,$5::jsonb)
        ON CONFLICT(agreement_id,due_on) DO UPDATE SET status=CASE WHEN maintenance_occurrences.status='CANCELLED' THEN 'DUE' ELSE maintenance_occurrences.status END,
        snapshot=CASE WHEN maintenance_occurrences.status='CANCELLED' THEN excluded.snapshot ELSE maintenance_occurrences.snapshot END
        WHERE maintenance_occurrences.status='CANCELLED' RETURNING id`, [randomUUID(), companyId, a.id, due, JSON.stringify(a.snapshot)])
      generated+=inserted.rowCount
      outstanding+=inserted.rowCount
      if (r.timing === 'COMPLETION' || r.schedule === 'ONCE') break
      due = nextServiceDue(r, a.starts_on, due)
      await db.query('UPDATE customer_service_agreements SET next_due=$3 WHERE id=$1 AND company_id=$2', [a.id, companyId, due])
    }
  }
  // Catch-up delivery is intentional: a missed cron still sends each reminder once.
  const pending = (await db.query(`SELECT o.*,o.due_on::text,p.reference,p.name AS product_name FROM maintenance_occurrences o
    JOIN customer_service_agreements a ON a.id=o.agreement_id AND a.company_id=o.company_id
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=o.company_id
    WHERE o.company_id=$1 AND o.status='DUE' AND a.status='ACTIVE' AND p.status='ACTIVE'`, [companyId])).rows
  for (const o of pending) for (const lead of o.snapshot.rules.reminderDays) {
    if (addServiceDate(o.due_on, -lead, 'DAY') > today) continue
    const claim = await db.query(`INSERT INTO service_reminders(id,company_id,occurrence_id,lead_days) VALUES($1,$2,$3,$4) ON CONFLICT(occurrence_id,lead_days) DO NOTHING RETURNING id`, [randomUUID(), companyId, o.id, lead])
    if (!claim.rowCount) continue
    await db.query(`INSERT INTO notifications(id,"companyId",type,title,message,"actionPath",metadata,"updatedAt")
      VALUES($1,$2,'SYSTEM_ALERT',$3,$4,'/after-sales', $5::jsonb,now())`, [randomUUID(), companyId, lead ? 'Maintenance due soon' : 'Maintenance due', `${o.product_name} (${o.reference}) — due ${o.due_on}`, JSON.stringify({ occurrenceId: o.id })])
    notified++
  }
  return { generated, notified }
}
export async function serviceJobList(db: any, companyId: string, query: any = {}) {
  return (await db.query(`SELECT j.*,j.completed_on::text,COALESCE(j.snapshot->>'name',a.snapshot->>'name') AS agreement_name,p.id AS customer_product_id,p.reference,p.name AS product_name,c.name AS customer_name,c.phone
    FROM service_jobs j JOIN customer_service_agreements a ON a.id=j.agreement_id AND a.company_id=j.company_id
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=j.company_id JOIN clients c ON c.id=p.client_id
    WHERE j.company_id=$1 AND ($2='' OR p.client_id=$2) AND ($3='' OR p.bill_id=$3) AND ($4='' OR p.order_id=$4)
    AND concat_ws(' ',p.reference,p.serial_number,p.name,c.name,c.phone,COALESCE(j.snapshot->>'name',a.snapshot->>'name'),j.kind,j.status,j.details::text) ILIKE $5
    ORDER BY j.created_at DESC,j.id LIMIT 500`, [companyId, String(query.clientId || ''), String(query.billId || ''), String(query.orderId || ''), '%' + String(query.q || '').trim().slice(0,200) + '%'])).rows
}
export async function saveServiceJob(db: any, companyId: string, actor: string, body: any) {
  if(!body.id&&body.requestKey){
    const previous=(await db.query('SELECT id,agreement_id FROM service_jobs WHERE company_id=$1 AND request_key=$2',[companyId,body.requestKey])).rows[0]
    if(previous){if(previous.agreement_id!==body.agreementId)throw serviceError('This job request belongs to another agreement.');return {id:previous.id}}
  }
  const old = body.id ? (await db.query('SELECT * FROM service_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE', [body.id, companyId])).rows[0] : null
  if (body.id && !old) throw serviceError('Service job not found.', 404)
  if(old&&old.status===body.status&&['COMPLETED','RESOLVED','REJECTED','CANCELLED'].includes(old.status))return {id:old.id}
  const a = (await db.query(`SELECT a.*,a.starts_on::text,a.last_completed_on::text,p.status AS product_status,p.client_id FROM customer_service_agreements a
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=a.company_id WHERE a.id=$1 AND a.company_id=$2 FOR UPDATE OF a`, [old?.agreement_id || body.agreementId, companyId])).rows[0]
  if (!a || a.product_status !== 'ACTIVE' || !['ACTIVE','PENDING','EXPIRED',...(old?['COMPLETED']:[])].includes(a.status)) throw serviceError('Select an active client agreement.', 400)
  const kind = old?.kind || (a.kind === 'MAINTENANCE' ? 'VISIT' : 'CLAIM')
  const allowed = kind === 'CLAIM' ? ['OPEN','APPROVED','REJECTED','IN_PROGRESS','RESOLVED','CANCELLED'] : ['OPEN','SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED']
  const status = body.status || old?.status || 'OPEN'
  if (!allowed.includes(status)) throw serviceError('Select a valid job status.', 400)
  if (old && ['COMPLETED','RESOLVED','REJECTED','CANCELLED'].includes(old.status)) throw serviceError('Completed or closed jobs are read-only.')
  const snapshot = old?.snapshot || a.snapshot, r = snapshot.rules
  const values = serviceInput(() => validateServiceValues(r.fields, body.details?.values || {}, ['COMPLETED','RESOLVED'].includes(status)))
  const details = { complaint: serviceInput(() => serviceText(body.details?.complaint, 'Complaint', 5000, kind === 'CLAIM')),
    assessment: serviceInput(() => serviceText(body.details?.assessment, 'Assessment')), notes: serviceInput(() => serviceText(body.details?.notes, 'Notes')),
    resolution: serviceInput(() => serviceText(body.details?.resolution, 'Resolution', 5000, status === 'RESOLVED')), values,
    checklist: r.checklist.map((s: string) => ({ label: s, done: body.details?.checklist?.some((c: any) => c.label === s && c.done === true) || false })),
    parts: [] as any[], charges: undefined as any }
  if(old?.bill_id) details.parts=old.details.parts||[]
  else details.parts=await validateServiceParts(db,companyId,body.details?.parts||[])
  if(old?.bill_id) details.charges=old.details.charges
  else if(body.details?.charges!==undefined) details.charges=serviceInput(()=>normalizeServiceLines(body.details.charges,false))
  else if(old?.details?.charges) details.charges=old.details.charges
  if(details.charges && new Set([...details.charges,...details.parts].map((line:any)=>line.id)).size!==details.charges.length+details.parts.length) throw serviceError('Service item IDs must be unique.',400)
  if (body.assignedTo && !(await db.query('SELECT 1 FROM company_users cu JOIN users u ON u.id=cu.user_id WHERE cu.company_id=$1 AND cu.user_id=$2 AND cu.status=true AND cu.deleted=false AND u.cleanup=false', [companyId, body.assignedTo])).rowCount) throw serviceError('Assign an active staff member of this company.', 400)
  const charge = old?.bill_id ? old.charge : serviceInput(() => serviceMoney(body.charge ?? (kind === 'VISIT' && a.completed_visits < r.freeVisits ? 0 : r.charge)))
  const tax = Number(body.tax ?? old?.tax ?? r.tax)
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw serviceError('Tax must be between 0 and 100.', 400)
  let occurrence: any = null
  const occurrenceId = old?.occurrence_id || body.occurrenceId || null
  if (occurrenceId) {
    occurrence = (await db.query('SELECT *,due_on::text FROM maintenance_occurrences WHERE id=$1 AND agreement_id=$2 AND company_id=$3 FOR UPDATE', [occurrenceId, a.id, companyId])).rows[0]
    if (!occurrence || occurrence.status !== 'DUE' || kind !== 'VISIT') throw serviceError('Select an open maintenance occurrence.', 400)
  }
  const key = old?.request_key || serviceInput(() => serviceText(body.requestKey, 'Job request ID', 128, true))
  if (!old) {
    const prior = (await db.query('SELECT id FROM service_jobs WHERE company_id=$1 AND request_key=$2', [companyId, key])).rows[0]
    if (prior) return prior
    if (occurrenceId && (await db.query('SELECT id FROM service_jobs WHERE occurrence_id=$1 AND company_id=$2', [occurrenceId, companyId])).rowCount) throw serviceError('This maintenance occurrence already has a service job.')
  }
  const completed = ['COMPLETED','RESOLVED'].includes(status) ? serviceInput(() => serviceDay(body.completedOn || serviceToday())) : null
  if(kind==='VISIT'&&status==='COMPLETED'&&!a.starts_on) throw serviceError('Record the required activation date before completing maintenance.',400)
  const appointment = body.appointmentOn ? new Date(body.appointmentOn) : null
  if (appointment && !Number.isFinite(+appointment)) throw serviceError('Enter a valid appointment date.', 400)
  const id = old?.id || randomUUID()
  await db.query(`INSERT INTO service_jobs(id,company_id,agreement_id,occurrence_id,request_key,kind,status,assigned_to,appointment_on,completed_on,details,snapshot,charge,tax,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,now()) ON CONFLICT(id) DO UPDATE SET status=excluded.status,assigned_to=excluded.assigned_to,
    appointment_on=excluded.appointment_on,completed_on=excluded.completed_on,details=excluded.details,charge=excluded.charge,tax=excluded.tax,updated_at=now() WHERE service_jobs.company_id=$2`,
  [id, companyId, a.id, occurrenceId, key, kind, status, body.assignedTo || null, appointment, completed, JSON.stringify(details), JSON.stringify(snapshot), charge, old?.bill_id ? old.tax : tax])
  if(status==='CANCELLED'&&occurrenceId) await db.query('UPDATE service_jobs SET occurrence_id=NULL WHERE id=$1 AND company_id=$2',[id,companyId])
  if (kind === 'VISIT' && status === 'COMPLETED') {
    if (occurrenceId) await db.query(`UPDATE maintenance_occurrences SET status='COMPLETED' WHERE id=$1 AND company_id=$2`, [occurrenceId, companyId])
    const completedCount = a.completed_visits + 1
    const ends = r.visitLimit != null && completedCount >= r.visitLimit
    const next = ends ? null : nextServiceDue(a.snapshot.rules, a.starts_on, occurrence?.due_on || completed, completed)
    await db.query(`UPDATE customer_service_agreements SET completed_visits=$3,last_completed_on=$4,next_due=$5,status=$6 WHERE id=$1 AND company_id=$2`,
      [a.id, companyId, completedCount, completed, next, ends || !next ? 'COMPLETED' : 'ACTIVE'])
    if(ends)await db.query(`UPDATE maintenance_occurrences o SET status='CANCELLED' WHERE o.agreement_id=$1 AND o.company_id=$2 AND o.status='DUE'
      AND NOT EXISTS(SELECT 1 FROM service_jobs j WHERE j.occurrence_id=o.id AND j.company_id=$2 AND j.status NOT IN('CANCELLED','REJECTED'))`,[a.id,companyId])
  }
  await serviceAudit(db, companyId, a.customer_product_id, actor, 'JOB_' + status, details.notes || 'Service job updated', old, { id, status, details, charge })
  return { id }
}
export async function invoiceServiceJob(db: any, companyId: string, actor: string, body: any) {
  const job = (await db.query(`SELECT j.*,p.client_id,p.reference FROM service_jobs j JOIN customer_service_agreements a ON a.id=j.agreement_id AND a.company_id=j.company_id
    JOIN customer_products p ON p.id=a.customer_product_id AND p.company_id=j.company_id WHERE j.id=$1 AND j.company_id=$2 FOR UPDATE OF j`, [body.id, companyId])).rows[0]
  if (!job || job.status === 'CANCELLED') throw serviceError('Service job not found.', 404)
  if (job.bill_id) return { billId: job.bill_id }
  if (!['COMPLETED','RESOLVED'].includes(job.status)) throw serviceError('Complete the service before creating its invoice.',400)
  const { issueProgramInvoice } = await import('./invoice-programs')
  const date = serviceToday()
  const template = { clientId: job.client_id, paymentTerms: 'Due on receipt', subject: 'Service ' + job.reference, notes: job.details.notes || '', termsAndConditions: '',
    discount: 0, discountType: 'amount', adjustment: 0, items: serviceInput(()=>serviceInvoiceItems(job)) }
  const category = await ensureServiceChargeCategory(db, companyId, actor)
  const result = await issueProgramInvoice(db, companyId, actor, template, date, date, { allowZeroTotal: true, serviceChargeCategoryId: category.id })
  await db.query('UPDATE service_jobs SET bill_id=$3,updated_at=now() WHERE id=$1 AND company_id=$2', [job.id, companyId, result.billId])
  await serviceAudit(db, companyId, job.id, actor, 'INVOICED', 'Service invoice issued', null, result)
  return result
}
