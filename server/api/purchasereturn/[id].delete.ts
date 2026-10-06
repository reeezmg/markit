import { defineEventHandler,createError,getRouterParam } from 'h3';
import { pool } from '../../db';
import { useCompanyRequestSession } from '../../utils/companyRequestScope';

export default defineEventHandler(async event=> {
  const session=await useCompanyRequestSession(event), companyId=session.data.companyId, id=getRouterParam(event,'id');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const record=(await db.query('SELECT id FROM purchase_returns WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,companyId])).rows[0];
    if(!record) throw createError({statusCode:404,statusMessage:'Purchase return not found'});
    await db.query(`UPDATE items i SET qty=COALESCE(i.qty,0)+r.qty FROM
      (SELECT item_id,sum(qty)::int qty FROM purchase_return_items WHERE purchase_return_id=$1 AND item_id IS NOT NULL GROUP BY item_id) r
      WHERE i.id=r.item_id AND i.company_id=$2`,[id,companyId]);
    await db.query('DELETE FROM distributor_payments WHERE purchase_return_id=$1 AND company_id=$2',[id,companyId]);
    await db.query('DELETE FROM purchase_return_items WHERE purchase_return_id=$1',[id]);
    await db.query('DELETE FROM purchase_returns WHERE id=$1 AND company_id=$2',[id,companyId]);
    await db.query('COMMIT');
    return {success:true};
  } catch(e:any) {await db.query('ROLLBACK');if(e.code==='P0001')throw createError({statusCode:400,statusMessage:e.message});throw e;}
  finally {db.release();}
});
