<script setup lang="ts">
import { customerProductReference, productReferencePrefix } from '~/utils/customer-product-numbering'
import { billingErrorMessage } from '~/utils/billing-error'
const settings = await useSettingsCompany()
const prefix = ref('PR'), savedPrefix = ref('PR'), nextNumber = ref('1')
const loading = ref(false), busy = ref(false), available = ref(false), canEdit = ref(false), error = ref(''), saved = ref(false)
let version = 0
const preview = computed(() => customerProductReference(prefix.value.trim().toUpperCase().replace(/-+$/, ''), nextNumber.value))
async function load() {
  const token = ++version
  loading.value = true; error.value = ''; saved.value = false
  try {
    const result = await settings.fetch<any>('/api/settings/customer-product-numbering')
    if (token !== version) return
    prefix.value = savedPrefix.value = result.prefix; nextNumber.value = result.nextNumber
    available.value = result.available; canEdit.value = result.canEdit
  } catch (e) { if (token === version) error.value = billingErrorMessage(e) }
  finally { if (token === version) loading.value = false }
}
async function save() {
  if (busy.value || loading.value || !available.value || !canEdit.value) return
  busy.value = true; error.value = ''; saved.value = false
  try {
    const result = await settings.fetch<any>('/api/settings/customer-product-numbering', { method: 'PUT', body: { prefix: productReferencePrefix(prefix.value) } })
    prefix.value = savedPrefix.value = result.prefix; nextNumber.value = result.nextNumber; saved.value = true
  } catch (e) { error.value = billingErrorMessage(e) } finally { busy.value = false }
}
onMounted(load)
watch(settings.scope.companyId, () => { prefix.value = savedPrefix.value = 'PR'; available.value = false; void load() })
</script>
<template>
  <section class="mb-8 border-b-2 border-gray-300 pb-8 dark:border-gray-600" aria-label="Client product reference numbering">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Client product references</h2>
    <p class="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">Each purchased unit gets its own reference. Numbers increase automatically for this company. Changing the prefix keeps existing references and continues the counter.</p>
    <UAlert v-if="error" role="alert" color="red" variant="soft" :title="error" class="mb-4"><template #description><UButton color="gray" variant="link" @click="load">Retry loading numbering</UButton></template></UAlert>
    <UAlert v-if="!loading&&!available&&!error" color="orange" variant="soft" title="Sequential references need database setup" description="The prepared client product numbering migration must be installed before these settings take effect. Existing registration remains available." class="mb-4"/>
    <form class="space-y-4" @submit.prevent="save">
      <div class="grid items-center gap-4 sm:grid-cols-2">
        <UFormGroup label="Product reference prefix" help="Default: PR. Enter the prefix without the final hyphen.">
          <UInput v-model="prefix" aria-label="Product reference prefix" placeholder="PR" maxlength="17" :disabled="loading||busy||!available||!canEdit" required/>
        </UFormGroup>
        <p class="text-sm text-gray-500 dark:text-gray-400">Next reference: <span class="font-mono font-medium text-gray-700 dark:text-gray-300">{{preview}}</span></p>
      </div>
      <p v-if="saved" role="status" class="text-sm text-green-700 dark:text-green-300">Product reference prefix saved.</p>
      <UButton type="submit" :loading="busy" :disabled="loading||busy||!available||!canEdit||prefix===savedPrefix">Save product reference prefix</UButton>
    </form>
  </section>
</template>
