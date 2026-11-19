<script setup lang="ts">
import '~/assets/css/invoice-programs.css'
import ProgramCustomer from './ProgramCustomer.vue'
import ProgramTemplate from './ProgramTemplate.vue'
import QuotePrintPreview from '~/components/Quotes/PrintPreview.vue'
import { newQuoteLine, quoteTotals } from '~/utils/erp-quote'
import { invoiceToday, recurringInput } from '~/utils/invoice-programs'
import { programRequest } from '~/utils/invoice-program-request.client'
import { defaultQuoteDesign } from '~/utils/quote-design'
import { billingErrorMessage } from '~/utils/billing-error'
const scope = useCompanyScope('form', true)
await scope.ready
const rows = ref<any[]>([]), selected = ref<any>(null), editor = ref(false), busy = ref(false), loading = ref(false), error = ref(''), search = ref(''), filter = ref('')
const editId = ref(''), revision = ref(''), customerName = ref(''), printDraft = ref<any>(null)
const currency = computed(() => scope.auth.session.value?.currency || 'INR')
const money = (n: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.value }).format(Number(n || 0))
const blank = () => ({ name: '', startDate: invoiceToday(), endDate: '', frequency: 'MONTH', interval: 1, generationMode: 'DRAFT', dueDays: 0,
  template: { clientId: '', quoteDate: invoiceToday(), expiryDate: '', referenceNumber: '', subject: '', salesperson: '', status: 'DRAFT' as const,
    notes: '', termsAndConditions: '', paymentTerms: '', deliveryEstimate: '', discount: 0, discountType: 'amount' as 'amount'|'percent', adjustment: 0, items: [newQuoteLine(crypto.randomUUID())] } })
