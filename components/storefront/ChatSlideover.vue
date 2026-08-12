<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: { url: string; mimeType: string; name?: string; data?: string }[]
  status?: string
  interactionId?: string
  beforeSha?: string
  afterSha?: string
  codeChanged?: boolean
  canUndo?: boolean
  piLeafId?: string
  undone?: boolean
}

interface AgentSessionSummary {
  conversationId: string
  title: string
  status: string
  stage: string
  messageCount: number
  updatedAt: string
}

interface TimingEvent {
  key: string
  label: string
  detail?: string | null
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  status: 'running' | 'done' | 'error'
}

interface TimingReport {
  version: number
  interactionId: string | null
  startedAt: number
  completedAt: number | null
  totalMs: number
  events: TimingEvent[]
}

type StorefrontRunMode = 'normal' | 'plan' | 'refine-plan' | 'execute-plan' | 'cancel-plan'

interface PlanState {
  phase: 'off' | 'planning' | 'ready' | 'executing'
  automatic: boolean
  steps: { step: number; text: string; completed: boolean }[]
  completed: number
  total: number
}

interface AgentSessionData {
  conversationId: string
  status: string
  stage: string
  messages: Message[]
  timingReport?: TimingReport | null
  planState?: PlanState | null
}

const props = defineProps<{
  modelValue?: boolean
  pageSlug: string
  pageConfig: { sections: Record<string, any>; order: string[] } | null
  /** Element picked in the live preview, forwarded as edit context. */
  selectedElement?: {
    label: string
    tag: string
    id: string
    classes: string[]
    text: string
    selector: string
    componentName?: string
    sourceFile: string
    componentHierarchy?: { name: string; sourceFile: string }[]
    attrs: Record<string, string>
    rect?: { top: number; left: number; width: number; height: number }
    ancestors?: { label: string; selector: string }[]
    route: string
  } | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updateConfig: [config: any]
  previewUpdated: []
  clearSelection: []
}>()

const isOpen = computed({
  get: () => props.modelValue ?? false,
  set: (val) => emit('update:modelValue', val),
})

function close() { isOpen.value = false }

const editorUrl = (useRuntimeConfig().public.storefrontEditorUrl as string || '').replace(/\/$/, '')

// Edit-session container (Cloud Run) — prompts go to its agent CLI, which
// streams back small status updates and pushes code changes to GitHub.
// ─── State ────────────────────────────────────────────────────────────────────

const input = ref('')
const loading = ref(false)
const messages = ref<Message[]>([])
const scrollRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<{ url: string; mimeType: string; name?: string; data: string }[]>([])
const toolActivity = ref('')   // e.g. "Reading hero-banner source..."
const streamingIdx = ref(-1)   // index of the currently-streaming assistant message
const conversationId = ref('')
const sessions = ref<AgentSessionSummary[]>([])
const showSessions = ref(false)
const loadingSessions = ref(false)
const openingSessionId = ref('')
const timingReport = ref<TimingReport | null>(null)
const planState = ref<PlanState | null>(null)
const planRequested = ref(false)
const refineRequested = ref(false)
const stopRequested = ref(false)
const undoingId = ref('')
const forkingId = ref('')

function publicAgentText(value: unknown) {
  return String(value ?? '').replace(/\bpi\b/gi, 'AI agent')
}

const activePlan = computed(() => planState.value?.phase !== 'off' ? planState.value : null)
const inputPlaceholder = computed(() => refineRequested.value
  ? 'Describe what should change in the plan…'
  : planRequested.value
    ? 'Describe the task the AI agent should plan without editing…'
    : 'Ask AI or paste a screenshot…')

const stageLabels: Record<string, string> = {
  idle: 'Ready', queued: 'Waiting for an editing container...',
  planning: 'Inspecting the storefront and preparing a plan...',
  waiting_for_container: 'All editing containers are busy; waiting for the oldest available slot...',
  creating_environment: 'Creating preview container...',
  resuming_environment: 'Resuming preview container...',
  // Reported whenever the interaction has no steps yet, which covers real work
  // in progress as well as container start-up — so the label must not claim setup.
  preparing_environment: 'Working on your storefront...',
  waiting_for_agent_status: 'The AI agent is still working; reconnecting status...',
  thinking: 'Planning the change...', running_code: 'Running code in the preview workspace...',
  working_files: 'Reading or updating storefront files...', code_failed: 'A workspace command failed; agent is recovering...',
  using_tool: 'Using an agent tool...', tool_failed: 'A tool failed; agent is recovering...',
  finalizing: 'Preparing the result...', saving_code: 'Saving storefront changes...',
  saving_session: 'Saving the conversation...', deploying_preview: 'Deploying the updated preview...',
  publishing_live: 'Publishing your changes to the live store...',
  in_progress: 'The AI agent is working...',
  requires_action: 'The agent needs additional input.', completed: 'Completed',
  incomplete: 'Stopped before completion', budget_exceeded: 'Token budget exceeded',
  failed: 'Failed', cancelled: 'Cancelled', canceled: 'Cancelled',
  stopping: 'Stopping task and restoring changes...',
}

function showStage(stage?: string, status?: string) {
  toolActivity.value = stageLabels[stage || ''] || stageLabels[status || ''] || `AI agent: ${stage || status || 'working'}`
}

// Runs regularly take many minutes with no visible stage change, so show elapsed
// time — without it a long run is indistinguishable from a hung one.
const elapsedSeconds = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

