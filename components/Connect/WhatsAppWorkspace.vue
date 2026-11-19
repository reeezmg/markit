<script setup lang="ts">
import { computed, ref, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import WhatsAppNotifications from './WhatsAppNotifications.vue'
const scope = useCompanyScope(), route = useRoute()
const companyId = scope.companyId.value
const tabs = ['Overview', 'Templates', 'Messages', 'Notifications', 'Settings'] as const
const tab = ref('Overview'), state = ref<any>(null), busy = ref(false), loading = ref(true)
const error = ref(''), notice = ref(''), sdkReady = ref(false), signupState = ref('')
const assets = ref<any[]>([]), assetKey = ref(''), manualToken = ref('')
const connection = computed(() => state.value?.connection), connected = computed(() => !!connection.value?.active)
const api = <T = any>(action: string, method: any = 'GET', body?: any, query?: any): Promise<T> => $fetch(`/api/connect/whatsapp/${action}`, {
  method, body, query, headers: { 'x-company-id': companyId }, credentials: 'include', retry: 0,
}) as Promise<T>
let disposed = false, signupTimer: ReturnType<typeof setTimeout> | undefined, refreshTimer: ReturnType<typeof setInterval> | undefined
watch(busy, value => { scope.busy.value = value })
async function run(work: () => Promise<void>) {
  if (busy.value) return
  error.value = ''; notice.value = ''; busy.value = true
  try { await work() } catch (e: any) { if (!disposed) error.value = e?.data?.statusMessage || e?.statusMessage || e?.message || 'Request failed' }
  finally { busy.value = false }
}
async function refreshStatus() { state.value = await api('status') }
async function prepareSignup() {
  signupState.value = (await api('start', 'POST', {})).state
}
async function loadSdk() {
  const win = window as any
  if (!win.FB) await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById('markit-facebook-sdk')
    const script = existing || document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Meta signup could not load. Check your browser connection or content blocker.')), { once: true })
    if (!existing) { script.id = 'markit-facebook-sdk'; (script as HTMLScriptElement).src = 'https://connect.facebook.net/en_US/sdk.js'; (script as HTMLScriptElement).async = true; document.head.appendChild(script) }
  })
  if (disposed) return
  win.FB.init({ appId: state.value.appId, version: state.value.version, autoLogAppEvents: false, xfbml: false })
  sdkReady.value = true
}
function beginSignup() {
  if (!sdkReady.value || busy.value || !signupState.value) return
  error.value = ''; notice.value = ''; busy.value = true
  signupTimer = setTimeout(() => { busy.value = false; error.value = 'Signup did not finish. Close the Meta popup and try again.' }, 180000)
  ;(window as any).FB.login(async (response: any) => {
    if (signupTimer) clearTimeout(signupTimer)
    if (disposed) return
    try {
      if (!response.authResponse?.code) throw new Error('Signup was cancelled or the required permissions were not granted.')
      const result = await api('exchange', 'POST', { code: response.authResponse.code, state: signupState.value })
      assets.value = result.assets; assetKey.value = result.assets.length === 1 ? result.assets[0].phoneId : ''
      notice.value = 'Business authorized. Choose the phone number to finish connecting.'
    } catch (e: any) { error.value = e?.data?.statusMessage || e.message }
    finally { busy.value = false }
  }, { config_id: state.value.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {} } })
}
async function manualConnect() {
  await prepareSignup()
  try {
    const result = await api('exchange', 'POST', { accessToken: manualToken.value, state: signupState.value })
    assets.value = result.assets; assetKey.value = result.assets.length === 1 ? result.assets[0].phoneId : ''
  } finally { manualToken.value = '' }
}
async function finishConnect() {
  const asset = assets.value.find(a => a.phoneId === assetKey.value)
  if (!asset) throw new Error('Choose a phone number')
  await api('finish', 'POST', { state: signupState.value, wabaId: asset.wabaId, phoneId: asset.phoneId })
  assets.value = []; signupState.value = ''; await refreshStatus()
  notice.value = 'Connected. Subscribe webhooks and check number registration in Settings before messaging.'
}

