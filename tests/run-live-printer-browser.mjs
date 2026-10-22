import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Exercises the actual Nuxt server and its compiled components. API fixtures are
// local to this temporary browser; no company preferences or other records are written.
const origin = 'http://localhost:3000';
const folder = path.resolve('../artifacts/live-printer');
fs.mkdirSync(folder, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'markit-live-printer-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--window-size=1440,1000', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
const pending = new Map();
const errors = [];
const requests = [];
let id = 0;
function call(method, params = {}) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(Error(`Timed out: ${method}`)); }, 20000);
    pending.set(requestId, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
const session = { id: 'test-user', companyId: 'test-company', email: 'preview@example.invalid', role: 'admin', type: 'USER', plan: 'pro', companyName: 'City Center', companyPhone: '+91 9945923901', gstin: '29ACBPH0045H1ZO', isTaxIncluded: true, upiId: 'preview@upi', address: { street: 'CITY CENTRE', city: 'Uppinangady', state: 'Karnataka', pincode: '574241' } };
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
async function until(expression, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(300); }
  throw Error(`Condition timed out: ${expression}`);
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(folder, name), Buffer.from(result.data, 'base64'));
}
async function click(label) {
  return evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw Error('Button not found'); button.click(); return true; })()`);
}
try {
  for (let i = 0; i < 100 && !fs.existsSync(path.join(profile, 'DevToolsActivePort')); i++) await delay(200);
  const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request?.reject(Error(JSON.stringify(message.error))); else request?.resolve(message.result);
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      requests.push(`${request.method} ${url.pathname}`);
      let body = {};
      if (!['GET', 'HEAD'].includes(request.method)) {
        errors.push(`Blocked unexpected write: ${url.pathname}`);
        await call('Fetch.fulfillRequest', { requestId, responseCode: 409, body: Buffer.from('{}').toString('base64') }); return;
      }
      if (url.pathname === '/api/auth/session') body = session;
      else if (url.pathname === '/api/auth/accessible-companies') body = [{ id: session.companyId, name: session.companyName, logo: null, parentCompanyId: null, isHeadOffice: false }];
      else if (url.pathname === '/api/settings/print-templates') body = { version: 1, templates: [], receiptId: null, labelId: null };
      else if (url.pathname === '/api/settings/label-variables') body = [];
      else if (url.pathname === '/api/branches') body = { parentCompanyId: null, branches: [] };
      else if (url.pathname.endsWith('/label-size')) body = { size: 'A4' };
      else if (url.pathname.startsWith('/api/model/')) body = { data: [] };
      await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
    }
  });
  await call('Page.enable'); await call('Runtime.enable');
  // A service worker can fetch outside this page's interception session.
  await call('Network.enable');
  await call('Network.setBypassServiceWorker', { bypass: true });
  await call('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api/*` }] });
  await call('Page.navigate', { url: `${origin}/login` });
  await until(`!!document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt`);
  await evaluate(`(async () => { const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt; await app.$auth.updateSession(); await app.$router.push('/settings/printer'); })()`);
  await until(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Preview Tax Receipt')`);
  await screenshot('01-settings.png');
  await click('Preview Tax Receipt');
  await until(`!!document.querySelector('dialog[open] img[alt="Receipt"]')`);
  await screenshot('02-classic-preview.png');
  await evaluate(`document.querySelector('dialog[open] [aria-label="Close receipt designer"]').click()`);
  await click('New receipt');
  await until(`!!document.querySelector('dialog[open] .preview-image') && !document.querySelector('dialog[open] [role="alert"]')`);
  await screenshot('03-classic-editor.png');
  await evaluate(`document.querySelector('dialog[open] [data-editor-tab="content"]').click()`);
  await evaluate(`[...document.querySelectorAll('dialog[open] .element-select')].find(b => b.textContent.includes('Table')).click()`);
  await until(`document.querySelectorAll('dialog[open] .table-column').length === 9`);
  await screenshot('04-table-editor.png');
  await click('Taxless');
  await evaluate(`[...document.querySelectorAll('dialog[open] .element-select')].find(b => b.textContent.includes('Table')).click()`);
  await until(`document.querySelectorAll('dialog[open] .table-column').length === 6 && !!document.querySelector('dialog[open] .preview-image')`);
  await delay(600);
  await screenshot('05-taxless-editor.png');
  await click('Tax');
  await evaluate(`[...document.querySelectorAll('dialog[open] .element-select')].find(b => b.textContent.includes('Table')).click()`);
  await until(`document.querySelectorAll('dialog[open] .table-column').length === 9 && !!document.querySelector('dialog[open] .preview-image')`);

  const layout = await evaluate(`(() => { const d=document.querySelector('dialog[open]'); const bounds=e=>{ const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}; };return { sidebar:bounds(d.querySelector('.editor-sidebar')), preview:bounds(d.querySelector('.editor-preview')), paper:bounds(d.querySelector('.preview-paper')), columns:d.querySelectorAll('.table-column').length, alerts:[...d.querySelectorAll('[role="alert"]')].map(e=>e.textContent) }; })()`);
  fs.writeFileSync(path.join(folder, 'verification.json'), JSON.stringify({ layout, errors }, null, 2));
  if (errors.length || layout.alerts.length) throw Error('Live printer check reported errors');
  if (Math.abs(layout.sidebar.width - layout.preview.width) > 1) throw Error('Editor must have equal columns');
  if (layout.paper.width < 400) throw Error('Receipt preview is too small to read at desktop width');
  console.log(JSON.stringify({ status: 'checked', layout, errors }));
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    await screenshot('failure.png').catch(() => {});
    console.log(JSON.stringify({ errors, requests, page: await evaluate(`({url:location.href,text:document.body.innerText.slice(0,1800)})`).catch(() => null) }));
  }
  throw error;
} finally {
  socket?.close(); browser.kill();
  if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('markit-live-printer-')) throw Error('Unexpected temporary profile');
  await fs.promises.rm(profile, { recursive:true, force:true, maxRetries:10, retryDelay:200 }).catch(() => {});
}
