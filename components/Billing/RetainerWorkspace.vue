<script setup lang="ts">
import '~/assets/css/invoice-programs.css'
import ProgramCustomer from './ProgramCustomer.vue'
import RetainerPrint from './RetainerPrint.vue'
import { invoiceToday, retainerInput, retainerStatus as status } from '~/utils/invoice-programs'
import { programRequest } from '~/utils/invoice-program-request.client'
import { billingErrorMessage } from '~/utils/billing-error'
const scope = useCompanyScope('form', true)
await scope.ready
const rows = ref<any[]>([]), accounts = ref<any[]>([]), selected = ref<any>(null), editor = ref(false), busy = ref(false), loading = ref(false), error = ref(''), search = ref(''), filter = ref('')
const editId = ref(''), revision = ref(''), customerName = ref(''), printing = ref(false)
const currency = computed(() => selected.value?.currency || scope.auth.session.value?.currency || 'INR')
const money = (n: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.value }).format(Number(n || 0))
const blank = () => ({ clientId: '', retainerDate: invoiceToday(), description: '', reference: '', amount: 0, liabilityAccountId: '', notes: '', termsAndConditions: '' })
const form = ref(blank())
const liabilities = computed(() => accounts.value.filter(a => a.type==='OTHER_CURRENT_LIABILITY'))
const actionName = ref(''), actionError = ref(''), invoices = ref<any[]>([]), invoiceSearch = ref(''), invoicesLoading = ref(false)
const payment = ref({ amount: 0, date: invoiceToday(), paymentMethod: 'Cash', accountId: '', billId: '', reference: '', eventId: '' })
const cashAccounts = computed(() => accounts.value.filter(a => a.type===(payment.value.paymentMethod==='Cash'?'CASH':'BANK')))
const actionLabel = computed(() => ({ collect:'Record advance payment', apply:'Apply advance to invoice', refund:'Refund unused advance', unapply:'Remove invoice application', sent:'Mark as sent', void:'Void retainer invoice' } as any)[actionName.value] || '')
let version = 0, detailVersion = 0, choiceVersion = 0, searchTimer: ReturnType<typeof setTimeout> | undefined, invoiceTimer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const token = ++version; loading.value = true; error.value = ''
  try {
    const [result, options] = await Promise.all([scope.fetch<any>('/api/retainer-invoices', { query: { q: search.value, status: filter.value } }), scope.fetch<any>('/api/retainer-invoices/options')])
    if (token === version) { rows.value = result.rows; accounts.value = options.accounts }
  } catch (e) { if (token === version) error.value = billingErrorMessage(e) }
  finally { if (token === version) loading.value = false }
}
async function detail(id: string) {
  const token = ++detailVersion
  try { const row = await scope.fetch<any>('/api/retainer-invoices/' + id); if (token === detailVersion) selected.value = row }
  catch (e) { if (token === detailVersion) error.value = billingErrorMessage(e) }
}
function create() { selected.value = null; editId.value = ''; revision.value = ''; form.value = blank(); form.value.liabilityAccountId = liabilities.value.length===1?liabilities.value[0].id:''; customerName.value = ''; editor.value = true; error.value = '' }
function edit() {
  const row = selected.value; editId.value = row.id; revision.value = row.revision; customerName.value = row.clientName
  form.value = { clientId: row.clientId, retainerDate: row.retainerDate, description: row.description, reference: row.reference, amount: row.amount,
    liabilityAccountId: row.liabilityAccountId, notes: row.notes, termsAndConditions: row.termsAndConditions }
  editor.value = true
}
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const payload = { ...retainerInput(form.value), revision: revision.value }, request = programRequest(scope.companyId.value + ':retainer-save:' + (editId.value || 'new'), payload)
    const result = await scope.fetch<any>('/api/retainer-invoices' + (editId.value ? '/' + editId.value : ''), {
      method: editId.value?'PUT':'POST', body: { ...payload, requestId: request.requestId },
    })
    request.clear(); editor.value = false; await load(); await detail(result.id)
  } catch (e) { error.value = billingErrorMessage(e) }
  finally { busy.value = false }
}
async function loadInvoices() {
  const token = ++choiceVersion; invoicesLoading.value = true; actionError.value = ''
  try {
    const result = await scope.fetch<any>('/api/billSale/invoices', { headers: { 'x-company-filter': scope.companyId.value }, query: {
      q: invoiceSearch.value, clientId: selected.value.clientId, state: 'unpaid', collectible: '1', pageSize: 100,
    } })
    if (token===choiceVersion) invoices.value = result.rows
  } catch (e) { if (token===choiceVersion) actionError.value = billingErrorMessage(e) }
  finally { if (token===choiceVersion) invoicesLoading.value = false }
}
function begin(action: string, event?: any) {
  if (busy.value) return
  actionName.value = action; actionError.value = ''; invoiceSearch.value = ''; invoices.value = []
  payment.value = { amount: action==='collect'?Math.max(0,selected.value.amount-selected.value.collected):event?Number(event.amount):Number(selected.value.available),
    date: invoiceToday(), paymentMethod: 'Cash', accountId: accounts.value.find(a=>a.type==='CASH')?.id || '', billId: '', reference: '', eventId: event?.id || '' }
  if (action==='apply') void loadInvoices()
}
function closeAction() { if (busy.value) return; actionName.value = ''; ++choiceVersion; clearTimeout(invoiceTimer) }
async function perform() {
  if (busy.value || !selected.value) return
  busy.value = true; actionError.value = ''
  try {
    const action = actionName.value
    const payload = ['sent','void'].includes(action) ? {action} : action==='unapply' ? {action, date:payment.value.date, reference:payment.value.reference,eventId:payment.value.eventId}
      : action==='apply' ? {action,date:payment.value.date,reference:payment.value.reference,amount:Number(payment.value.amount),billId:payment.value.billId}
      : {action,date:payment.value.date,reference:payment.value.reference,amount:Number(payment.value.amount),paymentMethod:payment.value.paymentMethod,accountId:payment.value.accountId}
    const id = selected.value.id, request = programRequest(scope.companyId.value + ':retainer:' + id, payload)
    await scope.fetch('/api/retainer-invoices/' + id + '/actions', { method: 'POST', body: { ...payload, requestId: request.requestId } })
    request.clear(); actionName.value = ''; await load(); await detail(id)
  } catch (e) { actionError.value = billingErrorMessage(e) }
  finally { busy.value = false }
}
watch(() => payment.value.paymentMethod, () => { if (!cashAccounts.value.some(a=>a.id===payment.value.accountId)) payment.value.accountId = cashAccounts.value[0]?.id || '' })
watch(() => payment.value.billId, id => { const invoice=invoices.value.find(i=>i.id===id); if(invoice) payment.value.amount=Math.min(Number(selected.value.available),Number(invoice.balanceDue)) })
watch(invoiceSearch, () => { clearTimeout(invoiceTimer); if(actionName.value==='apply') invoiceTimer = setTimeout(loadInvoices,250) })
watch([search, filter], () => { clearTimeout(searchTimer); searchTimer = setTimeout(load,250) })
watch(scope.companyId, () => { ++detailVersion; ++choiceVersion; selected.value=null; editor.value=false; actionName.value=''; rows.value=[]; void load() })
onMounted(load)
onBeforeUnmount(() => { ++version; ++detailVersion; ++choiceVersion; clearTimeout(searchTimer); clearTimeout(invoiceTimer) })
</script>
<template>
  <UDashboardPanelContent class="pb-8">
  <CompanyFormField toolbar :locked="busy || editor || !!selected" />
  <div class="invoice-programs">
    <div class="program-heading"><div><h1>Retainer invoices</h1><p class="program-muted">Request an advance, collect payment, then apply it to your customer's invoices.</p></div><button class="program-primary" :disabled="busy" @click="create">+ New retainer invoice</button></div>
    <p v-if="error" class="program-error" role="alert">{{ error }}</p>
    <form v-if="editor" class="program-panel" @submit.prevent="save">
      <div class="program-heading"><h2>{{ editId?'Edit retainer invoice':'New retainer invoice' }}</h2><button class="program-link" type="button" :disabled="busy" @click="editor=false">Close</button></div>
      <fieldset :disabled="busy">
        <div class="program-grid"><ProgramCustomer v-model="form.clientId" :name="customerName" :company-id="scope.companyId.value" @selected="customerName=$event.name" /><label>Retainer date<input v-model="form.retainerDate" type="date" required></label><label>Reference<input v-model="form.reference" maxlength="200"></label></div>
        <label>What is this advance for?<textarea v-model="form.description" rows="3" maxlength="2000" required placeholder="e.g. Advance for the website project"></textarea></label>
        <div class="program-grid"><label>Amount requested ({{ currency }})<input v-model.number="form.amount" type="number" min="0.01" max="999999999" step="0.01" required></label><label>Unearned revenue account<select v-model="form.liabilityAccountId" required><option disabled value="">Select a liability account</option><option v-for="account in liabilities" :key="account.id" :value="account.id">{{ account.name }}</option></select></label></div>
        <p class="program-muted">Choose the liability account used for customer advances. Create an Other Current Liability account in <NuxtLink class="program-link" to="/accountant/chart-of-accounts">Chart of accounts</NuxtLink> if needed.</p>
        <div class="program-grid"><label>Customer notes<textarea v-model="form.notes" rows="3" maxlength="5000"></textarea></label><label>Terms and conditions<textarea v-model="form.termsAndConditions" rows="3" maxlength="10000"></textarea></label></div>
        <div class="program-actions"><button type="button" class="program-secondary" @click="editor=false">Cancel</button><button type="submit" class="program-primary">{{ busy?'Saving…':'Save retainer invoice' }}</button></div>
      </fieldset>
    </form>
    <template v-else>
      <div class="program-filters"><input v-model="search" aria-label="Search retainer invoices" placeholder="Search number, customer or description"><select v-model="filter" aria-label="Retainer status"><option value="">All retainers</option><option value="DRAFT">Draft</option><option value="SENT">Sent / payments recorded</option><option value="VOID">Void</option></select></div>
      <p v-if="loading" class="program-muted">Loading retainers…</p>
      <div class="program-scroll"><table><thead><tr><th>Retainer</th><th>Customer</th><th>Date</th><th>Requested</th><th>Collected</th><th>Available</th><th>Status</th></tr></thead><tbody>
        <tr v-for="row in rows" :key="row.id"><td><button class="program-link" @click="detail(row.id)">RET-{{ row.number }}</button></td><td>{{ row.clientName }}</td><td>{{ row.retainerDate }}</td><td>{{ money(row.amount) }}</td><td>{{ money(row.collected) }}</td><td>{{ money(row.available) }}</td><td><span class="program-badge">{{ status(row) }}</span></td></tr>
        <tr v-if="!rows.length && !loading"><td colspan="7">No retainer invoices found. Create one to request an advance.</td></tr>
      </tbody></table></div><p v-if="rows.length===500" class="program-muted">Showing the latest 500 retainers. Search to narrow the results.</p>
      <section v-if="selected" class="program-panel">
        <div class="program-heading"><div><h2 class="font-semibold">RET-{{ selected.number }} · {{ selected.clientName }}</h2><p class="program-muted">{{ selected.retainerDate }} · {{ status(selected) }} · {{ selected.liabilityAccountName }}</p></div><button class="program-link" @click="selected=null">Close details</button></div>
        <p class="whitespace-pre-wrap">{{ selected.description }}</p>
        <div class="program-cards"><div><small>Requested</small><strong>{{ money(selected.amount) }}</strong></div><div><small>Collected</small><strong>{{ money(selected.collected) }}</strong></div><div><small>Applied</small><strong>{{ money(selected.applied) }}</strong></div><div><small>Refunded</small><strong>{{ money(selected.refunded) }}</strong></div><div><small>Available advance</small><strong>{{ money(selected.available) }}</strong></div></div>
        <div class="program-actions"><div class="program-history-actions flex-wrap">
          <template v-if="selected.status!=='VOID'"><button v-if="selected.collected<selected.amount" class="program-primary" :disabled="busy" @click="begin('collect')">Record payment</button><button v-if="selected.available>0" class="program-secondary" :disabled="busy" @click="begin('apply')">Apply to invoice</button><button v-if="selected.available>0" class="program-secondary" :disabled="busy" @click="begin('refund')">Refund</button><button v-if="!selected.events.length" class="program-secondary" :disabled="busy" @click="edit">Edit</button><button v-if="selected.status==='DRAFT'" class="program-secondary" :disabled="busy" @click="begin('sent')">Mark as sent</button><button v-if="!selected.events.length" class="program-link" :disabled="busy" @click="begin('void')">Void</button></template>
          <button class="program-secondary" :disabled="busy" @click="printing=true">Print / PDF</button>
        </div></div>
        <div class="program-scroll"><table><thead><tr><th>Date</th><th>Activity</th><th>Invoice / reference</th><th>Account / method</th><th>Amount</th><th></th></tr></thead><tbody>
          <tr v-for="event in selected.events" :key="event.id"><td>{{ event.eventDate }}</td><td>{{ event.kind==='UNAPPLY'?'Application removed':event.kind.toLowerCase() }}</td><td>{{ event.invoiceCode || event.reference }}</td><td>{{ event.accountName }} {{ event.payment_method }}</td><td>{{ money(event.amount) }}</td><td><button v-if="event.kind==='APPLY' && !event.reversalId" class="program-link" :disabled="busy" @click="begin('unapply',event)">Remove application</button><span v-if="event.reversalId" class="program-muted">Removed</span></td></tr>
          <tr v-if="!selected.events.length"><td colspan="6">No payments recorded yet.</td></tr>
        </tbody></table></div>
      </section>
    </template>
    <div v-if="actionName" class="program-overlay" @click.self="closeAction">
      <form class="program-dialog" role="dialog" aria-modal="true" :aria-label="actionLabel" @submit.prevent="perform">
        <h2>{{ actionLabel }}</h2><p v-if="selected" class="program-muted">RET-{{ selected.number }} · {{ selected.clientName }} · Available {{ money(selected.available) }}</p>
        <p v-if="actionError" class="program-error" role="alert">{{ actionError }}</p>
        <fieldset :disabled="busy">
          <p v-if="actionName==='sent'" class="program-muted">Confirm that you have shared this advance request with the customer.</p>
          <p v-else-if="actionName==='void'" class="program-muted">This cancels the advance request and keeps it in your history.</p>
          <template v-else>
            <template v-if="actionName==='apply'"><label>Find an unpaid invoice<input v-model="invoiceSearch" placeholder="Search invoice number or subject"></label><p v-if="invoicesLoading" class="program-muted">Loading invoices…</p><label>Invoice<select v-model="payment.billId" required><option disabled value="">Select an invoice for this customer</option><option v-for="invoice in invoices" :key="invoice.id" :value="invoice.id">{{ invoice.invoiceCode || invoice.invoiceNumber }} · Balance {{ money(invoice.balanceDue) }}</option></select></label><p v-if="!invoicesLoading && !invoices.length" class="program-muted">No unpaid invoices found for this customer.</p></template>
            <p v-if="actionName==='unapply'" class="program-muted">Remove {{ money(payment.amount) }} from this invoice. Its balance will reopen and this amount will become available in the retainer.</p>
            <label v-else>Amount<input v-model.number="payment.amount" type="number" min="0.01" step="0.01" :max="actionName==='collect'?selected.amount-selected.collected:selected.available" required></label>
            <label>Date<input v-model="payment.date" type="date" :min="selected?.events.at(-1)?.eventDate || selected?.retainerDate" :max="invoiceToday()" required></label>
            <template v-if="actionName==='collect' || actionName==='refund'"><label>Payment method<select v-model="payment.paymentMethod"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank</option></select></label><label>{{ actionName==='collect'?'Deposit to':'Paid from' }}<select v-model="payment.accountId" required><option disabled value="">Select a cash / bank account</option><option v-for="account in cashAccounts" :key="account.id" :value="account.id">{{ account.name }}</option></select></label></template>
            <label>Reference<input v-model="payment.reference" maxlength="200"></label>
          </template>
          <div class="program-actions"><button type="button" class="program-secondary" @click="closeAction">Cancel</button><button class="program-primary" type="submit">{{ busy?'Saving…':actionLabel }}</button></div>
        </fieldset>
      </form>
    </div>
    <RetainerPrint v-if="printing && selected" :retainer="selected" :company="scope.auth.session.value" @close="printing=false" />
  </div>
  </UDashboardPanelContent>
</template>

