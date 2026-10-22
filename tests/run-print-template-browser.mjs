import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vue from '@vitejs/plugin-vue';

const candidates = [process.env.PRINT_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) throw new Error('Set PRINT_TEST_BROWSER to a Chromium browser executable.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'markit-print-test-'));
const screenshot = process.env.PRINT_TEST_SCREENSHOT;
const previewQuery = ['no-tax', 'classic', 'designer', 'editor'].includes(process.env.PRINT_TEST_PRESET) ? `?preview=${process.env.PRINT_TEST_PRESET}` : '?preview=1';
const server = await createServer({ configFile: false, envDir: false, root: process.cwd(), plugins: [vue()], resolve: { alias: { '~': process.cwd() } }, server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { include: ['jspdf', 'jsbarcode', 'zod', 'vue', 'qrcode.vue'] } });
try {
  await server.listen();
  const port = server.httpServer.address().port;
  const output = await new Promise((resolve,reject) => {
    const child = spawn(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', `--window-size=${process.env.PRINT_TEST_WINDOW_SIZE || '1347,667'}`, `--user-data-dir=${profile}`, `--virtual-time-budget=${process.env.PRINT_TEST_VIRTUAL_MS || 15000}`, ...(screenshot ? [`--screenshot=${path.resolve(screenshot)}`] : []), '--dump-dom', `http://127.0.0.1:${port}/tests/${process.env.PRINT_TEST_PAGE || 'print-template-browser.html'}${screenshot ? previewQuery : ''}`], { windowsHide: true });
    let result='', errors='';
    child.stdout.on('data',chunk=>{result+=chunk;if (!screenshot && result.trimEnd().endsWith('</html>')) child.kill();});
    child.stderr.on('data',chunk=>errors+=chunk);
    const timer = setTimeout(()=>{child.kill(); reject(Error(`Browser test timed out: ${errors.slice(-2000)}`));},Number(process.env.PRINT_TEST_TIMEOUT_MS || 45000));
    child.on('error',reject); child.on('exit',()=>{clearTimeout(timer);resolve({result,errors});});
  });
  const result = output.result.match(/<pre id="result"[^>]*>([\s\S]*?)<\/pre>/)?.[1] || output.errors.slice(-1500);
  if (process.env.PRINT_TEST_PRESET === 'classic' && screenshot && result.includes('PREVIEW READY')) {
    const folder = path.dirname(path.resolve(screenshot));
    const png = output.result.match(/id="receipt-artifact"[^>]*src="data:image\/png;base64,([^"]+)"/)?.[1];
    const pdf = output.result.match(/<textarea id="receipt-pdf-artifact"[^>]*>([^<]+)<\/textarea>/)?.[1];
    if (!png || !pdf) throw new Error('Missing receipt preview artifacts');
    fs.writeFileSync(path.join(folder, 'Classic-Tax-Receipt.png'), Buffer.from(png, 'base64'));
    fs.writeFileSync(path.join(folder, 'Classic-Tax-Receipt.pdf'), Buffer.from(pdf, 'base64'));
    fs.writeFileSync(path.join(folder, 'Classic-Tax-Receipt.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Classic Tax Receipt — sample</title><style>body{margin:0}img{display:block;width:72mm;margin:auto}@media print{@page{margin:0}}</style></head><body><img alt="Sample receipt" src="data:image/png;base64,${png}"></body></html>`);
  }
  console.log(result);
  if (!result.includes(screenshot ? 'PREVIEW READY' : 'ALL PASSED')) process.exitCode=1;
} finally {
  await server.close();
  if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('markit-print-test-')) throw new Error('Unexpected temporary browser profile path');
  try { await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:300}); }
  catch(error) { if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code)) throw error; console.warn(`Temporary browser profile is still locked: ${profile}`); }
}
