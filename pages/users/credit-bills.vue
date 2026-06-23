<script setup lang="ts">
import { useFindManyCompanyUser } from '~/lib/hooks'

const toast = useToast()
const router = useRouter()
const useAuth = () => useNuxtApp().$auth
const companyId = computed(() => useAuth().session.value?.companyId)

const activeTab = ref('credit')
const tabs = [
  { key: 'credit', label: 'Credit' },
  { key: 'bills', label: 'Bills' },
]

const ledgerRows = ref<any[]>([])
const billRows = ref<any[]>([])
const loadingLedger = ref(false)
const loadingBills = ref(false)
const search = ref('')
const ledgerExpand = ref({ openedRows: [], row: null })
const billsExpand = ref({ openedRows: [], row: null })
const addOpen = ref(false)
const editingCredit = ref<any>(null)
const isSaving = ref(false)
const form = reactive({
  userId: '',
  type: 'CREDIT' as 'CREDIT' | 'PAYMENT',
  amount: 0,
  paymentMode: 'CASH' as 'CASH' | 'BANK',
  note: '',
  transactionDate: new Date().toISOString().slice(0, 10),
})

const { data: users } = useFindManyCompanyUser(
  computed(() => ({
    where: { companyId: companyId.value, deleted: false },
    orderBy: [{ name: 'asc' }],
    select: { userId: true, name: true, code: true },
  })),
)

const userOptions = computed(() =>
  (users.value || []).map((user: any) => ({
    label: `${user.name || 'User'}${user.code ? ` (${user.code})` : ''}`,
    value: user.userId,
  })),
)

const userColumns = [
  { key: 'code', label: 'Code', sortable: true },
  { key: 'name', label: 'User', sortable: true },
  { key: 'totalCredit', label: 'Credit', sortable: true },
  { key: 'totalPayment', label: 'Payments', sortable: true },
  { key: 'due', label: 'Due', sortable: true },
]

const txnColumns = [
  { key: 'createdAt', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'sourceType', label: 'Source' },
  { key: 'amount', label: 'Amount' },
  { key: 'note', label: 'Note' },
  { key: 'actions', label: '' },
]

const billUserColumns = [
  { key: 'code', label: 'Code', sortable: true },
  { key: 'name', label: 'User', sortable: true },
  { key: 'pending', label: 'Credit total', sortable: true },
  { key: 'billsCount', label: 'Bills', sortable: true },
]

const billColumns = [
  { key: 'invoiceNumber', label: 'Inv#' },
  { key: 'createdAt', label: 'Date' },
  { key: 'entriesCount', label: 'Entries' },
  { key: 'creditAmount', label: 'Credit' },
  { key: 'paymentStatus', label: 'Bill status' },
  { key: 'actions', label: 'Actions' },
]

