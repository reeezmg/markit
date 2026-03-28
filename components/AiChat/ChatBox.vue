<script setup lang="ts">
import { ref, nextTick } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const { isChatSlideoverOpen } = useDashboard()
const input = ref('')
const loading = ref(false)
const messages = ref<Message[]>([])
const scrollRef = ref<HTMLElement | null>(null)

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return

  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  await scrollToBottom()

  try {
    const res = await $fetch<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: { messages: messages.value },
    })
    messages.value.push({ role: 'assistant', content: res.reply })
  } catch {
    messages.value.push({
      role: 'assistant',
      content: 'Sorry, something went wrong. Please try again.',
    })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <UDashboardSlideover v-model="isChatSlideoverOpen">
    <template #title>
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-green-500" />
        Markit AI
      </div>
    </template>

    <div class="flex flex-col h-full">
      <!-- Messages -->
      <div ref="scrollRef" class="flex-1 overflow-y-auto flex flex-col gap-3 pb-2">
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

        <AiChatChatMessage
          v-for="(msg, i) in messages"
          :key="i"
          :role="msg.role"
          :content="msg.content"
        />

        <div v-if="loading" class="flex gap-2 items-center">
          <div
            class="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold shrink-0"
          >
            AI
          </div>
          <div
            class="bg-gray-100 dark:bg-gray-800 rounded-xl rounded-tl-none px-3 py-2 flex gap-1 items-center"
          >
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
      <div class="flex gap-2 items-end pt-3 border-t border-gray-200 dark:border-gray-700">
        <UTextarea
          v-model="input"
          placeholder="Ask something..."
          :rows="1"
          autoresize
          :maxrows="4"
          class="flex-1 text-sm"
          :disabled="loading"
          @keydown="handleKey"
        />
        <UButton
          icon="i-heroicons-paper-airplane"
          color="primary"
          :disabled="!input.trim() || loading"
          @click="send"
        />
      </div>
    </div>
  </UDashboardSlideover>
</template>
