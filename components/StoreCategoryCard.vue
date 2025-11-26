<script setup lang="ts">
const props = defineProps({
  category: {
    type: Object,
    required: true
  },
  company: {
    type: String,
    required: true
  }
});

const productCount = computed(() => props.category.products?.length || 0);
</script>

<template>
  <NuxtLink 
    :to="`/${company}/categories/${category.id}`"
    class="relative rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 h-48"
  >
    <img 
      v-if="category.image"
      :src="category.image"
      :alt="category.name"
      class="w-full h-full object-cover"
    />
    <div v-else class="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
      <UIcon name="i-heroicons-photo" class="w-12 h-12 text-gray-400" />
    </div>
    <div class="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center flex-col">
      <h3 class="text-xl font-bold text-white">{{ category.name }}</h3>
      <p class="text-white mt-1">{{ productCount }} products</p>
    </div>
  </NuxtLink>
</template>