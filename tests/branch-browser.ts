import * as Vue from 'vue';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { useCompanyScope, withCompanyRead } from '../composables/useCompanyScope';
import CompanyTableFilter from '../components/CompanyTableFilter.vue';
import CompanyFormField from '../components/CompanyFormField.vue';
import ErpPageNavbar from '../components/ErpPageNavbar.vue';
import { companySwitchLocation } from '../utils/companySwitchLocation';
import { companyStorageKey } from '../utils/companyStorageKey';

const auth = { session: Vue.ref<any>({ companyId: 'head', role: 'admin', companyName: 'Head',
  selectedAccounts: { companyId: 'head', defaults: { cash: 'old-head-cash' } } }) };
const stores = Vue.ref([{ id: 'head', name: 'Head', isHeadOffice: true, parentCompanyId: null },
  { id: 'branch', name: 'Branch', isHeadOffice: false, parentCompanyId: 'head' },
  { id: 'unrelated', name: 'Unrelated', isHeadOffice: false, parentCompanyId: null }]);
const requests: any[] = [], scopes: any = {};
const route = Vue.reactive<any>({ path: '/test', params: {}, query: {} });
declare const __PRODUCTS_PAGE_KEY__: string;
const entryPageKey = new Function(`return (${__PRODUCTS_PAGE_KEY__})`)();
Object.assign(globalThis, Vue, {
  useCompanyScope, useNuxtApp: () => ({ $auth: auth }), useFetch: () => ({ data: stores }),
  useRoute: () => route, useRouter: () => ({ replace: async (next: any) => { route.path = next.path; route.query = next.query; } }),
  useToast: () => ({ add: () => {} }), refreshNuxtData: async () => {},
  useRequestFetch: () => async (url: string, options: any = {}) => {
    requests.push({ url, ...options });
    const companyId = options.query?.companyId || options.headers?.['x-company-id'];
    if (companyId === 'unrelated') throw new Error('Company access denied');
    return { companyId, companyName: companyId, selectedAccounts: { companyId, defaults: { cash: companyId + '-cash' } } };
  },
});
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await Vue.nextTick(); };
const Table = (id: string) => Vue.defineComponent({ setup() {
  const scope = useCompanyScope('table'); scopes[id] = scope;
  // Exercise the same production adapter used by products, staff, sales and coupons.
  scopes[id + 'Query'] = withCompanyRead((args: any) => args, 'Coupon')(Vue.computed(() => ({ where: { companyId: 'head' } })));
  return () => Vue.h('div', { id }, [Vue.h(CompanyTableFilter)]);
} });
const Form = Vue.defineComponent({ setup() {
  scopes.form = useCompanyScope('form');
  return () => Vue.h('div', { id: 'entry' }, [Vue.h(CompanyFormField)]);
} });
const PageForm = Vue.defineComponent({ async setup() {
  const scope = useCompanyScope('form', true);
  scopes.page = scope; await scope.ready;
  return () => Vue.h('div', { id: 'page-entry' }, [Vue.h(CompanyFormField)]);
} });
const app = Vue.createApp({ render: () => Vue.h('main', [Vue.h(Table('first')), Vue.h(Table('second')), Vue.h(Form),
  Vue.h(Vue.Suspense, null, { default: () => Vue.h(PageForm, { key: entryPageKey(route) }) })]) });
app.use(VueQueryPlugin, { queryClient: new QueryClient() });
app.component('UFormGroup', { props: ['label'], setup: (p, { slots }) => () => Vue.h('label', [p.label, slots.default?.()]) });
app.component('USelect', { props: ['modelValue', 'options', 'disabled'], emits: ['update:modelValue'],
  setup: (p: any, { emit }) => () => Vue.h('select', { value: p.modelValue, disabled: p.disabled,
    onInput: (e: any) => emit('update:modelValue', e.target.value) },
  p.options.map((o: any) => Vue.h('option', { value: o.value }, o.label))) });
app.component('UModal', { render: () => null });