const templates = ref<any[]>([]), templateAfter = ref<string | null>(null), templateSearch = ref('')
const filteredTemplates = computed(() => templates.value.filter(t => `${t.name} ${t.status} ${t.language}`.toLowerCase().includes(templateSearch.value.toLowerCase())))
const editorOpen = ref(false), editingId = ref(''), templateName = ref(''), language = ref('en_US'), category = ref('UTILITY')
const templateBody = ref('Hello {{1}}, your order {{2}} is ready. Thank you for shopping with us.')
const sampleValues = ref('Alex\nORD-1001'), footer = ref(''), advancedTemplate = ref(false), componentsJson = ref('[]')
const bodyVariables = computed(() => [...new Set([...templateBody.value.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])))].sort((a,b) => a-b))
const templatePreview = computed(() => templateBody.value.replace(/\{\{(\d+)\}\}/g, (_, n) => sampleValues.value.split('\n')[Number(n)-1] || `{{${n}}}`))
async function loadTemplates(more = false) {
  const result = await api('templates', 'GET', undefined, more && templateAfter.value ? { after: templateAfter.value } : {})
  templates.value = more ? [...templates.value, ...result.data] : result.data; templateAfter.value = result.after
}
function editTemplate(t?: any) {
  editingId.value = t?.id || ''; templateName.value = t?.name || ''; language.value = t?.language || 'en_US'; category.value = t?.category || 'UTILITY'
  advancedTemplate.value = !!t; componentsJson.value = JSON.stringify(t?.components || [{ type: 'BODY', text: templateBody.value }], null, 2)
  if (t) templateBody.value = t.components?.find((c: any) => c.type === 'BODY')?.text || ''
  editorOpen.value = true
}
async function saveTemplate() {
  let components: any[]
  if (advancedTemplate.value) components = JSON.parse(componentsJson.value)
  else {
    const body: any = { type: 'BODY', text: templateBody.value }
    if (bodyVariables.value.length) {
      const examples = sampleValues.value.split('\n').map(s => s.trim())
      if (bodyVariables.value.some((v, i) => v !== i+1) || examples.length !== bodyVariables.value.length || examples.some(s => !s)) throw new Error('Provide one sample per consecutive variable, starting with {{1}}')
      body.example = { body_text: [examples] }
    }
    components = [body, ...(footer.value ? [{ type: 'FOOTER', text: footer.value }] : [])]
  }
  const result = await api('templates', editingId.value ? 'PUT' : 'POST', { id: editingId.value || undefined, name: templateName.value, language: language.value, category: category.value, components })
  editorOpen.value = false; await loadTemplates()
  notice.value = `Template submitted to Meta${result.id ? ` (${result.id})` : ''}. Approval status will update when you refresh.`
}
async function deleteTemplate(t: any) {
  if (!window.confirm(`Delete ${t.name} (${t.language}) from Meta? This cannot be undone.`)) return
  await api('templates', 'DELETE', { id: t.id }); await loadTemplates(); notice.value = 'Template deleted.'
}

const messages = ref<any[]>([]), messageBefore = ref<string | null>(null), recipient = ref(''), messageType = ref('template'), text = ref('')
const templateId = ref(''), parametersJson = ref('[]'), consent = ref(false), requestId = ref(''), uncertain = ref(false)
const selectedTemplate = computed(() => templates.value.find(t => t.id === templateId.value))
const sendVariables = ref<{ key: string; value: string; component: string }[]>([]), advancedSend = ref(false)
watch(templateId, () => {
  sendVariables.value = []
  for (const c of selectedTemplate.value?.components || []) {
    if (!['BODY', 'HEADER'].includes(c.type)) continue
    for (const n of [...new Set<string>([...(String(c.text || '').matchAll(/\{\{(\d+)\}\}/g))].map(m => m[1]))].sort((a,b) => Number(a)-Number(b))) sendVariables.value.push({ key: n, component: c.type.toLowerCase(), value: '' })
  }
  parametersJson.value = '[]'
})
async function loadMessages(more = false) {
  const result = await api('messages', 'GET', undefined, more && messageBefore.value ? { before: messageBefore.value } : {})
  messages.value = more ? [...messages.value, ...result.data] : result.data; messageBefore.value = result.before
}
function newSend() { requestId.value = crypto.randomUUID(); uncertain.value = false; notice.value = ''; error.value = '' }
async function sendMessage() {
  if (!requestId.value) requestId.value = crypto.randomUUID()
  let components: any[] = []
  if (messageType.value === 'template') {
    if (advancedSend.value) components = JSON.parse(parametersJson.value)
    else {
      if (sendVariables.value.some(v => !v.value.trim())) throw new Error('Fill every template variable')
      for (const type of ['header', 'body']) {
        const variables = sendVariables.value.filter(v => v.component === type)
        if (variables.length) components.push({ type, parameters: variables.map(v => ({ type: 'text', text: v.value })) })
      }
    }
  }
  try {
    const result = await api('messages', 'POST', { requestId: requestId.value, to: recipient.value, type: messageType.value, text: text.value, templateId: templateId.value, components, consent: consent.value })
    notice.value = `Message ${result.status.toLowerCase()}${result.metaId ? ` · ${result.metaId}` : ''}. Delivery is confirmed by webhook receipts.`
    uncertain.value = true // A second intentional send needs an explicit new ID.
    consent.value = false; await loadMessages()
  } catch (e) { uncertain.value = true; await loadMessages().catch(() => {}); throw e }
}
function reply(m: any) { recipient.value = m.recipient; messageType.value = 'text'; newSend() }
function messageLabel(m: any) { return m.content?.text?.body || m.content?.text || m.content?.template?.name || m.content?.caption || (m.content?.mediaId ? `Media · ${m.kind}` : m.kind) }
function formatDate(value: string) { return new Date(value).toLocaleString() }

