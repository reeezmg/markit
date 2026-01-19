<script setup lang="ts">
const props = defineProps({
  transaction: {
    type: Object,
    required: false,
  },
})

const emit = defineEmits(['save', 'cancel'])
const toast = useToast()

/* ---------------------------------------------------
   FORM INITIALIZATION
--------------------------------------------------- */
const transactionData = computed(() => ({
  date: props.transaction?.createdAt
    ? new Date(props.transaction.createdAt).toLocaleDateString('en-CA')
    : new Date().toLocaleDateString('en-CA'),

  partyType: props.transaction?.partyType || 'CUSTOMER',
  direction: props.transaction?.direction || 'GIVEN',

  amount: props.transaction?.amount || '',
  status: props.transaction?.status || 'PENDING',
  paymentMode: props.transaction?.paymentMode || 'CASH',
  note: props.transaction?.note || '',
}))

const form = ref({ ...transactionData.value })

/* ---------------------------------------------------
   SAVE FORM
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
    ...form.value,
    amount: Number(form.value.amount),
    status: form.value.status.value || form.value.status,
    partyType: form.value.partyType.value || form.value.partyType,
    direction: form.value.direction.value || form.value.direction,
    paymentMode: form.value.paymentMode.value || form.value.paymentMode,
  })
}
</script>
<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- Party Type -->
        <UFormGroup label="Party Type" required>
          <USelectMenu
            v-model="form.partyType"
            :options="[
              { label: 'Customer', value: 'CUSTOMER' },
              { label: 'Supplier', value: 'SUPPLIER' },
              { label: 'Employee', value: 'EMPLOYEE' },
              { label: 'Owner', value: 'OWNER' },
              { label: 'Other', value: 'OTHER' },
            ]"
          />
        </UFormGroup>

        <!-- Direction -->
        <UFormGroup label="Transaction Type" required>
          <USelectMenu
            v-model="form.direction"
            :options="[
              { label: 'Money Given', value: 'GIVEN' },
              { label: 'Money Received', value: 'RECEIVED' },
            ]"
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
            :options="[
              { label: 'Cash', value: 'CASH' },
              { label: 'Bank', value: 'BANK' },
              { label: 'UPI', value: 'UPI' },
              { label: 'Card', value: 'CARD' },
              { label: 'Cheque', value: 'CHEQUE' },
            ]"
          />
        </UFormGroup>

        <!-- Status -->
        <UFormGroup label="Status">
          <USelectMenu
            v-model="form.status"
            :options="[
              { label: 'Pending', value: 'PENDING' },
              { label: 'Paid', value: 'PAID' },
            ]"
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

      <div class="flex justify-end mt-4">
        <UButton color="gray" @click="emit('cancel')">Cancel</UButton>
        <UButton color="primary" class="ml-3" type="submit">
          Save
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>