try {
  app.mount('#app'); await settle();
  check(document.querySelectorAll('select').length === 4, 'Head office sees independent table and form controls');
  check(!Array.from(document.querySelectorAll('select option')).some(option => option.textContent === 'Unrelated'), 'Unrelated direct membership is not an organization filter option');
  check(scopes.first.readIds.value.join() === 'head,branch', 'Head office table defaults to all organization stores');
  check(scopes.first.auth.session.value.selectedAccounts.defaults.cash === 'head-cash', 'An active-company page reads current defaults rather than its old login snapshot');
  const choose = async (selector: string, value: string) => {
    const select = document.querySelector(selector) as HTMLSelectElement;
    select.value = value; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  };
  await choose('#first select', 'branch');
  check(scopes.first.readIds.value.join() === 'branch', 'Branch table filter changes');
  check(scopes.second.readIds.value.join() === 'head,branch', 'Second table remains independent');
  check(scopes.firstQuery.value.where.companyId === 'branch', 'Hook query follows branch selection');
  await scopes.first.fetch('/api/report/online');
  check(requests.at(-1).headers['x-company-filter'] === 'branch', 'SQL list sends branch header');
  await choose('#entry select', 'branch');
  check(scopes.form.auth.session.value.companyId === 'branch', 'Entry form uses branch context');
  check(scopes.form.auth.session.value.selectedAccounts.defaults.cash === 'branch-cash', 'Entry uses branch account defaults');
  check(auth.session.value.companyId === 'head', 'Local selections preserve sidebar company');
  check(auth.session.value.selectedAccounts.defaults.cash === 'old-head-cash', 'Local selections preserve the head-office login snapshot');
  await choose('#page-entry select', 'branch');
  await settle(); await settle();
  check(route.query.entryCompany === 'branch', 'Page form selection updates its route');
  check(scopes.page.auth.session.value.companyId === 'branch', 'Page form uses the selected branch after route replacement');
  check(scopes.page.auth.session.value.selectedAccounts.defaults.cash === 'branch-cash', 'Page form reloads branch defaults');
  check(auth.session.value.companyId === 'head', 'Page form preserves the sidebar company');
  await scopes.form.fetch('/api/bill/create', { method: 'POST', body: { companyId: 'branch' } });
  check(requests.at(-1).headers['x-company-id'] === 'branch', 'Entry submits branch ownership');
  check(new URL(scopes.form.downloadUrl('/api/report/generate-sales.pdf'), location.origin).searchParams.get('companyId') === 'branch', 'Download retains company');
  await choose('#first select', '');
  check(scopes.first.readIds.value.join() === 'head,branch', 'All companies can be restored');
  const before = requests.length;
  await scopes.form.selectCompany('unrelated').then(() => { throw new Error('Unrelated store was accepted'); }, () => {});
  check(requests.length === before, 'Unrelated store rejected before context request');
  localStorage.clear(); localStorage.setItem('bills', JSON.stringify([{ billNo: 7 }]));
  const headKey = companyStorageKey('bills', 'head', 'head');
  const branchKey = companyStorageKey('bills', 'branch', 'branch');
  check(localStorage.getItem(headKey)?.includes('7'), 'Legacy drafts adopted once');
  check(localStorage.getItem(branchKey) === null, 'Branch does not adopt head-office drafts');
  check(companySwitchLocation('/products/edit/product-a?entryCompany=head') === '/products', 'Company switch exits foreign product');
  check(companySwitchLocation('/accountant/chart-of-accounts?entryCompany=head&account=a') === '/accountant/chart-of-accounts', 'Company switch clears foreign account');
  auth.session.value = { companyId: 'branch', role: 'admin' }; await settle();
  check(document.querySelectorAll('select').length === 0, 'Branch session cannot select sibling/head-office scope');
  app.unmount();
  auth.session.value = { companyId: 'head', role: 'admin' };
  route.query = {};
  const pageMode = Vue.ref('table');
  const FullPageForm = Vue.defineComponent({ setup() {
    scopes.toolbarForm = useCompanyScope('form');
    return () => Vue.h('section', { id: 'full-page-form' }, [Vue.h(CompanyFormField, { toolbar: true })]);
  } });
  const ModalForm = Vue.defineComponent({ setup() {
    scopes.modal = useCompanyScope('form');
    return () => Vue.h('section', { role: 'dialog', id: 'modal-form' }, [Vue.h(CompanyFormField)]);
  } });
  const EmbeddedForm = Vue.defineComponent({ setup() {
    scopes.embedded = useCompanyScope('form');
    return () => Vue.h('form', { id: 'embedded-form' }, [Vue.h(CompanyFormField)]);
  } });
  const toolbarApp = Vue.createApp({ render: () => Vue.h('main', [Vue.h(ErpPageNavbar, { title: 'ERP' }),
    pageMode.value === 'table' ? Vue.h(Table('toolbar-table')) : Vue.h(FullPageForm), Vue.h(ModalForm), Vue.h(EmbeddedForm)]) });
  toolbarApp.use(VueQueryPlugin, { queryClient: new QueryClient() });
  for (const name of ['UFormGroup', 'USelect', 'UModal']) toolbarApp.component(name, app.component(name)!);
  toolbarApp.component('UDashboardNavbar', { props: ['title'], setup: (props, { slots }) => () => Vue.h('header',
    { style: 'display:flex;justify-content:space-between;width:100%' }, [
      Vue.h('div', { 'data-navbar-left': '' }, slots.left?.() || props.title),
      Vue.h('div', { 'data-navbar-right': '' }, slots.right?.()),
    ]) });
  toolbarApp.mount('#app'); await settle();
  check(document.querySelectorAll('[data-navbar-right] select').length === 1, 'Report selector appears at the right of the existing title bar');
  check(!document.querySelector('[data-navbar-left] select') && document.querySelector('[data-navbar-left]')?.textContent === 'ERP', 'Original left title is restored without a company selector');
  const controlBounds = document.querySelector('header select')!.getBoundingClientRect();
  const headerBounds = document.querySelector('header')!.getBoundingClientRect();
  check(controlBounds.left > headerBounds.left + headerBounds.width / 2, 'Selector is visually positioned on the right');
  check(!document.querySelector('#toolbar-table select'), 'Report selector leaves its old page position');
  check(Boolean(document.querySelector('#modal-form select')), 'Modal selector stays inside its modal');
  check(Boolean(document.querySelector('#embedded-form select')), 'Embedded mutation form keeps its selector inside the form');
  await choose('#company-page-topbar select', 'branch');
  check(scopes['toolbar-table'].readIds.value.join() === 'branch', 'Relocated report filter still controls the original query scope');
  check(scopes.modal.companyId.value === 'head', 'Filtering the page does not change a modal mutation owner');
  check(scopes.embedded.companyId.value === 'head', 'Filtering the page does not change an embedded mutation owner');
  await choose('#modal-form select', 'branch');
  check(scopes.modal.companyId.value === 'branch', 'Inline modal selection still controls its own mutation scope');
  pageMode.value = 'form'; await settle();
  check(document.querySelectorAll('header select').length === 1, 'Page navigation replaces the old toolbar control without duplicates');
  check(!document.querySelector('#full-page-form select'), 'Full-page mutation selector uses the same navbar position');
  await choose('#company-page-topbar select', 'branch');
  await scopes.toolbarForm.fetch('/api/bill/create', { method: 'POST', body: {} });
  check(requests.at(-1).headers['x-company-id'] === 'branch', 'Relocated full-page form retains its mutation company');
  check(auth.session.value.companyId === 'head', 'Moving selectors never switches the logged-in company');
  toolbarApp.unmount();
  check(!document.querySelector('#company-page-topbar'), 'Toolbar and teleported controls clean up on navigation');
  document.getElementById('result')!.textContent = 'ALL PASSED: real Vue company controls, independent filters, hook queries, branch forms/accounts, headers, exports, drafts, store-switch navigation and branch isolation.';
} catch (error: any) {
  document.getElementById('result')!.textContent = 'FAILED: ' + error.stack;
}
