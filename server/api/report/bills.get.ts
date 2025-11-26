// ~/server/api/bills.get.ts
import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyId = session.data.companyId;
  if (!companyId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

  const query = getQuery(event);
  const startDate = query.startDate ? new Date(JSON.parse(query.startDate)) : new Date(0);
  const endDate = query.endDate ? new Date(JSON.parse(query.endDate)) : new Date();

  const client = await pool.connect();
  try {
    const res = await client.query(
      `
      SELECT 
        b.subtotal,
        b.grand_total AS "grandTotal",
        b.created_at AS "createdAt",
        b.invoice_number AS "invoiceNumber",
        b.payment_method AS "paymentMethod",
        json_build_object(
          'name', cl.name,
          'phone', cl.phone
        ) AS client
      FROM bills b
      LEFT JOIN clients cl ON b.client_id = cl.id
      WHERE b.company_id = $1
        AND b.deleted = false
        AND b.created_at BETWEEN $2 AND $3
      ORDER BY b.created_at DESC;
      `,
      [companyId, startDate, endDate]
    );

    return res.rows;
  } finally {
    client.release();
  }
});
