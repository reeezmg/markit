import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { parse, compileScript } from '@vue/compiler-sfc';
import { renderToString } from '@vue/server-renderer';
import * as Vue from 'vue';
import { transformSync } from 'esbuild';
import { formatRelativeTime } from '../utils/dates';

test('notification rows default to unread, retain their own actions, and never auto-mark records read', async () => {
  const notices = Vue.ref([
    { id: 'fixture-a', companyId: 'head', title: 'Unread bill fixture', message: 'Fixture message', type: 'BILL_CREATED', read: false, actionPath: '/erp/sales?fixture=a', createdAt: new Date() },
    { id: 'fixture-b', companyId: 'head', title: 'Unread payment fixture', message: 'Fixture message', type: 'PAYMENT_RECEIVED', read: false, actionPath: '/accounts/transaction?fixture=b', createdAt: new Date() },
    { id: 'fixture-c', companyId: 'head', title: 'Already read fixture', message: 'Fixture message', type: 'SYSTEM_ALERT', read: true, createdAt: new Date() },
  ]);
  let markedAll = 0, tabModel: any;
  const buttons: Array<{ label(): string; to: any; click?: Function }> = [];
  const globals: Record<string, any> = {
    ref: Vue.ref, computed: Vue.computed, watchEffect: Vue.watchEffect, definePageMeta: () => {}, formatRelativeTime,
    useToast: () => ({ add: () => {} }),
    useCompanyScope: () => ({ ready: Promise.resolve() }),
    useNotifications: () => ({ notifications: notices, unreadCount: Vue.computed(() => notices.value.filter(row => !row.read).length),
      isLoading: Vue.ref(false), error: Vue.ref(null), fetchNotifications: async () => {},
      markAllAsRead: async () => { markedAll++; notices.value = notices.value.map(row => ({ ...row, read: true })); return true; },
      typeConfigs: {}, getAction: (row: any) => row.actionPath ? { label: row.type === 'BILL_CREATED' ? 'View bill' : 'View payment', color: 'primary', route: row.actionPath } : null }),
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  try {
    const { descriptor } = parse(readFileSync(process.env.NOTIFICATIONS_PAGE_SOURCE || 'pages/notifications.vue', 'utf8'), { filename: 'notifications.vue' });
    const compiled = compileScript(descriptor, { id: 'notification-fixtures', inlineTemplate: true });
    const js = transformSync(compiled.content, { loader: descriptor.scriptSetup?.lang === 'ts' ? 'ts' : 'js',
      format: 'cjs', target: 'es2022', logLevel: 'silent' }).code;
    const require = createRequire(import.meta.url), module = { exports: {} as any };
    new Function('require', 'exports', 'module', js)((name: string) => name === 'vue' ? Vue : require(name), module.exports, module);
    const app = Vue.createSSRApp(module.exports.default);
    app.config.warnHandler = () => {};
    app.config.globalProperties.formatRelativeTime = formatRelativeTime;
    app.component('UTabs', Vue.defineComponent({ props: ['modelValue', 'items'], setup(props) {
      tabModel = props.modelValue;
      return () => Vue.h('div', (props.items as any[]).map(item => Vue.h('span', item.label)));
    } }));
    app.component('UButton', Vue.defineComponent({ inheritAttrs: false, props: ['label', 'to'], setup(props, { attrs, slots }) {
      const label = () => String(props.label || slots.default?.().map(node => typeof node.children === 'string' ? node.children : '').join('') || '').trim();
      buttons.push({ label, to: props.to, click: attrs.onClick as Function });
      return () => Vue.h('button', label());
    } }));
    for (const name of ['UIcon', 'USpinner', 'UAlert']) app.component(name, { render: () => Vue.h('span') });
    const html = await renderToString(app);
    assert.equal(markedAll, 0, 'Opening/filtering notifications must not mutate ordinary records');
    assert.equal(tabModel, 0, 'Nuxt UI tabs use numeric indices and default to unread');
    assert.match(html, /Unread bill fixture/); assert.match(html, /Unread payment fixture/);
    assert.doesNotMatch(html, /Already read fixture/);
    const actions = buttons.filter(button => button.to);
    assert.deepEqual(actions.map(button => [button.label(), button.to]), [
      ['View bill', '/erp/sales?fixture=a'], ['View payment', '/accounts/transaction?fixture=b'],
    ], 'Each row keeps its own action label and route');
    const mark = buttons.find(button => button.label() === 'Mark all as read');
    assert.ok(mark?.click, 'Mark all read is an explicit user action');
    await mark.click();
    assert.equal(markedAll, 1);
    assert.ok(notices.value.every(row => row.read));
  } finally {
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; }
  }
});
