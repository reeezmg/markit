<script setup lang="ts">
import { ref, nextTick, watch, onUnmounted } from 'vue'

interface ToolCallRecord {
  tool: string
  args: Record<string, unknown>
  result: unknown
}

interface Attachment {
  type: 'voice' | 'image' | 'file'
  name?: string
  size?: number
  duration?: number
  url?: string
  mimeType: string
  base64?: string // only used for sending, not stored
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallRecord[]
  attachments?: Attachment[]
}

interface ChatListItem {
  id: string
  title: string
  updatedAt: string
}

const { isChatSlideoverOpen } = useDashboard()
const input = ref('')
const loading = ref(false)
const messages = ref<Message[]>([])
const scrollRef = ref<HTMLElement | null>(null)

// Chat persistence state
const chatId = ref<string | null>(null)
const chatList = ref<ChatListItem[]>([])
const showChatList = ref(false)
const loadingChats = ref(false)

// Voice recording state
const recording = ref(false)
const recordingStart = ref(0)
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []

// File/image attachment state
const pendingAttachments = ref<Attachment[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// Load chat list when slideover opens
watch(isChatSlideoverOpen, async (open) => {
  if (open) await fetchChatList()
})

async function fetchChatList() {
  loadingChats.value = true
  try {
    const res = await $fetch<{ chats: ChatListItem[] }>('/api/ai/chats')
    chatList.value = res.chats
  } catch { /* silent */ }
  finally { loadingChats.value = false }
}

async function openChat(id: string) {
  try {
    const res = await $fetch<{ chat: ChatListItem & { aiMessages: { role: string; content: string; toolCalls: unknown; attachments?: unknown }[] } }>(`/api/ai/chats/${id}`)
    chatId.value = id
    messages.value = res.chat.aiMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      toolCalls: m.toolCalls as ToolCallRecord[] | undefined,
      attachments: m.attachments as Attachment[] | undefined,
    }))
    showChatList.value = false
    await scrollToBottom()
  } catch { /* silent */ }
}

async function deleteChat(id: string) {
  try {
    await $fetch(`/api/ai/chats/${id}`, { method: 'DELETE' })
    chatList.value = chatList.value.filter((c) => c.id !== id)
    if (chatId.value === id) newChat()
  } catch { /* silent */ }
}

function newChat() {
  chatId.value = null
  messages.value = []
  pendingAttachments.value = []
  showChatList.value = false
}

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
}

// ─── Text send ────────────────────────────────────────────────────────────────

async function send() {
  const text = input.value.trim()
  const attachments = pendingAttachments.value.length ? [...pendingAttachments.value] : undefined

  if ((!text && !attachments) || loading.value) return

  // Build display message
  const displayContent = text || (attachments?.[0]?.type === 'image' ? '[Image]' : '[File]')
  messages.value.push({ role: 'user', content: displayContent, attachments })
  input.value = ''
  pendingAttachments.value = []
  loading.value = true
  await scrollToBottom()

  try {
    // If there are media attachments, use the media endpoint
    if (attachments?.length) {
      const mediaItems = attachments.map((a) => ({
        data: a.base64!,
        mimeType: a.mimeType,
        name: a.name,
      }))

      const res = await $fetch<{ reply: string; toolCalls?: ToolCallRecord[]; chatId?: string; uploaded?: { url: string; type: string; name?: string; mimeType: string }[] }>('/api/ai/media', {
        method: 'POST',
        body: {
          media: mediaItems,
          text: text || undefined,
          history: messages.value.slice(0, -1),
          chatId: chatId.value,
        },
      })
      // Update user message attachments with R2 URLs (replace blob URLs)
      if (res.uploaded?.length) {
        const userMsg = messages.value[messages.value.length - 1]
        if (userMsg.attachments) {
          userMsg.attachments = userMsg.attachments.map((att, i) => ({
            ...att,
            url: res.uploaded![i]?.url ?? att.url,
            base64: undefined, // clear base64 from memory
          }))
        }
      }
      messages.value.push({ role: 'assistant', content: res.reply, toolCalls: res.toolCalls })
      if (res.chatId) chatId.value = res.chatId
    } else {
      // Text-only
      const res = await $fetch<{ reply: string; toolCalls?: ToolCallRecord[]; chatId?: string }>('/api/ai/chat', {
        method: 'POST',
        body: { messages: messages.value, chatId: chatId.value },
      })
      messages.value.push({ role: 'assistant', content: res.reply, toolCalls: res.toolCalls })
      if (res.chatId) chatId.value = res.chatId
    }
  } catch (err: any) {
    const msg = err?.data?.message || err?.data?.statusMessage || err?.message || 'Something went wrong. Please try again.'
    messages.value.push({ role: 'assistant', content: `**Error:** ${msg}` })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

// ─── Voice recording ──────────────────────────────────────────────────────────

let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let speechDetected = false
let silenceCheckInterval: ReturnType<typeof setInterval> | null = null

async function startRecording() {
  if (recording.value || loading.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    speechDetected = false
    mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })

    // Set up silence detection
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    silenceCheckInterval = setInterval(() => {
      if (!analyser) return
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length
      if (avg > 15) speechDetected = true // threshold for speech vs silence
    }, 100)

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      if (silenceCheckInterval) clearInterval(silenceCheckInterval)
      audioContext?.close()
      audioContext = null
      analyser = null

      if (!audioChunks.length) return
      const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
      const duration = Math.round((Date.now() - recordingStart.value) / 1000)
      if (duration < 1 || blob.size < 1000 || !speechDetected) return
      await sendVoice(blob, mediaRecorder?.mimeType || 'audio/webm', duration)
    }

    mediaRecorder.start()
    recording.value = true
    recordingStart.value = Date.now()
  } catch { /* mic denied */ }
}

