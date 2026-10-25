import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(options: { assigned?: boolean; native?: boolean; supported?: boolean; cancelled?: boolean; failed?: boolean } = {}) {
  const calls: string[] = []; let assigned = !!options.assigned;
  const usb = {
    isWebUsbSupported: () => options.supported !== false,
    hasAssignedPrinter: (role: string) => { assert.equal(role, 'barcode'); return assigned; },
    connectUsbPrinter: async () => { calls.push('choose'); if (options.cancelled) throw Object.assign(new Error('Cancelled'), { name: 'NotFoundError' }); return { id: 'label-usb' }; },
    assignWebUsbPrinterRole: (id: string, role: string) => { assert.equal(id, 'label-usb'); assert.equal(role, 'barcode'); assigned = true; calls.push('assign'); },
    printLabelViaUsb: async (_data: any, _size: any, design: any) => { assert.equal(design.id, 'draft'); calls.push('usb'); if (options.failed) throw new Error('USB disconnected'); return { success: true }; },
  };
  const modules: Record<string, any> = {
    '~/utils/label-barcode': { MissingLabelBarcodeError: class extends Error {} },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => !!options.native } },
    '~/composables/useWebUsbPrinter': { useWebUsbPrinter: () => usb },
    '~/composables/useReceiptPrinter': { useReceiptPrinter: () => ({ printMobileLabel: async () => { calls.push('ble'); return { success: true }; } }) },
    '~/utils/load-print-template.client': { loadPrintTemplate: async () => ({ id: 'draft' }) },
    '~/utils/load-label-variables.client': { loadLabelVariables: async (items: any) => { calls.push('enrich'); return items; } },
    '~/utils/print-template-renderer.client': { browserPrintTemplates: async () => { calls.push('dialog'); } },
  };
  const source = readFileSync(new URL('../composables/usePrintBill.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (key: string) => { if (!modules[key]) throw new Error(key); return modules[key]; }, console: { error() {}, warn() {} }, $fetch: async () => { calls.push('local-server'); } });
  const print = () => exports.usePrint().printLabel([{ barcode: '123' }], '50x38mm', { id: 'draft' });
  return { print, calls };
}

test('printing requires a printer assigned in settings and never opens a chooser', async () => {
  const f = fixture(); await assert.rejects(f.print(), /Settings > Printer/);
  assert.deepEqual(f.calls, []);
});
test('assigned labels print directly through USB', async () => {
  const f = fixture({ assigned: true }); await f.print(); assert.deepEqual(f.calls, ['usb']);
});
test('unsupported and disconnected printers fail without browser or server fallback', async () => {
  for (const options of [{ supported: false }, { assigned: true, failed: true }]) {
    const f = fixture(options); await assert.rejects(f.print());
    assert.equal(f.calls.includes('dialog'), false); assert.equal(f.calls.includes('local-server'), false);
  }
});

function usbFixture(options: { cpcl?: boolean; renderFails?: boolean; writeFails?: boolean; noDesign?: boolean; loadFails?: boolean; byteLength?: number } = {}) {
  const calls: string[] = [];
  const notices: any[] = [];
  const printer = { id: 'usb', serialNumber: 's', vendorId: 1, productId: 2, productName: 'Test' };
  const values: Record<string, any> = { savedWebUsbPrinters: [printer], webUsbPrinterRoles: { receipt: 'usb', barcode: 'usb' }, 'markit-label-printer-language': options.cpcl ? 'cpcl' : 'tspl' };
  const device = { ...printer, opened: true, configuration: { interfaces: [{ interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 7, endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 1 }] }] }] },
    claimInterface: async (_iface: number) => {}, selectAlternateInterface: async (_iface: number, _alternate: number) => {}, releaseInterface: async (_iface: number) => {}, close: async () => {},
    transferOut: async (_ep: any, bytes: Uint8Array) => { calls.push('write'); if (options.writeFails) throw new Error('Transfer failed'); return { status: 'ok', bytesWritten: bytes.length }; } };
  const modules: Record<string, any> = {
    '~/utils/label-barcode': { MissingLabelBarcodeError: class extends Error {} },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => false } },
    '~/composables/printCommands': { buildBillReceiptBytes: () => { calls.push('legacy-receipt'); return new Uint8Array([1]); }, buildLabelPrintJobs: () => { calls.push('legacy-label'); return [new Uint8Array([1])]; }, buildReportReceiptBytes: () => new Uint8Array([1]) },
    '~/utils/load-print-template.client': { loadPrintTemplate: async (kind: string, companyId: string) => { assert.equal(companyId, 'company-a'); calls.push('load-' + kind); if (options.loadFails) throw new Error('Unauthorized'); return options.noDesign ? null : { id: 'saved', kind }; } },
    '~/utils/load-label-variables.client': { loadLabelVariables: async (items: any) => items },
    '~/utils/print-template-renderer.client': { renderPrintTemplate: async () => { calls.push('render'); if (options.renderFails) throw new Error('Invalid design'); return {}; }, templatePrintBytes: (_render: any, _template: any, language = 'escpos') => { calls.push(language); return new Uint8Array(options.byteLength ?? 1); } },
  };
  const source = readFileSync(new URL('../composables/useWebUsbPrinter.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, Error, useToast: () => ({ add: (n: any) => notices.push(n) }), Uint8Array, require: (key: string) => modules[key], window: {}, navigator: { usb: { getDevices: async () => [device] } }, localStorage: { getItem: (key: string) => JSON.stringify(values[key]), setItem() {} }, console: { warn() {} }, setTimeout: (fn: any) => fn() });
  const usb = exports.useWebUsbPrinter();
  return { calls, notices, device, receipt: () => usb.printBillViaUsb({ companyId: 'company-a' }), label: (override?: any, language?: string, items = [{ companyId: 'company-a' }]) => usb.printLabelViaUsb(items, '50x38mm', override, language) };
}

test('USB skips interrupt/status and serial endpoints in favor of printer bulk output', async () => {
  const f = usbFixture(); const selected: number[][] = [];
  f.device.configuration.interfaces.unshift({ interfaceNumber: 2, alternates: [
    { alternateSetting: 0, interfaceClass: 255, endpoints: [{ direction: 'out', type: 'interrupt', endpointNumber: 3 }] },
    { alternateSetting: 1, interfaceClass: 255, endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 4 }] },
  ] });
  f.device.claimInterface = async n => { selected.push([n]); };
  f.device.selectAlternateInterface = async (n, alt) => { selected.push([n, alt]); };
  f.device.transferOut = async (ep, bytes) => { selected.push([ep]); return { status: 'ok', bytesWritten: bytes.length }; };
  await f.receipt(); assert.deepEqual(selected, [[0], [0, 0], [1]]);
  // Vendor-class printers remain supported when no printer-class interface exists.
  f.device.configuration.interfaces.pop(); selected.length = 0;
  await f.receipt(); assert.deepEqual(selected, [[2], [2, 1], [4]]);
});

