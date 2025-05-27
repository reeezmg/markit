<script setup lang="ts">
defineProps({
  count: {
    type: Number,
    default: 0
  }
});
</script>

<template>
  <UTooltip text="Wishlist">
    <NuxtLink 
      to="/wishlist" 
      class="relative inline-flex items-center p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <UIcon name="i-heroicons-heart" class="w-5 h-5" />
      <span 
        v-if="count > 0"
        class="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full"
      >
        {{ count }}
      </span>
    </NuxtLink>
  </UTooltip>
</template>