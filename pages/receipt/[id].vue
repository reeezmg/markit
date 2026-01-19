<template>
    <UDashboardPage>
     <UDashboardPanel grow>
        <!-- <UDashboardNavbar title="Markit">
          <template #right>
            <div class="flex items-center gap-4">
              <UButton color="primary"  to="/login">Login</UButton>
              <UButton color="primary" to="/register">Register</UButton>
            </div>
          </template>
        </UDashboardNavbar> -->
  
        <UDashboardPanelContent>
   <ThermalReceipt v-if="printData" :data="printData" />
        </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
const route = useRoute()
const printData = ref<any>(null)

watch(
  () => route.params.id,
  async (id) => {
    if (!id) return

    const res = await $fetch('/api/billSale/receipt', {
      params: { id },
    })
    console.log('PRINT DATA:', res)
    printData.value = res
  },
  { immediate: true }
)
</script>
