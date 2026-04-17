<script setup lang="ts">
import { computed, ref } from 'vue'
import { marked } from 'marked'

interface Attachment {
  type: 'voice' | 'image' | 'file'
  name?: string
  size?: number
  duration?: number
  url?: string
  mimeType: string
}

const props = defineProps<{
  role: 'user' | 'assistant'
  content: string
  attachments?: Attachment[]
}>()

marked.setOptions({
  breaks: true,
  gfm: true,
})

const renderedHtml = computed(() => {
  if (props.role === 'user') return ''
  return marked.parse(props.content) as string
})

const visibleContent = computed(() => {
  if (props.content === '[Voice message]' || props.content === '[Image]' || props.content === '[File]') return ''
  return props.content
})

// Voice playback
const playingIndex = ref<number | null>(null)
const audioProgress = ref(0)
let currentAudio: HTMLAudioElement | null = null

function togglePlay(att: Attachment, index: number) {
  if (!att.url) return

  if (playingIndex.value === index) {
    currentAudio?.pause()
    currentAudio = null
    playingIndex.value = null
    audioProgress.value = 0
    return
  }

  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  const audio = new Audio(att.url)
  currentAudio = audio
  playingIndex.value = index
  audioProgress.value = 0

  audio.ontimeupdate = () => {
    if (audio.duration) {
      audioProgress.value = (audio.currentTime / audio.duration) * 100
    }
  }
  audio.onended = () => {
    playingIndex.value = null
    audioProgress.value = 0
    currentAudio = null
  }
  audio.play()
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div :class="['flex gap-2 items-start', role === 'user' ? 'flex-row-reverse' : 'flex-row']">
    <div
      :class="[
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
        role === 'user'
          ? 'bg-primary-500 text-white'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
      ]"
    >
      {{ role === 'user' ? 'U' : 'AI' }}
    </div>
    <div
      :class="[
        'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
        role === 'user'
          ? 'bg-primary-500 text-white rounded-tr-none'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-none prose prose-sm dark:prose-invert max-w-none',
      ]"
    >
      <!-- Attachments -->
      <div v-if="attachments?.length" class="flex flex-col gap-1.5 mb-1">
        <template v-for="(att, j) in attachments" :key="j">
          <!-- Voice -->
          <div
            v-if="att.type === 'voice'"
            class="flex items-center gap-2 py-1 cursor-pointer"
            @click="togglePlay(att, j)"
          >
            <UIcon
              :name="playingIndex === j ? 'i-heroicons-pause-circle' : 'i-heroicons-play-circle'"
              class="text-lg shrink-0"
            />
            <div class="flex-1 h-1.5 rounded-full overflow-hidden" :class="role === 'user' ? 'bg-primary-400' : 'bg-gray-300 dark:bg-gray-600'">
              <div
                v-if="playingIndex === j"
                class="h-full rounded-full transition-all duration-200"
                :class="role === 'user' ? 'bg-white' : 'bg-primary-500'"
                :style="{ width: `${audioProgress}%` }"
              />
              <div v-else class="flex gap-px h-full items-end">
                <div
                  v-for="n in 20"
                  :key="n"
                  class="flex-1 rounded-full"
                  :class="role === 'user' ? 'bg-white/60' : 'bg-gray-400 dark:bg-gray-500'"
                  :style="{ height: `${30 + Math.random() * 70}%` }"
                />
              </div>
            </div>
            <span class="text-xs opacity-75 shrink-0">{{ att.duration ? formatDuration(att.duration) : '0:00' }}</span>
          </div>

          <!-- Image -->
          <div v-else-if="att.type === 'image' && att.url" class="mt-0.5">
            <img
              :src="att.url"
              :alt="att.name || 'Image'"
              class="max-w-full max-h-48 rounded-lg object-cover cursor-pointer"
              @click="window.open(att.url, '_blank')"
            />
          </div>

          <!-- File -->
          <div
            v-else-if="att.type === 'file'"
            class="flex items-center gap-2 py-1.5 px-2 rounded-lg"
            :class="role === 'user' ? 'bg-primary-400/30' : 'bg-gray-200 dark:bg-gray-700'"
          >
            <UIcon name="i-heroicons-document" class="text-lg shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate">{{ att.name || 'File' }}</p>
              <p class="text-xs opacity-60">{{ att.size ? formatSize(att.size) : '' }}</p>
            </div>
          </div>
        </template>
      </div>

      <!-- Text content -->
      <template v-if="role === 'user' && visibleContent">
        <span class="whitespace-pre-wrap">{{ visibleContent }}</span>
      </template>
      <div v-else-if="role === 'assistant'" v-html="renderedHtml" />
    </div>
  </div>
</template>
