import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { build } from 'esbuild';

// Icons register a server-prefetch hook; the following async control owns a
// label/input pair. Removing the registration changes its useId boundary.
function createFixture(vue: typeof Vue, preserve: boolean, seen: string[]) {
  const Icon = vue.defineComponent({ setup() {
    if (preserve) vue.onServerPrefetch(async () => {});
    return () => vue.h('i');
  } });
  const Input = vue.defineComponent({ setup() {
    const id = vue.useId(); seen.push(id);
    return () => vue.h('label', { for: id }, [vue.h('input', { id })]);
  } });
  const AsyncControl = vue.defineComponent({ async setup() { return () => vue.h(Input); } });
  return vue.defineComponent({ setup() {
    return () => vue.h(vue.Suspense, null, { default: () => vue.h('section', [vue.h(Icon), vue.h(AsyncControl)]) });
  } });
}

export async function ssrIdFixture() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'defineNuxtConfig');
  (globalThis as any).defineNuxtConfig = (config: any) => config;
  let config: any;
  try { config = (await import('../../nuxt.config')).default; }
  finally {
    if (previous) Object.defineProperty(globalThis, 'defineNuxtConfig', previous);
    else delete (globalThis as any).defineNuxtConfig;
  }
  const vue = ['onRenderTracked', 'onRenderTriggered', 'onServerPrefetch'];
  const nuxt = { options: { optimization: { treeShake: { composables: { client: { vue } } } } } };
  const module = config.modules.find((module: any) => typeof module === 'function' && module.name === 'preserveServerPrefetchIds');
  if (module) await module({}, nuxt);
  const preserved = !nuxt.options.optimization.treeShake.composables.client.vue.includes('onServerPrefetch');
  const markup = await renderToString(Vue.createSSRApp(createFixture(Vue, true, [])));
  const scripts: Record<string, string> = {};
  for (const [mode, preserve] of [['negative', false], ['configured', preserved]] as const) {
    const bundle = await build({ stdin: { contents: `import * as Vue from 'vue';
      const __name=(target)=>target; // tsx preserves names inside serialized callbacks.
      const ids=[]; const createFixture=${createFixture.toString()};
      Vue.createSSRApp(createFixture(Vue,${preserve},ids)).mount('#fixture');
      setTimeout(()=>{window.__ssrIdResult={server:document.querySelector('input').id,client:ids[0]};},100);`,
      resolveDir: process.cwd(), sourcefile: 'ssr-id-browser.js' },
      bundle: true, write: false, platform: 'browser', format: 'esm', minify: true,
      define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true' } });
    scripts[mode] = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  }
  return (mode: string) => `<!doctype html><html><body><div id="fixture">${markup}</div><script type="module">${scripts[mode]}</script></body></html>`;
}
