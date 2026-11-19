import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build as buildNuxt, loadNuxt } from 'nuxt';
import { logger } from '@nuxt/kit';

test('Nuxt regenerates manifest middleware concurrently without duplicate warnings', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'markit-manifest-'));
  assert.ok(resolve(fixture).startsWith(resolve(tmpdir()) + sep));
  let nuxt: Awaited<ReturnType<typeof loadNuxt>> | undefined;
  t.after(async () => {
    await nuxt?.close();
    await rm(fixture, { recursive: true, force: true });
  });
  await mkdir(join(fixture, 'pages'));
  await mkdir(join(fixture, 'middleware'));
  await writeFile(join(fixture, 'pages/index.vue'), '<template><div>Manifest regression</div></template>');
  await writeFile(join(fixture, 'middleware/fixture.global.ts'), 'export default defineNuxtRouteMiddleware(() => {})');
  const warnings: string[] = [];
  t.mock.method(logger, 'warn', (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
  nuxt = await loadNuxt({
    cwd: fixture, dev: true,
    overrides: {
      _prepare: true, dev: true, debug: false, telemetry: false,
      modulesDir: [fileURLToPath(new URL('../node_modules/', import.meta.url))],
      devtools: { enabled: false },
      experimental: { appManifest: true },
      compatibilityDate: '2025-02-28',
    },
  });
  assert.equal(nuxt.options.dev, true);
  await buildNuxt(nuxt);
  const app = nuxt.apps.default;
  let registered = app.middleware;
  Object.defineProperty(app, 'middleware', {
    configurable: true,
    get: () => registered,
    set: value => {
      // The upstream fix collects middleware locally before publishing it.
      // Old Nuxt exposes an empty intermediate list to concurrent resolvers.
      assert.ok(value.length > 0, 'regeneration must not publish incomplete middleware');
      registered = value;
    },
  });
  // These option-bearing calls bypass Nuxt's debounced watcher and used to
  // mutate the same in-progress app, producing the false duplicate warning.
  await Promise.all(Array.from({ length: 4 }, () => nuxt.callHook('builder:generateApp', { filter: () => false })));
  await nuxt.callHook('builder:generateApp', { filter: () => false });
  const middleware = nuxt.apps.default.middleware.filter(item => item.name === 'manifest-route-rule');
  assert.equal(middleware.length, 1);
  assert.equal(middleware[0].global, true);
  assert.ok(middleware[0].path.endsWith('/middleware/manifest-route-rule.js'));
  assert.deepEqual(warnings.filter(message => message.includes('manifest-route-rule')), []);
});
