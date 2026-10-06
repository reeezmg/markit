<template>
  <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            class="px-3 py-2 text-left font-medium"
          >
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{ columns: string[] }>();
</script>
