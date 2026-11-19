<script setup lang="ts">
import type { DistributorTableReport } from '~/utils/distributor-table-export.client';

const props = defineProps<{ report: DistributorTableReport; disabled?: boolean }>();
const exporting = ref(false);
const toast = useToast();
const actions = [[
  { label: 'Download PDF', icon: 'i-heroicons-document-arrow-down', click: () => download('pdf') },
  { label: 'Download Excel', icon: 'i-heroicons-table-cells', click: () => download('excel') },
]];
async function download(format: 'pdf' | 'excel') {
  if (exporting.value || props.disabled || !props.report.rows.length) return;
  exporting.value = true;
  try {
    const { downloadDistributorTable } = await import('~/utils/distributor-table-export.client');
    await downloadDistributorTable(format, props.report);
  } catch (error: any) {
    toast.add({ title: 'Download failed', description: error.message, color: 'red' });
  } finally { exporting.value = false; }
}
</script>

<template>
  <UDropdown :items="actions">
    <UButton color="gray" variant="outline" size="xs" icon="i-heroicons-arrow-down-tray" label="Download"
      :loading="exporting" :disabled="disabled || exporting || !report.rows.length" />
  </UDropdown>
</template>
