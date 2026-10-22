import { createError } from 'h3';

/** Decode only bounded PDF uploads; generic image upload endpoints remain image-only. */
export function receiptPdfBuffer(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > 8 * 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid or oversized receipt PDF' });
  }
  // jsPDF may include a filename in its data URI.
  const match = value.match(/^data:application\/pdf(?:;filename=[^;,\r\n]+)?;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw createError({ statusCode: 400, statusMessage: 'Invalid receipt PDF' });
  const pdf = Buffer.from(match[1], 'base64');
  if (pdf.subarray(0, 5).toString() !== '%PDF-' || !pdf.subarray(-1024).includes(Buffer.from('%%EOF'))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid receipt PDF' });
  }
  return pdf;
}
