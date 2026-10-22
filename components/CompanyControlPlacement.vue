<script setup lang="ts">
// Keep the control in its owning component so its queries and mutations retain
// their existing scope. Only its DOM position changes after hydration.
withDefaults(defineProps<{ toolbar?: boolean; kind?: 'table' | 'form' }>(), { kind: 'form' });
const target = shallowRef<HTMLElement | null>(null);
onMounted(() => {
  target.value = document.getElementById('company-page-topbar');
});
</script>

<template>
  <Teleport v-if="toolbar && target" :to="target"><div :data-company-control="kind"><slot /></div></Teleport>
  <slot v-else />
</template>
