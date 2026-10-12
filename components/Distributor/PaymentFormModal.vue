<script setup lang="ts">
import { purchaseOrderDue } from '~/utils/purchase-order-payments'
import { useFindManyDistributorCompany } from '~/lib/company-hooks/distributor-company'

const props = defineProps<{
  modelValue: boolean
  payment?: any
  companyId?: string
  distributorId?: string
  purchaseOrderId?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const companyScope = useCompanyScope('form')
const $fetch = companyScope.fetch
const toast = useToast()
const saving = ref(false)
const paymentId = computed(() => props.payment?.id || '')
const form = ref({ distributorId: '', purchaseOrderIds: [] as string[], amount: null as number | null,
  paymentType: 'CASH', remarks: '', date: new Date().toISOString().slice(0, 10) })
const allocationAmounts = ref<Record<string, number>>({})
const accountingAccounts = ref<Record<string, string>>({})
const money = (amount: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(amount || 0))

const { data: distributorCompanies, refetch: refetchDistributors } = useFindManyDistributorCompany(computed(() => ({
  where: { companyId: companyScope.companyId.value },
  select: {
    distributorId: true,
    distributor: { select: { name: true } },
    purchaseOrders: {
      select: { id: true, purchaseOrderNo: true, billNo: true, totalAmount: true, dueCleared: true,
        distributorPayment: { select: { id: true, amount: true } },
        paymentAllocations: { select: { amount: true, payment: { select: { id: true } } } },
      },
      orderBy: { createdAt: 'desc' as const },
    },
  },
  orderBy: { distributor: { name: 'asc' as const } },
})), { companyScope: 'form' } as any)

const distributorOptions = computed(() => (distributorCompanies.value || []).map((dc: any) => ({
  label: dc.distributor?.name || '-', value: dc.distributorId,
})))
const purchaseOrders = computed(() => {
  const supplier = (distributorCompanies.value || []).find((dc: any) => dc.distributorId === form.value.distributorId)
  return (supplier?.purchaseOrders || []).map((po: any) => ({
    ...po, due: Math.max(0, purchaseOrderDue(po, paymentId.value || undefined)),
  }))
})
const purchaseOrderOptions = computed(() => purchaseOrders.value
  .filter((po: any) => po.due > 0 || form.value.purchaseOrderIds.includes(po.id))
  .map((po: any) => ({ label: `PO#${po.purchaseOrderNo ?? '-'}${po.billNo ? ` / ${po.billNo}` : ''} · Due ${money(po.due)}`, value: po.id })))
const selectedOrders = computed(() => form.value.purchaseOrderIds.map(id => purchaseOrders.value.find((po: any) => po.id === id)).filter(Boolean))
const allocations = computed(() => form.value.purchaseOrderIds.map(purchaseOrderId => ({ purchaseOrderId, amount: Number(allocationAmounts.value[purchaseOrderId] || 0) })))
const allocatedTotal = computed(() => allocations.value.reduce((sum, part) => sum + Math.round(part.amount * 100), 0) / 100)

function allocatePayment() {
  let remaining = Math.round(Number(form.value.amount || 0) * 100)
  allocationAmounts.value = Object.fromEntries(selectedOrders.value.map((po: any) => {
    const amount = Math.min(remaining, Math.round(po.due * 100))
    remaining -= amount
    return [po.id, amount / 100]
  }))
}

watch(() => form.value.purchaseOrderIds, allocatePayment)
watch(() => [props.modelValue, props.payment?.id, props.companyId, props.distributorId, props.purchaseOrderId], async () => {
  if (!props.modelValue) return
  try {
    const owner = props.payment?.companyId || props.companyId || companyScope.auth.session.value?.companyId
    await companyScope.beginForm(props.payment
      ? { model: 'DistributorPayment', id: props.payment.id, companyId: owner }
      : null)
    if (owner) await companyScope.selectOwner(owner)
    accountingAccounts.value = {}
    form.value = {
      distributorId: props.payment?.distributorId || props.distributorId || '',
      purchaseOrderIds: props.payment?.allocations?.length
        ? props.payment.allocations.map((a: any) => a.purchaseOrderId)
        : props.payment?.purchaseOrderId ? [props.payment.purchaseOrderId] : props.purchaseOrderId ? [props.purchaseOrderId] : [],
      amount: props.payment?.amount != null ? Number(props.payment.amount) : null,
      paymentType: props.payment?.paymentType || 'CASH',
      remarks: props.payment?.remarks || '',
      date: props.payment?.createdAt ? new Date(props.payment.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    }
    await refetchDistributors()
    await nextTick()
    allocationAmounts.value = props.payment?.allocations?.length
      ? Object.fromEntries(props.payment.allocations.map((a: any) => [a.purchaseOrderId, Number(a.amount)]))
      : props.payment?.purchaseOrderId ? { [props.payment.purchaseOrderId]: Number(props.payment.amount) } : {}
  } catch (error: any) {
    toast.add({ title: 'Could not load payment', description: error?.message, color: 'red' })
    open.value = false
  }
}, { immediate: true })

function selectDistributor(id: string) {
  form.value.distributorId = id
  form.value.purchaseOrderIds = []
}

async function save() {
  if (!form.value.distributorId || !Number(form.value.amount) || Number(form.value.amount) <= 0) {
    toast.add({ title: 'Select a distributor and enter a valid amount', color: 'red' }); return
  }
  if (allocations.value.length && (allocations.value.some(a => a.amount <= 0) ||
    Math.round(allocatedTotal.value * 100) !== Math.round(Number(form.value.amount) * 100))) {
    toast.add({ title: 'Allocate the payment total across the selected orders', color: 'red' }); return
  }
  saving.value = true
  try {
    const body = {
      companyId: companyScope.companyId.value,
      distributorId: form.value.distributorId,
      amount: Number(form.value.amount),
      paymentType: form.value.paymentType,
      remarks: form.value.remarks || null,
      billNo: props.payment?.billNo || null,
      purchaseOrderId: form.value.purchaseOrderIds[0] || null,
      allocations: allocations.value,
      createdAt: new Date(form.value.date),
      accountingAccounts: accountingAccounts.value,
    }
    if (paymentId.value) {
      await $fetch(`/api/distributor/payments/${paymentId.value}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/distributor/payments', { method: 'POST', body: { ...body, createExpense: true } })
    }
    toast.add({ title: paymentId.value ? 'Payment updated' : 'Payment added', color: 'green' })
    open.value = false
    emit('saved')
  } catch (error: any) {
    toast.add({ title: 'Payment failed', description: error?.data?.statusMessage || error?.message, color: 'red' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model="open">
    <UCard>
      <template #header><div class="text-base font-semibold">{{ paymentId ? 'Edit Payment' : 'New Payment' }}</div></template>
      <div class="space-y-4">
        <CompanyFormField @transferred="open = false" />
        <UFormGroup label="Distributor" required>
          <USelectMenu :model-value="form.distributorId" :options="distributorOptions" option-attribute="label"
            value-attribute="value" placeholder="Select distributor" searchable searchable-placeholder="Search distributor..."
            :disabled="!!paymentId" @update:model-value="selectDistributor" />
        </UFormGroup>
        <DistributorAccountSelection v-if="form.distributorId" v-model="accountingAccounts"
          :company-id="companyScope.companyId.value" :distributor-id="form.distributorId"
          :source-key="paymentId ? `payment:${paymentId}` : undefined"
          :roles="['payable', form.paymentType === 'CASH' ? 'cash' : 'bank']" />
        <UFormGroup label="Purchase Orders">
          <USelectMenu v-model="form.purchaseOrderIds" multiple :options="purchaseOrderOptions" option-attribute="label"
            value-attribute="value" :placeholder="form.distributorId ? 'Select purchase orders (optional)' : 'Select distributor first'"
            searchable searchable-placeholder="Search purchase order..." :disabled="!form.distributorId" />
        </UFormGroup>
        <div v-if="selectedOrders.length" class="space-y-3 rounded-md border p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">Amount per purchase order</span>
            <UButton color="gray" variant="soft" @click="allocatePayment">Allocate payment amount</UButton>
          </div>
          <UFormGroup v-for="po in selectedOrders" :key="po.id" :label="`PO#${po.purchaseOrderNo} · Due ${money(po.due)}`">
            <UInput v-model.number="allocationAmounts[po.id]" type="number" min="0.01" step="0.01" :max="po.due" />
          </UFormGroup>
          <p class="text-sm">Allocated: {{ money(allocatedTotal) }} / {{ money(form.amount) }}</p>
        </div>
        <UFormGroup label="Payment Date"><UInput v-model="form.date" type="date" /></UFormGroup>
        <UFormGroup label="Amount" required><UInput v-model.number="form.amount" type="number" min="0.01" step="0.01" /></UFormGroup>
        <UFormGroup label="Payment Type">
          <USelect v-model="form.paymentType" :options="[
            { label: 'Cash', value: 'CASH' }, { label: 'Bank', value: 'BANK' }, { label: 'UPI', value: 'UPI' },
            { label: 'Card', value: 'CARD' }, { label: 'Cheque', value: 'CHEQUE' },
          ]" option-attribute="label" value-attribute="value" />
        </UFormGroup>
        <UFormGroup label="Remarks"><UInput v-model="form.remarks" placeholder="Optional remarks" /></UFormGroup>
      </div>
      <template #footer><div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="open = false">Cancel</UButton>
        <UButton color="primary" :loading="saving" @click="save">{{ paymentId ? 'Save' : 'Submit' }}</UButton>
      </div></template>
    </UCard>
  </UModal>
</template>
