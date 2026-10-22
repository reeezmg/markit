import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture(failWrite = false) {
  let selected: any = { deviceId: 'printer-a', name: 'Saved printer' };
  const calls: any[] = [];
  const notices: any[] = [];
  const ble = { initialize: async () => { calls.push('initialize'); }, connect: async (id: string) => { calls.push(['connect', id]); }, disconnect: async (id: string) => { calls.push(['disconnect', id]); }, write: async (...args: any[]) => { calls.push(['write', args[3].byteLength]); if (failWrite) throw new Error('Write failed'); } };
  const modules: Record<string, any> = {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true } },
    '@capacitor-community/bluetooth-le': { BleClient: ble },
    '~/composables/printCommands': { buildReportReceiptBytes: () => new Uint8Array([1]) },
    '~/composables/useWebUsbPrinter': { prepareReceiptPrint: async (_data: any, design: any) => { calls.push(['receipt-design', design]); return new Uint8Array(1025); }, prepareLabelPrint: async (_data: any, _size: any, language: string, design: any) => { calls.push(['label-design', language, design]); return [new Uint8Array(5), new Uint8Array(6)]; }, useWebUsbPrinter: () => ({ getLabelPrinterLanguage: () => 'cpcl' }) },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../composables/useReceiptPrinter.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, useToast: () => ({ add: (n: any) => notices.push(n) }), require: (key: string) => modules[key], Uint8Array, DataView, localStorage: { getItem: () => JSON.stringify(selected) }, setTimeout: (fn: any) => fn() });
  return { printer: exports.useReceiptPrinter(), calls, notices, select: (p: any) => { selected = p; } };
}
test('Bluetooth reads the current saved printer each time and sends complete chunked designs', async () => {
  const f = fixture(); const draft = { id: 'draft' };
  await f.printer.printMobileBill({}, draft);
  assert.deepEqual(f.calls.filter(c => Array.isArray(c) && c[0] === 'write'), [['write',512],['write',512],['write',1]]);
  assert.ok(f.calls.some(c => c[0] === 'receipt-design' && c[1] === draft));
  f.select({ deviceId: 'printer-b' }); await f.printer.printMobileReport({});
  assert.ok(f.calls.some(c => c[0] === 'connect' && c[1] === 'printer-b'));
});
test('Bluetooth labels retain selected language and template, stopping on a failed write', async () => {
  const ok = fixture(); await ok.printer.printMobileLabel([{}], '50x38mm', { id: 'draft' });
  assert.ok(ok.calls.some(c => c[0] === 'label-design' && c[1] === 'cpcl' && c[2].id === 'draft'));
  const failed = fixture(true); await assert.rejects(failed.printer.printMobileLabel([{}], '50x38mm'), /Write failed/);
  assert.equal(failed.calls.filter(c => c[0] === 'write').length, 1);
  assert.deepEqual(failed.calls.at(-1), ['disconnect', 'printer-a']);
  failed.select(null); await assert.rejects(failed.printer.printMobileReport({}), /Select a Bluetooth printer/);
});

test('Bluetooth announces initiation before preparation and once across chunks and label copies', async () => {
  const ok = fixture(); const pending = ok.printer.printMobileBill({});
  assert.equal(ok.notices[0].title, 'Print initiated'); assert.deepEqual(ok.calls, []);
  await pending;
  assert.equal(ok.notices.length, 1); assert.equal(ok.notices[0].title, 'Print initiated');
  await ok.printer.printMobileLabel([{}, {}], '50x38mm'); assert.equal(ok.notices.length, 2);
  const failed = fixture(true); await assert.rejects(failed.printer.printMobileBill({}));
  assert.equal(failed.notices.length, 1);
});
