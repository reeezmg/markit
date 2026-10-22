<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { loadPrintTemplate } from '~/utils/load-print-template.client';
import { renderPrintTemplate } from '~/utils/print-template-renderer.client';
import { loadLabelVariables } from '~/utils/load-label-variables.client';
const props = defineProps<{ items: any[] }>();
const emit = defineEmits<{ original: [] }>();
const images = ref<string[]>([]);
const width = ref(50);
const error = ref('');
const loading = ref(true);
let generation = 0;
async function render() {
  const run = ++generation; loading.value = true; images.value = []; error.value = '';
  try {
    const template = await loadPrintTemplate('label', props.items[0]?.companyId);
    if (run !== generation) return;
    if (!template) { emit('original'); return; }
    width.value = template.width;
    const results: string[] = [];
    const items = await loadLabelVariables(props.items, template);
    for (const item of items) {
      const rendered = await renderPrintTemplate(template, item);
      if (run !== generation) return;
      results.push(rendered.canvas.toDataURL('image/png'));
    }
    images.value = results;
  } catch (err: any) { if (run === generation) error.value = err?.data?.statusMessage || err.message; }
  finally { if (run === generation) loading.value = false; }
}
onMounted(render);
onBeforeUnmount(() => { generation++; });
watch(() => props.items, render, { deep: true });
</script>
<template>
  <p v-if="error" role="alert" class="text-red-600">Could not render labels: {{ error }}</p>
  <p v-else-if="loading" class="text-sm text-gray-500">Loading label designs…</p>
  <div v-else class="flex flex-wrap justify-center gap-4">
    <img v-for="(image, index) in images" :key="index" :src="image" alt="Product label" class="shadow" :style="{ width: `${width}mm`, maxWidth: '100%' }" />
  </div>
</template>