test('USB stops at a failed chunk, retains its cause and closes without retry', async () => {
  const f = usbFixture({ byteLength: 9000 }); const sizes: number[] = []; const cleanup: string[] = [];
  const cause = new Error("Failed to execute 'transferOut' on 'USBDevice': A transfer error has occured");
  f.device.transferOut = async (_ep, bytes) => { sizes.push(bytes.length); if (sizes.length === 2) throw cause; return { status: 'ok', bytesWritten: bytes.length }; };
  f.device.releaseInterface = async () => { cleanup.push('release'); };
  f.device.close = async () => { cleanup.push('close'); };
  await assert.rejects(f.receipt(), (error: any) => {
    assert.match(error.message, /interface 0, endpoint 1 after 4096 confirmed bytes/);
    assert.match(error.message, /Some data may already have reached/);
    assert.equal(error.cause, cause); return true;
  });
  assert.deepEqual(sizes, [4096, 4096]); assert.deepEqual(cleanup, ['release', 'close']);
});

test('USB rejects stalled or short writes and releases a claim if alternate selection fails', async () => {
  for (const result of [{ status: 'stall', bytesWritten: 0 }, { status: 'ok', bytesWritten: 2 }]) {
    const f = usbFixture({ byteLength: 10 }); let writes = 0;
    f.device.transferOut = async () => { writes++; return result; };
    await assert.rejects(f.receipt(), /USB transfer status:/); assert.equal(writes, 1);
  }
  const f = usbFixture(); const cleanup: string[] = [];
  f.device.selectAlternateInterface = async () => { throw new Error('Alternate failed'); };
  f.device.releaseInterface = async () => { cleanup.push('release'); };
  f.device.close = async () => { cleanup.push('close'); f.device.opened = false; };
  await assert.rejects(f.receipt(), /Alternate failed/);
  assert.deepEqual(cleanup, ['release', 'close']); assert.equal(f.calls.includes('write'), false);
});
test('company defaults are loaded for receipt and label printing', async () => {
  const f = usbFixture(); await f.receipt(); await f.label();
  assert.deepEqual(f.calls, ['load-receipt', 'render', 'escpos', 'write', 'load-label', 'render', 'tspl', 'write']);
});
test('legacy fallback is restricted to preparing receipt and TSPL jobs', async () => {
  const f = usbFixture({ renderFails: true }); await f.receipt(); await f.label();
  assert.ok(f.calls.includes('legacy-receipt')); assert.ok(f.calls.includes('legacy-label'));
  for (const options of [{ writeFails: true }, { loadFails: true }]) {
    const g = usbFixture(options); await assert.rejects(g.receipt()); await assert.rejects(g.label());
    assert.equal(g.calls.some(c => c.startsWith('legacy-')), false);
  }
});
test('CPCL has no legacy fallback, and editor tests expose rendering errors', async () => {
  const f = usbFixture({ cpcl: true }); await f.label(); assert.ok(f.calls.includes('cpcl'));
  for (const options of [{ cpcl: true, renderFails: true }, { cpcl: true, noDesign: true }]) {
    const g = usbFixture(options); await assert.rejects(g.label()); assert.equal(g.calls.includes('write'), false); assert.equal(g.calls.includes('legacy-label'), false);
  }
  const draft = usbFixture({ renderFails: true }); await assert.rejects(draft.label({ id: 'draft' })); assert.equal(draft.calls.includes('legacy-label'), false);
});