function stopRecording() {
  if (mediaRecorder && recording.value) {
    mediaRecorder.stop()
    recording.value = false
  }
}

function getSupportedMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return 'audio/webm'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function sendVoice(blob: Blob, mimeType: string, duration: number) {
  const voiceAttachment: Attachment = {
    type: 'voice',
    mimeType: mimeType.split(';')[0],
    duration,
    size: blob.size,
  }

  messages.value.push({ role: 'user', content: '[Voice message]', attachments: [voiceAttachment] })
  loading.value = true
  await scrollToBottom()

  try {
    const audio = await blobToBase64(blob)
    const res = await $fetch<{ reply: string; toolCalls?: ToolCallRecord[]; chatId?: string; uploaded?: { url: string; type: string; mimeType: string }[] }>('/api/ai/media', {
      method: 'POST',
      body: {
        media: [{ data: audio, mimeType: mimeType.split(';')[0] }],
        text: 'Listen to this audio carefully and respond to exactly what the user said. If you cannot understand it, ask them to repeat.',
        history: messages.value.slice(0, -1),
        chatId: chatId.value,
      },
    })
    // Update voice attachment with R2 URL
    if (res.uploaded?.[0]?.url) {
      const userMsg = messages.value[messages.value.length - 1]
      if (userMsg.attachments?.[0]) userMsg.attachments[0].url = res.uploaded[0].url
    }
    messages.value.push({ role: 'assistant', content: res.reply, toolCalls: res.toolCalls })
    if (res.chatId) chatId.value = res.chatId
  } catch (err: any) {
    const msg = err?.data?.message || err?.data?.statusMessage || err?.message || 'Something went wrong. Please try again.'
    messages.value.push({ role: 'assistant', content: `**Error:** ${msg}` })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

// ─── File / Image picker ──────────────────────────────────────────────────────

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileSelected(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return

  for (const file of Array.from(files)) {
    const base64 = await blobToBase64(file)
    const isImage = file.type.startsWith('image/')

    const attachment: Attachment = {
      type: isImage ? 'image' : 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      base64,
      url: isImage ? URL.createObjectURL(file) : undefined,
    }
    pendingAttachments.value.push(attachment)
  }

  // Reset input so same file can be re-selected
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function removePendingAttachment(index: number) {
  const att = pendingAttachments.value[index]
  if (att.url) URL.revokeObjectURL(att.url)
  pendingAttachments.value.splice(index, 1)
}

// Cleanup on unmount
onUnmounted(() => {
  if (mediaRecorder && recording.value) mediaRecorder.stop()
  pendingAttachments.value.forEach((a) => { if (a.url) URL.revokeObjectURL(a.url) })
})

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}
</script>

<template>
  <UDashboardSlideover v-model="isChatSlideoverOpen">
    <template #title>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-green-500" />
          Markit AI
        </div>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-heroicons-clock"
            size="xs"
            variant="ghost"
            color="gray"
            title="Chat history"
            @click="showChatList = !showChatList; if (showChatList) fetchChatList()"
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
    </template>

    <div class="flex flex-col" style="height: calc(100vh - 8rem)">
      <!-- Chat List Panel -->
      <div v-if="showChatList" class="flex-1 min-h-0 overflow-y-auto">
        <div v-if="loadingChats" class="flex items-center justify-center py-8">
          <span class="text-sm text-gray-400">Loading...</span>
        </div>
        <div v-else-if="!chatList.length" class="flex items-center justify-center py-8">
          <span class="text-sm text-gray-400">No chats yet</span>
        </div>
        <div v-else class="flex flex-col">
          <div
            v-for="chat in chatList"
            :key="chat.id"
            class="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 group"
            :class="{ 'bg-primary-50 dark:bg-primary-900/20': chat.id === chatId }"
            @click="openChat(chat.id)"
          >
            <UIcon name="i-heroicons-chat-bubble-left-ellipsis" class="text-gray-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate">{{ chat.title }}</p>
              <p class="text-xs text-gray-400">{{ formatDate(chat.updatedAt) }}</p>
            </div>
            <UButton
              icon="i-heroicons-trash"
              size="2xs"
              variant="ghost"
              color="red"
              class="opacity-0 group-hover:opacity-100"
              @click.stop="deleteChat(chat.id)"
            />
          </div>
        </div>
      </div>

      <!-- Messages -->
      <template v-else>
        <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pb-2">
          <div
            v-if="!messages.length"
            class="flex flex-col items-center justify-center h-full gap-2 text-center px-6"
          >
            <div class="text-3xl">✨</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Ask me about your products, stock, or purchase orders.
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Press <UKbd>C</UKbd> <UKbd>B</UKbd> to toggle this panel
            </p>
          </div>

          <AiChatMessage
            v-for="(msg, i) in messages"
            :key="i"
            :role="msg.role"
            :content="msg.content"
            :attachments="msg.attachments"
          />

          <div v-if="loading" class="flex gap-2 items-center">
            <div class="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0">
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

        <!-- Pending attachments preview -->
        <div v-if="pendingAttachments.length" class="flex gap-2 px-1 py-2 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
          <div
            v-for="(att, j) in pendingAttachments"
            :key="j"
            class="relative shrink-0"
          >
            <!-- Image preview -->
            <img
              v-if="att.type === 'image' && att.url"
              :src="att.url"
              class="w-16 h-16 rounded-lg object-cover"
            />
            <!-- File preview -->
            <div
              v-else
              class="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center"
            >
              <UIcon name="i-heroicons-document" class="text-lg text-gray-400" />
              <span class="text-[10px] text-gray-400 truncate max-w-14 mt-0.5">{{ att.name }}</span>
            </div>
            <!-- Remove button -->
            <button
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
              @click="removePendingAttachment(j)"
            >
              x
            </button>
          </div>
        </div>

        <!-- Input -->
        <div class="flex gap-2 items-end pt-3 border-t border-gray-200 dark:border-gray-700">
          <!-- Hidden file input -->
          <input
            ref="fileInputRef"
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            class="hidden"
            @change="onFileSelected"
          />

          <!-- Attach button -->
          <UButton
            icon="i-heroicons-paper-clip"
            color="gray"
            variant="ghost"
            :disabled="loading || recording"
            title="Attach file or image"
            @click="openFilePicker"
          />

          <UTextarea
            v-model="input"
            placeholder="Ask something..."
            :rows="1"
            autoresize
            :maxrows="4"
            class="flex-1 text-sm"
            :disabled="loading || recording"
            @keydown="handleKey"
          />

          <!-- Mic button: tap to start/stop -->
          <UButton
            :icon="recording ? 'i-heroicons-stop-circle' : 'i-heroicons-microphone'"
            :color="recording ? 'red' : 'gray'"
            variant="solid"
            :disabled="loading"
            :title="recording ? 'Tap to stop' : 'Tap to record'"
            :class="{ 'animate-pulse': recording }"
            @click.prevent="recording ? stopRecording() : startRecording()"
          />

          <UButton
            icon="i-heroicons-paper-airplane"
            color="primary"
            :disabled="(!input.trim() && !pendingAttachments.length) || loading || recording"
            @click="send"
          />
        </div>
      </template>
    </div>
  </UDashboardSlideover>
</template>
