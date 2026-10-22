import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

function worker() {
  const handlers: Record<string, Function> = {}, saved = new Map<string, Response>();
  let offline = false;
  const cache = { put: async (request: Request | string, response: Response) => saved.set(typeof request === 'string' ? request : request.url, response),
    match: async (request: Request | string) => saved.get(typeof request === 'string' ? request : request.url)?.clone() };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://store.test' }, addEventListener: (type: string, handler: Function) => { handlers[type] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    URL, console: { log() {}, warn() {} }, importScripts() {},
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage() {} }) },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => { if (offline) throw Error('Offline fixture'); return new Response('network fixture', { status: 200 }); },
  });
  return { saved, offline: () => { offline = true; }, dispatch(url: string, document = false) {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { url, method: 'GET', mode: document ? 'navigate' : 'cors', headers: new Headers({ accept: document ? 'text/html' : '*/*' }) },
      respondWith(value: Promise<Response>) { response = value; } });
    return response;
  }, async install() { let done: Promise<void> | undefined; handlers.install({ waitUntil(value: Promise<void>) { done = value; } }); await done; } };
}

test('service worker never caches or replays authenticated API/company sessions', async () => {
  const context = worker();
  const url = 'https://store.test/api/auth/session';
  context.saved.set(url, new Response('old head-office session'));
  assert.equal(context.dispatch(url), undefined, 'API requests must use native networking, including offline failures');
  context.offline();
  assert.equal(context.dispatch(url), undefined, 'An offline company switch must not recover a previous session from cache');
  assert.equal(context.dispatch('https://third-party.test/private'), undefined, 'Only same-origin resources are intercepted');
});

test('service worker keeps static offline assets without storing authenticated documents', async () => {
  const context = worker();
  await context.install();
  assert.equal(context.saved.has('/'), false, 'Installation must not save an authenticated home document');
  const page = 'https://store.test/products';
  await context.dispatch(page, true);
  assert.equal(context.saved.has(page), false, 'Seller documents embed company data and are never cached');
  const asset = 'https://store.test/_nuxt/app.js';
  assert.equal(await (await context.dispatch(asset)!).text(), 'network fixture');
  assert.ok(context.saved.has(asset), 'Static assets remain available offline');
  context.offline();
  assert.equal(await (await context.dispatch(asset)!).text(), 'network fixture');
  assert.equal(await (await context.dispatch(page, true)!).text(), 'network fixture', 'Navigation uses the public offline document');
});
