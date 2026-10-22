<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { loadPrintTemplate } from '~/utils/load-print-template.client';
import { renderPrintTemplate } from '~/utils/print-template-renderer.client';
const props = defineProps<{ data: any }>();
const emit = defineEmits<{ original: [] }>();
const image = ref('');
const width = ref(72);
const error = ref('');
let generation = 0;
async function render() {
  const run = ++generation; image.value = ''; error.value = '';
  try {
    const template = props.data.printTemplate === undefined ? await loadPrintTemplate('receipt', props.data.companyId) : props.data.printTemplate;
    if (run !== generation) return;
    if (!template) { emit('original'); return; }
    const result = await renderPrintTemplate(template, props.data);
    if (run !== generation) return;
    width.value = template.width; image.value = result.canvas.toDataURL('image/png');
  } catch (err: any) { if (run === generation) error.value = err?.data?.statusMessage || err.message; }
}
onMounted(render);
watch(() => props.data, render, { deep: true });
</script>
<template>
  <div>
    <p v-if="error" role="alert" class="text-red-600">Could not render receipt: {{ error }}</p>
    <img v-else-if="image" :src="image" alt="Receipt" :style="{ width: `${width}mm`, maxWidth: '100%' }" />
    <p v-else class="text-sm text-gray-500">Loading receipt design…</p>
  </div>
</template>
