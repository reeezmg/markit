import assert from 'node:assert/strict';
import test from 'node:test';

test('prefetch preservation leaves dev transforms disabled and preserves production hooks', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'defineNuxtConfig');
  (globalThis as any).defineNuxtConfig = (config: unknown) => config;
  let config: any;
  try { config = (await import('../nuxt.config')).default; }
  finally {
    if (previous) Object.defineProperty(globalThis, 'defineNuxtConfig', previous);
    else delete (globalThis as any).defineNuxtConfig;
  }
  const configure = config.modules.find((module: any) => typeof module === 'function' && module.name === 'preserveServerPrefetchIds');
  for (const client of [{}, { vue: ['onRenderTracked', 'onRenderTriggered', 'onServerPrefetch'], '#app': ['definePageMeta'] }]) {
    const development = Object.keys(client).length === 0;
    const nuxt = { options: { optimization: { treeShake: { composables: { client } } } } };
    configure({}, nuxt);
    if (development) {
      // Nuxt installs the transform when this map has any keys, even if all
      // lists are empty. That produces the reported zero-length replacement.
      assert.deepEqual(client, {}, 'development must not activate the tree-shaking plugin');
    } else {
      assert.deepEqual(client.vue, ['onRenderTracked', 'onRenderTriggered']);
      assert.deepEqual(client['#app'], ['definePageMeta']);
    }
  }
});
