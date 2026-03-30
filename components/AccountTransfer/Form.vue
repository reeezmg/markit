<template>
  <UCard class="p-6">
    <UForm @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- Amount -->
        <UFormGroup label="Amount" required>
          <UInput v-model="form.amount" type="number" />
        </UFormGroup>

        <!-- From Type -->
        <UFormGroup label="From Account" required>
          <USelectMenu
            v-model="form.fromType"
            :options="accountTypes"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

        <!-- From Bank -->
        <UFormGroup v-if="showFromBank" label="From Bank">
          <USelectMenu
            v-model="form.fromBankId"
            :options="bankOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="Select bank"
          />
        </UFormGroup>

        <!-- To Type -->
        <UFormGroup label="To Account" required>
          <USelectMenu
            v-model="form.toType"
            :options="accountTypes"
            option-attribute="label"
            value-attribute="value"
          />
        </UFormGroup>

        <!-- To Bank -->
        <UFormGroup v-if="showToBank" label="To Bank">
          <USelectMenu
            v-model="form.toBankId"
            :options="bankOptions"
            option-attribute="label"
            value-attribute="value"
            placeholder="Select bank"
          />
        </UFormGroup>

      </div>

      <!-- Note -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea v-model="form.note" />
      </UFormGroup>

      <div class="flex justify-end mt-4 gap-2">
        <UButton color="gray" @click="emit('cancel')">Cancel</UButton>
        <UButton color="primary" type="submit" :loading="loading">Save</UButton>
      </div>
    </UForm>
  </UCard>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFindManyBankAccount } from '~/lib/hooks'

const props = defineProps<{ transfer?: any; loading?: boolean }>()
const emit = defineEmits(['save', 'cancel'])
const toast = useToast()
const useAuth = () => useNuxtApp().$auth

/* ---------------------------------------------------
   CONSTANTS
--------------------------------------------------- */
const accountTypes = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'Investment', value: 'INVESTMENT' },
]

/* ---------------------------------------------------
   BANK ACCOUNTS
--------------------------------------------------- */
const { data: banks } = useFindManyBankAccount(() => ({
  where: { companyId: useAuth().session.value?.companyId },
}))

const bankOptions = computed(() => [
  { label: 'Primary', value: '__PRIMARY__' },
  ...(banks.value?.map(b => ({
    label: `${b.bankName} • ${b.accountNo}`,
    value: b.id,
  })) ?? []),
])

/* ---------------------------------------------------
   FORM STATE (NORMALIZED)
--------------------------------------------------- */
const form = ref({
  date: props.transfer
    ? new Date(props.transfer.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10),

  fromType: props.transfer?.fromType ?? 'CASH',
  toType: props.transfer?.toType ?? 'BANK',

  fromBankId: props.transfer?.fromAccountId ?? '__PRIMARY__',
  toBankId: props.transfer?.toAccountId ?? '__PRIMARY__',

  amount: props.transfer?.amount ?? '',
  note: props.transfer?.note ?? '',
})

/* ---------------------------------------------------
   VISIBILITY
--------------------------------------------------- */
const showFromBank = computed(() => form.value.fromType === 'BANK')
const showToBank   = computed(() => form.value.toType   === 'BANK')

/* ---------------------------------------------------
   CLEANUP WHEN TYPE CHANGES
--------------------------------------------------- */
watch(
  () => form.value.fromType,
  v => v !== 'BANK' && (form.value.fromBankId = null)
)

watch(
  () => form.value.toType,
  v => v !== 'BANK' && (form.value.toBankId = null)
)

/* ---------------------------------------------------
   SAVE
--------------------------------------------------- */
const saveForm = () => {


  if (!form.value.amount || Number(form.value.amount) <= 0) {
    toast.add({ title: 'Invalid amount', color: 'red' })
    return
  }

  emit('save', {
    date: form.value.date,
    fromType: form.value.fromType,
    toType: form.value.toType,
    amount: Number(form.value.amount),
    note: form.value.note,

    // ✅ ONLY STRING IDS — '__PRIMARY__' means primary (null)
    ...(form.value.fromType === 'BANK' &&
      form.value.fromBankId &&
      form.value.fromBankId !== '__PRIMARY__' && {
        fromAccountId: form.value.fromBankId,
      }),

    ...(form.value.toType === 'BANK' &&
      form.value.toBankId &&
      form.value.toBankId !== '__PRIMARY__' && {
        toAccountId: form.value.toBankId,
      }),
  })
}
</script>
