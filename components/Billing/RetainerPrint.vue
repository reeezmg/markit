<script setup lang="ts">
import { retainerStatus } from '~/utils/invoice-programs'
const props = defineProps<{ retainer: any; company: any }>()
const emit = defineEmits<{ close: [] }>()
const money = (n: any) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: props.retainer.currency || 'INR' }).format(Number(n || 0))
const print = () => window.print()
useHead({ style: [{ key: 'retainer-print-page', textContent: '@page { size: A4; margin: 15mm; }' }] })
function key(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', key))
onBeforeUnmount(() => window.removeEventListener('keydown', key))
</script>
<template>
  <Teleport to="body">
    <div class="retainer-print-host" role="dialog" aria-label="Retainer invoice print preview" aria-modal="true">
      <div class="retainer-print-toolbar"><strong>RET-{{ retainer.number }}</strong><div><button @click="emit('close')">Close</button><button @click="print">Print / Save PDF</button></div></div>
      <article class="retainer-paper">
        <header><div><h2>{{ company?.companyName || company?.name }}</h2><p>{{ company?.companyPhone || company?.phone }}</p><p v-if="company?.gstin">GSTIN: {{ company.gstin }}</p></div><div><h1>RETAINER INVOICE</h1><p>RET-{{ retainer.number }} · {{ retainerStatus(retainer) }}</p></div></header>
        <section class="retainer-parties"><div><small>Customer</small><h3>{{ retainer.clientName }}</h3><p>{{ retainer.clientPhone }}</p></div><div><p>Date: {{ retainer.retainerDate }}</p><p v-if="retainer.reference">Reference: {{ retainer.reference }}</p><p>Currency: {{ retainer.currency }}</p></div></section>
        <table><thead><tr><th>Description</th><th>Amount requested</th></tr></thead><tbody><tr><td class="preserve">{{ retainer.description }}</td><td>{{ money(retainer.amount) }}</td></tr></tbody></table>
        <div class="retainer-print-totals"><p>Advance collected <strong>{{ money(retainer.collected) }}</strong></p><p>Applied to invoices <strong>{{ money(retainer.applied) }}</strong></p><p>Refunded <strong>{{ money(retainer.refunded) }}</strong></p><p>Unused advance <strong>{{ money(retainer.available) }}</strong></p><p>Amount still to collect <strong>{{ money(Math.max(0,retainer.amount-retainer.collected)) }}</strong></p></div>
        <p class="retainer-notice">Advance payment request for future goods or services.</p>
        <section v-if="retainer.notes"><h3>Customer notes</h3><p class="preserve">{{ retainer.notes }}</p></section>
        <section v-if="retainer.termsAndConditions"><h3>Terms and conditions</h3><p class="preserve">{{ retainer.termsAndConditions }}</p></section>
        <section v-if="retainer.events?.length"><h3>Payment and application history</h3><table><thead><tr><th>Date</th><th>Activity</th><th>Reference / invoice</th><th>Amount</th></tr></thead><tbody><tr v-for="event in retainer.events" :key="event.id"><td>{{ event.eventDate }}</td><td>{{ event.kind==='UNAPPLY'?'Application removed':event.kind.toLowerCase() }}</td><td>{{ event.invoiceCode || event.reference }}</td><td>{{ money(event.amount) }}</td></tr></tbody></table></section>
      </article>
    </div>
  </Teleport>
</template>
<style scoped>
.retainer-print-host{position:fixed;inset:0;z-index:100;overflow:auto;background:#e5e7eb;padding:24px;color:#111827}.retainer-print-toolbar{display:flex;align-items:center;justify-content:space-between;max-width:210mm;margin:0 auto 16px;font:14px Arial}.retainer-print-toolbar button{padding:8px 14px;margin-left:8px;border:1px solid #cbd5e1;border-radius:6px;background:white}.retainer-paper{box-sizing:border-box;max-width:210mm;min-height:260mm;background:white;margin:auto;padding:16mm;font:13px/1.6 Arial}.retainer-paper header,.retainer-parties{display:flex;justify-content:space-between;gap:24px;margin-bottom:28px}.retainer-paper h1{font-size:22px;font-weight:700}.retainer-paper h2{font-size:20px;font-weight:600}.retainer-paper h3{font-weight:600;margin-bottom:6px}.retainer-paper small{color:#64748b}.retainer-paper table{width:100%;border-collapse:collapse;margin:16px 0}.retainer-paper th,.retainer-paper td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}.retainer-paper th{background:#f8fafc}.retainer-paper th:last-child,.retainer-paper td:last-child{text-align:right;white-space:nowrap}.retainer-print-totals{max-width:340px;margin:24px 0 24px auto}.retainer-print-totals p{display:flex;justify-content:space-between;gap:20px;padding:4px 0}.retainer-paper section{margin-top:24px}.preserve{white-space:pre-wrap;overflow-wrap:anywhere}.retainer-notice{color:#64748b;font-size:12px}@media print{:global(body:has(>.retainer-print-host)>:not(.retainer-print-host)){display:none!important}.retainer-print-host{position:static;overflow:visible;background:white;padding:0}.retainer-print-toolbar{display:none}.retainer-paper{padding:0;max-width:none;min-height:0}thead{display:table-header-group}tr{break-inside:avoid}}@media(max-width:700px){.retainer-print-host{padding:10px}.retainer-paper{padding:18px}.retainer-paper h1{font-size:17px}}
</style>

