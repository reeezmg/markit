<script setup lang="ts">
import { useFindUniqueStatementBatch, useUpdateStatementBatch } from '~/lib/hooks/statement-batch'
import { useUpdateStatementRow, useDeleteStatementRow } from '~/lib/hooks/statement-row'
import { useFindManyBankAccount } from '~/lib/hooks/bank-account'
import { useFindUniqueCompany } from '~/lib/hooks'

definePageMeta({ auth: true })

const route = useRoute()
const toast = useToast()
const useAuth = () => useNuxtApp().$auth
const companyId = computed(() => useAuth().session.value?.companyId)
const batchId = computed(() => route.params.id as string)

// ─── Fetch batch + rows ───
const { data: batch, isLoading, refetch } = useFindUniqueStatementBatch({
  where: { id: batchId.value },
  include: {
    rows: { orderBy: { sno: 'asc' } },
  },
})

// ─── Bank account select ───
const { data: company } = useFindUniqueCompany({
  where: { id: companyId.value },
  select: { id: true, bankName: true, accountNo: true },
})
const { data: secondaryBanks } = useFindManyBankAccount({
  where: { companyId: companyId.value },
  select: { id: true, bankName: true, accountNo: true },
})

const bankOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = []
  if (company.value?.bankName) {
    opts.push({ label: `${company.value.bankName}${company.value.accountNo ? ' (' + company.value.accountNo + ')' : ''} — Primary`, value: 'PRIMARY' })
  }
  for (const b of secondaryBanks.value ?? []) {
    opts.push({ label: `${b.bankName || 'Bank'}${b.accountNo ? ' (' + b.accountNo + ')' : ''}`, value: b.id })
  }
  return opts
})

const selectedBankId = ref<string>('')
const updateBatch = useUpdateStatementBatch()

// Auto-fill from query param or batch data
watch([batch, () => route.query.bankAccountId], () => {
  if (selectedBankId.value) return
  if (batch.value?.bankAccountId) {
    selectedBankId.value = batch.value.bankAccountId
  } else if (route.query.bankAccountId) {
    selectedBankId.value = route.query.bankAccountId as string
  }
}, { immediate: true })

async function saveBankAccount() {
  if (!selectedBankId.value) return
  try {
    await updateBatch.mutateAsync({
      where: { id: batchId.value },
      data: { bankAccountId: selectedBankId.value === 'PRIMARY' ? null : selectedBankId.value },
    })
    toast.add({ title: 'Bank account saved', color: 'green' })
  } catch (err: any) {
    toast.add({ title: 'Error saving bank', color: 'red', description: err.message })
  }
}

watch(selectedBankId, (val) => {
  if (val && batch.value) saveBankAccount()
})

const rows = computed(() => batch.value?.rows ?? [])

// ─── Stats ───
const totalRows = computed(() => rows.value.length)
const matchedRows = computed(() => rows.value.filter(r => r.operation).length)
const unmatchedRows = computed(() => rows.value.filter(r => !r.operation).length)
const executedRows = computed(() => rows.value.filter(r => r.executed).length)
const assignedNotExecuted = computed(() => rows.value.filter(r => r.operation && !r.executed).length)
const allAssigned = computed(() => totalRows.value > 0 && unmatchedRows.value === 0)

// ─── User inputs for rows ───
const userInputs = ref<Record<string, string>>({})
const findingRow = ref<Record<string, boolean>>({})
const executingRow = ref<Record<string, boolean>>({})
const executingAll = ref(false)
const editingRow = ref<string | null>(null)
const rowErrors = ref<Record<string, string>>({})

// ─── Columns ───
const columns = [
  { key: 'sno', label: 'S.No' },
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'operation', label: 'Operation' },
  { key: 'error', label: 'Status' },
  { key: 'actions', label: '' },
]

