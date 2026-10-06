import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'
import * as dates from '../../composables/date'
import { companyStorageKey } from '../../utils/companyStorageKey'
import { billingErrorMessage } from '../../utils/billing-error'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export const billing = 'pages/erp/billing.vue'
export const edit = 'pages/erp/edit/[salesId].vue'
export const read = (file: string) => readFileSync(root + file, 'utf8')
export const script = (file: string) => file.endsWith('.vue') ? parse(read(file)).descriptor.scriptSetup!.content : read(file)
export const plain = (value: any) => JSON.parse(JSON.stringify(value))
export const row = (overrides = {}) => ({ id: '', variantId: '', sn: 1, name: 'Manual item', barcode: '', category: [{ id: 'cat', name: 'Tops', hsn: '6109' }], qty: 1, rate: 100, discount: 0, tax: 0, value: 100, return: false, ...overrides })
export const item = (barcode = '1A123456') => ({ id: barcode, size: 'M', qty: 0, variant: { id: 'variant-' + barcode, name: 'Blue', unit: 'Nos', sprice: 100, dprice: 100, pprice: 40, tax: 5, sizes: ['M'], product: { name: 'Shirt', categoryId: 'cat', subcategory: { name: 'Cotton' } } } })
export const deferred = () => { let resolve!: (value: any) => void; let reject!: (value: any) => void; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

// Execute the actual checked-in declarations, not copies of billing logic.
// Every external dependency is supplied explicitly. Unknown requests fail closed.
export function harness(file: string, names?: string[], overrides: Record<string, any> = {}) {
  const calls: any[] = [], toasts: any[] = [], mounts: any[] = [], unmounts: any[] = []
  const storage = new Map<string, string>()
  const scope = Vue.effectScope()
  const context: any = {
    ...Vue, ...dates, companyStorageKey, billingErrorMessage,
    console: { log() {}, warn() {}, error() {} },
    process: { client: true }, navigator: { onLine: true },
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    onMounted: (fn: any) => mounts.push(fn), onBeforeUnmount: (fn: any) => unmounts.push(fn), onUnmounted: (fn: any) => unmounts.push(fn),
    useToast: () => ({ add: (value: any) => toasts.push(value) }),
    useNuxtApp: () => ({ $auth: { session: Vue.ref({ companyId: 'company', id: 'staff', pointsValue: 10 }) } }),
    ...overrides,
  }
  context.$fetch ||= async (url: string, options: any) => { calls.push({ url, ...options }); throw new Error('Unmocked request: ' + url) }
  context.useCompanyScope ||= () => ({ fetch: context.$fetch, companyId: Vue.ref('company'), auth: context.useNuxtApp().$auth })
  const source = ts.createSourceFile(file, script(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statements = names ? names.map(name => {
    if (name.startsWith('$watch:')) {
      const watched = name.slice(7)
      const node = source.statements.find(s => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.expression.getText(source) === 'watch' && s.expression.arguments[0]?.getText(source) === watched)
      if (!node) throw new Error('Missing watch: ' + watched)
      return node.getText(source)
    }
    const node = source.statements.find(s => (ts.isFunctionDeclaration(s) && s.name?.text === name) || (ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(source) === name)))
    if (!node) throw new Error('Missing source declaration: ' + name + ' in ' + file)
    return node.getText(source)
  }) : source.statements.filter(s => !ts.isImportDeclaration(s) && !ts.isExportDeclaration(s)).map(s => s.getText(source))
  const code = statements.join('\n').replace(/^export\s+/gm, '')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  vm.createContext(context)
  scope.run(() => vm.runInContext(js + (names ? `\nObject.assign(globalThis, {${names.filter(name => !name.startsWith('$')).join(',')}})` : ''), context, { filename: root + file }))
  return { context, calls, toasts, storage, mounts, stop: () => { for (const fn of unmounts) fn(); scope.stop() }, run: (fn: () => any) => scope.run(fn), mount: async () => { for (const fn of mounts) await scope.run(fn); await Vue.nextTick() } }
}

export function composable(file: string, name: string, args: any[] = [], overrides = {}) {
  const h = harness(file, undefined, overrides)
  const result = h.run(() => vm.runInContext(name, h.context)(...args))
  return { ...h, result }
}

export function pageState(overrides: Record<string, any> = {}) {
  const session = { companyId: 'company', id: 'staff', pointsValue: 10, isTaxIncluded: true }
  const state: any = {
    useAuth: () => ({ session: Vue.ref(session) }), toast: { add() {} },
    isSaving: Vue.ref(false), items: Vue.ref([row(), row({ name: '', category: [], rate: 0, value: 0 })]),
    currentRequestIds: Vue.ref({}), subtotal: Vue.ref(100), grandTotal: Vue.ref(100), discount: Vue.ref(0), returnAmt: Vue.ref(0),
    redeemedAmt: Vue.ref(0), redeemedPoints: Vue.ref(0), points: Vue.ref(0), paymentMethod: Vue.ref('Cash'),
    splitPayments: Vue.ref([]), clientId: Vue.ref(''), clientName: Vue.ref(''), phoneNo: Vue.ref(''), couponValue: Vue.ref(0),
    selected: Vue.ref(null), selectedCouponId: Vue.ref(null), skipPoints: Vue.ref(false), selectedAction: Vue.ref(null),
    date: Vue.ref('2026-10-06T08:00:00.000Z'), uuid: Vue.ref(''), uuidv4: () => 'test-request', RECENT_BILL_KEY: 'recent',
    bill: Vue.ref({ invoiceNumber: 92 }), route: { params: { salesId: 'test-bill' } }, showUnitColumn: Vue.ref(false),
    pastBillPoints: Vue.ref(10), oldClientId: Vue.ref(''), originalRedeemedPoints: Vue.ref(0),
    commitDateInput() {}, reset() {}, print() {}, send() {}, download() {}, fireFcmNotification() {}, printData: null,
    ...overrides,
  }
  return state
}