test('native label actions use Bluetooth without requiring a WebUSB assignment', async () => {
  const f = fixture({ native: true, supported: false }); await f.print(); assert.deepEqual(f.calls, ['ble']);
});

test('test language override applies to one label job without changing the saved language', async () => {
  const f = usbFixture(); await f.label(undefined, 'cpcl');
  assert.ok(f.calls.includes('cpcl')); f.calls.length = 0;
  await f.label(); assert.ok(f.calls.includes('tspl')); assert.equal(f.calls.includes('cpcl'), false);
});

 test('USB announces initiation before preparation, once per job even if printing later fails', async () => {
  const ok = usbFixture(); const pending = ok.receipt();
  assert.equal(ok.notices[0].title, 'Print initiated'); assert.deepEqual(ok.calls, []);
  await pending; await ok.label();
  assert.deepEqual(ok.notices.map(n => n.title), ['Print initiated', 'Print initiated']);
  const failed = usbFixture({ writeFails: true }); await assert.rejects(failed.label());
  assert.equal(failed.notices.length, 1);
  const invalid = usbFixture({ cpcl: true, renderFails: true }); await assert.rejects(invalid.label());
  assert.equal(invalid.notices.length, 1);
});

test('100 identical label copies render once, distinct data and later jobs render afresh', async () => {
  const f = usbFixture();
  await f.label(undefined, undefined, Array.from({length:100}, () => ({companyId:'company-a'})));
  assert.equal(f.calls.filter(c=>c==='render').length, 1);
  assert.equal(f.calls.filter(c=>c==='write').length, 100);
  f.calls.length = 0;
  await f.label(undefined, undefined, [{companyId:'company-a', barcode:'A'}, {companyId:'company-a', barcode:'B'}] as any);
  assert.equal(f.calls.filter(c=>c==='render').length, 2);
});
