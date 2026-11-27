<script setup lang="ts">
import { computed } from 'vue'
import PrinterTemplateDesigner from '~/components/PrinterTemplateDesigner.vue'
import { printDesignerSamples } from '~/utils/print-designer-samples'
definePageMeta({ auth: true, layout: false, documentDesigner: true })
const route = useRoute(), scope = useCompanyScope('form')
const samples = computed(() => printDesignerSamples(scope.auth.session.value || {}))
</script>
<template>
  <PrinterTemplateDesigner :key="`${route.params.kind}:${route.params.id}:${route.query.entryCompany || ''}`" workspace hide-original-receipt :template-id="String(route.params.id)" :template-kind="String(route.params.kind)" :receipt-data="samples.receipt" :label-data="samples.label" />
</template>
