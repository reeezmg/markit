<script setup lang="ts">
import { useCompanyEntries } from '~/composables/companyReports'

const entries = ref([])
const loading = ref(false)

const fetchEntries = async (start?: Date, end?: Date) => {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0))
  const todayEnd = new Date(new Date().setHours(23, 59, 59, 999))

  const finalStart = start ?? todayStart
  const finalEnd = end ?? todayEnd

  loading.value = true
  entries.value = await useCompanyEntries(finalStart, finalEnd)
  loading.value = false
}

// fetch default entries (today)
onMounted(() => {
  fetchEntries()
})

// re-fetch when date is updated from child
const handleDateChange = (range: { start: Date; end: Date }) => {
  fetchEntries(range.start, range.end)
}
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
          @update:selectedDate="handleDateChange"
        />
      </div>
      <div class="px-4">
        <UsersReportChart v-if="entries" :entries="entries" />
      </div>
    </template>
  </UDashboardPanelContent>
</template>
