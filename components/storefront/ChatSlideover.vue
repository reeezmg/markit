<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: { url: string; mimeType: string; data: string }[]
}

const props = defineProps<{
  modelValue?: boolean
  pageSlug: string
  pageConfig: { sections: Record<string, any>; order: string[] } | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  updateConfig: [config: any]
}>()

const isOpen = computed({
  get: () => props.modelValue ?? false,
  set: (val) => emit('update:modelValue', val),
})

function close() { isOpen.value = false }

// Edit-session container (Cloud Run) — prompts go to its agent CLI, which
// streams back small status updates and pushes code changes to GitHub.
const editorUrl = (useRuntimeConfig().public.storefrontEditorUrl as string || '').replace(/\/$/, '')

// ─── State ────────────────────────────────────────────────────────────────────

const input = ref('')
const loading = ref(false)
const messages = ref<Message[]>([])
const scrollRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingImages = ref<{ url: string; mimeType: string; data: string }[]>([])
const toolActivity = ref('')   // e.g. "Reading hero-banner source..."
const streamingIdx = ref(-1)   // index of the currently-streaming assistant message

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

onMounted(loadMemory)

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
  const data = await blobToBase64(file)
  const url = URL.createObjectURL(file)
  pendingImages.value.push({ url, mimeType: file.type, data })
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

// ─── Send ─────────────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

async function send() {
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

          <AiChatMessage
            v-for="(msg, i) in messages"
            :key="i"
            :role="msg.role"
            :content="msg.content"
          />

          <!-- Image previews sent by user -->
          <template v-for="(msg, i) in messages" :key="`img-${i}`">
            <div v-if="msg.images?.length && msg.role === 'user'" class="flex justify-end gap-1 px-1 -mt-1">
              <img v-for="(img, j) in msg.images" :key="j" :src="img.url" class="h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
            </div>
          </template>

          <!-- Tool activity strip (shown while streaming) -->
          <div v-if="toolActivity" class="tool-activity">
            <span class="tool-dot" />
            <span class="tool-label">{{ toolActivity }}</span>
          </div>
        </div>

        <!-- Pending images -->
        <div v-if="pendingImages.length" class="flex gap-2 px-2 py-2 border-t border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0">
          <div v-for="(img, j) in pendingImages" :key="j" class="relative shrink-0">
            <img :src="img.url" class="w-16 h-16 rounded-lg object-cover" />
            <button class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs leading-none" @click="removePendingImage(j)">✕</button>
          </div>
        </div>

        <!-- Input -->
        <div class="ai-input-area">
          <input ref="fileInputRef" type="file" multiple accept="image/*" class="hidden" @change="onFileSelected" />
          <UButton icon="i-heroicons-photo" color="gray" variant="ghost" size="sm" :disabled="loading" title="Attach screenshot" @click="openFilePicker" />
          <UTextarea
            v-model="input"
            placeholder="Ask AI or paste a screenshot…"
            :rows="1"
            autoresize
            :maxrows="5"
            class="flex-1 text-sm"
            :disabled="loading"
            @keydown="handleKey"
            @paste.native="handlePaste"
          />
          <UButton icon="i-heroicons-paper-airplane" color="primary" size="sm" :disabled="(!input.trim() && !pendingImages.length) || loading" @click="send" />
        </div>
      </div>
  </Transition>

  <!-- Memory modal -->
  <UModal v-model="showMemory" title="Storefront Memory" size="lg">
    <template #body>
      <p class="text-xs text-gray-400 mb-3">Injected into every AI prompt so it knows your brand, theme, and goals.</p>
      <textarea v-model="memoryText" class="w-full h-96 font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-100 outline-none resize-y" spellcheck="false" />
    </template>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <UButton variant="ghost" @click="showMemory = false">Cancel</UButton>
        <UButton :loading="isSavingMemory" @click="saveMemory">Save memory</UButton>
      </div>
    </template>
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

.ai-input-area {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  padding: 10px 10px 12px;
  border-top: 1px solid var(--ui-border, #e5e7eb);
  flex-shrink: 0;
}

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
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

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
