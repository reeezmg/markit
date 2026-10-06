import { defineEventHandler, createError } from 'h3'
import { pool } from '~/server/db'
export default defineEventHandler(async(event)=>{
  const session=await useAuthSession(event),companyId=session.data?.companyId
  if (!companyId) throw createError({statusCode:401,statusMessage:'Not authenticated'})
  return (await pool.query(`SELECT id,name FROM accountant_v2_accounting_accounts
    WHERE company_id=$1 AND account_type='BANK' AND is_active AND deleted_at IS NULL ORDER BY name`,[companyId])).rows
})
