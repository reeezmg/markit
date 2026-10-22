import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, createWriteStream, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import WebSocket from 'ws';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { createApp, createError, eventHandler, readBody, splitCookiesString, toWebHandler } from 'h3';
import { useChunkedAuthSession } from '../auth/server/utils/chunked-session';
import { normalizeBillingUnits } from '../utils/billing-units';
import { normalizeSizeLabels } from '../utils/size-labels';
import { packSelectedAccounts } from '../server/utils/selected-accounts-codec';
import { accountantSections } from '../utils/accountant-navigation';
import { activePageQueryState, nuxtPageDataState, vuePageMounted, requestBelongsToDocument, hasCompanyRestriction } from './helpers/page-query-state';
import { staticPageRedirect } from './helpers/page-redirects';
import { testCatalogForm } from './helpers/catalog-form';
import { RecordFixtures } from './helpers/record-fixtures';
import { testSettingsFailure } from './helpers/settings-failure-browser';
import { assertAuditBundleCurrent } from '../scripts/lib/branch-e2e-build-state.mjs';
import { readOnlyAuditJob } from './helpers/audit-job';

// Local authenticated browser testing. Default audits enforce READ ONLY; opt-in form mode uses run-owned fixtures.
// No login credentials, auth cookies, record contents or customer names are written to reports.
const formTests = process.env.BRANCH_E2E_FORM_TESTS === '1' || process.argv.includes('--forms');
const recordTests = process.argv.includes('--records');
const settingsFailureTests = process.argv.includes('--settings-failure');
const bundledServer = process.env.BRANCH_E2E_BUNDLED === '1' || process.argv.includes('--bundled');
const catalogForms = formTests && (process.env.BRANCH_E2E_CATALOG_FORMS === '1' || process.argv.includes('--catalog'));
const readJob = readOnlyAuditJob(process.env.BRANCH_E2E_READ_JOB, formTests, bundledServer);
const originalDatabaseUrl = process.env.DATABASE_URL!;
const testWriteUrl = new URL(originalDatabaseUrl);
testWriteUrl.searchParams.set('options', `${testWriteUrl.searchParams.get('options') || ''} -c default_transaction_read_only=off`.trim());
const recordPrefix = `BRANCH_E2E_${Date.now().toString(36).toUpperCase()}_`;
const url = new URL(originalDatabaseUrl);
url.searchParams.set('options', '-c default_transaction_read_only=on');
process.env.DATABASE_URL = url.toString();
process.env.PGOPTIONS = '-c default_transaction_read_only=on';
const db = new Pool({ connectionString: url.toString(), options: process.env.PGOPTIONS });
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const fixtureWriter = formTests || recordTests ? new PrismaClient({ datasources: { db: { url: testWriteUrl.toString() } } }) : null;
const folder = 'tests/branch-reports';
mkdirSync(folder, { recursive: true });
const runtimeFolder = resolve('..', 'artifacts', 'storetools-branch-e2e-run', readJob || '.');
mkdirSync(runtimeFolder, { recursive: true });
const browserProfileRoot = resolve('node_modules/.cache/branch-e2e-profiles');
mkdirSync(browserProfileRoot, { recursive: true });
const port = Number(process.env.BRANCH_E2E_PORT || 3107), origin = `http://127.0.0.1:${port}`;
const serverMemory = Number(process.env.BRANCH_E2E_MEMORY_MB || 8192);
assert.ok(Number.isSafeInteger(serverMemory) && serverMemory > 0, 'BRANCH_E2E_MEMORY_MB must be a positive integer');
const report: any = { databaseMode: 'read-only (verified for pg and Prisma)', bootstrap: 'local encrypted test session, existing authorized membership',
  serverMode: bundledServer ? 'bundled node server' : 'development server',
  serverHeapLimitMB: serverMemory, driverProcessId: process.pid, pages: [], switches: [], errors: [], startedAt: new Date().toISOString() };
if (formTests) { report.databaseMode = `test database: only run-prefixed ${catalogForms ? 'coupon/brand/collection/category' : 'coupon'} fixtures may be mutated`; report.forms = []; }
const fixtureCompanyIds: string[] = [];
let recordFixtures: RecordFixtures | undefined;
let appProcess: ReturnType<typeof spawn> | undefined, chrome: ReturnType<typeof spawn> | undefined, socket: WebSocket | undefined;
let browserProfile: string | undefined;
const output = createWriteStream(runtimeFolder + '/server.log');
let sequence = 0;
const pageTimeout = Number(process.env.BRANCH_E2E_PAGE_MS || 180000);
const pending = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
const command = (method: string, params: any = {}, timeoutMs = method === 'Page.navigate' ? pageTimeout : 60000) => new Promise<any>((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(Error(`Chrome command timed out: ${method}`)); }, timeoutMs);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  socket!.send(JSON.stringify({ id, method, params }));
});
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let stopRequested = false;
const controlTimer = setInterval(() => {
  try {
    const control = JSON.parse(readFileSync(runtimeFolder + '/control.json', 'utf8').replace(/^\uFEFF/, ''));
    if (control.stopDriver === process.pid && control.startedAt === report.startedAt) {
      stopRequested = true;
      for (const waiter of pending.values()) waiter.reject(Error('Audit stopped by control request'));
      pending.clear();
    }
  } catch {}
}, 1000);
const assertAuditRunning = () => {
  if (stopRequested) throw Error('Audit stopped by control request');
  if (appProcess && appProcess.exitCode !== null) throw Error('Audit server exited; remaining pages cannot be checked');
};
const safe = (value: string) => value.replace(/[a-f\d]{8}-[a-f\d-]{27,}/gi, ':record').replace(/[\w.+-]+@[\w.-]+/g, ':email');
const save = () => writeFileSync(runtimeFolder + '/results.json', JSON.stringify(report, null, 2) + '\n');

