<script setup lang="ts">
import QuoteDocument from '~/components/Quotes/Document.vue'
import { defaultQuoteDesign } from '~/utils/quote-design'
const props = defineProps<{ quote: any; company: any; inline?: boolean; documentTitle?: string }>()
const emit = defineEmits<{ close: [] }>()
useHead(() => ({ style: [{ key: 'quote-page-margins', textContent: `@page { size: A4; margin: ${props.quote.documentDesign?.padding ?? defaultQuoteDesign().padding}mm; }` }] }))
const print = () => window.print()
function keydown(event: KeyboardEvent) { if (!props.inline && event.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', keydown))
onBeforeUnmount(() => window.removeEventListener('keydown', keydown))
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <div class="erp-quote-print-host" :class="{ 'quote-inline': inline }" :role="inline ? undefined : 'dialog'" :aria-modal="inline ? undefined : true" :aria-label="documentTitle === 'SALES ORDER' ? 'Sales order print preview' : 'Quote print preview'">
      <div class="quote-print-toolbar">
        <span class="font-semibold">{{ quote.quoteNumber }}</span>
        <div class="flex gap-2"><UButton v-if="!inline" color="gray" @click="emit('close')">Close</UButton><UButton icon="i-heroicons-printer" @click="print">Print / Save PDF</UButton></div>
      </div>
      <QuoteDocument :quote="quote" :company="company" :document-title="documentTitle" />
    </div>
  </Teleport>
</template>

<style scoped>
.erp-quote-print-host { position: fixed; inset: 0; z-index: 100; overflow: auto; background: #e5e7eb; color: #111827; padding: 24px; }
.quote-print-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.quote-inline { position: static; padding: 16px; }
@media print {
  :global(body:has(> .erp-quote-print-host) > :not(.erp-quote-print-host)) { display: none !important; }
  .erp-quote-print-host { position: static; overflow: visible; background: white; padding: 0; }
  .quote-print-toolbar { display: none; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}
</style>
