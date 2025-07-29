<template>
    <div class="rounded-2xl bg-white dark:bg-zinc-900 shadow-md p-4 flex flex-col gap-2">
      <div class="text-sm text-gray-500 dark:text-gray-400">{{ title }}</div>
      <div class="text-2xl font-bold text-gray-800 dark:text-white">
        <slot>{{ value }}</slot>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  defineProps<{
    title: string
    value?: string | number
  }>()
  </script>
  