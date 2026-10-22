import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { createError } from 'h3';
import * as shares from '../server/utils/receiptShare';
import { receiptPdfBuffer } from '../server/utils/receiptPdf';

const require = createRequire(import.meta.url);
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.3\nfixture\n%%EOF\n').toString('base64');

function fixture() {
  const calls: any[] = [];
  let allowAccess = true, billExists = true, uploadFails = false, whatsappFails = false;
  const modules: Record<string, any> = {
    'h3': {
      createError, defineEventHandler: (fn: any) => fn,
      readBody: async (e: any) => e.body, getQuery: (e: any) => e.query,
      setHeader: () => {}, sendRedirect: (_: any, url: string, status: number) => ({ url, status }),
    },
    '~/server/utils/organizationReadScope': { getReadCompanyId: async (_: any, id: string) => {
      calls.push(['authorize', id]);
      if (!allowAccess || id !== 'company-a') throw createError({ statusCode: 403 });
      return id;
    } },
    '~/server/utils/receiptData': { readReceiptData: async (bill: string, companies: string[]) => {
      calls.push(['read', bill, companies]);
      if (!billExists) throw createError({ statusCode: 404 });
      assert.deepEqual(Array.from(companies), ['company-a']);
      return { companyId: 'company-a' };
    } },
    '~/server/utils/receiptShare': shares,
    '~/server/utils/receiptPdf': { receiptPdfBuffer },
    '~/server/utils/r2': {
      uploadBufferToR2: async (...args: any[]) => { calls.push(['upload', ...args]); if (uploadFails) throw Error('Upload failed'); },
      getR2SignedUrl: async (key: string, filename: string) => { calls.push(['sign', key, filename]); return 'https://storage.example/receipt.pdf'; },
    },
  };
  function load(file: string) {
    const source = readFileSync(new URL('../server/api/' + file, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: any = {};
    vm.runInNewContext(code, {
      exports, require: (id: string) => modules[id] ?? require(id), Date, URLSearchParams, String, encodeURIComponent,
      process: { env: { WHATSAPP_PHONE_ID: 'test-phone-id', WHATSAPP_TOKEN: 'test-token' } },
      console: { error: () => {} },
      $fetch: async (_: string, options: any) => { calls.push(['whatsapp', options.body]); if (whatsappFails) throw Error('Provider unavailable'); return { id: 'mock-message' }; },
    });
    return exports.default;
  }
  return { calls, post: load('billSale/share-receipt.post.ts'), get: load('receipt-share.get.ts'), send: load('whatsapp/send-payment-template.post.ts'),
    deny: () => { allowAccess = false; }, removeBill: () => { billExists = false; }, failUpload: () => { uploadFails = true; }, failWhatsApp: () => { whatsappFails = true; } };
}

test('PDF sharing authorizes the bill, stores a unique PDF, and signs that exact document', async () => {
  const previous = process.env.RECEIPT_SHARE_SECRET;
  process.env.RECEIPT_SHARE_SECRET = 'test-only-receipt-pdf-signing-key-32-characters';
  try {
    const f = fixture();
    const result = await f.post({ body: { billId: 'bill-a', companyId: 'company-a', pdf } });
    const upload = f.calls.find(c => c[0] === 'upload');
    assert.equal(f.calls[0][0], 'authorize');
    assert.deepEqual(upload[1], receiptPdfBuffer(pdf));
    assert.match(upload[2], /^receipts\/company-a\/bill-a\/[a-f0-9-]+\.pdf$/);
    assert.equal(upload[3], 'application/pdf');
    const url = new URL(result.path, 'https://app.example');
    const token = url.searchParams.get('share')!;
    assert.equal(shares.verifyReceiptShare(token).documentKey, upload[2]);
    assert.equal(url.searchParams.get('pdf'), '1');
    assert.equal(result.path, '/receipt/' + result.receiptId);
    const sent = await f.send({ body: { receiptId: result.receiptId, companyId: 'company-a', phone: '9999999999' } });
    assert.equal(sent.success, true);
    const message = f.calls.find(c => c[0] === 'whatsapp')[1];
    assert.equal(message.template.components[1].parameters[0].text, result.receiptId);
    f.failWhatsApp();
    assert.equal((await f.send({ body: { receiptId: result.receiptId, companyId: 'company-a', phone: '9999999999' } })).success, false);
    await assert.rejects(f.send({ body: { receiptId: result.receiptId.replace('bill-a?', 'bill-b?'), companyId: 'company-a', phone: '9999999999' } }), { statusCode: 400 });
    await assert.rejects(f.send({ body: { receiptId: 'bill-a', companyId: 'company-a', phone: '9999999999' } }));
    const redirect = await f.get({ query: { token, pdf: '1' } });
    assert.equal(redirect.status, 302);
    assert.deepEqual(f.calls.at(-1), ['sign', upload[2], 'receipt.pdf']);
    f.removeBill();
    await assert.rejects(f.get({ query: { token, pdf: '1' } }), { statusCode: 404 });
    const count = f.calls.filter(c => c[0] === 'sign').length;
    assert.equal(count, 1, 'Deleted bills must not issue new storage URLs');
  } finally {
    if (previous === undefined) delete process.env.RECEIPT_SHARE_SECRET;
    else process.env.RECEIPT_SHARE_SECRET = previous;
  }
});

test('unauthorized, invalid and failed uploads never produce PDF share links', async () => {
  const previous = process.env.RECEIPT_SHARE_SECRET;
  process.env.RECEIPT_SHARE_SECRET = 'test-only-receipt-pdf-signing-key-32-characters';
  try {
    const denied = fixture(); denied.deny();
    await assert.rejects(denied.post({ body: { billId: 'bill-a', companyId: 'company-a', pdf } }), { statusCode: 403 });
    assert.equal(denied.calls.some(c => c[0] === 'upload'), false);
    const invalid = fixture();
    await assert.rejects(invalid.post({ body: { billId: 'bill-a', companyId: 'company-a', pdf: 'data:image/png;base64,YWJj' } }), { statusCode: 400 });
    assert.equal(invalid.calls.some(c => c[0] === 'upload'), false);
    const failed = fixture(); failed.failUpload();
    await assert.rejects(failed.post({ body: { billId: 'bill-a', companyId: 'company-a', pdf } }), /Upload failed/);
    const legacy = fixture();
    const result = await legacy.post({ body: { billId: 'bill-a', companyId: 'company-a' } });
    assert.equal(legacy.calls.some(c => c[0] === 'upload'), false);
    const token = new URL(result.path, 'https://app.example').searchParams.get('share');
    await assert.rejects(legacy.get({ query: { token, pdf: '1' } }), { statusCode: 404 });
  } finally {
    if (previous === undefined) delete process.env.RECEIPT_SHARE_SECRET;
    else process.env.RECEIPT_SHARE_SECRET = previous;
  }
});
