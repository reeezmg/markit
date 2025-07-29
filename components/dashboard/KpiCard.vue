<template>
    <div class="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-2xl shadow-md p-4 hover:shadow-lg transition">
      <div>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ title }}</p>
        <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ value }}</p>
      </div>
      
    </div>
  </template>
  
  <script setup lang="ts">
  defineProps<{
    title: string
    value: string | number
  }>()
  </script>
  