const elapsedLabel = computed(() => {
  const seconds = elapsedSeconds.value
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
})

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  const seconds = Math.round(ms / 100) / 10
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}m ${remainder}s`
}

const timingEvents = computed(() => {
  // elapsedSeconds keeps running rows repainting once a second.
  void elapsedSeconds.value
  const now = Date.now()
  return (timingReport.value?.events || []).map(event => ({
    ...event,
    label: publicAgentText(event.label),
    detail: publicAgentText(event.detail),
    displayDuration: formatDuration(event.durationMs ?? Math.max(0, now - event.startedAt)),
  }))
})

const timingTotal = computed(() => {
  void elapsedSeconds.value
  const report = timingReport.value
  if (!report) return ''
  return formatDuration(report.completedAt
    ? report.completedAt - report.startedAt
    : Date.now() - report.startedAt)
})

function startElapsed() {
  const startedAt = Date.now()
  elapsedSeconds.value = 0
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - startedAt) / 1000)
  }, 1000)
}

function stopElapsed() {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = null
  elapsedSeconds.value = 0
}

onUnmounted(stopElapsed)

async function loadSessions() {
  loadingSessions.value = true
  try {
    const result = await $fetch<{ sessions: AgentSessionSummary[] }>('/api/ecommerce-cms/storefront-agent/sessions')
    sessions.value = result.sessions
  } finally {
    loadingSessions.value = false
  }
}

// ─── Memory ───────────────────────────────────────────────────────────────────

const DEFAULT_MEMORY = {
  theme: { primaryColor: '', accentColor: '', fontFamily: '', borderRadius: '', style: '' },
  brand: { name: '', tagline: '', tone: '', targetAudience: '', industry: '' },
  pages: {},
  sections: {},
  ideas: [],
  architecture: '',
  notes: '',
}

const memory = ref<Record<string, any>>({ ...DEFAULT_MEMORY })
const showMemory = ref(false)
const isSavingMemory = ref(false)
const memoryText = ref('')

async function loadMemory() {
  try {
    const res = await $fetch<{ content: Record<string, any> }>('/api/ecommerce-cms/storefront-memory')
    memory.value = res?.content ?? DEFAULT_MEMORY
  } catch {
    memory.value = { ...DEFAULT_MEMORY }
  }
}

async function saveMemory() {
  isSavingMemory.value = true
  try {
    let parsed: Record<string, any>
    try { parsed = JSON.parse(memoryText.value) }
    catch { useToast().add({ title: 'Invalid JSON', color: 'red' }); return }
    await $fetch('/api/ecommerce-cms/storefront-memory', { method: 'PUT', body: { content: parsed } })
    memory.value = parsed
    showMemory.value = false
    useToast().add({ title: 'Memory saved', color: 'green' })
  } catch {
    useToast().add({ title: 'Failed to save memory', color: 'red' })
  } finally {
    isSavingMemory.value = false
  }
}

function openMemory() {
  memoryText.value = JSON.stringify(memory.value, null, 2)
  showMemory.value = true
}

onMounted(() => {
  conversationId.value = crypto.randomUUID()
  loadMemory()
  loadSessions()
})

// ─── Patch parsing ────────────────────────────────────────────────────────────

// Properly extract nested JSON by counting braces (regex stops at first })
function extractBlock(text: string, marker: string): { json: any; start: number; end: number } | null {
  const m = text.match(new RegExp(`\\/\\/\\s*${marker}\\s*\\n`))
  if (!m || m.index === undefined) return null
  const jsonStart = m.index + m[0].length
  if (text[jsonStart] !== '{') return null
  let depth = 0, inStr = false, esc = false
  for (let i = jsonStart; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try { return { json: JSON.parse(text.slice(jsonStart, i + 1)), start: m.index, end: i + 1 } }
      catch { return null }
    }
  }
  return null
}

function parsePatch(text: string): any | null {
  return extractBlock(text, '@@CONFIG_PATCH')?.json ?? null
}

function parseMemoryUpdate(text: string): Record<string, any> | null {
  return extractBlock(text, '@@MEMORY_UPDATE')?.json ?? null
}

function stripBlocks(text: string): string {
  let out = text
  for (const marker of ['@@CONFIG_PATCH', '@@MEMORY_UPDATE']) {
    const block = extractBlock(out, marker)
    if (!block) continue
    // Also strip surrounding markdown code fence if the AI wrapped it in ```
    const before = out.slice(0, block.start)
    const fenceMatch = before.match(/```[a-z]*\n$/)
    let removeStart = block.start
    let removeEnd = block.end
    if (fenceMatch) {
      removeStart = block.start - fenceMatch[0].length
      const afterClose = out.slice(block.end).match(/^\n?```/)
      if (afterClose) removeEnd = block.end + afterClose[0].length
    }
    out = out.slice(0, removeStart) + out.slice(removeEnd)
  }
  return out.trim()
}

function applyMemoryUpdate(update: Record<string, any>) {
  const next = JSON.parse(JSON.stringify(memory.value))
  for (const [dotKey, val] of Object.entries(update)) {
    const parts = dotKey.split('.')
    let cur: any = next
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {}
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = val
  }
  memory.value = next
  $fetch('/api/ecommerce-cms/storefront-memory', { method: 'PUT', body: { content: next } }).catch(() => {})
}

// ─── Image handling ───────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function addImageFile(file: File) {
  if (!file.type.startsWith('image/')) return
  if (pendingImages.value.length >= 4) return
  const data = await blobToBase64(file)
  const url = URL.createObjectURL(file)
  pendingImages.value.push({ url, mimeType: file.type, name: file.name, data })
}