const health = ref<any>(null), profileLoaded = ref(false), profile = reactive({ about: '', address: '', description: '', email: '', websites: '' }), pin = ref('')
async function loadSettings() {
  const [h, p] = await Promise.all([api('health'), api('profile')]); health.value = h
  const data = p.data?.[0] || {}; for (const field of ['about', 'address', 'description', 'email'] as const) profile[field] = data[field] || ''
  profile.websites = (data.websites || []).join('\n')
  profileLoaded.value = true
}
async function saveProfile() { await api('profile', 'POST', { ...profile, websites: profile.websites.split('\n').map(v => v.trim()).filter(Boolean) }); notice.value = 'Business profile updated.' }
async function subscribe() { await api('subscribe', 'POST', {}); await refreshStatus(); notice.value = 'App subscribed. Enable the messages webhook field in the Meta App Dashboard.' }
async function register() { try { await api('register', 'POST', { pin: pin.value }); notice.value = 'Number registered with Meta.'; await loadSettings() } finally { pin.value = '' } }
async function disconnect() {
  if (!window.confirm('Disconnect this company’s WhatsApp account? Messaging stops and its stored credential is removed. Message history remains.')) return
  await api('disconnect', 'POST', {}); await refreshStatus(); await prepareSignup(); notice.value = 'Disconnected. Reconnect the same account and number whenever needed.'
}
watch(tab, () => run(async () => {
  if (!connected.value) return
  if (tab.value === 'Templates') await loadTemplates()
  if (tab.value === 'Messages') { await loadTemplates(); await loadMessages() }
  if (tab.value === 'Settings') await loadSettings()
}))
onMounted(async () => {
  await run(async () => {
    await refreshStatus()
    if (state.value.configured && state.value.schemaReady) { await prepareSignup(); await loadSdk() }
  })
  loading.value = false
  if (route.query.tab && tabs.includes(String(route.query.tab) as any)) tab.value = String(route.query.tab)
  refreshTimer = setInterval(() => {
    if (!busy.value && !assets.value.length && state.value?.configured && state.value?.schemaReady) prepareSignup().catch(() => { signupState.value = '' })
  }, 8 * 60 * 1000)
})
onBeforeUnmount(() => { disposed = true; scope.busy.value = false; if (signupTimer) clearTimeout(signupTimer); if (refreshTimer) clearInterval(refreshTimer); manualToken.value = '' })
</script>

