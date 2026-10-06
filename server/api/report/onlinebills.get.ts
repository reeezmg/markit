import {reportWindow} from '~/server/utils/report-accounting';
// ~/server/api/report/bills.get.ts
import { defineEventHandler, getQuery } from 'h3';
import { pool } from '~/server/db';
import { getReadCompanyIds } from '~/server/utils/organizationReadScope';

export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event);
  const companyIds = await getReadCompanyIds(event);
  const cleanup = session.data.cleanup ?? false;

  const query = getQuery(event);
  const {from:startDate,to:endDate}=reportWindow(query);
  const markitOnly = query.markit === 'true'; // Check if markit filter is requested

  const client = await pool.connect();
  try {
    let sqlQuery = `
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
      WHERE b.company_id = ANY($1::text[])
        AND b.deleted = false
        AND b.created_at BETWEEN $2 AND $3
        AND ($4 = true OR b.precedence IS NOT TRUE)
    `;

    // Add is_markit filter if requested
    if (markitOnly) {
      sqlQuery += ` AND b.is_markit = true`;
    }

    sqlQuery += ` ORDER BY b.created_at DESC;`;

    const res = await client.query(
      sqlQuery,
      [companyIds, startDate.toISOString(), endDate.toISOString(), cleanup]
    );

    return res.rows;
  } finally {
    client.release();
  }
});