function openFilePicker() { fileInputRef.value?.click() }

async function onFileSelected(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  for (const file of Array.from(files)) await addImageFile(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function removePendingImage(index: number) {
  URL.revokeObjectURL(pendingImages.value[index].url)
  pendingImages.value.splice(index, 1)
}

function handlePaste(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items ?? [])
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) addImageFile(file)
    }
  }
}

onUnmounted(() => {
  pendingImages.value.forEach(img => URL.revokeObjectURL(img.url))
})

// ─── Selected-element context ─────────────────────────────────────────────────

// Turns the preview selection into something the agent can actually act on:
// prod builds strip Vue's __file, so the class list is the reliable way for it
// to locate the element in source.
const elementContext = computed(() => {
  const el = props.selectedElement
  if (!el) return ''
  const lines = [
    `- rendered as: <${el.tag}>${el.classes?.length ? ` class="${el.classes.join(' ')}"` : ''}`,
    `- css selector: ${el.selector}`,
    `- on route: ${el.route}`,
  ]
  if (el.id) lines.push(`- id: ${el.id}`)
  if (el.text) lines.push(`- visible text: "${el.text}"`)
  if (el.componentName) lines.push(`- component: ${el.componentName}`)
  for (const [key, val] of Object.entries(el.attrs ?? {})) lines.push(`- ${key}: ${val}`)
  if (el.sourceFile) lines.push(`- source component: ${el.sourceFile}`)
  else if (el.classes?.length) lines.push(`- locate it in source by searching for the class "${el.classes[0]}"`)
  if (el.componentHierarchy?.length) {
    lines.push(`- component hierarchy: ${el.componentHierarchy.map(item => `${item.name} (${item.sourceFile})`).join(' > ')}`)
  }
  if (el.rect) {
    lines.push(`- viewport placement: x=${Math.round(el.rect.left)}, y=${Math.round(el.rect.top)}, width=${Math.round(el.rect.width)}, height=${Math.round(el.rect.height)}`)
  }
  if (el.ancestors?.length) lines.push(`- DOM ancestors: ${el.ancestors.map(item => item.label).join(' > ')}`)

  // Data only — how to interpret and scope this block lives in the agent's
  // system instructions, so it is stated once instead of on every message.
  return [
    '## Selected element',
    ...lines,
    '',
  ].join('\n')
})

// ─── Model picker ─────────────────────────────────────────────────────────────

// Which AI runs the edit. The list comes from the sandbox so adding a model is
// a change in one place; if that call fails we fall back to an empty list and
// the picker simply hides — sending must never depend on it.
const models = ref<{ key: string; label: string; note: string; family: string; supportsImages?: boolean }[]>([])
const selectedModel = ref<string>('')

onMounted(async () => {
  try {
    const res = await $fetch<{
      default: string
      models: { key: string; label: string; note: string; family: string; supportsImages?: boolean }[]
    }>('/api/ecommerce-cms/storefront-agent/models')
    models.value = res.models ?? []
    // Server-side stickiness still applies: leaving this as the default and not
    // sending it means the backend reuses whatever the seller picked before.
    selectedModel.value = res.default ?? ''
  } catch {
    models.value = []
  }
})

// ─── Send ─────────────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

