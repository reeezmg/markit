import { createError } from 'h3'
import { pool } from '../db'
import { executeOperation, deleteExecutedRecord, parseMeta, upsertMapping } from '../api/statement/_helpers'
import { saveSourceRequest } from './source-save-request'

export async function executeStatementRow(companyId:string, userId:string, rowId:string, bankAccountId:string, options:{reexecute?:boolean;requestId?:string}={}) {
  const db=await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId])
    const batch=(await db.query(`SELECT sb.id FROM statement_batches sb JOIN statement_rows sr ON sr.batch_id=sb.id
      WHERE sr.id=$1 AND sb.company_id=$2 FOR UPDATE OF sb`,[rowId,companyId])).rows[0]
    if (!batch) throw createError({statusCode:404,statusMessage:'Row not found'})
    const row=(await db.query('SELECT * FROM statement_rows WHERE id=$1 AND batch_id=$2 FOR UPDATE',[rowId,batch.id])).rows[0]
    if (!row?.operation) throw createError({statusCode:400,statusMessage:'Assign an operation first'})
    const previous=parseMeta(row.execution_result)
    const save=async()=>{
      if (row.executed && !options.reexecute) return {...previous,replayed:true}
      if (previous.operationId) await deleteExecutedRecord(previous.operation || row.operation,previous,db,companyId)
      const result=await executeOperation(row,row.operation,parseMeta(row.operation_meta),companyId,db,bankAccountId)
      const receipt={success:true,...result,operation:row.operation,meta:parseMeta(row.operation_meta),bankAccountId,skipped:row.operation==='IGNORE'}
      await db.query('UPDATE statement_rows SET executed=true,execution_result=$2::jsonb WHERE id=$1',[rowId,JSON.stringify(receipt)])
      await db.query(`UPDATE statement_batches SET status=CASE WHEN EXISTS(SELECT 1 FROM statement_rows WHERE batch_id=$1 AND NOT executed)
        THEN 'PENDING' ELSE 'EXECUTED' END WHERE id=$1 AND company_id=$2`,[batch.id,companyId])
      return receipt
    }
    const result=options.requestId || options.reexecute
      ? await saveSourceRequest(db,companyId,userId,'statement-row',options.requestId!,{rowId,bankAccountId,operation:row.operation,meta:parseMeta(row.operation_meta)},save)
      : await save()
    await db.query('COMMIT')
    return result
  } catch(error:any) {
    await db.query('ROLLBACK')
    // Keep reload-visible errors without losing the previous source receipt.
    try {
      await db.query('BEGIN')
      await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId])
      const batch=(await db.query(`SELECT sb.id FROM statement_batches sb JOIN statement_rows sr ON sr.batch_id=sb.id
        WHERE sr.id=$1 AND sb.company_id=$2 FOR UPDATE OF sb`,[rowId,companyId])).rows[0]
      if (batch) {
        const changed=await db.query(`UPDATE statement_rows SET execution_result=COALESCE(execution_result,'{}'::jsonb)||$2::jsonb
          WHERE id=$1 AND batch_id=$3 AND NOT executed`,[rowId,JSON.stringify({error:error.message}),batch.id])
        if (changed.rowCount) await db.query("UPDATE statement_batches SET status='PENDING' WHERE id=$1 AND company_id=$2",[batch.id,companyId])
      }
      await db.query('COMMIT')
    } catch { try { await db.query('ROLLBACK') } catch {} }
    throw error
  }
  finally { db.release() }
}

/** Assignment preserves the old source receipt until its replacement commits. */
export async function assignStatementOperation(companyId:string,rowId:string,result:{operation:string;operationMeta?:any;operationLabel?:string},userInput?:string,allowExecuted=false) {
  const db=await pool.connect()
  try {
    await db.query('BEGIN')
    await db.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:'||$1))",[companyId])
    const batch=(await db.query(`SELECT sb.id FROM statement_batches sb JOIN statement_rows sr ON sr.batch_id=sb.id
      WHERE sr.id=$1 AND sb.company_id=$2 FOR UPDATE OF sb`,[rowId,companyId])).rows[0]
    if (!batch) throw createError({statusCode:404,statusMessage:'Row not found'})
    const row=(await db.query('SELECT * FROM statement_rows WHERE id=$1 AND batch_id=$2 FOR UPDATE',[rowId,batch.id])).rows[0]
    if(row.executed && !allowExecuted) throw createError({statusCode:409,statusMessage:'Row already executed; edit its operation explicitly'})
    const previous=parseMeta(row.execution_result)
    const receipt=row.execution_result ? {...previous,operation:previous.operation || row.operation} : null
    await db.query(`UPDATE statement_rows SET operation=$2,operation_meta=$3::jsonb,operation_label=$4,user_input=$5,
      executed=false,execution_result=$6::jsonb WHERE id=$1`,[rowId,result.operation,JSON.stringify(result.operationMeta ?? null),result.operationLabel || null,userInput || null,JSON.stringify(receipt)])
    await db.query("UPDATE statement_batches SET status='PENDING' WHERE id=$1 AND company_id=$2",[batch.id,companyId])
    await upsertMapping(companyId,row.description,result.operation,result.operationMeta ?? null,result.operationLabel || result.operation,userInput,db)
    await db.query('COMMIT')
  } catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
}
