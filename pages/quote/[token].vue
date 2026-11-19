<script setup lang="ts">
import QuoteDocument from '~/components/Quotes/PrintPreview.vue'
import { billingErrorMessage } from '~/utils/billing-error'
definePageMeta({ layout: false, auth: false })
useHead({ title: 'Customer quote', meta: [{ name: 'referrer', content: 'no-referrer' }, { name: 'robots', content: 'noindex,nofollow' }] })
const route = useRoute(), token = String(route.params.token)
const { data, error, pending, refresh } = await useAsyncData(`public-quote:${token}`, () => $fetch<any>('/api/quote-share', { query: { token } }))
const busy = ref(false), actionError = ref(''), confirmation = ref<'ACCEPTED' | 'DECLINED' | ''>('')
async function respond() {
  if (!confirmation.value || busy.value) return
  busy.value = true; actionError.value = ''
  try {
    await $fetch('/api/quote-share', { method: 'POST', body: { token, decision: confirmation.value } })
    confirmation.value = ''; await refresh()
  } catch (e) { actionError.value = billingErrorMessage(e) }
  finally { busy.value = false }
}
</script>
<template>
  <main class="min-h-screen bg-gray-100 text-gray-900">
    <div class="quote-response mx-auto max-w-4xl px-4 pt-5">
      <p v-if="pending" class="py-10 text-center">Loading quote…</p>
      <UAlert v-else-if="error" color="red" title="Quote unavailable" :description="billingErrorMessage(error)" />
      <template v-else-if="data">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm">
          <div><h1 class="font-semibold">{{ data.quote.quoteNumber }}</h1><p class="text-sm text-gray-500">{{ data.expired && !['ACCEPTED','DECLINED'].includes(data.quote.status) ? 'Expired' : data.quote.status }}</p></div>
          <div v-if="data.canRespond" class="flex gap-2"><UButton color="gray" :disabled="busy" @click="confirmation = 'DECLINED'">Decline quote</UButton><UButton :disabled="busy" @click="confirmation = 'ACCEPTED'">Accept quote</UButton></div>
        </div>
        <UAlert v-if="actionError" class="mt-3" color="red" title="Could not record your response" :description="actionError" />
        <div v-if="confirmation" class="mt-3 rounded-lg bg-white p-4"><p class="mb-3">{{ confirmation === 'ACCEPTED' ? 'Confirm that you accept the prices and terms in this quote.' : 'Confirm that you decline this quote.' }}</p><div class="flex gap-2"><UButton color="gray" :disabled="busy" @click="confirmation = ''">Cancel</UButton><UButton :loading="busy" @click="respond">{{ confirmation === 'ACCEPTED' ? 'Confirm acceptance' : 'Confirm decline' }}</UButton></div></div>
        <p v-if="data.quote.status === 'ACCEPTED'" role="status" class="mt-3 text-sm text-green-700">Your acceptance has been recorded.</p>
        <p v-if="data.quote.status === 'DECLINED'" role="status" class="mt-3 text-sm text-gray-600">Your decline has been recorded.</p>
      </template>
    </div>
    <QuoteDocument v-if="data && !error" :quote="data.quote" :company="data.company" inline />
  </main>
</template>
<style scoped>@media print { .quote-response { display: none; } main { background: white; } }</style>
