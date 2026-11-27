import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { parse, compileScript, compileStyle, compileTemplate } from '@vue/compiler-sfc';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const candidates = [process.env.PRINT_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) throw new Error('Set PRINT_TEST_BROWSER to a Chromium browser executable.');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'markit-print-test-'));
const screenshot = process.env.PRINT_TEST_SCREENSHOT;
const previewQuery = process.env.AFTER_SALES_PREVIEW ? '?preview='+encodeURIComponent(process.env.AFTER_SALES_PREVIEW) : ['no-tax', 'classic', 'designer', 'editor', 'label', 'receipt', 'box', 'paint', 'empty-paint', 'codes', 'tax-tools'].includes(process.env.PRINT_TEST_PRESET) ? `?preview=${process.env.PRINT_TEST_PRESET}` : '?preview=1';
const page = process.argv[2] || process.env.PRINT_TEST_PAGE || 'print-template-browser.html';
const documentDesignerUi = ['document-designer-browser.html', 'document-designer-page-browser.html', 'document-designer-layers-browser.html', 'document-designer-bindings-browser.html', 'printer-designer-browser.html', 'printer-interactions-browser.html', 'designer-combinations-browser.html', 'print-template-browser.html', 'sheet-image-browser.html', 'receipt-font-browser.html', 'receipt-audit-browser.html'].includes(page);
const loansUi = page === 'loans-browser.html';
const investorsUi = page === 'investors-browser.html';
const investmentUi = loansUi || investorsUi;
const afterSalesUi = ['after-sales-browser.html', 'after-sales-e2e-browser.html', 'sales-after-sales-browser.html'].includes(page) || investmentUi;
const uiLabel = investorsUi ? 'Investor' : loansUi ? 'Loan' : 'After-sales';
const pageFile = path.resolve('tests', page);
const html = fs.readFileSync(pageFile, 'utf8');
const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!match) throw new Error('Test page must contain one module script.');
if (afterSalesUi) console.log(`Building ${uiLabel} fixture with Nuxt UI`);
const bundle = await build({ stdin: { contents: match[1], resolveDir: path.dirname(pageFile), sourcefile: page + '.ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', alias: { '~': process.cwd(), ...(afterSalesUi ? { '#imports': path.resolve('tests/after-sales-ui-runtime.ts'), '#app':path.resolve('tests/after-sales-ui-runtime.ts'), '#build/app.config': path.resolve('tests/after-sales-ui-runtime.ts'), '#ui': path.resolve('node_modules/@nuxt/ui/dist/runtime') } : {}) }, define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', ...(afterSalesUi ? {'import.meta.dev':'true','import.meta.client':'true','import.meta.server':'false'} : {}) }, plugins: [{ name: 'print-vue', setup(builder) {
  if (documentDesignerUi) builder.onResolve({ filter: /^lucide-vue-next$/ }, () => ({ path: path.resolve('tests/designer-icons-fixture.mjs') }));
  builder.onLoad({ filter: /\.css$/ }, args => ({ contents: 'const style=document.createElement("style");style.textContent=' + JSON.stringify(fs.readFileSync(args.path,'utf8')) + ';document.head.appendChild(style);', loader: 'js' }));
  builder.onLoad({ filter: /\.vue$/ }, args => {
    const { descriptor } = parse(fs.readFileSync(args.path, 'utf8'), { filename: args.path });
    const id = createHash('sha1').update(args.path).digest('hex').slice(0, 8);
    const css = descriptor.styles.map(style => compileStyle({ source: style.src ? fs.readFileSync(path.resolve(path.dirname(args.path), style.src), 'utf8') : style.content, filename: args.path, id: 'data-v-' + id, scoped: !!style.scoped }).code).join('\n');
    const script = compileScript(descriptor, { id, inlineTemplate: true }).content.replace('export default', 'const component =');
    let template = '';
    if (afterSalesUi && !descriptor.scriptSetup && descriptor.template) {
      const compiled = compileTemplate({ source: descriptor.template.content, filename: args.path, id });
      if (compiled.errors.length) throw Error(compiled.errors.join('\n'));
      template = '\n' + compiled.code.replace('export function render', 'function render') + '\ncomponent.render=render;';
    }
    return { contents: script + template + '\ncomponent.__scopeId=' + JSON.stringify('data-v-' + id) + '; export default component; const style=document.createElement("style");style.textContent=' + JSON.stringify(css) + ';document.head.appendChild(style);', loader: 'ts', resolveDir: path.dirname(args.path) };
  });
} }] });
if (afterSalesUi) console.log('Nuxt UI components bundled; generating styles');
const scriptTag = '<script type="module">' + bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>';
const withoutScript = html.replace(match[0], '');
let fixture = withoutScript.includes('</head>') ? withoutScript.replace('</head>', () => scriptTag + '</head>') : withoutScript.replace('<body>', () => '<head>' + scriptTag + '</head><body>');
if (afterSalesUi) {
  const { default: postcss } = await import('postcss');
  const { default: tailwind } = await import('tailwindcss');
  const { default: colors } = await import('tailwindcss/colors.js');
  const styles = await postcss([tailwind({ content: [investmentUi ? 'components/Investments/**/*.vue' : 'components/AfterSales/**/*.vue','pages/after-sales/**/*.vue','node_modules/@nuxt/ui/dist/runtime/components/**/*.vue','node_modules/@nuxt/ui/dist/runtime/ui.config/**/*.js'], theme: { extend: { colors: { primary: colors.orange, gray: colors.gray } } }, darkMode: 'class', safelist: [{pattern:/(bg|text|ring|border)-(primary|gray|red|green|orange|blue)-(50|100|200|300|400|500|600|700|800|900|950)/,variants:['dark','hover','dark:hover','focus-visible']}] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', {from:undefined});
  fixture=fixture.replace('</head>','<style>'+styles.css+'</style></head>');
  const fixtureFolder = investorsUi ? '.cache/investors' : loansUi ? '.cache/loans' : '.cache/after-sales';
  fs.mkdirSync(fixtureFolder,{recursive:true});
  fs.writeFileSync(fixtureFolder+'/ui-fixture.html',fixture);
  console.log(`${uiLabel} fixture ready; starting browser`);
}
const investorFixture = investorsUi ? (await import('./investor-flow-fixture.ts')).createInvestorFlowFixture() : null;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (['after-sales-e2e-browser.html','sales-after-sales-browser.html'].includes(page) && url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    try {
      const target = new URL(process.env.AFTER_SALES_E2E_API);
      if (target.hostname !== '127.0.0.1') throw Error('The rollback browser bridge must be local.');
      let body = ''; for await (const chunk of req) body += chunk;
      const response = await fetch(new URL(url.pathname + url.search, target), {
        method: req.method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body } : {})
      });
      res.statusCode = response.status; res.end(await response.text());
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ statusMessage: error.message })); }
    return;
  }
  if (investorFixture && (url.pathname.startsWith('/fixture-api/') || url.pathname === '/fixture-control')) {
    res.setHeader('Content-Type','application/json');
    try {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === '/fixture-control') {
        if (body.failHistory) investorFixture.failNextHistory();
        res.end(JSON.stringify(investorFixture.state)); return;
      }
      const path = url.pathname.slice('/fixture-api'.length);
      const data = path === '/fixture-defaults' ? investorFixture.defaults : await investorFixture.call(path, req.method, body, Object.fromEntries(url.searchParams));
      res.end(JSON.stringify(data));
    } catch (error) { res.statusCode = error.statusCode || 400; res.end(JSON.stringify({ statusMessage: error.statusMessage || error.message })); }
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture);
});
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  const output = afterSalesUi || documentDesignerUi ? await (await import('./run-ui-browser.mjs')).runUiBrowser({browser,profile,screenshot,size:process.env.PRINT_TEST_WINDOW_SIZE,url:`http://127.0.0.1:${port}/tests/${page}${screenshot?previewQuery:''}`,timeout:Number(process.env.PRINT_TEST_TIMEOUT_MS||120000),failOnRuntimeError:documentDesignerUi}) : await new Promise((resolve,reject) => {
    const child = spawn(browser, ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-default-apps', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', `--window-size=${process.env.PRINT_TEST_WINDOW_SIZE || '1347,667'}`, `--user-data-dir=${profile}`, `--virtual-time-budget=${process.env.PRINT_TEST_VIRTUAL_MS || 30000}`, ...(screenshot ? [`--screenshot=${path.resolve(screenshot)}`] : []), '--dump-dom', `http://127.0.0.1:${port}/tests/${process.argv[2] || process.env.PRINT_TEST_PAGE || 'print-template-browser.html'}${screenshot ? previewQuery : ''}`], { windowsHide: true });
    let result='', errors='';
    child.stdout.on('data',chunk=>{result+=chunk;if (!screenshot && result.trimEnd().endsWith('</html>')) child.kill();});
    child.stderr.on('data',chunk=>errors+=chunk);
    const timer = setTimeout(()=>{child.kill(); reject(Error(`Browser test timed out: ${errors.slice(-2000)}`));},Number(process.env.PRINT_TEST_TIMEOUT_MS || (afterSalesUi ? 120000 : 45000)));
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
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('markit-print-test-')) throw new Error('Unexpected temporary browser profile path');
  try { await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:300}); }
  catch(error) { if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error.code)) throw error; console.warn(`Temporary browser profile is still locked: ${profile}`); }
}
