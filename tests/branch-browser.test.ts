import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { parse, compileScript } from '@vue/compiler-sfc';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve, dirname, relative, isAbsolute, basename } from 'node:path';
import WebSocket from 'ws';
import { ssrIdFixture } from './helpers/ssr-id-fixture';

test('Chrome: head-office/branch company controls and navigation', { timeout: 120000 }, async () => {
  const chrome = [process.env.BRANCH_TEST_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && existsSync(p));
  assert.ok(chrome, 'Set BRANCH_TEST_BROWSER to a Chromium executable');
  // Isolated temporary profile; the browser never uses the user's real profile.
  mkdirSync('tests/branch-reports', { recursive: true });
  const profileRoot = resolve('node_modules/.cache/branch-browser-profiles');
  mkdirSync(profileRoot, { recursive: true });
  const profile = mkdtempSync(join(profileRoot, 'markit-branch-browser-'));
  const productsTemplate = parse(readFileSync('pages/products.vue', 'utf8')).descriptor.template?.content || '';
  const entryKey = productsTemplate.match(/<NuxtPage\b[^>]*:page-key="([^"]+)"/)?.[1];
  assert.ok(entryKey, 'Product page forms use their production route key');
  const bundle = await build({ entryPoints: ['tests/branch-browser.ts'], bundle: true, write: false,
    define: { __PRODUCTS_PAGE_KEY__: JSON.stringify(entryKey) },
    platform: 'browser', format: 'esm', alias: { '~': process.cwd() }, plugins: [{ name: 'branch-vue', setup(builder) {
      builder.onLoad({ filter: /\.vue$/ }, async args => {
        const { descriptor } = parse(readFileSync(args.path, 'utf8'), { filename: args.path });
        return { contents: compileScript(descriptor, { id: args.path, inlineTemplate: true }).content,
          loader: 'ts', resolveDir: dirname(args.path) };
      });
    } }] });
  const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const fixtureHtml = await ssrIdFixture();
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url?.startsWith('/tests/ssr-id/')) { res.end(fixtureHtml(req.url.split('/').at(-1)!)); return; }
    res.end(`<!doctype html><html><body><div id="app"></div><pre id="result">RUNNING</pre><script type="module">${js}</script></body></html>`);
  });
  let child: ReturnType<typeof spawn> | undefined;
  let socket: WebSocket | undefined;
  try {
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const port = (server.address() as any).port;
    child = spawn(chrome!, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
      '--no-default-browser-check', '--no-proxy-server', '--remote-debugging-port=0', '--remote-allow-origins=*',
      `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise<string>((resolveEndpoint, reject) => {
      let errors = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout: ' + errors.slice(-1000))), 20000);
      child!.stderr!.on('data', data => {
        errors += data;
        const match = errors.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolveEndpoint(match[1]); }
      });
      child!.on('error', reject);
    });
    const address = new URL(endpoint);
    const page: any = await fetch(`http://${address.host}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolveOpen, reject) => { socket!.once('open', resolveOpen); socket!.once('error', reject); });
    let seq = 0;
    const waiting = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
    const browserErrors: any[] = [];
    socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
      const pending = waiting.get(message.id);
      if (pending) { waiting.delete(message.id); message.error ? pending.reject(message.error) : pending.resolve(message.result); }
    });
    const command = (method: string, params: any = {}) => new Promise<any>((resolveCommand, reject) => {
      const id = ++seq; waiting.set(id, { resolve: resolveCommand, reject }); socket!.send(JSON.stringify({ id, method, params }));
    });
    await command('Runtime.enable');
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/tests/branch-browser.html` });
    let result = 'RUNNING';
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && result === 'RUNNING') {
      const state = await command('Runtime.evaluate', { expression: "document.querySelector('#result')?.textContent || 'RUNNING'", returnByValue: true });
      result = state.result.value;
      if (browserErrors.length) break;
      if (result === 'RUNNING') await new Promise(resolveTick => setTimeout(resolveTick, 250));
    }
    const document = await command('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true });
    const html = document.result.value;
    writeFileSync(resolve('tests/branch-reports/browser.html'), html);
    assert.match(result, /^ALL PASSED/, result + '\n' + JSON.stringify(browserErrors));
    console.log(result);
    for (const mode of ['negative', 'configured']) {
      await command('Page.navigate', { url: `http://127.0.0.1:${port}/tests/ssr-id/${mode}` });
      let ids: { server: string; client: string } | undefined;
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        const response = await command('Runtime.evaluate', { expression: 'window.__ssrIdResult', returnByValue: true });
        ids = response.result.value;
        if (ids?.client) break;
        await new Promise(done => setTimeout(done, 100));
      }
      assert.ok(ids?.server && ids.client, 'Production hydration fixture finishes: ' + JSON.stringify(browserErrors));
      assert.equal(ids.server === ids.client, mode === 'configured', mode === 'configured'
        ? 'Configured production build must preserve matching SSR/client control IDs'
        : 'Negative control must reproduce removed-prefetch ID mismatch');
      console.log(`Production ID hydration ${mode}: server=${ids.server}, client=${ids.client}`);
    }
    await command('Browser.close').catch(() => {});
  } finally {
    socket?.terminate();
    if (child?.pid && child.exitCode === null && process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }); }
      catch { child.kill(); }
    } else child?.kill();
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    const actual = realpathSync(profile), root = realpathSync(profileRoot), within = relative(root, actual);
    assert.ok(within && !within.startsWith('..') && !isAbsolute(within) && basename(actual).startsWith('markit-branch-browser-'), 'Temporary browser profile must remain inside the workspace cache');
    // Chrome's descendant processes can release the Windows profile lock after
    // its main process exits. Async retries also let child exit events drain.
    await rm(actual, { recursive: true, force: true, maxRetries: 15, retryDelay: 250 });
  }
});
