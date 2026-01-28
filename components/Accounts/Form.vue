<template>
  <UCard class="p-6">
    <UForm @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- Party Type -->
        <UFormGroup label="Party Type" required>
          <USelectMenu
            v-model="form.partyType"
            :options="partyTypes"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

        <!-- Direction -->
        <UFormGroup label="Transaction Type" required>
          <USelectMenu
            v-model="form.direction"
            :options="directions"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

        <!-- Amount -->
        <UFormGroup label="Amount" required>
          <UInput
            v-model="form.amount"
            type="number"
            placeholder="0.00"
          />
        </UFormGroup>

        <!-- Payment Mode -->
        <UFormGroup label="Payment Mode" required>
          <USelectMenu
            v-model="form.paymentMode"
            :options="paymentModes"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

        <!-- Bank (only when BANK & secondary banks exist) -->
        <UFormGroup
          v-if="showBankSelect"
          label="Bank Account"
        >
          <USelectMenu
            v-model="form.accountId"
            :options="bankOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="Select bank"
          />
        </UFormGroup>

        <!-- Status -->
        <UFormGroup label="Status">
          <USelectMenu
            v-model="form.status"
            :options="statuses"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

      </div>

      <!-- Note -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea
          v-model="form.note"
          placeholder="Optional note..."
        />
      </UFormGroup>

      <div class="flex justify-end mt-4 gap-2">
        <UButton color="gray" @click="emit('cancel')">
          Cancel
        </UButton>
        <UButton color="primary" type="submit">
          Save
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFindManyBankAccount } from '~/lib/hooks'

/* ---------------------------------------------------
   PROPS / EMITS
--------------------------------------------------- */
const props = defineProps<{ transaction?: any }>()
const emit = defineEmits(['save', 'cancel'])
const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   OPTIONS
--------------------------------------------------- */
const partyTypes = [
  { label: 'Customer', value: 'CUSTOMER' },
  { label: 'Supplier', value: 'SUPPLIER' },
  { label: 'Employee', value: 'EMPLOYEE' },
  { label: 'Owner', value: 'OWNER' },
  { label: 'Other', value: 'OTHER' },
]

const directions = [
  { label: 'Money Given', value: 'GIVEN' },
  { label: 'Money Received', value: 'RECEIVED' },
]

const paymentModes = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' },
  { label: 'Cheque', value: 'CHEQUE' },
]

const statuses = [
  { label: 'Paid', value: 'PAID' },
  { label: 'Pending', value: 'PENDING' }
]

/* ---------------------------------------------------
   BANK ACCOUNTS (SECONDARY)
--------------------------------------------------- */
const { data: banks } = useFindManyBankAccount(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const bankOptions = computed(() =>
  banks.value?.map(b => ({
    label: `${b.bankName} • ${b.accountNo}`,
    value: b.id,
  })) ?? []
)

/* ---------------------------------------------------
   FORM STATE (NORMALIZED)
--------------------------------------------------- */
const form = ref({
  date: props.transaction?.createdAt
    ? new Date(props.transaction.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10),

  partyType: props.transaction?.partyType ?? 'CUSTOMER',
  direction: props.transaction?.direction ?? 'GIVEN',
  paymentMode: props.transaction?.paymentMode ?? 'CASH',
  status: props.transaction?.status ?? 'PAID',

  amount: props.transaction?.amount ?? '',
  note: props.transaction?.note ?? '',

  // 🔑 BankAccount ID (only for BANK)
  accountId: props.transaction?.accountId ?? null,
})

/* ---------------------------------------------------
   SHOW / HIDE BANK SELECT
--------------------------------------------------- */
const showBankSelect = computed(
  () =>
    form.value.paymentMode === 'BANK' &&
    bankOptions.value.length > 0
)

/* ---------------------------------------------------
   CLEANUP WHEN PAYMENT MODE CHANGES
--------------------------------------------------- */
watch(
  () => form.value.paymentMode,
  v => {
    if (v !== 'BANK') {
      form.value.accountId = null
    }
  }
)

/* ---------------------------------------------------
   SAVE
--------------------------------------------------- */
const saveForm = () => {
  if (!form.value.amount || Number(form.value.amount) <= 0) {
    toast.add({
      title: 'Please enter valid amount',
      color: 'red',
    })
    return
  }

  emit('save', {
    date: form.value.date,
    partyType: form.value.partyType,
    direction: form.value.direction,
    status: form.value.status,
    paymentMode: form.value.paymentMode,
    amount: Number(form.value.amount),
    note: form.value.note,

    // ✅ only ID or null
    ...(form.value.paymentMode === 'BANK' &&
      form.value.accountId && {
        accountId: form.value.accountId,
      }),
  })
}
</script>