const money = (value: any) =>
  `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const formatDate = (value: any) =>
  value ? new Date(value).toLocaleDateString('en-GB') : '-'

const fetchLedger = async () => {
  loadingLedger.value = true
  try {
    ledgerRows.value = await $fetch('/api/users/credit-ledger')
  } catch (error: any) {
    toast.add({ title: 'Failed to load user credit', description: error?.message || 'Something went wrong', color: 'red' })
  } finally {
    loadingLedger.value = false
  }
}

const fetchBills = async () => {
  loadingBills.value = true
  try {
    billRows.value = await $fetch('/api/users/credit-bills')
  } catch (error: any) {
    toast.add({ title: 'Failed to load credit bills', description: error?.message || 'Something went wrong', color: 'red' })
  } finally {
    loadingBills.value = false
  }
}

const refresh = async () => {
  await Promise.all([fetchLedger(), fetchBills()])
}

onMounted(refresh)

const filteredLedgerRows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (ledgerRows.value || []).filter((user: any) => {
    if (!term) return true
    return [
      user.name,
      user.code,
      ...(user.transactions || []).map((txn: any) => txn.note),
      ...(user.transactions || []).map((txn: any) => txn.sourceType),
    ].some((value) => String(value || '').toLowerCase().includes(term))
  })
})

const billCreditAmount = (bill: any) => Number(bill?.creditAmount ?? 0)
const filteredBillRows = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (billRows.value || [])
    .map((user: any) => ({
      ...user,
      pending: (user.bills || []).reduce((sum: number, bill: any) => sum + billCreditAmount(bill), 0),
      billsCount: (user.bills || []).length,
    }))
    .filter((user: any) => {
      if (!user.billsCount) return false
      if (!term) return true
      return [
        user.name,
        user.code,
        ...user.bills.map((bill: any) => bill.invoiceNumber),
      ].some((value) => String(value || '').toLowerCase().includes(term))
    })
})

const totalDue = computed(() => filteredLedgerRows.value.reduce((sum: number, user: any) => sum + Number(user.due || 0), 0))
const totalBillCredit = computed(() => filteredBillRows.value.reduce((sum: number, user: any) => sum + Number(user.pending || 0), 0))
const creditTypeLabel = (type: string) => type === 'CREDIT_BILL_PAYMENT' ? 'Payment' : 'Credit'
const isCreditPayment = (type: string) => type === 'CREDIT_BILL_PAYMENT'

const resetForm = () => {
  editingCredit.value = null
  form.userId = ''
  form.type = 'CREDIT'
  form.amount = 0
  form.paymentMode = 'CASH'
  form.note = ''
  form.transactionDate = new Date().toISOString().slice(0, 10)
}

const openAdd = () => {
  resetForm()
  addOpen.value = true
}

const openEditManualCredit = (row: any) => {
  editingCredit.value = row
  form.userId = row.userId
  form.type = row.type === 'CREDIT_BILL_PAYMENT' ? 'PAYMENT' : 'CREDIT'
  form.amount = Number(row.amount || 0)
  form.paymentMode = row.paymentMode === 'BANK' ? 'BANK' : 'CASH'
  form.note = row.note || ''
  form.transactionDate = row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  addOpen.value = true
}

const saveCredit = async () => {
  if (!form.userId || !form.amount || form.amount <= 0) {
    toast.add({ title: 'Select user and amount', color: 'red' })
    return
  }
  isSaving.value = true
  try {
    const body = { ...form, amount: Number(form.amount), sourceType: 'MANUAL' }
    if (editingCredit.value) {
      await $fetch(`/api/users/credit-ledger/${editingCredit.value.id}`, {
        method: 'PUT',
        body,
      })
    } else {
      await $fetch('/api/users/credit-ledger', {
        method: 'POST',
        body,
      })
    }
    toast.add({ title: editingCredit.value ? 'Credit row updated' : form.type === 'CREDIT' ? 'Credit added' : 'Payment added', color: 'green' })
    addOpen.value = false
    await fetchLedger()
  } catch (error: any) {
    toast.add({ title: 'Could not save credit', description: error?.data?.statusMessage || error?.message, color: 'red' })
  } finally {
    isSaving.value = false
  }
}

const deleteManualCredit = async (row: any) => {
  try {
    await $fetch(`/api/users/credit-ledger/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Credit row deleted', color: 'green' })
    await fetchLedger()
  } catch (error: any) {
    toast.add({ title: 'Could not delete credit row', description: error?.data?.statusMessage || error?.message, color: 'red' })
  }
}

const billAction = (row: any) => [
  [
    {
      label: 'Edit bill',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => router.push(`/erp/edit/${row.id}`),
    },
  ],
]
</script>

