import { defineEventHandler, readBody, createError, setHeader } from 'h3';
import { getReadCompanyId } from '~/server/utils/organizationReadScope';
import { readReceiptData } from '~/server/utils/receiptData';
import { createReceiptShare } from '~/server/utils/receiptShare';
import { randomUUID } from 'node:crypto';
import { uploadBufferToR2 } from '~/server/utils/r2';
import { receiptPdfBuffer } from '~/server/utils/receiptPdf';

export default defineEventHandler(async event => {
  const body = await readBody(event);
  if (typeof body?.billId !== 'string' || !body.billId) throw createError({ statusCode: 400, statusMessage: 'Bill ID is required' });
  if (body.companyId !== undefined && typeof body.companyId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Invalid company' });
  const companyIds = [await getReadCompanyId(event, body.companyId)];
  const receipt = await readReceiptData(body.billId, companyIds);
  let documentKey: string | undefined;
  if (body.pdf !== undefined) {
    const pdf = receiptPdfBuffer(body.pdf);
    documentKey = `receipts/${encodeURIComponent(receipt.companyId)}/${encodeURIComponent(body.billId)}/${randomUUID()}.pdf`;
    // Check signing configuration before uploading to avoid orphan files on configuration errors.
    createReceiptShare(body.billId, receipt.companyId);
    await uploadBufferToR2(pdf, documentKey, 'application/pdf');
  }
  const token = createReceiptShare(body.billId, receipt.companyId, Date.now(), documentKey);
  const receiptId = `${encodeURIComponent(body.billId)}?share=${encodeURIComponent(token)}${documentKey ? '&pdf=1' : ''}`;
  setHeader(event, 'Cache-Control', 'no-store');
  return { path: `/receipt/${receiptId}`, receiptId, expiresInDays: 30 };
});
