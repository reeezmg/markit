import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';
import { useCompanyRequestSession } from '~/server/utils/companyRequestScope';
import { assertSalaryManager } from '~/server/utils/salary-input';
export default defineEventHandler(async event=>{
  const session=await useCompanyRequestSession(event);
  assertSalaryManager(session.data.role);
  const companyId=session.data.companyId;
  const banks=(await pool.query(`SELECT id,name FROM accountant_v2_accounting_accounts WHERE company_id=$1 AND account_type='BANK' AND is_active AND deleted_at IS NULL ORDER BY name,id`,[companyId])).rows;
  const paymentId=getQuery(event).paymentId;
  let selectedBankId:string|null=null;
  if(typeof paymentId==='string' && paymentId) {
    const row=(await pool.query(`SELECT COALESCE(s.accounts->>CASE WHEN p.bank_account_id IS NOT NULL THEN 'bank:'||p.bank_account_id ELSE 'bank' END,
      cfg.accounts->>CASE WHEN p.bank_account_id IS NOT NULL THEN 'bank:'||p.bank_account_id ELSE 'bank' END) AS bank
      FROM salary_payments p LEFT JOIN accountant_v2_user_settings cfg ON cfg.company_id=p.company_id
      LEFT JOIN user_ledger_entries l ON l.company_id=p.company_id AND l.source_type='SALARY_PAYMENT' AND l.source_id=p.id AND l.type='SALARY_PAYMENT'
      LEFT JOIN accountant_v2_user_sources s ON s.company_id=l.company_id AND s.ledger_id=l.id
      WHERE p.company_id=$1 AND p.id=$2 AND p.payment_mode::text IN ('BANK','UPI')`,[companyId,paymentId])).rows[0];
    selectedBankId=row?.bank || null;
  }
  return {banks,selectedBankId};
});
