<template>
  <div
    class="receipt-page min-h-screen w-full flex justify-center items-start
           py-6 px-2 bg-gray-100 dark:bg-gray-900"
  >
    <div v-if="pending" class="mt-16 text-sm text-gray-500 dark:text-gray-400">
      Loading receipt…
    </div>
    <div v-else-if="error" class="mt-16 text-sm text-red-500 dark:text-red-400">
      Receipt not found.
    </div>
    <div v-else-if="printData">
      <div class="receipt-actions flex flex-wrap gap-2 mb-4">
        <UButton label="Download PDF" :loading="busy" @click="downloadPdf" />
        <UButton v-if="!route.query.share" label="Copy PDF link" :loading="busy" @click="shareReceipt" />
      </div>
      <p v-if="actionMessage" role="status" class="receipt-actions mb-3 text-sm">{{ actionMessage }}</p>
      <input v-if="shareUrl" class="receipt-actions w-full mb-3" aria-label="Receipt share link" readonly :value="shareUrl" @focus="($event.target as HTMLInputElement).select()" />
      <ThermalReceipt :data="printData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { shareReceiptPDF } from '~/utils/share-receipt.client'
definePageMeta({ layout: false })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex,nofollow' }] })

const route = useRoute()
const printData = ref<any>(null)
const pending = ref(true)
const error = ref(false)
const busy = ref(false)
const actionMessage = ref('')
const shareUrl = ref('')
async function downloadPdf() {
  busy.value = true; actionMessage.value = ''
  try {
    const { generateThermalReceiptPDF } = await import('~/utils/thermal-receipt.client')
    await generateThermalReceiptPDF(printData.value)
  } catch { actionMessage.value = 'Could not download the receipt. Please retry.' }
  finally { busy.value = false }
}
async function shareReceipt() {
  busy.value = true; actionMessage.value = ''
  try {
    const result = await shareReceiptPDF(printData.value, String(route.params.id))
    shareUrl.value = window.location.origin + result.path
    try { await navigator.clipboard.writeText(shareUrl.value); actionMessage.value = 'PDF link copied. Anyone with this link can download this receipt for 30 days.' }
    catch { actionMessage.value = 'Copy the link below. It is valid for 30 days.' }
  } catch (err: any) { actionMessage.value = err?.data?.statusMessage || 'Could not create a share link.' }
  finally { busy.value = false }
}

watch(
  () => [route.params.id, route.query.share, route.query.pdf],
  async ([id, share, pdf]) => {
    if (!id) return

    pending.value = true
    error.value = false

    try {
      shareUrl.value = ''; actionMessage.value = ''
      if (share && pdf === '1') {
        if (typeof window !== 'undefined') window.location.replace(`/api/receipt-share?token=${encodeURIComponent(String(share))}&pdf=1`)
        return
      }
      printData.value = share ? await $fetch('/api/receipt-share', { params: { token: share } }) : await $fetch('/api/billSale/receipt', {
        params: { id, companyFilter: route.query.companyId },
      })
    } catch (err) {
      error.value = true
      printData.value = null
    } finally {
      pending.value = false
    }
  },
  { immediate: true }
)
</script>

<style scoped>
@media print {
  .receipt-actions { display: none !important; }
  .receipt-page {
    background: #fff !important;
    padding: 0 !important;
    min-height: auto !important;
  }
}
</style>
