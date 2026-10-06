import { randomUUID } from 'node:crypto';
import { createError, getRouterParam, readBody, type H3Event } from 'h3';
import { pool } from '../db';
import { selectDistributorAccounts } from './distributor-account-selection';
import { useCompanyRequestSession } from './companyRequestScope';


/** The credit and its received-money transaction are one business operation. */
export async function writeDistributorCredit(event:H3Event) {
  const session=await useCompanyRequestSession(event);
  const companyId=session.data.companyId;
  const id=getRouterParam(event,'id') || randomUUID();
  const body=event.method==='DELETE'?{}:await readBody(event);
  const client=await pool.connect();
  const invalid=(message:string)=>createError({statusCode:400,statusMessage:message});
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('accountant-v2:' || $1))",[companyId]);
    await client.query("SELECT set_config('app.accountant_user',$1,true)",[session.data.id]);
    const old=event.method==='POST'?null:(await client.query('SELECT * FROM distributor_credits WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,companyId])).rows[0];
    if(event.method!=='POST'&&!old) throw createError({statusCode:404,statusMessage:'Distributor credit not found'});
    if(old?.purchase_order_id) throw invalid('Edit or delete the purchase document for a purchase credit');
    if(event.method==='DELETE') {
      await client.query('DELETE FROM distributor_credits WHERE id=$1 AND company_id=$2',[id,companyId]);
      if(old.money_transaction_id) {

        await client.query('DELETE FROM money_transactions WHERE id=$1 AND company_id=$2',[old.money_transaction_id,companyId]);
      }
    } else {
      const distributorId=old?.distributor_id || body.distributorId;
      if(!(await client.query('SELECT 1 FROM distributor_companies WHERE company_id=$1 AND distributor_id=$2 FOR SHARE',[companyId,distributorId])).rowCount) throw invalid('Select a distributor linked to this company');
      const amount=Number(body.amount),date=new Date(body.createdAt || body.date || Date.now());
      if(!Number.isFinite(amount)||amount<=0||Math.abs(amount*100-Math.round(amount*100))>0.00001||!Number.isFinite(date.getTime())) throw invalid('Enter a positive amount with at most two decimals and a valid date');
      const isMoney=old?Boolean(old.money_transaction_id):body.creditKind==='AMOUNT';
      let moneyId=old?.money_transaction_id || null;
      const linked=moneyId?(await client.query('SELECT * FROM money_transactions WHERE id=$1 AND company_id=$2 FOR UPDATE',[moneyId,companyId])).rows[0]:null;
      if (moneyId && !linked) throw invalid('Linked money transaction belongs to another company');
      const selections={...body.accountingAccounts};
      if(isMoney) {
        const mode=body.paymentMode || 'CASH';
        if(!['CASH','BANK'].includes(mode)) throw invalid('Choose cash or bank');
        const bank=null;
        if(mode==='BANK' && body.bankAccountId && body.bankAccountId!=='__PRIMARY__') selections.bank=body.bankAccountId;
        if(mode==='BANK' && !selections.bank && linked?.account_id) {
          const recorded=(await client.query('SELECT accounts FROM accountant_v2_distributor_sources WHERE company_id=$1 AND distributor_id=$2 AND source_key=$3',[companyId,distributorId,`credit:${id}`])).rows[0];
          selections.bank=recorded?.accounts?.[`bank:${linked.account_id}`] || (await client.query('SELECT account_id FROM accountant_v2_distributor_mappings WHERE company_id=$1 AND distributor_id=$2 AND role=$3',[companyId,distributorId,`bank:${linked.account_id}`])).rows[0]?.account_id;
          if(!selections.bank) throw invalid('Select a native bank account for this receipt');
        }
        moneyId ||= randomUUID();
        await client.query(`INSERT INTO money_transactions(id,company_id,party_type,direction,status,amount,payment_mode,account_id,note,created_at,updated_at)
          VALUES($1,$2,'SUPPLIER','RECEIVED','PAID',$3,$4,$5,$6,$7,now())
          ON CONFLICT(id) DO UPDATE SET amount=EXCLUDED.amount,payment_mode=EXCLUDED.payment_mode,account_id=EXCLUDED.account_id,note=EXCLUDED.note,created_at=EXCLUDED.created_at,updated_at=now()
          WHERE money_transactions.company_id=EXCLUDED.company_id`,[moneyId,companyId,amount,mode,bank,body.remarks||null,date]);

      }
      if(old) await client.query(`UPDATE distributor_credits SET amount=$3,created_at=$4,remarks=$5,"billNo"=$6 WHERE id=$1 AND company_id=$2`,[id,companyId,amount,date,body.remarks||null,isMoney?null:body.billNo||null]);
      else {
        const number=(await client.query('UPDATE companies SET distributor_credit_counter=distributor_credit_counter+1 WHERE id=$1 RETURNING distributor_credit_counter-1 AS number',[companyId])).rows[0].number;
        await client.query(`INSERT INTO distributor_credits(id,company_id,distributor_id,amount,created_at,remarks,"billNo",credit_no,money_transaction_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,companyId,distributorId,amount,date,body.remarks||null,isMoney?null:body.billNo||null,number,moneyId]);
      }
      await selectDistributorAccounts(client,companyId,distributorId,`credit:${id}`,selections);
    }
    await client.query('COMMIT');
    return {id,success:true};
  } catch(e:any) {await client.query('ROLLBACK');if(e.code==='P0001') throw invalid(e.message);throw e;}
  finally {client.release();}
}
