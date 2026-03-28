<script setup lang="ts">
defineProps<{
  role: 'user' | 'assistant'
  content: string
}>()
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
        'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
        role === 'user'
          ? 'bg-primary-500 text-white rounded-tr-none'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-none',
      ]"
    >
      {{ content }}
    </div>
  </div>
</template>
