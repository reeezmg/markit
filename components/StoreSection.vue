<script setup lang="ts">
defineProps({
  title: {
    type: String,
    required: true
  }
});
</script>

<template>
  <section class="mb-12">
    <h2 class="text-2xl font-bold mb-6">{{ title }}</h2>
    <slot />
  </section>
</template>