async function cookieFor(userId: string, companyId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { companies: { where: { companyId },
    include: { company: { include: { address: true, pipeline: true, productinput: true, variantinput: true } } } } } });
  const accountDefaults = async (id: string) => {
    const { rows } = await db.query(`SELECT DISTINCT ON ("resourceId") "resourceId","after" FROM accountant_v2_accountant_audit
      WHERE company_id=$1 AND resource='account-defaults' AND action='configured' AND deleted_at IS NULL
      ORDER BY "resourceId",created_at DESC,id DESC`, [id]);
    const mappings = await db.query(`SELECT 'erp' kind,accounts FROM accountant_v2_erp_settings WHERE company_id=$1
      UNION ALL SELECT 'staff',accounts FROM accountant_v2_user_settings WHERE company_id=$1
      UNION ALL SELECT 'ecommerce',accounts FROM accountant_v2_ecommerce_settings WHERE company_id=$1`, [id]);
    return { companyId: id, version: 2, defaults: { ...Object.fromEntries(rows.map(row => [row.resourceId, row.after || {}])),
      ...Object.fromEntries(mappings.rows.map(row => [row.kind, row.accounts || {}])) } };
  };
  const config = { name: 'nuxt-session', password: process.env.NUXT_AUTH_PASSWORD || 'secretsecretsecretsecretsecretsecretsecret',
    cookie: { secure: false, sameSite: 'lax' as const, maxAge: 14400 } };
  const bindings: Record<string, any> = { eventHandler, readBody, createError,
    useAuthSession: (event: any) => useChunkedAuthSession(event, config),
    findUserByEmail: async () => user, hash: async () => user.password,
    getPurchaseExpenseCategoryId: async (id: string) => (await prisma.expenseCategory.findFirstOrThrow({ where: { companyId: id, name: 'Purchase' } })).id,
    loadSelectedAccounts: accountDefaults, packSelectedAccounts, normalizeBillingUnits, normalizeSizeLabels,
    getHeadOfficeAdmin: async () => null, ensureHeadOfficeBranchMemberships: async () => {},
  };
  // Reuse production session construction, replacing only password verification and membership provisioning
  // inside this test process. The running app has no test endpoint and no auth bypass.
  const source = ts.transpileModule(readFileSync('auth/server/api/auth/login.post.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?\r?\n/gm, '').replace('export default', 'return');
  const login = new Function(...Object.keys(bindings), source)(...Object.values(bindings));
  const app = createApp().use('/bootstrap', login);
  const response = await toWebHandler(app)(new Request(origin + '/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'local-e2e-bootstrap', password: 'in-memory-verification' }) }));
  assert.equal(response.status, 200, 'Local session bootstrap');
  return splitCookiesString(response.headers.get('set-cookie') || '').map(cookie => {
    const [pair] = cookie.split(';'), split = pair.indexOf('=');
    return { name: pair.slice(0, split), value: pair.slice(split + 1), url: origin, httpOnly: true, sameSite: 'Lax' };
  });
}

try {
  assert.equal((await db.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
  const prismaMode: any = await prisma.$queryRawUnsafe('SHOW default_transaction_read_only');
  assert.equal(prismaMode[0].default_transaction_read_only, 'on', 'Prisma must also be read only');
  const { rows } = await db.query(`SELECT h.id head,b.id branch,h.plan head_plan,b.plan branch_plan,hu.user_id FROM companies h
    JOIN company_users hu ON hu.company_id=h.id AND hu.role='admin' AND hu.status=true AND hu.deleted=false
    JOIN companies b ON b.parent_company_id=h.id AND b.status=true
    JOIN company_users bu ON bu.company_id=b.id AND bu.user_id=hu.user_id AND bu.status=true AND bu.deleted=false
    WHERE h.is_head_office=true AND h.parent_company_id IS NULL AND h.status=true ORDER BY h.id,b.id LIMIT 1`);
  assert.ok(rows.length, 'An existing head-office/branch admin membership is required; fixtures are never created in production');
  const fixture = rows[0];
  fixtureCompanyIds.push(fixture.head, fixture.branch);
  if (recordTests) {
    assert.ok(!formTests, 'Detail fixtures use a read-only browser server');
    recordFixtures = new RecordFixtures(fixtureWriter, recordPrefix, folder + '/detail-fixture-backup.json');
    for (const companyId of fixtureCompanyIds) await recordFixtures.seed(companyId, fixture.user_id);
    report.recordFixtures = 'run-owned draft/zero-value detail records; browser API remains read-only';
  }
  if (formTests) {
    assert.equal(await prisma.coupon.count({ where: { code: { startsWith: recordPrefix } } }), 0, 'Fixture namespace must be unused');
    writeFileSync(folder + '/form-fixture-backup.json', JSON.stringify({ recordPrefix, existingRecords: [], createdRecords: [], cleanup: 'pending' }, null, 2));
    if (catalogForms) {
      for (const model of ['brand', 'collection', 'category'] as const)
        assert.equal(await (prisma[model] as any).count({ where: { name: { startsWith: recordPrefix } } }), 0);
      writeFileSync(folder + '/catalog-fixture-backup.json', JSON.stringify({ recordPrefix, existingRecords: [], snapshots: [], cleanup: 'pending' }, null, 2));
    }
  }
  const cookies = await cookieFor(fixture.user_id, fixture.head);
  if (process.env.BRANCH_E2E_PREFLIGHT === '1') {
    report.preflight = 'passed'; save();
    console.log('PASS: pg and Prisma enforce read-only transactions; existing head/branch membership and encrypted local session are ready.');
  } else {
  writeFileSync(folder + '/e2e.env', '# Credentials are inherited in memory; the driver explicitly selects read-only or authorized fixture mode.\n');
  if (bundledServer) {
    assert.ok(existsSync('.output-branch-e2e/server/index.mjs'), 'Build the isolated bundled server before running --bundled');
    const manifest = assertAuditBundleCurrent();
    report.bundleFingerprint = manifest.sources.fingerprint;
  }
  const serverArguments = bundledServer ? ['.output-branch-e2e/server/index.mjs'] : ['node_modules/@nuxt/cli/bin/nuxi.mjs', 'dev', '--host', '127.0.0.1', '--port', String(port), '--dotenv', folder + '/e2e.env'];
  if (process.env.BRANCH_E2E_INSPECT === '1') {
    assert.ok(bundledServer && !formTests, 'Inspector diagnostics require the built read-only server');
    serverArguments.unshift('--inspect=127.0.0.1:0');
  }
  appProcess = spawn(process.execPath, serverArguments, {
    windowsHide: true, env: { ...process.env, DATABASE_URL: formTests ? testWriteUrl.toString() : url.toString(),
      PGOPTIONS: formTests ? '-c default_transaction_read_only=off' : process.env.PGOPTIONS, BRANCH_E2E_FORM_TESTS: formTests ? '1' : '',
      BRANCH_E2E_CATALOG_FORMS: catalogForms ? '1' : '',
      BRANCH_E2E_RECORD_PREFIX: formTests ? recordPrefix : '',
      NODE_OPTIONS: `--max-old-space-size=${serverMemory}`, NUXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: bundledServer ? 'production' : 'development', DEBUG: '', NUXT_DEBUG: '', MARKIT_E2E_BUILD_DIR: resolve('.nuxt-branch-e2e'),
      NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port),
      BASE_URL: origin + '/api/model', NUXT_PUBLIC_BASE_URL: origin + '/api/model' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  appProcess.stdout!.pipe(output, { end: false }); appProcess.stderr!.pipe(output, { end: false });
  report.serverProcessId = appProcess.pid; save();
  let startupFailure = '';
  let startupOutput = '';
  const inspectStartup = (chunk: Buffer) => {
    const text = startupOutput = (startupOutput + String(chunk)).slice(-16000);
    if (text.includes('[branch-e2e] Actual Nitro PostgreSQL and Prisma clients verified READ ONLY.')) report.actualServerReadOnlyVerified = true;
    if (formTests && text.includes('[branch-e2e] Actual Nitro clients verified TEST FORM MODE.')) report.actualServerTestModeVerified = true;
    const match = text.match(/(?:Pre-transform error:|Branch E2E server refused startup:)[^\r\n]+/);
    if (match) startupFailure = safe(match[0]);
  };
  appProcess.stdout!.on('data', inspectStartup); appProcess.stderr!.on('data', inspectStartup);
  let ready = false;
  const startupDeadline = Date.now() + Number(process.env.BRANCH_E2E_STARTUP_MS || 1800000);
  for (let n = 0; Date.now() < startupDeadline; n++) {
    assertAuditRunning();
    if (startupFailure) throw Error(startupFailure);
    if (appProcess.exitCode !== null) throw Error('Nuxt exited; inspect artifacts/storetools-branch-e2e-run/server.log');
    try { const response = await fetch(origin + '/api/auth/session', { signal: AbortSignal.timeout(15000) });
      if (response.ok && (formTests ? report.actualServerTestModeVerified : report.actualServerReadOnlyVerified)) { ready = true; break; }
    } catch {}
    if (n % 20 === 0) console.log(formTests ? 'Waiting for isolated test-form Nuxt app...' : 'Waiting for read-only Nuxt app...');
    await pause(1000);
  }
  assert.ok(ready, 'Read-only Nuxt server startup');
  const mutationProbe = await fetch(origin + '/api/branch-e2e-readonly-probe', { method: 'POST', signal: AbortSignal.timeout(60000) });
  assert.equal(mutationProbe.status, 409, 'Audit guard must end the request before route handling');
  assert.equal(mutationProbe.headers.get('x-branch-audit-blocked'), 'mutation', 'Audit server must block state-changing routes');
  report.mutationGuardVerified = true;
  const authenticated = await fetch(origin + '/api/auth/session', {
    headers: { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') },
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(authenticated.status, 200, 'Actual server must accept the encrypted test session');
  const authenticatedSession: any = await authenticated.json();
  assert.ok(authenticatedSession.id === fixture.user_id && authenticatedSession.companyId === fixture.head,
    'Actual server must authenticate the intended existing member and head office');
  // Keep any session refresh issued by the real server (including its chunk clearing).
  const refreshedCookies = splitCookiesString(authenticated.headers.get('set-cookie') || '');
  const browserCookies = new Map(cookies.map(cookie => [cookie.name, cookie]));
  for (const cookie of refreshedCookies) {
    const [pair] = cookie.split(';'), split = pair.indexOf('=');
    const name = pair.slice(0, split), value = pair.slice(split + 1);
    if (!value || /max-age=0(?:;|$)/i.test(cookie)) browserCookies.delete(name);
    else browserCookies.set(name, { name, value, url: origin, httpOnly: true, sameSite: 'Lax' });
  }
  cookies.splice(0, cookies.length, ...browserCookies.values());
  report.authenticatedSessionVerified = true; save();
  const binary = [process.env.BRANCH_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
  assert.ok(binary, 'Chrome or Edge required');
  browserProfile = mkdtempSync(join(browserProfileRoot, 'markit-branch-e2e-'));
  chrome = spawn(binary!, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--no-default-browser-check',
    '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${browserProfile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 30000); let text = '';
    chrome!.stderr!.on('data', chunk => { text += chunk; const found = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) { clearTimeout(timer); resolve(found[1]); } }); chrome!.once('error', reject);
  });
  const debuggerOrigin = `http://${new URL(endpoint).host}`;
  let target: any;
  let errors: any[] = [], activity = Date.now();
  let currentLoaderId = '';
  const inflight = new Set<string>();
  const requestPaths = new Map<string, string>();
  const requestLoaders = new Map<string, string>();
  const activeRequests = () => [...inflight].filter(id => requestBelongsToDocument(requestLoaders.get(id), currentLoaderId)).length;
  const pendingModules = new Map<string, string>();
  const moduleLoaders = new Map<string, string>();
  const activeModules = () => [...pendingModules.keys()].filter(id => requestBelongsToDocument(moduleLoaders.get(id), currentLoaderId)).length;
  let hydrationWarnings: any[] = [];
  let settingsMutation: { path: string; companyId?: string } | undefined;
  const handlePageMessage = (buffer: any) => {
    const message = JSON.parse(String(buffer)), waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); message.error ? waiter.reject(message.error) : waiter.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push({ kind: 'javascript', detail: safe(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text) });
    if (message.method === 'Page.javascriptDialogOpening') {
      errors.push({ kind: 'native-dialog', type: message.params.type });
      void command('Page.handleJavaScriptDialog', { accept: message.params.type === 'alert' }).catch(() => {});
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
      const strings: string[] = message.params.args.filter((arg: any) => arg.type === 'string').map((arg: any) => arg.value);
      if (strings.some(value => /hydration/i.test(value))) hydrationWarnings.push({
        mismatch: strings.find(value => /hydration/i.test(value))?.match(/Hydration\s+(children|text content|node|class|style|attribute).*?mismatch/i)?.[1] || 'other',
        nodeTags: [...new Set(message.params.args.filter((arg: any) => arg.subtype === 'node')
          .map((arg: any) => String(arg.description || '').match(/^(?:[A-Za-z][\w-]*|#comment|#text)/)?.[0]).filter(Boolean))],
        components: [...new Set(strings.flatMap(value => [...value.matchAll(/at <([A-Za-z][\w.-]*)/g)].map(match => match[1])))],
        controlAttributes: strings.flatMap(value => [...value.matchAll(/(rendered on server|expected on client):\s*((?:id|for|aria-labelledby|aria-controls)="[A-Za-z0-9:_ .-]{1,120}")/g)]
          .map(match => ({ side: match[1], attribute: match[2] }))),
      });
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const frame = message.params.stackTrace?.callFrames?.[0];
      // Record error locations, never arbitrary console arguments/customer data.
      const descriptions = message.params.args.map((arg: any) => String(arg.description || arg.value || ''));
      const category = descriptions.some((value: string) => /hydration.*mismatch/i.test(value)) ? 'hydration-mismatch'
        : descriptions.some((value: string) => /Geocoding Service:.*enable Billing/i.test(value)) ? 'maps-billing-required'
        : descriptions.map((value: string) => value.match(/\b(?:TypeError|ReferenceError|SyntaxError)\b/)?.[0]
          || value.match(/\b(?:[A-Za-z]+MapError|InvalidValueError|REQUEST_DENIED)\b/)?.[0]).find(Boolean);
      errors.push({ kind: 'console-error', source: safe((frame?.url || '').replace(origin, '').split('?')[0]), line: frame?.lineNumber,
        ...(category ? { category } : {}) });
    }
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith(origin + '/api/')) {
      const request = message.params.request;
      const path = new URL(request.url).pathname;
      if (['POST', 'PUT', 'PATCH'].includes(request.method) &&
          (path.startsWith('/api/model/') || path.startsWith('/api/accountant/'))) {
        let body: any; try { body = JSON.parse(request.postData || '{}'); } catch {}
        const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key.toLowerCase(), value]));
        // Retain ownership proof only, never cookies, full payloads or record data.
        settingsMutation = { path, companyId: headers['x-company-id'] as string ||
          (path === '/api/model/company/update' ? body?.where?.id
            : body?.where?.companyId_pageName_key?.companyId) };
      }
      inflight.add(message.params.requestId); requestPaths.set(message.params.requestId, new URL(message.params.request.url).pathname); activity = Date.now();
      requestLoaders.set(message.params.requestId, message.params.loaderId);
    }
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith(origin + '/_nuxt/') && message.params.type !== 'WebSocket') {
      pendingModules.set(message.params.requestId, new URL(message.params.request.url).pathname); activity = Date.now();
      moduleLoaders.set(message.params.requestId, message.params.loaderId);
    }
    if (message.method === 'Network.loadingFailed' && inflight.has(message.params.requestId) &&
        requestBelongsToDocument(requestLoaders.get(message.params.requestId), currentLoaderId) && !message.params.canceled)
      errors.push({ kind: 'network', path: safe(requestPaths.get(message.params.requestId) || ''), detail: message.params.errorText });
    if (['Network.loadingFinished', 'Network.loadingFailed'].includes(message.method) && inflight.delete(message.params.requestId)) {
      requestPaths.delete(message.params.requestId); requestLoaders.delete(message.params.requestId); activity = Date.now();
    }
    if (message.method === 'Network.loadingFailed' && pendingModules.has(message.params.requestId) && requestBelongsToDocument(moduleLoaders.get(message.params.requestId), currentLoaderId) && !message.params.canceled)
      errors.push({ kind: 'module-network', path: safe(pendingModules.get(message.params.requestId) || ''), detail: message.params.errorText });
    if (['Network.loadingFinished', 'Network.loadingFailed'].includes(message.method) && pendingModules.delete(message.params.requestId)) { moduleLoaders.delete(message.params.requestId); activity = Date.now(); }
    if (message.method === 'Network.responseReceived' && currentLoaderId &&
        requestBelongsToDocument(message.params.loaderId, currentLoaderId) && message.params.response.url.startsWith(origin)) {
      const timing = Object.entries(message.params.response.headers || {}).find(([name]) => name.toLowerCase() === 'server-timing')?.[1];
      const bytes = Buffer.byteLength(String(timing || ''));
      report.serverTimingMaxBytes = Math.max(report.serverTimingMaxBytes || 0, bytes);
      if (bytes > 8192) errors.push({ kind: 'transport-header-budget', path: safe(new URL(message.params.response.url).pathname), bytes });
    }
    if (message.method === 'Network.responseReceived' && currentLoaderId &&
        requestBelongsToDocument(requestLoaders.get(message.params.requestId), currentLoaderId) && inflight.has(message.params.requestId) &&
        message.params.response.url.startsWith(origin + '/api/') && message.params.response.status >= 400) {
      const blocked = Object.entries(message.params.response.headers || {}).find(([name]) => name.toLowerCase() === 'x-branch-audit-blocked')?.[1];
      errors.push({ kind: blocked ? 'audit-blocked' : 'api', path: safe(new URL(message.params.response.url).pathname), status: message.params.response.status, ...(blocked ? { reason: blocked } : {}) });
    }
    if (message.method === 'Network.responseReceived' && requestBelongsToDocument(message.params.loaderId, currentLoaderId) && message.params.response.url.startsWith(origin) && message.params.response.status >= 400 &&
      (message.params.type === 'Document' || message.params.response.url.startsWith(origin + '/_nuxt/')))
      errors.push({ kind: 'page-or-module', path: safe(new URL(message.params.response.url).pathname), status: message.params.response.status });
  };
  async function openBrowserPage() {
    target = await fetch(debuggerOrigin + '/json/new?about:blank', { method: 'PUT', signal: AbortSignal.timeout(30000) }).then(r => r.json());
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => { socket!.once('open', resolve); socket!.once('error', reject); });
    socket.on('error', () => {});
    socket.on('message', handlePageMessage);
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    if (process.env.BRANCH_E2E_BROWSER_DEBUG === '1') writeFileSync(runtimeFolder + '/browser-debug.json', JSON.stringify({ driverProcessId: process.pid, debuggerOrigin, targetWebSocket: target.webSocketDebuggerUrl }) + '\n');
    await command('Network.setBlockedURLs', { urls: ['*google-analytics.com*', '*googletagmanager.com*'] });
  }
  await openBrowserPage();
  await command('Network.setCookies', { cookies });
  const inventory = JSON.parse(readFileSync(folder + '/page-audit.json', 'utf8')).inventory;
  // Pure redirect pages are route aliases, not screens expected to retain the alias URL.
  const staticRedirects: Record<string, string> = {};
  for (const row of inventory.filter((row: any) => !row.page.includes('['))) {
    const descriptor = parse(readFileSync('pages/' + row.page, 'utf8')).descriptor;
    const target = staticPageRedirect(descriptor.scriptSetup?.content || descriptor.script?.content || '');
    if (target) {
      staticRedirects['/' + row.page.replace(/\.vue$/, '').replace(/(?:^|\/)index$/, '')] = target;
    }
  }
  report.staticRedirects = staticRedirects;
  report.navigationMode = 'fresh document and query client for each page'; save();
  const excludedBuyerRoutes = ['/marketplace', '/checkout'];
  report.excludedBuyerRoutes = [...excludedBuyerRoutes, '/checkout/:orderId'];
  const routes = [...new Set<string>(['/settings/branches', ...inventory.filter((row: any) => row.mode !== 'public/auth' && !row.page.includes('['))
    .map((row: any) => '/' + row.page.replace(/\.vue$/, '').replace(/(?:^|\/)index$/, ''))])].filter(route => !excludedBuyerRoutes.includes(route));
  routes.push(...accountantSections.flatMap(section => section.links.map(([view]) => '/accountant/' + view)));
  const selectedRoutes = process.env.BRANCH_E2E_ROUTES?.split(',').filter(Boolean) || [];
  const requestedRoutes = selectedRoutes.length ? selectedRoutes : (settingsFailureTests ? ['/settings', '/settings/store'] : formTests ? ['/coupon'] : undefined);
  report.pageAuditScope = requestedRoutes ? 'requested routes and form visits only' : 'all static seller routes, Accountant views and available record pages';
  report.formsScope = formTests ? (catalogForms ? ['coupon', 'brand', 'collection', 'category'] : ['coupon']) : [];
  // Dynamic record pages are included only when an existing company-owned record is available.
  async function dynamicRoutes(companyId: string) {
    const specs = [['product', '/products/edit/'], ['brand', '/products/brands/edit/'], ['category', '/products/categories/edit/'],
      ['collection', '/products/collections/edit/'], ['bill', '/erp/edit/'], ['purchaseReturn', '/distributor/edit-purchase-return/'],
      ['payrollCycle', '/users/salary/cycle/'], ['bankAccount', '/accounts/bank/'], ['statementBatch', '/statement/'],
      ['accountantManualJournal', '/accountant/manual-journals/', '/edit'], ['accountantInvestor', '/investments/investors/']];
    const result: string[] = [];
    for (const [model, prefix, suffix = ''] of specs) {
      if (!(prisma as any)[model]) continue;
      const meta = Prisma.dmmf.datamodel.models.find(row => row.name[0].toLowerCase() + row.name.slice(1) === model);
      const where = { companyId, ...(meta?.fields.some(field => field.name === 'deleted') ? { deleted: false } : {}) };
      try { const fixtureId = recordFixtures?.id(model, companyId);
        const record = fixtureId ? { id: fixtureId } : await (prisma as any)[model].findFirst({ where, select: { id: true } });
        if (record) result.push(prefix + record.id + suffix); else report.pages.push({ company: companyId === fixture.head ? 'head' : 'branch', route: prefix + ':id' + suffix, status: 'no-existing-record' });
      } catch { report.pages.push({ company: companyId === fixture.head ? 'head' : 'branch', route: prefix + ':id', status: 'fixture-query-unavailable' }); }
    }
    const history = await prisma.billHistory.findFirst({ where: { bill: { companyId } }, select: { id: true } });
    if (history) result.push('/saleshistory/' + history.id);
    const bill = await prisma.bill.findFirst({ where: { companyId, deleted: false }, select: { id: true } });
    if (bill) result.push('/receipt/' + bill.id);
    const onlineFixtureId = recordFixtures?.id('bill', companyId);
    const online = onlineFixtureId ? { id: onlineFixtureId } : await prisma.bill.findFirst({ where: { companyId, deleted: false, isMarkit: true }, select: { id: true } });
    if (online) result.push('/erp/online/' + online.id, '/order/ready?id=' + encodeURIComponent(online.id));
    else for (const route of ['/erp/online/:id', '/order/ready?id=:id'])
      report.pages.push({ company: companyId === fixture.head ? 'head' : 'branch', route, status: 'no-existing-record' });
    const packFixtureId = recordFixtures?.id('trynbuy', companyId);
    const packOrder = packFixtureId ? { id: packFixtureId } : await prisma.trynbuy.findFirst({ where: { company: { some: { id: companyId } } }, select: { id: true } });
    if (packOrder) result.push('/order/pack?id=' + encodeURIComponent(packOrder.id));
    else report.pages.push({ company: companyId === fixture.head ? 'head' : 'branch', route: '/order/pack?id=:id', status: 'no-existing-record' });
    return result;
  }
  async function recoverBrowserPage() {
    assertAuditRunning();
    for (const waiter of pending.values()) waiter.reject(Error('Unresponsive page closed'));
    pending.clear();
    socket?.removeAllListeners('message'); socket?.terminate();
    await fetch(debuggerOrigin + '/json/close/' + target.id, { signal: AbortSignal.timeout(10000) }).catch(() => {});
    currentLoaderId = '';
    inflight.clear(); requestPaths.clear(); requestLoaders.clear(); pendingModules.clear(); moduleLoaders.clear();
    await openBrowserPage(); // Same browser profile retains the current company's encrypted cookie.
    await command('Page.navigate', { url: origin + '/api/auth/session' }); // Establish the app origin before any company switch.
  }
  async function visit(route: string, company: string) {
    report.currentPage = { company, route: safe(route), startedAt: new Date().toISOString() }; save();
    console.log(`Checking ${company} ${safe(route)}...`);
    errors = []; hydrationWarnings = []; inflight.clear(); requestPaths.clear(); requestLoaders.clear(); pendingModules.clear(); moduleLoaders.clear(); activity = Date.now();
    currentLoaderId = '';
    await command('Runtime.evaluate', { expression: "try{localStorage.removeItem('lastRoute')}catch{}" });
    let expectedRoute = staticRedirects[route] || route;
    const plan = company === 'head' ? fixture.head_plan : fixture.branch_plan;
    if (company === 'branch' && route === '/settings/branches') expectedRoute = '/settings/store';
    if (route === '/order/pack') expectedRoute = '/order/trynbuy';
    if (route === '/order/ready') expectedRoute = '/erp/online';
    if (route.startsWith('/erp/billing') && ['free', 'lite'].includes(plan)) expectedRoute = '/offline';
    if (route.startsWith('/offline') && plan === 'pro') expectedRoute = '/erp/billing';
    const expectedPath = new URL(expectedRoute, origin).pathname.replace(/\/$/, '');
    const started = Date.now();
    const navigation = await command('Page.navigate', { url: origin + route });
    if (navigation.errorText) throw Error(navigation.errorText);
    currentLoaderId = navigation.loaderId || '';
    let state: any, settled = false;
    while (Date.now() - started < pageTimeout) {
      assertAuditRunning();
      const response = await command('Runtime.evaluate', { expression: `(()=>{const app=document.querySelector('#__nuxt')?.__vue_app__;return JSON.stringify({ready:document.readyState,path:location.pathname,
        mounted:(${vuePageMounted.toString()})(document.querySelector('#__nuxt')),...(${activePageQueryState.toString()})(app?._context?.provides?.VUE_QUERY_CLIENT),
        ...(${nuxtPageDataState.toString()})(app?.$nuxt),
        error:!!document.querySelector('#__nuxt_error') || /^(500|Server Error|Internal Server Error)/.test(document.title),
        blank:!document.querySelector('#__nuxt')?.textContent?.trim()})})()`, returnByValue: true });
      try { state = JSON.parse(response.result.value); } catch {}
      if (state?.ready === 'complete' && state.mounted && !state.loadingQueries && !state.loadingAsyncData && state.path.replace(/\/$/, '') === expectedPath &&
          !activeRequests() && !activeModules() && Date.now() - activity > 1200 && Date.now() - started > 2500) { settled = true; break; }
      await pause(300);
    }
    if (state?.failedQueries) errors.push({ kind: 'query-state', count: state.failedQueries });
    if (state?.loadingQueries) errors.push({ kind: 'query-loading', count: state.loadingQueries });
    if (state?.failedAsyncData) errors.push({ kind: 'nuxt-data', count: state.failedAsyncData });
    if (state?.loadingAsyncData) errors.push({ kind: 'nuxt-loading', count: state.loadingAsyncData });
    const failed = !settled || errors.length || !state || state.error || state.blank ||
      state.path.replace(/\/$/, '') !== expectedPath;
    const blocked = settled && state && !state.error && !state.blank && errors.length && errors.every(error => error.kind === 'audit-blocked');
    report.pages.push({ company, route: safe(route), status: blocked ? 'blocked-read-only' : failed ? 'failed' : 'passed', landed: safe(state?.path || ''),
      expectedPath: safe(expectedPath || '/'),
      settled, readyState: state?.ready, mounted: state?.mounted, loadingQueries: state?.loadingQueries, failedQueries: state?.failedQueries,
      loadingAsyncData: state?.loadingAsyncData, failedAsyncData: state?.failedAsyncData,
      pendingApiPaths: [...requestPaths].filter(([id]) => requestBelongsToDocument(requestLoaders.get(id), currentLoaderId)).map(([, path]) => safe(path)),
      pendingApiScopes: [...requestPaths].map(([id, path]) => ({ path: safe(path), sameDocument: requestLoaders.get(id) === currentLoaderId, documentKnown: Boolean(requestLoaders.get(id)) })),
      pendingModulePaths: [...pendingModules].filter(([id]) => requestBelongsToDocument(moduleLoaders.get(id), currentLoaderId)).map(([, path]) => safe(path)), hydrationWarnings: [...hydrationWarnings],
      durationMs: Date.now() - started, errors: [...errors] }); save();
    console.log(`${company} ${safe(route)} ${blocked ? 'BLOCKED (read-only audit)' : failed ? 'FAIL' : 'PASS'}${errors.length ? ` (${errors.length} errors)` : ''}`);
    return settled;
  }
  async function checkPage(route: string, company: string) {
    assertAuditRunning();
    const started = Date.now();
    let recover = false;
    try {
      recover = !await visit(route, company);
      if (route === '/products' && report.pages.at(-1)?.status === 'passed') await testProductExpansion(company);
      if (route === '/notifications' && report.pages.at(-1)?.status === 'passed') await testNotificationTabs(company);
      if (company === 'head' && report.pages.at(-1)?.status === 'passed') await testTableCompanyFilter(route);
    }
    catch (error: any) {
      report.pages.push({ company, route: safe(route), status: 'failed', durationMs: Date.now() - started,
        errors: [...errors, { kind: 'browser', detail: safe(error.message) }], hydrationWarnings: [...hydrationWarnings] }); save();
      console.log(`${company} ${safe(route)} FAIL (browser)`);
      recover = true;
    }
    if (recover) {
      report.recoveries ||= [];
      report.recoveries.push({ company, route: safe(route), time: new Date().toISOString() }); save();
      await recoverBrowserPage();
    }
  }
  async function testTableCompanyFilter(route: string) {
    const evaluate = async (expression: string) => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const selector = `(()=>[...document.querySelectorAll('select')].find(select=>select.getClientRects().length&&[...select.options].some(option=>option.value===''&&option.textContent.trim()==='All companies')&&[...select.options].some(option=>option.value===${JSON.stringify(fixture.branch)})))()`;
    const initial = await evaluate(`(()=>{const select=${selector};return select?{value:select.value}:null})()`);
    if (!initial) return;
    report.interactions ||= [];
    const result: any = { company: 'head', route, action: 'filter branch without switching sidebar company', status: 'running' };
    report.interactions.push(result); save();
    const errorStart = errors.length;
    const select = async (value: string) => {
      assert.ok(await evaluate(`(()=>{const select=${selector};if(!select)return false;select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));return true})()`));
      await pause(300);
      const deadline = Date.now() + pageTimeout;
      let settled = false;
      while (Date.now() < deadline) {
        assertAuditRunning();
        const state = await evaluate(`(()=>{const app=document.querySelector('#__nuxt')?.__vue_app__;return (${activePageQueryState.toString()})(app?._context?.provides?.VUE_QUERY_CLIENT)})()`);
        if (!state.loadingQueries && !activeRequests() && !activeModules() && Date.now() - activity > 1200) {
          assert.equal(state.failedQueries, 0, 'Filtered queries must succeed'); settled = true; break;
        }
        await pause(300);
      }
      assert.ok(settled, 'Company filter requests must finish');
      assert.equal(await evaluate(`(${selector})?.value`), value, 'Local company filter retains its selection');
    };
    try {
      await select(fixture.branch);
      const model = ({ '/products': 'Product', '/products/brands': 'Brand', '/products/categories': 'Category', '/products/collections': 'Collection', '/coupon': 'Coupon' } as Record<string, string>)[route];
      if (model) {
        const scopes = await evaluate(`(()=>{const client=document.querySelector('#__nuxt')?.__vue_app__?._context?.provides?.VUE_QUERY_CLIENT;return client.getQueryCache().getAll().filter(query=>query.isActive()&&query.queryKey[1]===${JSON.stringify(model)}).map(query=>({branch:(${hasCompanyRestriction.toString()})(query.queryKey,${JSON.stringify(fixture.branch)}),head:(${hasCompanyRestriction.toString()})(query.queryKey,${JSON.stringify(fixture.head)})}))})()`);
        assert.ok(scopes.length, 'The filtered model must have an active query');
        assert.ok(scopes.every((scope: any) => scope.branch && !scope.head), 'Actual query keys must restrict ownership to the selected branch');
        result.restrictedQueries = scopes.length;
      }
      const sessionCompany = await evaluate("(async()=>{const response=await fetch('/api/auth/session');if(!response.ok)throw Error('Session verification failed');return (await response.json()).companyId})()");
      assert.equal(sessionCompany, fixture.head, 'A table filter must not switch the authenticated company');
      await select(initial.value);
      assert.equal(errors.length, errorStart, 'Filtering must not fail API requests or throw');
      result.status = 'passed';
    } catch (error: any) {
      result.status = 'failed'; result.error = safe(error.message); result.errors = errors.slice(errorStart); process.exitCode = 1;
      // Restore the control where possible so later forms start in the original scope.
      await select(initial.value).catch(() => {});
    } finally { save(); console.log(`Company table filter ${safe(route)}: ${result.status}`); }
  }
  async function testNotificationTabs(company: string) {
    report.interactions ||= [];
    const result: any = { company, route: '/notifications', action: 'switch unread/all tabs without marking notifications read', status: 'running' };
    report.interactions.push(result); save();
    const errorStart = errors.length;
    const state = async () => {
      const response = await command('Runtime.evaluate', { expression: "(()=>{const tabs=[...document.querySelectorAll('[role=tab]')].filter(e=>e.getClientRects().length);return {count:tabs.length,selected:tabs.findIndex(e=>e.getAttribute('aria-selected')==='true')}})()", returnByValue: true });
      return response.result.value;
    };
    try {
      const initial = await state(); result.initial = initial;
      assert.equal(initial.count, 2, 'Unread and All tabs must be visible');
      for (const index of [1, 0]) {
        await command('Runtime.evaluate', { expression: `[...document.querySelectorAll('[role=tab]')].filter(e=>e.getClientRects().length)[${index}].click()` });
        const deadline = Date.now() + Math.min(pageTimeout, 15000);
        let current: any;
        while (Date.now() < deadline && errors.length === errorStart) {
          assertAuditRunning(); current = await state();
          if (current?.selected === index && !activeRequests() && Date.now() - activity > 1200) break;
          await pause(200);
        }
        result.errors = errors.slice(errorStart);
        assert.equal(result.errors.length, 0, 'Changing tabs must not throw or mark ordinary notifications read');
        assert.equal(current?.selected, index, 'Selected notification tab must follow the click');
      }
      assert.equal(initial.selected, 0, 'The page must default to unread notifications');
      result.status = 'passed';
    } catch (error: any) {
      result.status = 'failed'; result.error = safe(error.message); result.errors = errors.slice(errorStart); process.exitCode = 1;
    } finally { save(); console.log(`Notification tabs ${company}: ${result.status}`); }
  }
  async function testProductExpansion(company: string) {
    report.interactions ||= [];
    const result: any = { company, route: '/products', action: 'expand product row', status: 'running' };
    report.interactions.push(result); save();
    const errorStart = errors.length;
    try {
      const clicked = await command('Runtime.evaluate', { expression: `(()=>{const row=[...document.querySelectorAll('table tbody tr')].find(row=>row.getClientRects().length&&row.cells.length>1&&row.cells[0]?.querySelector('button'));const button=row?.cells[0]?.querySelector('button');if(!button)return false;button.click();return true})()`, returnByValue: true });
      if (!clicked.result.value) { result.status = 'no-visible-expandable-record'; return; }
      const deadline = Date.now() + pageTimeout;
      let expanded = false;
      while (Date.now() < deadline && errors.length === errorStart) {
        assertAuditRunning();
        const state = await command('Runtime.evaluate', { expression: "!![...document.querySelectorAll('table tbody td[colspan]')].find(cell=>cell.getClientRects().length)", returnByValue: true });
        expanded = !!state.result.value;
        if (expanded && !activeRequests() && !activeModules() && Date.now() - activity > 1200) break;
        await pause(300);
      }
      result.errors = errors.slice(errorStart);
      assert.ok(expanded, 'Product variants must appear after expanding a row');
      assert.equal(result.errors.length, 0, 'Expanding a product must not throw or fail API requests');
      result.status = 'passed';
    } catch (error: any) {
      result.status = 'failed'; result.error = safe(error.message); result.errors = errors.slice(errorStart); process.exitCode = 1;
    } finally { save(); console.log(`Product expansion ${company}: ${result.status}`); }
  }
  async function testCouponForm(company: string, companyId: string) {
    const code = recordPrefix + company.toUpperCase();
    const result: any = { company, form: 'coupon', code, status: 'running', steps: [] };
    const priorErrors = errors.length, priorWarnings = hydrationWarnings.length;
    report.forms.push(result); save();
    const evaluate = async (expression: string) => {
      const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      return response.result.value;
    };
    const waitFor = async (predicate: () => Promise<any>, label: string) => {
      const deadline = Date.now() + pageTimeout;
      while (Date.now() < deadline) { assertAuditRunning(); if (await predicate()) return; await pause(500); }
      throw Error('Form test timed out: ' + label);
    };
    const clickText = async (text: string, selector = 'button,[role="menuitem"]') => {
      const clicked = await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)});if(!el)return false;el.click();return true})()`);
      assert.ok(clicked, 'Visible form control: ' + text);
    };
    const fill = async (selector: string, value: string) => {
      assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), 'Input: ' + selector);
    };
    const formInput = 'input[placeholder="e.g., SUMMER25"]';
    const reloadCouponPage = async () => {
      const oldDocument = Date.now();
      await evaluate(`window.__branchE2eOldDocument=${oldDocument}`);
      const navigation = await command('Page.navigate', { url: origin + '/coupon' });
      currentLoaderId = navigation.loaderId || '';
      await waitFor(async () => !activeRequests() && !activeModules() && Date.now() - activity > 1200 &&
        await evaluate(`window.__branchE2eOldDocument!==${oldDocument}&&document.readyState==='complete'&&(${vuePageMounted.toString()})(document.querySelector('#__nuxt'))`), 'new coupon document fully hydrated');
    };
    const submit = () => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(formInput)});if(!e)throw Error('Coupon form missing');e.closest('form').requestSubmit();return true})()`);
    const record = () => prisma.coupon.findFirst({ where: { code, companyId } });
    const snapshot = async () => {
      const backup = JSON.parse(readFileSync(folder + '/form-fixture-backup.json', 'utf8'));
      backup.createdRecords = await prisma.coupon.findMany({ where: { code: { startsWith: recordPrefix }, companyId: { in: fixtureCompanyIds } } });
      backup.snapshots ||= [];
      backup.snapshots.push({ at: new Date().toISOString(), records: backup.createdRecords });
      writeFileSync(folder + '/form-fixture-backup.json', JSON.stringify(backup, null, 2));
    };
    const seekCreatedRow = async () => {
      let lastAdvance = 0;
      await waitFor(async () => {
        if (await evaluate(`!![...document.querySelectorAll('tr')].find(e=>e.textContent.includes(${JSON.stringify(code)}))`)) return true;
        if (!activeRequests() && Date.now() - activity > 1200 && Date.now() - lastAdvance > 2000) {
          await evaluate(`document.querySelector('button[aria-label="Next"]:not([disabled])')?.click()`);
          lastAdvance = Date.now();
        }
        return false;
      }, 'created coupon visible in paginated table');
    };
    const openAction = async (action: string) => {
      await seekCreatedRow();
      assert.ok(await evaluate(`(()=>{const row=[...document.querySelectorAll('tr')].find(e=>e.textContent.includes(${JSON.stringify(code)}));const button=row?.querySelector('button[aria-haspopup="menu"]')||row?.querySelector('td:last-child button');if(!button)return false;button.click();return true})()`), 'Coupon row actions');
      await waitFor(async () => evaluate(`!![...document.querySelectorAll('[role="menuitem"]')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(action)})`), action + ' menu');
      await clickText(action, '[role="menuitem"]');
    };
    try {
      // The preference is local to this disposable browser profile, not a company setting.
      await evaluate("localStorage.setItem('couponList_pageCount','40')");
      await reloadCouponPage();
      await waitFor(async () => evaluate("!![...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()==='Create')"), 'coupon page hydration');
      await clickText('Create');
      await waitFor(async () => evaluate(`!!document.querySelector(${JSON.stringify(formInput)})`), 'create form');
      await fill(formInput, code);
      await submit();
      await pause(700);
      assert.equal(await record(), null, 'Invalid form must not create a record');
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(formInput)})`), 'Invalid form stays open');
      result.steps.push('required discount rejected'); save();
      await fill('input[placeholder="0-100"]', '12');
      await submit();
      await waitFor(async () => (await record())?.discountValue === 12, 'create persisted');
      await snapshot();
      await waitFor(async () => !await evaluate(`!!document.querySelector(${JSON.stringify(formInput)})`), 'create modal closed after success');
      result.steps.push('created through browser form and verified in database'); save();
      await openAction('Edit');
      await waitFor(async () => evaluate(`!!document.querySelector(${JSON.stringify(formInput)})?.disabled`), 'edit form');
      await fill('input[placeholder="0-100"]', '17');
      await submit();
      await waitFor(async () => (await record())?.discountValue === 17, 'edit persisted');
      await snapshot();
      await waitFor(async () => !await evaluate(`!!document.querySelector(${JSON.stringify(formInput)})`), 'edit modal closed');
      await reloadCouponPage();
      await seekCreatedRow();
      assert.ok(await evaluate(`!![...document.querySelectorAll('tr')].find(e=>e.textContent.includes(${JSON.stringify(code)})&&e.textContent.includes('17%'))`), 'Edited value survives reload');
      result.steps.push('edited through browser form and verified after reload'); save();
      await openAction('Delete');
      await waitFor(async () => evaluate("!![...document.querySelectorAll('[role=dialog]')].find(e=>e.textContent.includes('Delete Coupon'))"), 'delete confirmation');
      await clickText('Delete', '[role="dialog"] button');
      await waitFor(async () => !await record(), 'delete persisted');
      result.steps.push('deleted through confirmation and verified in database');
      result.errors = errors.slice(priorErrors);
      result.hydrationWarnings = hydrationWarnings.slice(priorWarnings);
      assert.equal(result.errors.length, 0, 'Form workflow must finish without API or JavaScript errors');
      assert.equal(result.hydrationWarnings.length, 0, 'Form reloads must hydrate without mismatches');
      result.status = 'passed';
    } catch (error: any) {
      result.status = 'failed'; result.error = safe(error.message);
      result.errors = errors.slice(priorErrors); result.pendingApiPaths = [...requestPaths].filter(([id]) => requestBelongsToDocument(requestLoaders.get(id), currentLoaderId)).map(([, path]) => safe(path));
      process.exitCode = 1;
    }
    save(); console.log(`Coupon form ${company}: ${result.status}`);
  }
  for (const [company, companyId] of [['head', fixture.head], ['branch', fixture.branch]]) {
    if (readJob && company !== readJob) continue;
    if (company === 'branch') {
      if (readJob === 'branch') {
        // A branch-only job has not visited a seller page yet. Relative fetches
        // require an application document rather than the initial about:blank.
        const navigation = await command('Page.navigate', { url: origin + '/nonetwork' });
        currentLoaderId = navigation.loaderId || '';
        let applicationDocument = false;
        const deadline = Date.now() + pageTimeout;
        while (Date.now() < deadline) {
          const state = await command('Runtime.evaluate', { expression: `location.origin===${JSON.stringify(origin)}&&document.readyState==='complete'`, returnByValue: true });
          if (state.result?.value === true) { applicationDocument = true; break; }
          await pause(200);
        }
        assert.ok(applicationDocument, 'Branch job must commit an application document before switching');
      }
      const switched = await command('Runtime.evaluate', { expression: `(async()=>{const response=await fetch('/api/auth/switch-company',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:${JSON.stringify(companyId)}})});const current=await fetch('/api/auth/session');const session=await current.json();return {status:response.status,persisted:current.ok&&session.companyId===${JSON.stringify(companyId)}};})()`, awaitPromise: true, returnByValue: true });
      report.switches.push({ direction: 'head-to-branch', status: switched.result.value?.status, persisted: switched.result.value?.persisted === true });
      if (switched.result.value?.status !== 200 || !switched.result.value?.persisted) throw Error('Actual head-to-branch company switch did not persist');
    }
    const existingPages = !requestedRoutes || requestedRoutes.some(route => route.includes(':record')) ? await dynamicRoutes(companyId) : [];
    const companyRoutes = requestedRoutes ? requestedRoutes.flatMap(route => route.includes(':record')
      ? existingPages.filter(actual => safe(actual) === route) : [route]) : [...routes, ...existingPages];
    for (const route of companyRoutes) await checkPage(route, company);
    if (settingsFailureTests) {
      assert.ok(!formTests && !recordTests, 'Settings rejection cases require a read-only server');
      await testSettingsFailure({ company, report, save, visit: route => checkPage(route, company), timeout: pageTimeout,
        mutation: () => settingsMutation,
        ...(company === 'head' && process.argv.includes('--settings-head-scope')
          ? { targetCompanyId: fixture.branch, loggedCompanyId: fixture.head } : {}),
        assertRunning: assertAuditRunning, errors: () => errors,
        idle: () => !activeRequests() && !activeModules() && Date.now() - activity > 1200,
        evaluate: async expression => {
          const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
          if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
          return response.result.value;
        },
      });
    }
    if (formTests) await testCouponForm(company, companyId);
    if (catalogForms) for (const model of ['brand', 'collection', 'category'] as const) await testCatalogForm({
      model, company, companyId: company === 'head' && model === 'brand' ? fixture.branch : companyId,
      sidebarCompanyId: companyId, targetCompany: company === 'head' && model === 'brand' ? 'branch' : company,
      selectCompanyId: company === 'head' && model === 'brand' ? fixture.branch : undefined,
      prefix: recordPrefix, prisma, report, save, timeout: pageTimeout,
      assertRunning: assertAuditRunning,
      visit: route => checkPage(route, company),
      evaluate: async expression => {
        assertAuditRunning();
        const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
      },
      idle: () => !activeRequests() && !activeModules() && Date.now() - activity > 1200,
      errors: () => errors, warnings: () => hydrationWarnings,
      snapshot: async () => {
        const backup = JSON.parse(readFileSync(folder + '/catalog-fixture-backup.json', 'utf8'));
        const records: any = {};
        for (const model of ['brand', 'collection', 'category'] as const)
          records[model] = await (prisma[model] as any).findMany({ where: { name: { startsWith: recordPrefix }, companyId: { in: fixtureCompanyIds } } });
        backup.snapshots.push({ at: new Date().toISOString(), records });
        writeFileSync(folder + '/catalog-fixture-backup.json', JSON.stringify(backup, null, 2));
      },
    });
  }
  const back = await command('Runtime.evaluate', { expression: `(async()=>{const response=await fetch('/api/auth/switch-company',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({companyId:${JSON.stringify(fixture.head)}})});const current=await fetch('/api/auth/session');const session=await current.json();return {status:response.status,persisted:current.ok&&session.companyId===${JSON.stringify(fixture.head)}};})()`, awaitPromise: true, returnByValue: true });
  report.switches.push({ direction: readJob === 'head' ? 'head-session-retained' : 'branch-to-head', status: back.result.value?.status, persisted: back.result.value?.persisted === true });
  if (back.result.value?.status !== 200 || !back.result.value?.persisted) throw Error('Actual branch-to-head company switch did not persist');
  if (bundledServer) assertAuditBundleCurrent();
  const counts = (rows: any[]) => rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {} as Record<string, number>);
  report.pageSummary = counts(report.pages);
  report.formSummary = counts(report.forms || []);
  report.interactionSummary = counts(report.interactions || []);
  report.pageAuditStatus = report.pages.some((page: any) => page.status === 'failed') ? 'failed'
    : report.pages.some((page: any) => page.status !== 'passed') ? 'partial' : 'passed';
  report.finishedAt = new Date().toISOString(); save();
  console.log(`Page audit ${report.pageAuditStatus}: ${JSON.stringify(report.pageSummary)}. Forms: ${JSON.stringify(report.formSummary)}. Interactions: ${JSON.stringify(report.interactionSummary)}.`);
  if (report.pages.some((p: any) => ['failed', 'blocked-read-only'].includes(p.status)) || report.switches.some((s: any) => s.status !== 200)) process.exitCode = 1;
  }
} catch (error: any) { report.errors.push(safe(error.message)); save(); console.error(safe(error.message)); process.exitCode = 1; }
finally {
  clearInterval(controlTimer);
  if (!formTests && process.env.BRANCH_E2E_BROWSER_DEBUG === '1') {
    const pause = Math.min(120000, Math.max(0, Number(process.env.BRANCH_E2E_DIAGNOSTIC_PAUSE_MS))) || 0;
    if (pause) { console.log('Keeping read-only diagnostic browser available for ' + pause + ' ms'); await new Promise(resolve => setTimeout(resolve, pause)); }
  }
  if (socket?.readyState === WebSocket.OPEN) await command('Browser.close', {}, 5000).catch(() => {});
  socket?.terminate();
  if (chrome?.pid && chrome.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); }
    catch { chrome.kill(); }
  } else chrome?.kill();
  chrome?.stderr?.destroy(); chrome?.unref();
  if (browserProfile && existsSync(browserProfile)) {
    try {
      const actualProfile = realpathSync(browserProfile), actualRoot = realpathSync(browserProfileRoot);
      const withinRoot = relative(actualRoot, actualProfile);
      if (!withinRoot || withinRoot.startsWith('..') || isAbsolute(withinRoot) || !basename(actualProfile).startsWith('markit-branch-e2e-'))
        throw Error('Temporary profile path failed containment checks');
      await rm(actualProfile, { recursive: true, force: true, maxRetries: 15, retryDelay: 250 });
    } catch {
      report.errors.push('Temporary test-browser profile cleanup failed'); process.exitCode = 1;
    }
  }
  if (appProcess?.pid && appProcess.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(appProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); }
    catch { appProcess.kill(); }
  } else appProcess?.kill();
  appProcess?.stdout?.destroy(); appProcess?.stderr?.destroy(); appProcess?.unref(); output.end();
  await prisma.$disconnect(); await db.end();
  if (fixtureWriter) {
    if (recordFixtures) {
      try { await recordFixtures.removeAll(); report.detailFixtureCleanup = 'verified'; }
      catch (error: any) { report.errors.push('Detail fixture cleanup failed: ' + safe(error.message)); process.exitCode = 1; }
    }
    if (formTests && catalogForms) {
      try {
        const backup = JSON.parse(readFileSync(folder + '/catalog-fixture-backup.json', 'utf8'));
        backup.remainingBeforeCleanup = {};
        const where = { name: { startsWith: recordPrefix }, companyId: { in: fixtureCompanyIds } };
        for (const model of ['brand', 'collection', 'category'] as const)
          backup.remainingBeforeCleanup[model] = await (fixtureWriter[model] as any).findMany({ where });
        writeFileSync(folder + '/catalog-fixture-backup.json', JSON.stringify(backup, null, 2));
        for (const model of ['brand', 'collection', 'category'] as const) {
          if (backup.remainingBeforeCleanup[model].length) await (fixtureWriter[model] as any).deleteMany({ where });
          assert.equal(await (fixtureWriter[model] as any).count({ where }), 0);
        }
        backup.cleanup = 'verified: no run-owned catalog fixtures remain';
        writeFileSync(folder + '/catalog-fixture-backup.json', JSON.stringify(backup, null, 2));
        report.catalogFixtureCleanup = 'verified';
      } catch (error: any) { report.errors.push('Catalog fixture cleanup failed: ' + safe(error.message)); process.exitCode = 1; }
    }
    if (formTests) try {
      const where = { code: { startsWith: recordPrefix }, companyId: { in: fixtureCompanyIds } };
      const remaining = await fixtureWriter.coupon.findMany({ where });
      const backup = JSON.parse(readFileSync(folder + '/form-fixture-backup.json', 'utf8'));
      backup.remainingBeforeCleanup = remaining;
      writeFileSync(folder + '/form-fixture-backup.json', JSON.stringify(backup, null, 2));
      if (remaining.length) await fixtureWriter.coupon.deleteMany({ where });
      assert.equal(await fixtureWriter.coupon.count({ where }), 0);
      backup.cleanup = 'verified: no run-owned fixtures remain';
      writeFileSync(folder + '/form-fixture-backup.json', JSON.stringify(backup, null, 2));
      report.fixtureCleanup = 'verified';
    } catch (error: any) { report.errors.push('Test fixture cleanup failed: ' + safe(error.message)); process.exitCode = 1; }
    await fixtureWriter.$disconnect();
  }
  writeFileSync(folder + (readJob ? '/' + readJob + '-retest.json' : '/e2e-results.json'), JSON.stringify(report, null, 2) + '\n');
}