// ─── Format currency ───
const fmt = (val: number | null | undefined) => {
  if (val == null || val === 0) return ''
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Validate bank selected ───
function requireBank(): boolean {
  if (!selectedBankId.value) {
    toast.add({ title: 'Please select a bank account first', color: 'red' })
    return false
  }
  return true
}

// ─── Assign operation for a row (AI classify) ───
async function findOperation(rowId: string) {
  const input = userInputs.value[rowId]?.trim()
  if (!input) {
    toast.add({ title: 'Please enter an operation', color: 'red' })
    return
  }
  if (!requireBank()) return

  findingRow.value[rowId] = true
  try {
    const result = await $fetch('/api/statement/find-operation', {
      method: 'POST',
      body: { rowId, userInput: input, bankAccountId: selectedBankId.value },
    })
    toast.add({ title: `Assigned: ${result.operationLabel}`, color: 'green' })
    userInputs.value[rowId] = ''
    editingRow.value = null
    delete rowErrors.value[rowId]
    await refetch()
  } catch (err: any) {
    const msg = err.data?.statusMessage || err.message
    rowErrors.value[rowId] = msg
    toast.add({ title: 'Error', color: 'red', description: msg })
  } finally {
    findingRow.value[rowId] = false
  }
}

// ─── Execute a single row ───
async function executeRow(rowId: string) {
  if (!requireBank()) return

  executingRow.value[rowId] = true
  try {
    const result = await $fetch('/api/statement/execute-row', {
      method: 'POST',
      body: { rowId, bankAccountId: selectedBankId.value },
    })
    toast.add({ title: 'Row executed', color: 'green' })
    delete rowErrors.value[rowId]
    await refetch()
  } catch (err: any) {
    const msg = err.data?.statusMessage || err.message
    rowErrors.value[rowId] = msg
    toast.add({ title: 'Execution failed', color: 'red', description: msg })
  } finally {
    executingRow.value[rowId] = false
  }
}

// ─── Edit operation (click edit on executed/assigned row) ───
function startEdit(rowId: string, savedUserInput?: string | null) {
  editingRow.value = rowId
  userInputs.value[rowId] = savedUserInput || ''
}

function cancelEdit() {
  if (editingRow.value) {
    userInputs.value[editingRow.value] = ''
  }
  editingRow.value = null
}

// ─── Execute all assigned rows ───
async function executeAll() {
  if (!assignedNotExecuted.value) return
  if (!requireBank()) return

  executingAll.value = true
  try {
    const result = await $fetch('/api/statement/execute', {
      method: 'POST',
      body: { batchId: batchId.value, bankAccountId: selectedBankId.value },
    })
    // Map errors back to row IDs
    if (result.errors > 0) {
      for (const r of result.results) {
        if (r.status === 'error') {
          const matchRow = rows.value.find(row => row.sno === r.sno)
          if (matchRow) rowErrors.value[matchRow.id] = r.error || 'Unknown error'
        }
      }
      const errDetails = result.results.filter((r: any) => r.status === 'error').map((r: any) => `Row ${r.sno}: ${r.error}`).join('\n')
      toast.add({ title: `${result.executed} executed, ${result.errors} error(s)`, description: errDetails, color: 'orange' })
    } else {
      toast.add({ title: result.summary, color: 'green' })
    }
    await refetch()
  } catch (err: any) {
    toast.add({ title: 'Execution failed', color: 'red', description: err.data?.statusMessage || err.message })
  } finally {
    executingAll.value = false
  }
}

// ─── Ignore a row (direct update, no AI) ───
const updateRow = useUpdateStatementRow()
async function ignoreRow(rowId: string) {
  findingRow.value[rowId] = true
  try {
    await updateRow.mutateAsync({
      where: { id: rowId },
      data: { operation: 'IGNORE', operationLabel: 'Ignore', operationMeta: {}, userInput: 'ignore', executed: false, executionResult: null as any },
    })
    toast.add({ title: 'Marked as Ignore', color: 'gray' })
    delete rowErrors.value[rowId]
    await refetch()
  } catch (err: any) {
    toast.add({ title: 'Error', color: 'red', description: err.message })
  } finally {
    findingRow.value[rowId] = false
  }
}

// ─── Remove a row ───
const deleteRow = useDeleteStatementRow()
const removingRow = ref<Record<string, boolean>>({})
async function removeRow(rowId: string) {
  removingRow.value[rowId] = true
  try {
    await deleteRow.mutateAsync({ where: { id: rowId } })
    toast.add({ title: 'Row removed', color: 'green' })
    delete rowErrors.value[rowId]
    await refetch()
  } catch (err: any) {
    toast.add({ title: 'Error removing row', color: 'red', description: err.message })
  } finally {
    removingRow.value[rowId] = false
  }
}

// ─── Operation badge color ───
function opColor(operation: string | null): string {
  switch (operation) {
    case 'EXPENSE': return 'red'
    case 'TRANSFER': return 'blue'
    case 'TRANSACTION': return 'purple'
    case 'DISTRIBUTOR_PAYMENT': return 'orange'
    case 'INVESTMENT': return 'teal'
    case 'IGNORE': return 'gray'
    default: return 'gray'
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Bank Statement Processing">
        <template #right>
          <UButton
            v-if="assignedNotExecuted > 0"
            label="Execute All"
            icon="i-heroicons-play"
            color="primary"
            :disabled="executingAll"
            :loading="executingAll"
            @click="executeAll"
          />
          <UBadge v-if="executedRows > 0 && assignedNotExecuted === 0 && unmatchedRows === 0" color="green" variant="subtle" size="lg">
            <UIcon name="i-heroicons-check-circle" class="mr-1" /> All Executed
          </UBadge>
        </template>
      </UDashboardNavbar>

      <div class="p-4 space-y-4 overflow-auto h-[calc(100vh-64px)]">
        <!-- Stats bar -->
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <div v-if="batch?.sourceFileName" class="text-gray-500">
            <UIcon name="i-heroicons-document" class="inline mr-1" />
            {{ batch.sourceFileName }}
          </div>
          <UBadge color="gray" variant="subtle">{{ totalRows }} rows</UBadge>
          <UBadge color="green" variant="subtle">{{ executedRows }} executed</UBadge>
          <UBadge v-if="assignedNotExecuted > 0" color="blue" variant="subtle">{{ assignedNotExecuted }} assigned</UBadge>
          <UBadge v-if="unmatchedRows > 0" color="yellow" variant="subtle">{{ unmatchedRows }} unmatched</UBadge>

          <div class="ml-auto flex items-center gap-2">
            <span class="text-xs text-gray-500">Bank Account:</span>
            <USelectMenu
              v-model="selectedBankId"
              :options="bankOptions"
              value-attribute="value"
              option-attribute="label"
              placeholder="Select bank account"
              size="sm"
              class="w-64"
            />
          </div>
        </div>

        <!-- Help text -->
        <div v-if="unmatchedRows > 0" class="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          For unmatched rows, type an operation and click <strong>Assign</strong>. Examples:
          <code class="mx-1">expense rent</code>,
          <code class="mx-1">transfer cash</code>,
          <code class="mx-1">distributor XYZ Traders</code>,
          <code class="mx-1">investment in Partner</code>,
          <code class="mx-1">transaction supplier</code>,
          <code class="mx-1">ignore</code>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-16">
          <UIcon name="i-heroicons-arrow-path" class="animate-spin text-2xl text-gray-400" />
          <span class="ml-2 text-gray-500">Loading statement...</span>
        </div>

        <!-- Table -->
        <UTable
          v-else
          :rows="rows"
          :columns="columns"
          :ui="{
            td: { base: 'whitespace-nowrap' },
          }"
        >
          <template #sno-data="{ row }">
            <span class="font-mono text-xs">{{ row.sno }}</span>
          </template>

          <template #date-data="{ row }">
            <span class="text-xs">{{ row.date }}</span>
          </template>

          <template #description-data="{ row }">
            <span class="text-xs max-w-[400px] whitespace-normal break-words block">
              {{ row.description }}
            </span>
          </template>

          <template #debit-data="{ row }">
            <span v-if="row.debit" class="text-red-600 text-xs font-medium">{{ fmt(row.debit) }}</span>
          </template>

          <template #credit-data="{ row }">
            <span v-if="row.credit" class="text-green-600 text-xs font-medium">{{ fmt(row.credit) }}</span>
          </template>

          <template #operation-data="{ row }">
            <!-- STATE 4: Editing (executed or assigned row being re-assigned) -->
            <div v-if="editingRow === row.id" class="flex items-center gap-1">
              <UInput
                v-model="userInputs[row.id]"
                placeholder="New operation..."
                size="xs"
                class="w-64"
                @keyup.enter="findOperation(row.id)"
                @keyup.escape="cancelEdit()"
              />
              <UButton
                label="Assign"
                size="xs"
                color="primary"
                variant="soft"
                :loading="findingRow[row.id]"
                @click="findOperation(row.id)"
              />
              <UButton
                icon="i-heroicons-x-mark"
                size="xs"
                color="gray"
                variant="ghost"
                @click="cancelEdit()"
              />
            </div>

            <!-- STATE 3: Executed — badge + edit icon -->
            <div v-else-if="row.executed" class="flex items-center gap-1">
              <UBadge :color="opColor(row.operation)" variant="subtle" size="xs">
                {{ row.operationLabel || row.operation }}
              </UBadge>
              <UButton
                icon="i-heroicons-pencil-square"
                size="xs"
                color="gray"
                variant="ghost"
                @click="startEdit(row.id, row.userInput)"
              />
            </div>

            <!-- STATE 2: Assigned but not executed — badge + edit icon + Execute button -->
            <div v-else-if="row.operation" class="flex items-center gap-1">
              <UBadge :color="opColor(row.operation)" variant="subtle" size="xs">
                {{ row.operationLabel || row.operation }}
              </UBadge>
              <UButton
                icon="i-heroicons-pencil-square"
                size="xs"
                color="gray"
                variant="ghost"
                @click="startEdit(row.id, row.userInput)"
              />
              <UButton
                label="Execute"
                size="xs"
                color="green"
                variant="soft"
                :loading="executingRow[row.id]"
                @click="executeRow(row.id)"
              />
            </div>

            <!-- STATE 1: Unmatched — input + Assign button + Ignore button -->
            <div v-else class="flex items-center gap-1">
              <UInput
                v-model="userInputs[row.id]"
                placeholder="e.g. expense rent"
                size="xs"
                class="w-64"
                @keyup.enter="findOperation(row.id)"
              />
              <UButton
                label="Assign"
                size="xs"
                color="primary"
                variant="soft"
                :loading="findingRow[row.id]"
                @click="findOperation(row.id)"
              />
              <UButton
                label="Ignore"
                size="xs"
                color="gray"
                variant="soft"
                :loading="findingRow[row.id]"
                @click="ignoreRow(row.id)"
              />
            </div>
          </template>

          <template #actions-data="{ row }">
            <UButton
              icon="i-heroicons-trash"
              size="xs"
              color="red"
              variant="ghost"
              :loading="removingRow[row.id]"
              @click="removeRow(row.id)"
            />
          </template>

          <template #error-data="{ row }">
            <div v-if="rowErrors[row.id]" class="flex items-center gap-1 max-w-[250px]">
              <UIcon name="i-heroicons-exclamation-triangle" class="text-red-500 shrink-0" />
              <span class="text-xs text-red-600 truncate" :title="rowErrors[row.id]">{{ rowErrors[row.id] }}</span>
              <UButton
                icon="i-heroicons-x-mark"
                size="2xs"
                color="gray"
                variant="ghost"
                @click="delete rowErrors[row.id]"
              />
            </div>
            <div v-else-if="row.executed">
              <UIcon name="i-heroicons-check-circle" class="text-green-500" />
            </div>
          </template>
        </UTable>
      </div>
    </UDashboardPanel>
  </UDashboardPage>
</template>
