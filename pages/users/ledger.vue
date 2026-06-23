<script setup lang="ts">
const toast = useToast()

const rows = ref<any[]>([])
const loading = ref(false)
const search = ref('')
const expand = ref({ openedRows: [], row: null })

const userColumns = [
  { key: 'code', label: 'Code', sortable: true },
  { key: 'name', label: 'User', sortable: true },
  { key: 'totalCredit', label: 'Credit', sortable: true },
  { key: 'totalDebit', label: 'Debit', sortable: true },
  { key: 'balance', label: 'Balance', sortable: true },
]

const entryColumns = [
  { key: 'createdAt', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'direction', label: 'Dr/Cr' },
  { key: 'sourceType', label: 'Source' },
  { key: 'amount', label: 'Amount' },
  { key: 'balanceAfter', label: 'Balance' },
  { key: 'note', label: 'Note' },
]

const money = (value: any) =>
  `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const formatDate = (value: any) =>
  value ? new Date(value).toLocaleDateString('en-GB') : '-'

const fetchRows = async () => {
  loading.value = true
  try {
    rows.value = await $fetch('/api/users/ledger')
  } catch (error: any) {
    toast.add({ title: 'Failed to load user ledger', description: error?.message || 'Something went wrong', color: 'red' })
  } finally {
    loading.value = false
  }
}

onMounted(fetchRows)

const filteredRows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (rows.value || []).filter((user: any) => {
    if (!term) return true
    return [
      user.name,
      user.code,
      ...(user.entries || []).map((entry: any) => entry.type),
      ...(user.entries || []).map((entry: any) => entry.sourceType),
      ...(user.entries || []).map((entry: any) => entry.note),
    ].some((value) => String(value || '').toLowerCase().includes(term))
  })
})

const totalBalance = computed(() => filteredRows.value.reduce((sum: number, user: any) => sum + Number(user.balance || 0), 0))
</script>

<template>
  <UDashboardPanelContent>
    <UCard>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold">User Ledger</h2>
          <p class="text-sm text-gray-500">Complete user debit/credit ledger with running balance.</p>
        </div>
        <div class="text-sm font-medium" :class="totalBalance >= 0 ? 'text-green-600' : 'text-red-600'">
          Balance {{ money(totalBalance) }}
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass-20-solid"
          placeholder="Search user, code, source, note"
          class="sm:max-w-xs"
        />
        <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" @click="fetchRows">
          Refresh
        </UButton>
      </div>

      <UTable
        v-model:expand="expand"
        :rows="filteredRows"
        :columns="userColumns"
        :loading="loading"
        :multiple-expand="false"
      >
        <template #code-data="{ row }">
          <span class="font-mono text-xs">{{ row.code || '-' }}</span>
        </template>
        <template #totalCredit-data="{ row }">
          <span class="text-green-600">{{ money(row.totalCredit) }}</span>
        </template>
        <template #totalDebit-data="{ row }">
          <span class="text-red-600">{{ money(row.totalDebit) }}</span>
        </template>
        <template #balance-data="{ row }">
          <span :class="row.balance >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'">{{ money(row.balance) }}</span>
        </template>

        <template #expand="{ row: userRow }">
          <UTable :rows="userRow.entries" :columns="entryColumns">
            <template #createdAt-data="{ row }">{{ formatDate(row.createdAt) }}</template>
            <template #type-data="{ row }">
              <span class="text-xs">{{ row.type }}</span>
            </template>
            <template #direction-data="{ row }">
              <UBadge :color="row.direction === 'CREDIT' ? 'green' : 'red'" variant="subtle" size="xs">{{ row.direction }}</UBadge>
            </template>
            <template #sourceType-data="{ row }">
              <span class="text-xs">{{ row.sourceType }}</span>
            </template>
            <template #amount-data="{ row }">
              <span :class="row.direction === 'CREDIT' ? 'text-green-600' : 'text-red-600'">{{ money(row.amount) }}</span>
            </template>
            <template #balanceAfter-data="{ row }">
              <span :class="row.balanceAfter >= 0 ? 'text-green-600' : 'text-red-600'">{{ money(row.balanceAfter) }}</span>
            </template>
            <template #note-data="{ row }">{{ row.note || '-' }}</template>
          </UTable>
        </template>
      </UTable>
    </UCard>
  </UDashboardPanelContent>
</template>