<template>
  <UDashboardPanelContent>
    <UCard>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold">User Credit</h2>
          <p class="text-sm text-gray-500">Credit and reductions are tracked in one ledger.</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="text-sm font-medium text-orange-600">
            {{ activeTab === 'credit' ? `Due ${money(totalDue)}` : `Bill credit ${money(totalBillCredit)}` }}
          </div>
          <UButton icon="i-heroicons-plus" label="Add credit" @click="openAdd" />
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass-20-solid"
          placeholder="Search user, code, invoice, note"
          class="sm:max-w-xs"
        />
        <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" @click="refresh">
          Refresh
        </UButton>
      </div>

      <UTabs v-model="activeTab" :items="tabs" class="mb-4" />

      <UTable
        v-if="activeTab === 'credit'"
        v-model:expand="ledgerExpand"
        :rows="filteredLedgerRows"
        :columns="userColumns"
        :loading="loadingLedger"
        :multiple-expand="false"
      >
        <template #code-data="{ row }">
          <span class="font-mono text-xs">{{ row.code || '-' }}</span>
        </template>
        <template #totalCredit-data="{ row }">
          <span class="text-orange-600">{{ money(row.totalCredit) }}</span>
        </template>
        <template #totalPayment-data="{ row }">
          <span class="text-green-600">{{ money(row.totalPayment) }}</span>
        </template>
        <template #due-data="{ row }">
          <span :class="row.due > 0 ? 'font-semibold text-orange-600' : 'text-gray-500'">{{ money(row.due) }}</span>
        </template>
        <template #expand="{ row: userRow }">
          <UTable :rows="userRow.transactions" :columns="txnColumns">
            <template #createdAt-data="{ row }">{{ formatDate(row.createdAt) }}</template>
            <template #type-data="{ row }">
              <UBadge :color="isCreditPayment(row.type) ? 'green' : 'orange'" variant="subtle" size="xs">{{ creditTypeLabel(row.type) }}</UBadge>
            </template>
            <template #sourceType-data="{ row }">
              <span class="text-xs">{{ row.sourceType }}</span>
            </template>
            <template #amount-data="{ row }">
              <span :class="isCreditPayment(row.type) ? 'text-green-600' : 'text-orange-600'">{{ isCreditPayment(row.type) ? '-' : '+' }}{{ money(row.amount) }}</span>
            </template>
            <template #note-data="{ row }">{{ row.note || '-' }}</template>
            <template #actions-data="{ row }">
              <div v-if="row.sourceType === 'MANUAL'" class="flex items-center gap-1">
                <UButton
                  color="gray"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-pencil-square"
                  @click="openEditManualCredit(row)"
                />
                <UButton
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-trash"
                  @click="deleteManualCredit(row)"
                />
              </div>
              <span v-else class="text-xs text-gray-400">-</span>
            </template>
          </UTable>
        </template>
      </UTable>

      <UTable
        v-else
        v-model:expand="billsExpand"
        :rows="filteredBillRows"
        :columns="billUserColumns"
        :loading="loadingBills"
        :multiple-expand="false"
      >
        <template #code-data="{ row }">
          <span class="font-mono text-xs">{{ row.code || '-' }}</span>
        </template>
        <template #pending-data="{ row }">
          <span class="font-semibold text-orange-600">{{ money(row.pending) }}</span>
        </template>
        <template #expand="{ row: userRow }">
          <UTable :rows="userRow.bills" :columns="billColumns">
            <template #createdAt-data="{ row }">{{ formatDate(row.createdAt) }}</template>
            <template #creditAmount-data="{ row }">{{ money(row.creditAmount) }}</template>
            <template #paymentStatus-data="{ row }">
              <UBadge :color="row.paymentStatus === 'PAID' ? 'green' : 'orange'" variant="subtle" size="xs">{{ row.paymentStatus }}</UBadge>
            </template>
            <template #actions-data="{ row }">
              <UDropdown :items="billAction(row)">
                <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
              </UDropdown>
            </template>
          </UTable>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="addOpen">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">{{ editingCredit ? 'Edit User Credit' : 'Add User Credit' }}</h3>
        </template>
        <div class="space-y-3">
          <UFormGroup label="User">
            <USelectMenu v-model="form.userId" :options="userOptions" value-attribute="value" option-attribute="label" searchable />
          </UFormGroup>
          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Type">
              <USelect v-model="form.type" :options="[
                { label: 'Credit', value: 'CREDIT' },
                { label: 'Payment / reduction', value: 'PAYMENT' },
              ]" value-attribute="value" option-attribute="label" />
            </UFormGroup>
            <UFormGroup label="Amount">
              <UInput v-model.number="form.amount" type="number" min="0" />
            </UFormGroup>
          </div>
          <UFormGroup label="Payment mode">
            <USelect v-model="form.paymentMode" :options="[
              { label: 'Cash', value: 'CASH' },
              { label: 'Primary bank', value: 'BANK' },
            ]" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup label="Date">
            <UInput v-model="form.transactionDate" type="date" />
          </UFormGroup>
          <UFormGroup label="Note">
            <UTextarea v-model="form.note" autoresize />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="addOpen = false" />
            <UButton :loading="isSaving" :label="editingCredit ? 'Update' : 'Save'" @click="saveCredit" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
