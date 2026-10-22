import { defineEventHandler, getQuery, setHeader, createError, sendRedirect } from 'h3';
import { verifyReceiptShare } from '~/server/utils/receiptShare';
import { readReceiptData } from '~/server/utils/receiptData';
import { getR2SignedUrl } from '~/server/utils/r2';

export default defineEventHandler(async event => {
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Referrer-Policy', 'no-referrer');
  const { token, pdf } = getQuery(event);
  if (typeof token !== 'string') throw createError({ statusCode: 404, statusMessage: 'Receipt link not found' });
  const { billId, companyId, documentKey } = verifyReceiptShare(token);
  if (pdf === '1') {
    if (!documentKey) throw createError({ statusCode: 404, statusMessage: 'Receipt PDF not found' });
    // Keep deleted/inaccessible bills unavailable, as with the existing viewer.
    await readReceiptData(billId, [companyId]);
    return sendRedirect(event, await getR2SignedUrl(documentKey, 'receipt.pdf'), 302);
  }
  return readReceiptData(billId, [companyId]);
});
