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
    <ThermalReceipt v-else-if="printData" :data="printData" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const printData = ref<any>(null)
const pending = ref(true)
const error = ref(false)

watch(
  () => route.params.id,
  async (id) => {
    if (!id) return

    pending.value = true
    error.value = false

    try {
      printData.value = await $fetch('/api/billSale/receipt', {
        params: { id },
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
  .receipt-page {
    background: #fff !important;
    padding: 0 !important;
    min-height: auto !important;
  }
}
</style>