<template>
  <div class="wa-workspace mx-auto max-w-7xl space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex items-center gap-3"><span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><UIcon name="i-heroicons-chat-bubble-left-right" class="h-7 w-7" /></span><div><h1 class="text-xl font-semibold">WhatsApp Business</h1><p class="text-sm text-gray-500">Connect your business. Keep every conversation moving.</p></div></div>
      <UBadge :color="connected ? 'green' : 'gray'" variant="subtle">{{ connected ? 'Connected' : 'Not connected' }}</UBadge>
    </header>
    <div v-if="error" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{{ error }}</div>
    <div v-if="notice" role="status" class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{{ notice }}</div>
    <p v-if="loading" role="status" class="p-8 text-gray-500">Loading company connection…</p>
    <template v-if="state">
      <div v-if="!state.schemaReady || !state.configured" class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p class="font-medium">Setup is needed before this company can connect</p>
        <p v-if="!state.schemaReady" class="mt-1">The WhatsApp database migration is prepared and awaits separate approval to apply.</p>
        <p v-if="!state.configured" class="mt-1">The Markit operator must configure: {{ Object.entries(state.setup).filter(([, value]) => !value).map(([key]) => key).join(', ') }}. See the WhatsApp Connect setup guide.</p>
      </div>
      <nav aria-label="WhatsApp workspace" class="flex gap-1 overflow-x-auto border-b border-gray-200 pb-2 dark:border-gray-800">
        <button v-for="item in tabs" :key="item" type="button" :aria-current="tab === item ? 'page' : undefined" :disabled="busy" class="rounded-lg px-4 py-2 text-sm font-medium" :class="tab === item ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'" @click="tab = item">{{ item }}</button>
      </nav>
      <WhatsAppNotifications v-if="tab==='Notifications'" :key="companyId" :company-id="companyId" :connected="connected" @busy="busy=$event" />
      <section v-if="tab === 'Overview'" class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-5 lg:col-span-2">
          <div class="wa-card">
            <h2 class="text-lg font-semibold">{{ connected ? connection.verifiedName || 'Your business account' : 'Bring your business to WhatsApp' }}</h2>
            <p class="mt-2 text-sm text-gray-500">Customers connect their own Meta business account and phone number to Markit. Account ownership stays with the business.</p>
            <dl v-if="connection" class="my-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt class="text-gray-500">Phone number</dt><dd>{{ connection.displayPhone }}</dd></div><div><dt class="text-gray-500">Business account ID</dt><dd class="break-all font-mono">{{ connection.wabaId }}</dd></div><div><dt class="text-gray-500">Phone number ID</dt><dd class="break-all font-mono">{{ connection.phoneId }}</dd></div><div><dt class="text-gray-500">Webhook subscription</dt><dd>{{ connection.subscribed ? 'Subscribed' : 'Needs setup' }}</dd></div></dl>
            <div class="mt-5 flex flex-wrap gap-3"><UButton icon="i-heroicons-link" :disabled="!sdkReady || !signupState || busy || !state.schemaReady" @click="beginSignup">{{ connected ? 'Renew authorization' : 'Connect with Meta' }}</UButton><UButton v-if="connected" variant="soft" :disabled="busy" @click="tab = 'Settings'">Connection settings</UButton></div>
            <p class="mt-3 text-xs text-gray-500">A Meta business administrator completes signup in a secure Meta window. Your WhatsApp password is never shared with Markit.</p>
            <div v-if="assets.length" class="mt-5 space-y-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-800"><label class="block text-sm font-medium" for="wa-asset">Choose the business number</label><select id="wa-asset" v-model="assetKey" class="wa-input"><option value="">Select a number</option><option v-for="asset in assets" :key="asset.phoneId" :value="asset.phoneId">{{ asset.verifiedName }} · {{ asset.displayPhone }} · {{ asset.wabaId }}</option></select><UButton :disabled="!assetKey || busy" :loading="busy" @click="run(finishConnect)">Finish connection</UButton></div>
          </div>
          <div class="wa-card"><h2 class="font-semibold">From connection to conversation</h2><ol class="mt-4 space-y-4 text-sm"><li><strong>1. Connect a company.</strong><p class="text-gray-500">Authorize its Meta business portfolio, WhatsApp account and number.</p></li><li><strong>2. Activate the channel.</strong><p class="text-gray-500">Subscribe webhooks, register the number if needed, and add a payment method in Meta.</p></li><li><strong>3. Create a template.</strong><p class="text-gray-500">Submit an order update, reminder or other business message for Meta approval.</p></li><li><strong>4. Start a conversation.</strong><p class="text-gray-500">Send an approved template to an opted-in customer. Reply to their messages within the service window.</p></li></ol></div>
        </div>
        <aside class="space-y-5"><div class="wa-card"><h2 class="font-semibold">Ready for real customers</h2><p class="mt-3 text-sm text-gray-500">Templates and messages use the connected company’s number. Refresh activity to see incoming messages and delivery receipts.</p><div class="mt-4 space-y-2"><UButton block variant="soft" :disabled="!connected || busy" @click="tab = 'Templates'">Manage templates</UButton><UButton block variant="soft" :disabled="!connected || busy" @click="tab = 'Messages'">Open messages</UButton></div></div>
          <details class="wa-card"><summary class="cursor-pointer text-sm font-medium">App-admin testing / existing credentials</summary><p class="my-3 text-xs text-gray-500">Use a token issued to the configured Meta app with access to this business. Markit validates the granted accounts before connecting. Tokens remain on the server after authorization.</p><form class="space-y-3" @submit.prevent="run(manualConnect)"><label for="wa-token" class="text-sm">Business access token</label><input id="wa-token" v-model="manualToken" class="wa-input" type="password" autocomplete="off" required maxlength="1800" /><UButton type="submit" :disabled="busy || !state.configured || !state.schemaReady" :loading="busy">Validate and select account</UButton></form></details>
        </aside>
      </section>

      <section v-if="tab === 'Templates'" class="space-y-5">
        <div class="flex flex-wrap justify-between gap-3"><div><h2 class="font-semibold">Message templates</h2><p class="text-sm text-gray-500">Create and manage templates in the company’s WhatsApp business account.</p></div><div class="flex gap-2"><UButton variant="soft" :disabled="!connected || busy" @click="run(() => loadTemplates())">Refresh</UButton><UButton :disabled="!connected || busy" @click="editTemplate()">Create template</UButton></div></div>
        <div v-if="editorOpen" class="wa-card grid gap-6 lg:grid-cols-3">
          <form class="space-y-4 lg:col-span-2" @submit.prevent="run(saveTemplate)"><h3 class="font-semibold">{{ editingId ? 'Edit template' : 'New template' }}</h3><div class="grid gap-4 sm:grid-cols-3"><label class="wa-label">Name<input v-model="templateName" class="wa-input" required pattern="[a-z][a-z0-9_]*" :disabled="!!editingId" placeholder="order_ready" /></label><label class="wa-label">Language code<input v-model="language" class="wa-input" required :disabled="!!editingId" placeholder="en_US" /></label><label class="wa-label">Category<select v-model="category" class="wa-input"><option>UTILITY</option><option>MARKETING</option><option>AUTHENTICATION</option></select></label></div>
            <label class="flex items-center gap-2 text-sm"><input v-model="advancedTemplate" type="checkbox" /> Edit complete components JSON (headers, buttons, media or authentication)</label>
            <template v-if="!advancedTemplate"><label class="wa-label">Message body<textarea v-model="templateBody" class="wa-input" rows="5" required maxlength="1024" /></label><p class="text-xs text-gray-500">Use numbered variables such as &#123;&#123;1&#125;&#125; and &#123;&#123;2&#125;&#125;.</p><label v-if="bodyVariables.length" class="wa-label">Sample values — one per variable, one per line<textarea v-model="sampleValues" class="wa-input" rows="3" /></label><label class="wa-label">Footer (optional)<input v-model="footer" class="wa-input" maxlength="60" /></label></template>
            <label v-else class="wa-label">Meta template components<textarea v-model="componentsJson" class="wa-input font-mono text-xs" rows="14" spellcheck="false" required /></label>
            <p class="text-xs text-gray-500">Meta reviews submissions and may recategorize them. Authentication templates require Meta’s authentication component format. For media headers, use an uploaded Meta example handle.</p><div class="flex gap-2"><UButton type="submit" :disabled="busy" :loading="busy">Submit to Meta</UButton><UButton variant="ghost" :disabled="busy" @click="editorOpen = false">Cancel</UButton></div>
          </form>
          <div class="rounded-xl bg-emerald-50 p-5 dark:bg-emerald-950"><p class="mb-4 text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{{ advancedTemplate ? 'Body reference' : 'Message preview' }}</p><div class="whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-sm text-gray-800 shadow-sm">{{ templatePreview }}<p v-if="footer" class="mt-3 text-xs text-gray-500">{{ footer }}</p></div></div>
        </div>
        <input v-model="templateSearch" aria-label="Search templates" class="wa-input max-w-sm" placeholder="Search name, language or status…" />
        <div class="wa-card overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b border-gray-200 text-gray-500 dark:border-gray-800"><th class="p-3">Template</th><th class="p-3">Category</th><th class="p-3">Status</th><th class="p-3">Actions</th></tr></thead><tbody><tr v-for="t in filteredTemplates" :key="t.id" class="border-b border-gray-100 dark:border-gray-800"><td class="p-3"><p class="font-medium">{{ t.name }}</p><p class="text-xs text-gray-500">{{ t.language }} · {{ t.id }}</p></td><td class="p-3">{{ t.category }}</td><td class="p-3"><UBadge :color="t.status === 'APPROVED' ? 'green' : 'gray'" variant="subtle">{{ t.status }}</UBadge><p v-if="t.rejected_reason" class="mt-1 text-xs text-red-600">{{ t.rejected_reason }}</p></td><td class="p-3"><div class="flex gap-2"><UButton size="xs" variant="ghost" :disabled="busy" @click="editTemplate(t)">Edit</UButton><UButton size="xs" color="red" variant="ghost" :disabled="busy" @click="run(() => deleteTemplate(t))">Delete</UButton></div></td></tr><tr v-if="!filteredTemplates.length"><td colspan="4" class="p-8 text-center text-gray-500">{{ connected ? 'No templates found. Create your first business message.' : 'Connect a business to manage its templates.' }}</td></tr></tbody></table><UButton v-if="templateAfter" class="mt-4" variant="soft" :disabled="busy" @click="run(() => loadTemplates(true))">Load more templates</UButton></div>
      </section>

      <section v-if="tab === 'Messages'" class="grid gap-6 lg:grid-cols-3">
        <form class="wa-card space-y-4 self-start" @submit.prevent="run(sendMessage)"><h2 class="font-semibold">Send a message</h2><label class="wa-label">Recipient number<input v-model="recipient" type="tel" class="wa-input" placeholder="+91 98765 43210" required :disabled="uncertain" /></label><label class="wa-label">Message type<select v-model="messageType" class="wa-input" :disabled="uncertain"><option value="template">Approved template</option><option value="text">Text reply (24-hour window)</option></select></label>
          <template v-if="messageType === 'template'"><label class="wa-label">Approved template<select v-model="templateId" class="wa-input" required :disabled="uncertain"><option value="">Choose a template</option><option v-for="t in templates.filter(t => t.status === 'APPROVED')" :key="t.id" :value="t.id">{{ t.name }} · {{ t.language }}</option></select></label><p v-if="selectedTemplate" class="whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm dark:bg-emerald-950">{{ selectedTemplate.components?.find((c: any) => c.type === 'BODY')?.text }}</p><label class="flex items-center gap-2 text-xs"><input v-model="advancedSend" type="checkbox" :disabled="uncertain" /> Advanced parameters (media, buttons or named variables)</label><label v-for="v in advancedSend ? [] : sendVariables" :key="v.component + v.key" class="wa-label">{{ v.component }} variable {{ v.key }}<input v-model="v.value" class="wa-input" required :disabled="uncertain" /></label><label v-if="advancedSend" class="wa-label">Send components JSON<textarea v-model="parametersJson" class="wa-input font-mono text-xs" rows="7" :disabled="uncertain" /></label><p class="text-xs text-gray-500">Media headers and dynamic buttons require matching advanced parameters. Approval and parameter validity are checked against Meta.</p></template>
          <label v-else class="wa-label">Reply<textarea v-model="text" class="wa-input" rows="5" maxlength="4096" required :disabled="uncertain" /></label>
          <label class="flex items-start gap-2 text-sm"><input v-model="consent" type="checkbox" class="mt-1" required :disabled="uncertain" /><span>I confirm this recipient opted in to receive this business message.</span></label><p class="text-xs text-gray-500">Consent confirmation is recorded with the sending administrator. Text replies require a customer message received within the last 24 hours.</p>
          <UButton type="submit" block :disabled="!connected || busy || uncertain || !consent" :loading="busy">Send message</UButton><UButton v-if="uncertain" block variant="soft" :disabled="busy" @click="newSend">Start a new message</UButton><p v-if="uncertain" class="text-xs text-amber-700 dark:text-amber-300">Check activity before starting another send. A pending or unknown result may already have reached Meta.</p>
        </form>
        <div class="wa-card space-y-4 lg:col-span-2"><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">Conversation activity</h2><p class="text-xs text-gray-500">Incoming messages and actual Meta delivery receipts.</p></div><UButton variant="soft" :disabled="busy || !connection" @click="run(() => loadMessages())">Refresh</UButton></div><p v-if="!messages.length" class="py-12 text-center text-sm text-gray-500">No messages yet. Send an approved template to start a conversation.</p><article v-for="m in messages" :key="m.id" class="rounded-xl border p-4" :class="m.direction === 'inbound' ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-gray-200 dark:border-gray-800'"><div class="flex flex-wrap justify-between gap-2 text-xs"><strong>{{ m.direction === 'inbound' ? 'From' : 'To' }} +{{ m.recipient }}</strong><span>{{ formatDate(m.createdAt) }}</span></div><p class="mt-2 whitespace-pre-wrap break-words text-sm">{{ messageLabel(m) }}</p><div class="mt-3 flex flex-wrap items-center gap-2"><UBadge :color="m.status === 'FAILED' || m.status === 'UNKNOWN' ? 'red' : m.status === 'READ' || m.status === 'DELIVERED' ? 'green' : 'gray'" variant="subtle">{{ m.status }}</UBadge><span class="break-all font-mono text-xs text-gray-500">{{ m.metaId || m.id }}</span><UButton v-if="m.direction === 'inbound'" size="xs" variant="ghost" :disabled="busy" @click="reply(m)">Reply</UButton></div><p v-if="m.content?.deliveryError" class="mt-2 text-xs text-red-600">Meta delivery error {{ m.content.deliveryError }}</p></article><UButton v-if="messageBefore" variant="soft" :disabled="busy" @click="run(() => loadMessages(true))">Older messages</UButton></div>
      </section>

      <section v-if="tab === 'Settings'" class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-5"><div class="wa-card space-y-4"><h2 class="font-semibold">Channel activation</h2><p class="text-sm text-gray-500">Configure this app’s webhook callback to <code class="break-all">{{ state.webhookPath }}</code> on your public HTTPS Markit domain, and subscribe the Meta webhook to the messages field. The verification token is configured by your operator.</p><UButton :disabled="!connected || busy" :loading="busy" @click="run(subscribe)">{{ connection?.subscribed ? 'Refresh app subscription' : 'Subscribe company webhooks' }}</UButton><div v-if="health" class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800"><p>Verified name: {{ health.phone.verified_name }}</p><p>Number verification: {{ health.phone.code_verification_status }}</p><p>Quality: {{ health.phone.quality_rating || 'Not available' }}</p><p>Platform: {{ health.phone.platform_type }}</p></div><UButton variant="ghost" :disabled="!connected || busy" @click="run(loadSettings)">Refresh health and profile</UButton></div>
          <form class="wa-card space-y-4" @submit.prevent="run(register)"><h2 class="font-semibold">Register a verified number</h2><p class="text-sm text-gray-500">Use this only when Meta requires Cloud API registration after signup. Enter the number’s two-step verification PIN, or set its PIN during first registration. Existing WhatsApp Business app coexistence numbers follow Meta’s separate activation flow.</p><label class="wa-label">Six-digit PIN<input v-model="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required class="wa-input" /></label><UButton type="submit" :disabled="!connected || busy">Register number</UButton></form>
          <div class="wa-card space-y-3"><h2 class="font-semibold">Billing and account ownership</h2><p class="text-sm text-gray-500">Add a payment method and complete business verification in Meta. Meta controls account eligibility, messaging limits and template approval.</p><UButton to="https://business.facebook.com/wa/manage/" target="_blank" variant="soft">Open WhatsApp Manager</UButton><UButton block color="red" variant="ghost" :disabled="!connected || busy" @click="run(disconnect)">Disconnect this company</UButton></div>
        </div>
        <form class="wa-card space-y-4 self-start" @submit.prevent="run(saveProfile)"><h2 class="font-semibold">Business profile</h2><p class="text-sm text-gray-500">The information customers see on your WhatsApp business profile.</p><label class="wa-label">About<input v-model="profile.about" class="wa-input" maxlength="139" /></label><label class="wa-label">Description<textarea v-model="profile.description" class="wa-input" rows="4" maxlength="512" /></label><label class="wa-label">Address<input v-model="profile.address" class="wa-input" maxlength="256" /></label><label class="wa-label">Email<input v-model="profile.email" type="email" class="wa-input" maxlength="128" /></label><label class="wa-label">Websites — up to two, one per line<textarea v-model="profile.websites" class="wa-input" rows="2" placeholder="https://yourcompany.com" /></label><UButton type="submit" :disabled="!connected || busy || !profileLoaded" :loading="busy">Save profile</UButton></form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.wa-card { @apply rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900; }
.wa-label { @apply block space-y-1 text-sm font-medium; }
.wa-input { @apply block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100; }
button:disabled { @apply cursor-not-allowed opacity-60; }
</style>