const form = ref(blank())
let version = 0, detailVersion = 0, timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const token = ++version; loading.value = true; error.value = ''
  try {
    const result = await scope.fetch<any>('/api/recurring-invoices', { query: { q: search.value, status: filter.value } })
    if (token === version) rows.value = result.rows
  } catch (e) { if (token === version) error.value = billingErrorMessage(e) }
  finally { if (token === version) loading.value = false }
}
async function detail(id: string) {
  const token = ++detailVersion
  try { const row = await scope.fetch<any>('/api/recurring-invoices/' + id); if (token === detailVersion) selected.value = row }
  catch (e) { if (token === detailVersion) error.value = billingErrorMessage(e) }
}
function create() { selected.value = null; editId.value = ''; revision.value = ''; form.value = blank(); customerName.value = ''; error.value = ''; editor.value = true }
function edit(row: any) {
  editId.value = row.id; revision.value = row.revision; customerName.value = row.clientName
  form.value = { name: row.name, startDate: row.startDate, endDate: row.endDate || '', frequency: row.frequency, interval: row.interval,
    generationMode: row.generationMode, dueDays: row.dueDays, template: JSON.parse(JSON.stringify(row.template)) }
  error.value = ''; editor.value = true
}
async function save() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const input = recurringInput(form.value), payload = { ...input, revision: revision.value }
    const request = programRequest(scope.companyId.value + ':recurring-save:' + (editId.value || 'new'), payload)
    const result = await scope.fetch<any>('/api/recurring-invoices' + (editId.value ? '/' + editId.value : ''), {
      method: editId.value ? 'PUT' : 'POST', body: { ...payload, requestId: request.requestId },
    })
    request.clear(); editor.value = false; await load(); await detail(result.id)
  } catch (e) { error.value = billingErrorMessage(e) }
  finally { busy.value = false }
}
async function action(row: any, action: string, occurrenceId?: string) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const payload = { action, ...(occurrenceId ? { occurrenceId } : {}) }, request = programRequest(scope.companyId.value + ':recurring:' + row.id, payload)
    await scope.fetch('/api/recurring-invoices/' + row.id + '/actions', { method: 'POST', body: { ...payload, requestId: request.requestId } })
    request.clear(); await load(); await detail(row.id)
  } catch (e) { error.value = billingErrorMessage(e) }
  finally { busy.value = false }
}
function preview(occurrence: any) {
  const documentDesign = defaultQuoteDesign()
  documentDesign.sections.at(-1)!.text = 'Draft invoice. Issue this invoice before requesting payment.'
  printDraft.value = { ...occurrence.template, quoteNumber: 'Recurring draft · ' + occurrence.invoiceDate, quoteDate: occurrence.invoiceDate,
    expiryDate: occurrence.dueDate, clientName: occurrence.clientName || selected.value.clientName, clientPhone: occurrence.clientPhone || selected.value.clientPhone,
    total: quoteTotals(occurrence.template).total, documentDesign }
}
watch([search, filter], () => { clearTimeout(timer); timer = setTimeout(load, 250) })
watch(scope.companyId, () => { ++detailVersion; selected.value = null; editor.value = false; rows.value = []; void load() })
onMounted(load)
onBeforeUnmount(() => { ++version; ++detailVersion; clearTimeout(timer) })
</script>
<template>
  <UDashboardPanelContent class="pb-8">
  <CompanyFormField toolbar :locked="busy || editor || !!selected" />
  <div class="invoice-programs">
    <div class="program-heading"><div><h1>Recurring invoices</h1><p class="program-muted">Set a schedule once. Review drafts or issue invoices automatically.</p></div><button class="program-primary" :disabled="busy" @click="create">+ New recurring invoice</button></div>
    <p v-if="error" class="program-error" role="alert">{{ error }}</p>
    <form v-if="editor" class="program-panel" @submit.prevent="save">
      <div class="program-heading"><h2>{{ editId ? 'Edit recurring profile' : 'New recurring profile' }}</h2><button type="button" class="program-link" :disabled="busy" @click="editor=false">Close</button></div>
      <fieldset :disabled="busy">
        <div class="program-grid"><label>Profile name<input v-model="form.name" required maxlength="200" placeholder="e.g. Monthly maintenance"></label><ProgramCustomer v-model="form.template.clientId" :name="customerName" :company-id="scope.companyId.value" @selected="customerName=$event.name" /></div>
        <div class="program-grid">
          <label>Start date<input v-model="form.startDate" type="date" required :disabled="!!editId"></label>
          <label>Repeat every<input v-model.number="form.interval" type="number" min="1" max="365" required :disabled="!!editId"></label>
          <label>Frequency<select v-model="form.frequency" :disabled="!!editId"><option value="DAY">Day(s)</option><option value="WEEK">Week(s)</option><option value="MONTH">Month(s)</option><option value="YEAR">Year(s)</option></select></label>
          <label>End date (optional)<input v-model="form.endDate" type="date" :min="form.startDate"></label>
          <label>Generate as<select v-model="form.generationMode"><option value="DRAFT">Draft — review before issuing</option><option value="ISSUE">Issue invoice automatically</option></select></label>
          <label>Payment due after (days)<input v-model.number="form.dueDays" type="number" min="0" max="3650" required></label>
        </div>
        <p class="program-muted">Runs daily at 6:00 AM IST. A past start date skips earlier dates when this profile is first saved. Automatic issue creates an unpaid invoice and updates stock and accounts.</p>
        <ProgramTemplate v-model="form.template" :company-id="scope.companyId.value" :currency="currency" />
        <div class="program-actions"><button type="button" class="program-secondary" @click="editor=false">Cancel</button><button class="program-primary" type="submit">{{ busy ? 'Saving…' : 'Save recurring profile' }}</button></div>
      </fieldset>
    </form>
    <template v-else>
      <div class="program-filters"><input v-model="search" aria-label="Search recurring profiles" placeholder="Search profiles or customers"><select v-model="filter" aria-label="Profile status"><option value="">All profiles</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option></select></div>
      <p v-if="loading" class="program-muted">Loading profiles…</p>
      <div class="program-scroll"><table><thead><tr><th>Profile</th><th>Customer</th><th>Frequency</th><th>Next invoice</th><th>Amount</th><th>Status</th><th></th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.id"><td><button class="program-link" @click="detail(row.id)">{{ row.name }}</button><p v-if="row.last_error" class="program-error">{{ row.last_error }}</p></td><td>{{ row.clientName }}</td><td>Every {{ row.interval }} {{ row.frequency.toLowerCase() }} · {{ row.generationMode==='DRAFT'?'Draft':'Auto issue' }}</td><td>{{ row.status==='COMPLETED'?'—':row.nextDate }}</td><td>{{ money(quoteTotals(row.template).total) }}</td><td><span class="program-badge">{{ row.status }}</span></td><td><button class="program-link" :disabled="busy" @click="edit(row)">Edit</button></td></tr>
        <tr v-if="!rows.length && !loading"><td colspan="7">No recurring profiles found. Create a profile to get started.</td></tr>
      </tbody></table></div>
      <p v-if="rows.length===500" class="program-muted">Showing the latest 500 profiles. Search to narrow the results.</p>
      <section v-if="selected" class="program-panel">
        <div class="program-heading"><div><h2 class="font-semibold">{{ selected.name }}</h2><p class="program-muted">{{ selected.clientName }} · Next invoice {{ selected.nextDate }} · {{ selected.status }}</p></div><button class="program-link" @click="selected=null">Close history</button></div>
        <div class="program-actions">
          <div class="program-history-actions"><button v-if="selected.status==='ACTIVE'" class="program-secondary" :disabled="busy" @click="action(selected,'pause')">Pause</button><button v-if="selected.status==='PAUSED'" class="program-secondary" :disabled="busy" @click="action(selected,'resume')">Resume</button><button v-if="selected.status==='ACTIVE' && selected.nextDate<=invoiceToday()" class="program-primary" :disabled="busy" @click="action(selected,'generate')">Generate due invoice</button></div>
        </div>
        <p class="program-muted">Pausing stops generation. Resuming skips dates missed while paused. Each draft keeps its original items, dates and customer.</p>
        <div class="program-scroll"><table><thead><tr><th>Invoice date</th><th>Due date</th><th>Amount</th><th>Invoice</th><th></th></tr></thead><tbody>
          <tr v-for="child in selected.occurrences" :key="child.id"><td>{{ child.invoiceDate }}</td><td>{{ child.dueDate }}</td><td>{{ money(quoteTotals(child.template).total) }}</td><td>{{ child.billDeleted?'Deleted invoice':child.billId?child.invoiceCode:'Draft' }}</td><td><div class="program-history-actions"><template v-if="!child.billId"><button class="program-link" :disabled="busy" @click="preview(child)">Preview</button><button class="program-link" :disabled="busy" @click="action(selected,'issue',child.id)">Issue invoice</button></template><NuxtLink v-else-if="!child.billDeleted" :to="{path:'/erp/invoices',query:{entryCompany:scope.companyId.value,q:child.invoiceCode}} " class="program-link">View invoice</NuxtLink></div></td></tr>
          <tr v-if="!selected.occurrences.length"><td colspan="5">Invoices generated by this profile will appear here.</td></tr>
        </tbody></table></div><p v-if="selected.occurrences.length===200" class="program-muted">Showing the latest 200 occurrences.</p>
      </section>
    </template>
    <QuotePrintPreview v-if="printDraft" :quote="printDraft" :company="scope.auth.session.value" document-title="INVOICE DRAFT" @close="printDraft=null" />
  </div>
  </UDashboardPanelContent>
</template>

