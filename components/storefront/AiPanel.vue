<script setup lang="ts">
const props = defineProps<{
  pageSlug: string
  pageConfig: { sections: Record<string, any>; order: string[] } | null
}>()

const emit = defineEmits<{
  applyPatch: [patch: any]
}>()

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const messages = ref<Message[]>([])
const input = ref('')
const isLoading = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const memory = ref<Record<string, any>>({})
const showMemory = ref(false)
const isSavingMemory = ref(false)
const memoryText = ref('')

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
    try {
      parsed = JSON.parse(memoryText.value)
    } catch {
      useToast().add({ title: 'Invalid JSON in memory', color: 'red' })
      return
    }
    await $fetch('/api/ecommerce-cms/storefront-memory', {
      method: 'PUT',
      body: { content: parsed },
    })
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

// ─── Chat ─────────────────────────────────────────────────────────────────────

function parsePatch(text: string): any | null {
  const match = text.match(/\/\/\s*@@CONFIG_PATCH\s*\n(\{[\s\S]*?\})/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function parseMemoryUpdate(text: string): Record<string, any> | null {
  const match = text.match(/\/\/\s*@@MEMORY_UPDATE\s*\n(\{[\s\S]*?\})/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
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

function stripBlocks(text: string): string {
  return text
    .replace(/\/\/\s*@@CONFIG_PATCH\s*\n\{[\s\S]*?\}/g, '')
    .replace(/\/\/\s*@@MEMORY_UPDATE\s*\n\{[\s\S]*?\}/g, '')
    .trim()
}

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || isLoading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  isLoading.value = true
  await scrollToBottom()

  try {
    const payload = {
      messages: messages.value.slice(0, -1).concat({ role: 'user', content: text }),
      pageSlug: props.pageSlug,
      pageConfig: props.pageConfig,
      storefrontMemory: memory.value,
    }
    console.log('[StorefrontAI] sending →', JSON.stringify(payload, null, 2))
    const res = await $fetch<{ reply: string }>('/api/ecommerce-cms/storefront-chat', {
      method: 'POST',
      body: payload,
    })

    const reply = res.reply ?? ''
    const patch = parsePatch(reply)
    const memoryUpdate = parseMemoryUpdate(reply)

    if (patch) emit('applyPatch', patch)
    if (memoryUpdate) applyMemoryUpdate(memoryUpdate)

    messages.value.push({ role: 'assistant', content: stripBlocks(reply) })
  } catch (err: any) {
    const msg = err?.data?.message || err?.data?.statusMessage || err?.message || 'Something went wrong. Please try again.'
    messages.value.push({ role: 'assistant', content: `**Error:** ${msg}` })
  } finally {
    isLoading.value = false
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
}
</script>

<template>
  <div class="flex flex-col h-full bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-green-500" />
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">Storefront AI</span>
      </div>
      <div class="flex items-center gap-1">
        <UButton
          icon="i-heroicons-brain"
          size="xs"
          variant="ghost"
          color="gray"
          title="Edit storefront memory"
          @click="openMemory"
        />
        <UButton
          icon="i-heroicons-plus"
          size="xs"
          variant="ghost"
          color="gray"
          title="New chat"
          @click="newChat"
        />
      </div>
    </div>

    <!-- Messages -->
    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-3 py-3">
      <div
        v-if="!messages.length"
        class="flex flex-col items-center justify-center h-full gap-2 text-center px-4"
      >
        <div class="text-3xl">✨</div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Ask AI to design or edit this page.
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Try: "Make the hero heading say Welcome" or<br>
          "Add a FAQ section at the bottom"
        </p>
      </div>

      <AiChatMessage
        v-for="(msg, i) in messages"
        :key="i"
        :role="msg.role"
        :content="msg.content"
      />

      <div v-if="isLoading" class="flex gap-2 items-center">
        <div class="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0 text-gray-600 dark:text-gray-300">
          AI
        </div>
        <div class="bg-gray-100 dark:bg-gray-800 rounded-xl rounded-tl-none px-3 py-2 flex gap-1 items-center">
          <span
            v-for="n in 3"
            :key="n"
            class="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"
            :style="{ animationDelay: `${(n - 1) * 0.15}s` }"
          />
        </div>
      </div>
    </div>

    <!-- Input -->
    <div class="flex gap-2 items-end px-3 pt-2 pb-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
      <UTextarea
        v-model="input"
        placeholder="Ask AI to edit this page…"
        :rows="1"
        autoresize
        :maxrows="4"
        class="flex-1 text-sm"
        :disabled="isLoading"
        @keydown="handleKey"
      />
      <UButton
        icon="i-heroicons-paper-airplane"
        color="primary"
        :disabled="!input.trim() || isLoading"
        @click="send"
      />
    </div>
  </div>

  <!-- Memory modal -->
  <UModal v-model="showMemory" title="Storefront Memory" size="lg">
    <template #body>
      <p class="text-xs text-gray-400 mb-3">
        This memory is injected into every AI prompt so it knows your brand, theme, and goals.
        Edit as JSON or let the AI update it via chat.
      </p>
      <textarea
        v-model="memoryText"
        class="w-full h-96 font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-800 dark:text-gray-100 outline-none resize-y focus:border-primary-500 box-sizing-border"
        spellcheck="false"
      />
    </template>
    <template #footer>
      <div class="flex gap-2 justify-end">
        <UButton variant="ghost" @click="showMemory = false">Cancel</UButton>
        <UButton :loading="isSavingMemory" @click="saveMemory">Save memory</UButton>
      </div>
    </template>
  </UModal>
</template>
