<script setup lang="ts">
const companyScope = useCompanyScope('table');
const $fetch = companyScope.fetch;

import { useFindManyCompanyUser } from '~/lib/company-hooks/company-user';

const toast = useToast()
const router = useRouter()
const useAuth = () => companyScope.auth
const companyId = companyScope.companyId
const canManage = computed(() => ['admin', 'manager', 'accountant'].includes(useAuth().session.value?.role || ''))
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const deleteTarget = ref<any>(null)
const deleteOpen = ref(false)
const deleting = ref(false)
const ledgerError = ref(false)
const billsError = ref(false)

const activeTab = ref(0)
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
  transactionDate: localToday(),
})

const { data: users } = useFindManyCompanyUser(
  computed(() => ({
    where: { companyId: companyId.value, deleted: false },
    orderBy: [{ name: 'asc' }],
    select: { userId: true, name: true, code: true, companyId: true },
  })), { companyScope: 'form' } as any,
)

const userOptions = computed(() =>
  (users.value || []).filter((u: any) => u.companyId === companyScope.companyId.value).map((user: any) => ({
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

let fetchLedgerVersion = 0;
const fetchLedger = async () => {
  const version = ++fetchLedgerVersion;
  loadingLedger.value = true
  ledgerError.value = false
  try {
    const result = await $fetch('/api/users/credit-ledger');
    if (version === fetchLedgerVersion) ledgerRows.value = result
  } catch (error: any) {
    if (version !== fetchLedgerVersion) return
    ledgerError.value = true
    ledgerRows.value = []
    toast.add({ title: 'Failed to load user credit', description: error?.message || 'Something went wrong', color: 'red' })
  } finally {
    if (version === fetchLedgerVersion) loadingLedger.value = false
  }
}

let fetchBillsVersion = 0;
const fetchBills = async () => {
  const version = ++fetchBillsVersion;
  loadingBills.value = true
  billsError.value = false
  try {
    const result = await $fetch('/api/users/credit-bills');
    if (version === fetchBillsVersion) billRows.value = result
  } catch (error: any) {
    if (version !== fetchBillsVersion) return
    billsError.value = true
    billRows.value = []
    toast.add({ title: 'Failed to load credit bills', description: error?.message || 'Something went wrong', color: 'red' })
  } finally {
    if (version === fetchBillsVersion) loadingBills.value = false
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
const creditTypeLabel = (row: any) => row.sourceType === 'PAYROLL' ? 'Payroll deduction' : row.sourceType === 'BILL' ? 'Bill credit' : row.type === 'CREDIT_BILL_PAYMENT' ? 'Repayment received' : 'Money given'
const sourceLabel = (source: string) => (({ MANUAL: 'Manual money movement', BILL: 'Sales bill', PAYROLL: 'Payroll settlement' } as Record<string, string>)[source] || source)
const isCreditPayment = (type: string) => type === 'CREDIT_BILL_PAYMENT'

const resetForm = () => {
  editingCredit.value = null
  form.userId = ''
  form.type = 'CREDIT'
  form.amount = 0
  form.paymentMode = 'CASH'
  form.note = ''
  form.transactionDate = localToday()
}

const openAdd = async () => {
  if (!canManage.value) return
    await companyScope.beginForm();
  resetForm()
  addOpen.value = true
}

const openEditManualCredit = async (row: any) => {
  if (!canManage.value || row.sourceType !== 'MANUAL') return
    await companyScope.beginForm(row?.id ? { model: 'UserLedgerEntry', id: row.id, companyId: row.companyId } : null);
  editingCredit.value = row
  form.userId = row.userId
  form.type = row.type === 'CREDIT_BILL_PAYMENT' ? 'PAYMENT' : 'CREDIT'
  form.amount = Number(row.amount || 0)
  form.paymentMode = row.paymentMode === 'BANK' ? 'BANK' : 'CASH'
  form.note = row.note || ''
  form.transactionDate = row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : localToday()
  addOpen.value = true
}

const saveCredit = async () => {
  if (isSaving.value || companyScope.busy.value || !canManage.value) return
  if (!form.userId || !form.amount || form.amount <= 0) {
    toast.add({ title: 'Select user and amount', color: 'red' })
    return
  }
  isSaving.value = true
  try {
    const body = { ...form, amount: Number(form.amount) }
    if (editingCredit.value) {
      await $fetch(`/api/users/credit-ledger/${editingCredit.value.id}`, {
        method: 'PUT',
        headers: { 'x-company-id': editingCredit.value.companyId },
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

const confirmDelete = (row: any, staff: any) => {
  deleteTarget.value = { ...row, staffName: staff.name || staff.code || row.userId }
  deleteOpen.value = true
}
const deleteManualCredit = async () => {
  if (deleting.value || !canManage.value || !deleteTarget.value) return
  const row = deleteTarget.value
  deleting.value = true
  try {
    await $fetch(`/api/users/credit-ledger/${row.id}`, { method: 'DELETE', headers: { 'x-company-id': row.companyId } })
    deleteOpen.value = false
    toast.add({ title: 'Credit row deleted', color: 'green' })
    await fetchLedger()
  } catch (error: any) {
    toast.add({ title: 'Could not delete credit row', description: error?.data?.statusMessage || error?.message, color: 'red' })
  } finally { deleting.value = false }
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
watch(companyScope.readIds, () => { ledgerRows.value = []; billRows.value = []; expandReset(); void refresh(); });
function expandReset() { ledgerExpand.value = { openedRows: [], row: null }; billsExpand.value = { openedRows: [], row: null }; }
watch(companyScope.companyId, () => { if (!editingCredit.value) form.userId = ''; });
</script>

<template>
  <UDashboardPanelContent>

    <UCard>
      <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-lg font-semibold">Staff credit and repayments</h2>
          <p class="text-sm text-gray-500">Track money given to staff, repayments, bill credit and payroll deductions.</p>
        </div>
        <div class="flex items-center gap-2">
          <div v-if="activeTab === 0 ? !loadingLedger && !ledgerError : !loadingBills && !billsError" class="text-sm font-medium text-orange-600">
            {{ activeTab === 0 ? `Due ${money(totalDue)}` : `Bill credit ${money(totalBillCredit)}` }}
          </div>
          <UButton v-if="canManage" icon="i-heroicons-plus" label="Record money movement" @click="openAdd" />
        </div>
      </div>

      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        
        <CompanyTableFilter />
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

      <UAlert class="mb-4" icon="i-heroicons-information-circle" title="What these balances mean" description="Due is staff credit minus repayments and payroll deductions; it is not salary payable. Negative due means repayments exceed credit. Bill credit shows original credit purchases, not their remaining unpaid balance. Totals follow the current search and company filter." />
      <UAlert v-if="activeTab === 0 ? ledgerError : billsError" class="mb-4" color="red" title="Could not load this ledger" description="Use Refresh to try again before relying on balances." />
      <UTabs v-model="activeTab" :items="tabs" class="mb-4" />

      <UTable row-key="scopeKey"
        v-if="activeTab === 0 && !ledgerError"
        v-model:expand="ledgerExpand"
        :rows="filteredLedgerRows"
        :columns="companyScope.columns(userColumns)"
        :loading="loadingLedger"
        :multiple-expand="false"
      ><template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
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
          <span :class="row.due > 0 ? 'font-semibold text-red-600' : row.due < 0 ? 'font-semibold text-green-600' : 'text-gray-500'">{{ money(row.due) }}</span>
        </template>
        <template #expand="{ row: userRow }">
          <UTable :rows="userRow.transactions" :columns="companyScope.columns(txnColumns)"><template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
            <template #createdAt-data="{ row }">{{ formatDate(row.createdAt) }}</template>
            <template #type-data="{ row }">
              <UBadge :color="isCreditPayment(row.type) ? 'green' : 'orange'" variant="subtle" size="xs">{{ creditTypeLabel(row) }}</UBadge>
            </template>
            <template #sourceType-data="{ row }">
              <span class="text-xs">{{ sourceLabel(row.sourceType) }}</span>
            </template>
            <template #amount-data="{ row }">
              <span :class="isCreditPayment(row.type) ? 'text-green-600' : 'text-orange-600'">{{ isCreditPayment(row.type) ? '-' : '+' }}{{ money(row.amount) }}</span>
            </template>
            <template #note-data="{ row }">{{ row.note || '-' }}</template>
            <template #actions-data="{ row }">
              <div v-if="canManage && row.sourceType === 'MANUAL'" class="flex items-center gap-1">
                <UButton
                  color="gray"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-pencil-square"
                  aria-label="Edit money movement" @click="openEditManualCredit({ ...row, userId: userRow.userId })"
                />
                <UButton
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-trash"
                  aria-label="Delete money movement" @click="confirmDelete(row, userRow)"
                />
              </div>
              <span v-else class="text-xs text-gray-400">{{ row.sourceType === 'MANUAL' ? 'View only' : 'Managed in the source bill or payroll' }}</span>
            </template>
          </UTable>
        </template>
      </UTable>

      <UTable row-key="scopeKey"
        v-else-if="activeTab === 1 && !billsError"
        v-model:expand="billsExpand"
        :rows="filteredBillRows"
        :columns="companyScope.columns(billUserColumns)"
        :loading="loadingBills"
        :multiple-expand="false"
      ><template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
        <template #code-data="{ row }">
          <span class="font-mono text-xs">{{ row.code || '-' }}</span>
        </template>
        <template #pending-data="{ row }">
          <span class="font-semibold text-orange-600">{{ money(row.pending) }}</span>
        </template>
        <template #expand="{ row: userRow }">
          <UTable :rows="userRow.bills" :columns="companyScope.columns(billColumns)"><template #companyId-data="{ row }">{{ companyScope.companyName(row.companyId) }}</template>
            <template #createdAt-data="{ row }">{{ formatDate(row.createdAt) }}</template>
            <template #creditAmount-data="{ row }">{{ money(row.creditAmount) }}</template>
            <template #paymentStatus-data="{ row }">
              <UBadge :color="row.paymentStatus === 'PAID' ? 'green' : 'orange'" variant="subtle" size="xs">{{ row.paymentStatus }}</UBadge>
            </template>
            <template #actions-data="{ row }">
              <UDropdown v-if="canManage" :items="billAction(row)">
                <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
              </UDropdown>
            </template>
          </UTable>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="addOpen" :prevent-close="isSaving">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">{{ editingCredit ? 'Edit money movement' : 'Record money movement' }}</h3>
        </template>
        <div class="space-y-3">
          <CompanyFormField :locked="!!editingCredit || isSaving" />
                    <UFormGroup label="Staff member" required help="The staff member whose credit balance will change. Staff cannot be changed after saving.">
            <USelectMenu v-model="form.userId" :disabled="!!editingCredit || isSaving" :options="userOptions" value-attribute="value" option-attribute="label" searchable />
          </UFormGroup>
          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Movement" help="Money given increases staff debt and reduces cash/bank. Repayment reduces staff debt and increases cash/bank.">
              <USelect v-model="form.type" :options="[
                { label: 'Money given to staff', value: 'CREDIT' },
                { label: 'Repayment received', value: 'PAYMENT' },
              ]" value-attribute="value" option-attribute="label" />
            </UFormGroup>
            <UFormGroup label="Amount" required help="Enter a positive amount with up to two decimal places.">
              <UInput v-model.number="form.amount" type="number" min="0.01" max="999999999" step="0.01" />
            </UFormGroup>
          </div>
          <UFormGroup label="Cash or bank account" help="This movement changes the selected cash or primary bank ledger.">
            <USelect v-model="form.paymentMode" :options="[
              { label: 'Cash', value: 'CASH' },
              { label: 'Primary bank', value: 'BANK' },
            ]" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup label="Transaction date" required help="The date the money actually moved. Backdated edits recalculate balances.">
            <UInput v-model="form.transactionDate" type="date" min="2000-01-01" max="2100-12-31" />
          </UFormGroup>
          <UFormGroup label="Note" help="Explain why money was given or repaid. This form is not for a non-cash debt adjustment.">
            <UTextarea v-model="form.note" :maxlength="1000" autoresize />
          </UFormGroup>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" :disabled="isSaving" @click="addOpen = false" />
            <UButton :loading="isSaving" :disabled="companyScope.busy.value" :label="editingCredit ? 'Update' : 'Save'" @click="saveCredit" />
          </div>
        </template>
      </UCard>
    </UModal>
    <UModal v-model="deleteOpen" :prevent-close="deleting">
      <UCard>
        <template #header><h3 class="font-semibold">Delete this money movement?</h3></template>
        <p class="text-sm">{{ deleteTarget?.staffName }} - {{ money(deleteTarget?.amount) }} on {{ formatDate(deleteTarget?.createdAt) }}.</p>
        <p class="mt-2 text-sm text-gray-500">This removes the staff credit entry and its linked {{ deleteTarget?.paymentMode === 'BANK' ? 'primary bank' : 'cash' }} transaction. {{ deleteTarget?.type === 'CREDIT_BILL_PAYMENT' ? 'Staff debt will increase and the recorded repayment will be removed.' : 'Staff debt will decrease and the recorded money given will be removed.' }} Balances will be recalculated.</p>
        <template #footer><div class="flex justify-end gap-2">
          <UButton label="Keep entry" color="gray" :disabled="deleting" @click="deleteOpen = false" />
          <UButton label="Delete entry and money transaction" color="red" :loading="deleting" @click="deleteManualCredit" />
        </div></template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