async function sendLegacy() {
  const text = input.value.trim()
  const images = pendingImages.value.length ? [...pendingImages.value] : undefined
  if (!text && !images) return
  if (loading.value) return

  const userMsg: Message = { role: 'user', content: text || '(see attached image)', images }
  messages.value.push(userMsg)
  input.value = ''
  pendingImages.value = []
  loading.value = true
  toolActivity.value = ''
  await scrollToBottom()

  // Add empty assistant message slot — text streams into it
  messages.value.push({ role: 'assistant', content: '' })
  streamingIdx.value = messages.value.length - 1

  let fullText = ''

  try {
    const resp = await fetch(`${editorUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.value.slice(0, -1).concat({
          role: 'user',
          content: userMsg.content,
        }),
        pageSlug: props.pageSlug,
      }),
    })

    if (!resp.ok) throw new Error(`Server error ${resp.status}`)
    if (!resp.body) throw new Error('No response body')

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        let evt: any
        try { evt = JSON.parse(line.slice(6)) } catch { continue }

        if (evt.type === 'status') {
          console.log('[AI status]', evt.text)
          toolActivity.value = evt.text
        } else if (evt.type === 'intent') {
          console.log('[AI intent]', evt)
          toolActivity.value = `${evt.action} → ${evt.target}`
        } else if (evt.type === 'triage') {
          toolActivity.value = `Identified: ${evt.targetTypes?.join(', ') || 'page'}`
        } else if (evt.type === 'tool_call') {
          const argStr = Object.entries(evt.args ?? {}).map(([k, v]) => `${k}: "${v}"`).join(', ')
          toolActivity.value = `${evt.name}(${argStr})`
        } else if (evt.type === 'tool_result') {
          toolActivity.value = `${evt.name} ✓`
        } else if (evt.type === 'text') {
          fullText += evt.chunk
          messages.value[streamingIdx.value].content = stripBlocks(fullText)
          await scrollToBottom()
        } else if (evt.type === 'patch') {
          console.log('[AI patch]', evt.patch)
          console.log('[AI patch] newConfig sections:', Object.keys(evt.newConfig?.sections ?? {}))
          if (evt.newConfig) emit('updateConfig', evt.newConfig)
          else console.warn('[AI patch] newConfig missing!')
        } else if (evt.type === 'memory') {
          applyMemoryUpdate(evt.update)
        } else if (evt.type === 'done') {
          messages.value[streamingIdx.value].content = stripBlocks(fullText)
          toolActivity.value = ''
        }
      }
    }
  } catch (err: any) {
    const msg = err?.message || 'Something went wrong.'
    messages.value[streamingIdx.value].content = `**Error:** ${msg}`
  } finally {
    loading.value = false
    toolActivity.value = ''
    streamingIdx.value = -1
    await scrollToBottom()
  }
}

async function pollCurrentInteraction() {
  const startedAt = Date.now()
  let consecutiveStatusFailures = 0
  while (Date.now() - startedAt < 62 * 60 * 1000) {
    await new Promise(resolve => setTimeout(resolve, 2500))
    let result: {
      status: string
      stage: string
      reply: string | null
      error: string | null
      previewDeploymentStarted: boolean
      productionDeploymentStarted: boolean
      timingReport?: TimingReport | null
      runMode?: StorefrontRunMode
      planState?: PlanState | null
      interactionId?: string
      beforeSha?: string | null
      afterSha?: string | null
      codeChanged?: boolean
      canUndo?: boolean
      piLeafId?: string | null
    }
    try {
      result = await $fetch<typeof result>('/api/ecommerce-cms/storefront-agent/status', {
        query: { conversationId: conversationId.value },
      })
      consecutiveStatusFailures = 0
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status || error?.response?.status || error?.data?.statusCode)
      const rolloutOrTransientFailure = statusCode === 404 || statusCode === 429 || statusCode >= 500
      if (rolloutOrTransientFailure && consecutiveStatusFailures < 5) {
        consecutiveStatusFailures += 1
        toolActivity.value = 'Reconnecting to storefront agent...'
        continue
      }
      throw error
    }
    if (stopRequested.value) return
    showStage(result.stage, result.status)
    if (result.timingReport) timingReport.value = result.timingReport
    if (result.planState !== undefined) planState.value = result.planState?.phase === 'off' ? null : result.planState

    if (result.status === 'completed') {
      Object.assign(messages.value[streamingIdx.value], {
        content: result.reply || 'The storefront request finished.',
        status: result.status,
        interactionId: result.interactionId,
        beforeSha: result.beforeSha || undefined,
        afterSha: result.afterSha || undefined,
        codeChanged: result.codeChanged === true,
        canUndo: result.canUndo === true,
        piLeafId: result.piLeafId || undefined,
      })
      if (result.previewDeploymentStarted) await new Promise(resolve => setTimeout(resolve, 800))
      if (result.previewDeploymentStarted) emit('previewUpdated')
      return
    }
    if (['incomplete', 'budget_exceeded'].includes(result.status)) {
      messages.value[streamingIdx.value].content = `**Not completed:** ${result.reply || 'The agent stopped before making the requested change.'}`
      if (result.previewDeploymentStarted) emit('previewUpdated')
      return
    }
    if (result.status === 'requires_action') {
      throw new Error('The AI agent paused because it requires additional input or tool approval.')
    }
    if (['failed', 'cancelled', 'canceled'].includes(result.status)) {
      throw new Error(result.error || 'The storefront request failed.')
    }
  }
  throw new Error('The storefront request is still running. You can reopen this session from Recent chats.')
}

async function send(requestedMode?: StorefrontRunMode, actionText?: string) {
  const runMode = requestedMode || (refineRequested.value ? 'refine-plan' : planRequested.value ? 'plan' : undefined)
  const text = actionText || input.value.trim()
  const images = pendingImages.value.length ? [...pendingImages.value] : undefined
  if ((!text && !images) || loading.value) return

  const userMsg: Message = { role: 'user', content: text || '(see attached image)', images }
  messages.value.push(userMsg)
  input.value = ''
  planRequested.value = false
  refineRequested.value = false
  pendingImages.value = []
  loading.value = true
  stopRequested.value = false
  toolActivity.value = 'Starting storefront agent...'
  timingReport.value = null
  startElapsed()
  messages.value.push({ role: 'assistant', content: '' })
  streamingIdx.value = messages.value.length - 1
  await scrollToBottom()

  try {
    const started = await $fetch<{
      status: string
      stage: string
      timingReport?: TimingReport | null
      uploaded?: { url: string; mimeType: string; name?: string }[]
    }>('/api/ecommerce-cms/storefront-agent/chat', {
      method: 'POST',
      body: {
        conversationId: conversationId.value,
        prompt: `Current editor page: ${props.pageSlug}\n\n${elementContext.value}\n${userMsg.content}`,
        displayPrompt: userMsg.content,
        model: selectedModel.value || undefined,
        runMode,
        images: images?.map(image => ({ mimeType: image.mimeType, data: image.data, name: image.name })),
      },
    })
    if (started.uploaded?.length) {
      userMsg.images = started.uploaded
      images?.forEach(image => URL.revokeObjectURL(image.url))
    }
    showStage(started.stage, started.status)
    if (started.timingReport) timingReport.value = started.timingReport
    await pollCurrentInteraction()
  } catch (err: any) {
    const message = err?.data?.statusMessage || err?.data?.message || err?.message || 'Something went wrong.'
    messages.value[streamingIdx.value].content = `**Error:** ${message}`
  } finally {
    loading.value = false
    toolActivity.value = ''
    streamingIdx.value = -1
    stopElapsed()
    loadSessions()
    await scrollToBottom()
  }
}

async function stopTask() {
  if (!loading.value || stopRequested.value) return
  stopRequested.value = true
  toolActivity.value = stageLabels.stopping
  try {
    const stopped = await $fetch<{ reply: string; interactionId?: string }>(
      '/api/ecommerce-cms/storefront-agent/stop',
      { method: 'POST', body: { conversationId: conversationId.value } },
    )
    const index = streamingIdx.value
    if (index >= 0) {
      Object.assign(messages.value[index], {
        content: stopped.reply || 'Task stopped and its changes were discarded.',
        status: 'cancelled',
        interactionId: stopped.interactionId,
        codeChanged: false,
        canUndo: false,
      })
    }
  } catch (err: any) {
    stopRequested.value = false
    useToast().add({
      title: 'Could not stop task',
      description: publicAgentText(err?.data?.statusMessage || err?.data?.message || err?.message || 'Please try again.'),
      color: 'red',
    })
    return
  }
  loading.value = false
  toolActivity.value = ''
  streamingIdx.value = -1
  stopElapsed()
  loadSessions()
  await scrollToBottom()
}

async function undoTask(message: Message) {
  if (!message.interactionId || !message.canUndo || loading.value || undoingId.value) return
  undoingId.value = message.interactionId
  try {
    const result = await $fetch<{ previewDeploymentStarted?: boolean }>(
      '/api/ecommerce-cms/storefront-agent/undo',
      { method: 'POST', body: { conversationId: conversationId.value, interactionId: message.interactionId } },
    )
    message.canUndo = false
    message.undone = true
    if (result.previewDeploymentStarted) emit('previewUpdated')
    useToast().add({ title: 'Task undone', description: 'The inverse change was pushed to the preview branch.' })
  } catch (err: any) {
    useToast().add({
      title: 'Undo could not be applied',
      description: publicAgentText(err?.data?.statusMessage || err?.data?.message || err?.message || 'The newer code conflicts with this task.'),
      color: 'red',
    })
  } finally {
    undoingId.value = ''
  }
}

async function forkChat(message: Message) {
  if (!message.interactionId || !message.piLeafId || loading.value || forkingId.value) return
  forkingId.value = message.interactionId
  const targetConversationId = crypto.randomUUID()
  try {
    const forked = await $fetch<AgentSessionData>('/api/ecommerce-cms/storefront-agent/fork', {
      method: 'POST',
      body: {
        sourceConversationId: conversationId.value,
        conversationId: targetConversationId,
        interactionId: message.interactionId,
      },
    })
    conversationId.value = forked.conversationId
    messages.value = Array.isArray(forked.messages) ? forked.messages.map(item => ({ ...item })) : []
    timingReport.value = null
    planState.value = forked.planState?.phase === 'off' ? null : forked.planState || null
    useToast().add({ title: 'Forked into a new chat', description: 'The earlier messages and AI context were copied.' })
    loadSessions()
    await scrollToBottom()
  } catch (err: any) {
    useToast().add({
      title: 'Could not fork chat',
      description: publicAgentText(err?.data?.statusMessage || err?.data?.message || err?.message || 'Please try again.'),
      color: 'red',
    })
  } finally {
    forkingId.value = ''
  }
}

function togglePlanMode() {
  if (loading.value) return
  refineRequested.value = false
  planRequested.value = !planRequested.value
}

function refinePlan() {
  if (loading.value) return
  planRequested.value = false
  refineRequested.value = true
}

function executePlan() {
  send('execute-plan', 'Execute the approved plan.')
}

function cancelPlan() {
  send('cancel-plan', 'Cancel the current plan.')
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function newChat() {
  messages.value = []
  input.value = ''
  pendingImages.value.forEach(img => URL.revokeObjectURL(img.url))
  pendingImages.value = []
  timingReport.value = null
  planState.value = null
  planRequested.value = false
  refineRequested.value = false
  conversationId.value = crypto.randomUUID()
  showSessions.value = false
}

async function openSession(item: AgentSessionSummary) {
  if (loading.value) return
  openingSessionId.value = item.conversationId
  let session: AgentSessionData
  try {
    session = await $fetch<AgentSessionData>('/api/ecommerce-cms/storefront-agent/session', {
      query: { conversationId: item.conversationId },
    })
  } catch (err: any) {
    useToast().add({
      title: 'Could not open chat',
      description: publicAgentText(err?.data?.statusMessage || err?.message || 'Session loading failed.'),
      color: 'red',
    })
    return
  } finally {
    openingSessionId.value = ''
  }
  conversationId.value = session.conversationId
  messages.value = Array.isArray(session.messages)
    ? session.messages.map(message => ({ ...message }))
    : []
  timingReport.value = session.timingReport || null
  planState.value = session.planState?.phase === 'off' ? null : session.planState || null
  planRequested.value = false
  refineRequested.value = false
  showSessions.value = false
  if (['queued', 'in_progress'].includes(session.status)) {
    loading.value = true
    messages.value.push({ role: 'assistant', content: '' })
    streamingIdx.value = messages.value.length - 1
    showStage(session.stage, session.status)
    try { await pollCurrentInteraction() }
    catch (err: any) { messages.value[streamingIdx.value].content = `**Error:** ${err?.message || 'Unable to resume session.'}` }
    finally { loading.value = false; toolActivity.value = ''; streamingIdx.value = -1; loadSessions() }
  }
  await scrollToBottom()
}
</script>

<template>
  <Transition name="panel">
    <div v-if="isOpen" class="ai-panel">
        <!-- Header -->
        <div class="ai-header">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-green-500" />
            <span class="text-sm font-semibold text-gray-900 dark:text-white">Storefront AI</span>
          </div>
          <div class="flex items-center gap-1">
            <UButton icon="i-heroicons-clock" size="xs" variant="ghost" color="gray" title="Recent chats" @click="showSessions = true; loadSessions()" />
            <UButton icon="i-heroicons-brain" size="xs" variant="ghost" color="gray" title="Edit memory" @click="openMemory" />
            <UButton icon="i-heroicons-plus" size="xs" variant="ghost" color="gray" title="New chat" @click="newChat" />
            <UButton icon="i-heroicons-x-mark" size="xs" variant="ghost" color="gray" title="Close" @click="close" />
          </div>
        </div>

        <!-- Messages -->
        <div ref="scrollRef" class="ai-messages">
          <div v-if="!messages.length" class="ai-empty">
            <div class="text-3xl mb-2">✨</div>
            <p class="text-sm text-gray-500 dark:text-gray-400 text-center">Ask AI to design or edit this page.</p>
            <p class="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">Paste a screenshot to recreate a design.</p>
          </div>

          <template v-for="(msg, i) in messages" :key="i">
            <AiChatMessage :role="msg.role" :content="publicAgentText(msg.content)" />
            <div v-if="msg.images?.length && msg.role === 'user'" class="flex justify-end gap-1 px-9 -mt-2">
              <a v-for="(img, j) in msg.images" :key="j" :href="img.url" target="_blank" rel="noopener noreferrer">
                <img :src="img.url" :alt="img.name || 'Storefront chat image'" class="h-20 max-w-48 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
              </a>
            </div>
            <div v-if="msg.role === 'assistant' && msg.interactionId && msg.content" class="reply-actions">
              <button
                v-if="msg.canUndo"
                type="button"
                class="reply-action"
                :disabled="loading || !!undoingId"
                title="Create an inverse Git commit for this task"
                @click="undoTask(msg)"
              >
                <UIcon name="i-heroicons-arrow-uturn-left" />
                <span>{{ undoingId === msg.interactionId ? 'Undoing...' : 'Undo' }}</span>
              </button>
              <span v-else-if="msg.undone" class="reply-action reply-action--done">
                <UIcon name="i-heroicons-check" /> Undone
              </span>
              <button
                v-if="msg.piLeafId"
                type="button"
                class="reply-action"
                :disabled="loading || !!forkingId"
                title="Start a new chat from this reply"
                @click="forkChat(msg)"
              >
                <UIcon name="i-heroicons-arrow-path-rounded-square" />
                <span>{{ forkingId === msg.interactionId ? 'Forking...' : 'Fork chat' }}</span>
              </button>
            </div>
          </template>

          <!-- Tool activity strip (shown while streaming) -->
          <div v-if="toolActivity" class="tool-activity">
            <span class="tool-dot" />
            <span class="tool-label">{{ publicAgentText(toolActivity) }}</span>
            <span v-if="elapsedLabel" class="tool-elapsed">{{ elapsedLabel }}</span>
          </div>

          <details v-if="timingReport" class="timing-report" open>
            <summary class="timing-summary">
              <span>Time report</span>
              <span class="timing-total">{{ timingTotal }}</span>
            </summary>
            <div class="timing-list">
              <div v-for="event in timingEvents" :key="event.key" class="timing-row">
                <span class="timing-status" :class="`timing-status--${event.status}`" />
                <span class="timing-copy">
                  <span class="timing-label">{{ event.label }}</span>
                  <span v-if="event.detail" class="timing-detail">{{ event.detail }}</span>
                </span>
                <span class="timing-duration">{{ event.displayDuration }}</span>
              </div>
            </div>
          </details>

          <section v-if="activePlan" class="plan-card">
            <div class="plan-card__header">
              <div>
                <span class="plan-card__title">{{ activePlan.phase === 'executing' ? 'Executing plan' : activePlan.phase === 'ready' ? 'Plan ready' : 'Preparing plan' }}</span>
                <span v-if="activePlan.automatic" class="plan-card__badge">Automatic</span>
              </div>
              <span v-if="activePlan.total" class="plan-card__progress">{{ activePlan.completed }}/{{ activePlan.total }}</span>
            </div>
            <ol v-if="activePlan.steps.length" class="plan-steps">
              <li v-for="step in activePlan.steps" :key="step.step" :class="{ 'plan-step--done': step.completed }">
                <span class="plan-step__number">{{ step.step }}</span>
                <span>{{ step.text }}</span>
              </li>
            </ol>
            <p v-else class="plan-card__hint">The AI agent is inspecting the storefront. No files can be changed in this mode.</p>
            <div class="plan-card__actions">
              <UButton v-if="activePlan.phase === 'ready'" size="xs" icon="i-heroicons-play" @click="executePlan">Execute</UButton>
              <UButton v-if="activePlan.phase === 'ready'" size="xs" color="gray" variant="soft" icon="i-heroicons-pencil-square" @click="refinePlan">Refine</UButton>
              <UButton v-if="activePlan.phase !== 'executing'" size="xs" color="gray" variant="ghost" @click="cancelPlan">Cancel</UButton>
            </div>
          </section>
        </div>

        <!-- Pending images -->
        <div v-if="pendingImages.length" class="flex gap-2 px-2 py-2 border-t border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0">
          <div v-for="(img, j) in pendingImages" :key="j" class="relative shrink-0">
            <img :src="img.url" class="w-16 h-16 rounded-lg object-cover" />
            <button class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs leading-none" @click="removePendingImage(j)">✕</button>
          </div>
        </div>

        <!-- Selected element context -->
        <div v-if="selectedElement" class="sel-chip">
          <UIcon name="i-heroicons-cursor-arrow-rays" class="sel-chip-icon" />
          <span class="sel-chip-label">{{ selectedElement.label }}</span>
          <span v-if="selectedElement.text" class="sel-chip-text">{{ selectedElement.text }}</span>
          <button
            class="sel-chip-clear"
            title="Clear selection — the next message will not be scoped to this element"
            @click="emit('clearSelection')"
          >✕</button>
        </div>

        <!-- Model picker. Hidden entirely when the list can't be loaded, so a
             sandbox hiccup never blocks sending a message. -->
        <div v-if="models.length" class="model-row">
          <UIcon name="i-heroicons-cpu-chip" class="model-icon" />
          <select v-model="selectedModel" :disabled="loading" class="model-select" title="Which AI makes the change">
            <option v-for="m in models" :key="m.key" :value="m.key">{{ m.label }}{{ m.supportsImages ? ' · Vision' : '' }} - {{ m.note }}</option>
          </select>
        </div>

        <!-- Input -->
        <div class="composer">
          <div class="ai-input-area">
            <input ref="fileInputRef" type="file" multiple accept="image/*" class="hidden" @change="onFileSelected" />
            <UButton icon="i-heroicons-photo" color="gray" variant="ghost" size="sm" :disabled="loading" title="Attach screenshot" @click="openFilePicker" />
            <UTextarea
              v-model="input"
              :placeholder="inputPlaceholder"
              :rows="1"
              autoresize
              :maxrows="5"
              class="flex-1 text-sm"
              :disabled="loading"
              @keydown="handleKey"
              @paste.native="handlePaste"
            />
            <UButton
              v-if="loading"
              icon="i-heroicons-stop"
              color="red"
              variant="soft"
              size="sm"
              :loading="stopRequested"
              title="Stop task and discard this task's changes"
              @click="stopTask"
            />
            <UButton v-else icon="i-heroicons-paper-airplane" color="primary" size="sm" :disabled="!input.trim() && !pendingImages.length" @click="send()" />
          </div>
          <div class="composer-options">
            <button
              type="button"
              class="plan-toggle"
              :class="{ 'plan-toggle--active': planRequested || refineRequested }"
              :disabled="loading"
              title="Plan with read-only tools before editing"
              @click="togglePlanMode"
            >
              <UIcon name="i-heroicons-clipboard-document-list" />
              <span>{{ refineRequested ? 'Refining plan' : planRequested ? 'Plan mode on' : 'Plan' }}</span>
            </button>
            <span v-if="planRequested || refineRequested" class="composer-options__hint">Read-only until you approve</span>
          </div>
        </div>
      </div>
  </Transition>

  <!-- Memory modal -->
  <UModal v-model="showMemory">
    <UCard>
      <template #header><h3 class="font-semibold">Storefront Memory</h3></template>
      <p class="text-xs text-gray-400 mb-3">Injected into every AI prompt so it knows your brand, theme, and goals.</p>
      <textarea v-model="memoryText" class="w-full h-96 font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-100 outline-none resize-y" spellcheck="false" />
      <template #footer>
        <div class="flex gap-2 justify-end">
          <UButton variant="ghost" @click="showMemory = false">Cancel</UButton>
          <UButton :loading="isSavingMemory" @click="saveMemory">Save memory</UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <UModal v-model="showSessions">
    <UCard>
      <template #header><h3 class="font-semibold">Recent storefront chats</h3></template>
      <div v-if="loadingSessions" class="text-sm text-gray-500 py-6 text-center">Loading sessions...</div>
      <div v-else-if="!sessions.length" class="text-sm text-gray-500 py-6 text-center">No previous chats yet.</div>
      <div v-else class="session-list">
        <button v-for="session in sessions" :key="session.conversationId" class="session-row" :disabled="!!openingSessionId" @click="openSession(session)">
          <span class="session-title">{{ session.title }}</span>
          <span class="session-meta">
            {{ publicAgentText(stageLabels[session.stage] || stageLabels[session.status] || session.status) }}
            · {{ session.messageCount }} messages
            <template v-if="openingSessionId === session.conversationId"> · Opening...</template>
          </span>
        </button>
      </div>
    </UCard>
  </UModal>
</template>

<style scoped>
.ai-panel {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--ui-bg, #fff);
  border-left: 1px solid var(--ui-border, #e5e7eb);
  overflow: hidden;
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ui-border, #e5e7eb);
  flex-shrink: 0;
}

.reply-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: -6px 36px 8px;
}

.reply-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 6px;
  color: var(--ui-text-muted, #6b7280);
  font-size: 11px;
}

.reply-action:hover:not(:disabled) { background: var(--ui-bg-elevated, #f3f4f6); color: var(--ui-text, #111827); }
.reply-action:disabled { opacity: .5; cursor: not-allowed; }
.reply-action--done { color: #16a34a; }

.ai-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 8px;
}

.ai-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Model picker. Deliberately quieter than the selection chip - the chip is
   about what you're changing, this is a setting you rarely touch. */
.model-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin: 0 10px 6px;
}
.model-icon {
  width: 13px;
  height: 13px;
  color: var(--ui-text-muted, #9ca3af);
  flex-shrink: 0;
}
.model-select {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  font-size: 11px;
  color: var(--ui-text-muted, #6b7280);
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  outline: none;
  cursor: pointer;
}
.model-select:disabled { opacity: 0.5; cursor: default; }
.dark .model-select {
  border-color: rgba(255, 255, 255, 0.12);
  color: #9ca3af;
}
.dark .model-select option { background: #1f2937; color: #e5e7eb; }

.sel-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin: 0 10px 6px;
  padding: 5px 9px;
  border: 1px solid rgba(249, 115, 22, 0.35);
  background: rgba(249, 115, 22, 0.09);
  border-radius: 8px;
  font-size: 11px;
  min-width: 0;
}
.sel-chip-icon { width: 13px; height: 13px; color: #f97316; flex-shrink: 0; }
.sel-chip-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 700;
  color: #c2410c;
  flex-shrink: 0;
}
.dark .sel-chip-label { color: #fdba74; }
.sel-chip-text {
  color: var(--ui-text-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sel-chip-clear {
  margin-left: auto;
  flex-shrink: 0;
  padding: 0 2px;
  line-height: 1;
  color: #c2410c;
  opacity: 0.6;
}
.sel-chip-clear:hover { opacity: 1; }
.dark .sel-chip-clear { color: #fdba74; }

.composer {
  border-top: 1px solid var(--ui-border, #e5e7eb);
  flex-shrink: 0;
  padding: 8px 10px 7px;
}

.ai-input-area {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.composer-options {
  min-height: 25px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 3px 0 39px;
}

.plan-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 6px;
  color: var(--ui-text-muted, #6b7280);
  font-size: 11px;
  line-height: 1.2;
}
.plan-toggle svg { width: 13px; height: 13px; }
.plan-toggle:hover:not(:disabled) { background: rgba(107, 114, 128, 0.1); }
.plan-toggle:disabled { opacity: 0.45; }
.plan-toggle--active { background: rgba(249, 115, 22, 0.12); color: #c2410c; }
.dark .plan-toggle--active { color: #fdba74; }
.composer-options__hint { font-size: 10px; color: var(--ui-text-muted, #9ca3af); }

.plan-card {
  margin: 0 4px;
  padding: 10px;
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 10px;
  background: rgba(249, 115, 22, 0.06);
}
.plan-card__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.plan-card__title { font-size: 12px; font-weight: 700; color: var(--ui-text, #374151); }
.plan-card__badge {
  margin-left: 6px;
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(249, 115, 22, 0.16);
  color: #c2410c;
  font-size: 9px;
  text-transform: uppercase;
}
.plan-card__progress { font-size: 10px; color: var(--ui-text-muted, #6b7280); }
.plan-card__hint { margin-top: 7px; font-size: 11px; color: var(--ui-text-muted, #6b7280); }
.plan-steps { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.plan-steps li { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; color: var(--ui-text, #374151); }
.plan-step__number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 17px;
  height: 17px;
  border-radius: 50%;
  background: rgba(249, 115, 22, 0.14);
  color: #c2410c;
  font-size: 9px;
  font-weight: 700;
}
.plan-step--done { opacity: 0.58; text-decoration: line-through; }
.plan-card__actions { display: flex; align-items: center; gap: 6px; margin-top: 9px; }
.dark .plan-card__title, .dark .plan-steps li { color: #e5e7eb; }

.tool-activity {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  margin: 0 4px;
  background: var(--ui-bg-elevated, #f3f4f6);
  border-radius: 8px;
  font-size: 11px;
  color: var(--ui-text-muted, #6b7280);
  flex-shrink: 0;
}
.dark .tool-activity { background: #1f2937; color: #9ca3af; }
.tool-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #3b82f6;
  animation: pulse 1s ease-in-out infinite;
  flex-shrink: 0;
}
.tool-label { font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-elapsed {
  margin-left: auto; flex-shrink: 0; padding-left: 8px;
  font-family: ui-monospace, monospace; font-variant-numeric: tabular-nums;
  opacity: 0.55;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.timing-report {
  margin: 0 4px;
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 8px;
  background: var(--ui-bg, #fff);
  font-size: 11px;
}
.timing-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  cursor: pointer;
  font-weight: 600;
  color: var(--ui-text-muted, #6b7280);
}
.timing-total, .timing-duration {
  font-family: ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
.timing-list { border-top: 1px solid var(--ui-border, #e5e7eb); padding: 4px 0; }
.timing-row { display: flex; align-items: flex-start; gap: 7px; padding: 5px 9px; }
.timing-status { width: 7px; height: 7px; margin-top: 3px; border-radius: 50%; flex: 0 0 auto; background: #22c55e; }
.timing-status--running { background: #3b82f6; animation: pulse 1s ease-in-out infinite; }
.timing-status--error { background: #ef4444; }
.timing-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.timing-label { color: var(--ui-text, #374151); }
.timing-detail { color: var(--ui-text-muted, #9ca3af); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.timing-duration { color: var(--ui-text-muted, #6b7280); flex: 0 0 auto; }
.dark .timing-report { background: #111827; border-color: #374151; }
.dark .timing-label { color: #d1d5db; }

.session-list { display: flex; flex-direction: column; gap: 6px; }
.session-row {
  display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 10px 12px;
  text-align: left; border: 1px solid var(--ui-border, #e5e7eb); border-radius: 8px;
  background: var(--ui-bg, #fff); cursor: pointer;
}
.session-row:hover { background: var(--ui-bg-elevated, #f8fafc); }
.session-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-meta { font-size: 11px; color: var(--ui-text-muted, #6b7280); }

/* Slide in — animate width so the iframe shrinks smoothly */
.panel-enter-active,
.panel-leave-active {
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.18s ease;
  overflow: hidden;
}
.panel-enter-from,
.panel-leave-to {
  width: 0 !important;
  opacity: 0;
}
</style>
