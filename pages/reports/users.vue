<script setup lang="ts">
import { useCompanyEntries } from '~/composables/companyReports'

const useAuth = () => useNuxtApp().$auth;
const companyName = computed(() => useAuth().session.value?.companyName);
const entries = ref([])
const loading = ref(false)

// ✅ Define selectedDate for v-model binding
const selectedDate = ref({
  start: new Date(new Date().setHours(0, 0, 0, 0)),
  end: new Date(new Date().setHours(23, 59, 59, 999)),
})

const fetchEntries = async (start?: Date, end?: Date) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0))
  const todayEnd = new Date(new Date().setHours(23, 59, 59, 999))

  const finalStart = start ?? todayStart
  const finalEnd = end ?? todayEnd
  loading.value = true
  console.log(finalStart,finalEnd)
  entries.value = await useCompanyEntries(finalStart, finalEnd)
  console.log(entries.value)
  loading.value = false
}

// ✅ Wait until session is ready before fetching
watch(
  () => useAuth().session.value,
  (session) => {
    if (session?.companyId || session?.companyName) {
      fetchEntries(selectedDate.value.start, selectedDate.value.end)
    }
  },
  { immediate: true }
)

// 🔁 Refetch when selectedDate or companyName changes
watch([selectedDate, companyName], ([newVal, newCompany]) => {
  if (newCompany) {
    fetchEntries(newVal.start, newVal.end)
  }
})
</script>



<template>
  <UDashboardPanelContent class="pb-24">
    <div v-if="loading" class="w-full flex justify-center items-center py-20">
        <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 text-gray-500 mr-2" />
        <span>Loading data...</span>
    </div>

    <template v-else>
      <div>
        <UsersReportTable
          v-if="entries"
          :users="entries"
          v-model:selectedDate="selectedDate"
        />
      </div>
      <div class="px-4">
        <UsersReportChart v-if="entries" :entries="entries" />
      </div>
    </template>
  </UDashboardPanelContent>
</template>
