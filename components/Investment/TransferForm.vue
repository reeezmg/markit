<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- From Account -->
        <UFormGroup label="From Account" required>
          <USelectMenu
            v-model="form.fromType"
            :options="accountTypes"
          />
        </UFormGroup>

        <!-- To Account -->
        <UFormGroup label="To Account" required>
          <USelectMenu
            v-model="form.toType"
            :options="accountTypes"
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

      </div>

      <!-- Note -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea
          v-model="form.note"
          placeholder="Optional note..."
        />
      </UFormGroup>

      <div class="flex justify-end mt-4">
        <UButton color="gray" @click="emit('cancel')">
          Cancel
        </UButton>
        <UButton color="primary" class="ml-3" type="submit">
          Transfer
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
const emit = defineEmits(['save', 'cancel'])
const toast = useToast()

/* ---------------------------------------------------
   CONSTANTS
--------------------------------------------------- */
const accountTypes = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'Investment', value: 'INVESTMENT' },
]

/* ---------------------------------------------------
   FORM STATE
--------------------------------------------------- */
const form = ref({
  date: new Date().toLocaleDateString('en-CA'),
  fromType:{ label: 'Cash', value: 'CASH' },
  toType:{ label: 'Bank', value: 'BANK' },
  amount: '',
  note: '',
})

/* ---------------------------------------------------
   VALIDATION + SAVE
--------------------------------------------------- */
const saveForm = () => {
  if (form.value.fromType === form.value.toType) {
    toast.add({
      title: 'From and To account cannot be the same',
      color: 'red',
    })
    return
  }

  if (!form.value.amount || Number(form.value.amount) <= 0) {
    toast.add({
      title: 'Please enter valid amount',
      color: 'red',
    })
    return
  }

  emit('save', {
    date: form.value.date,
    fromType: form.value.fromType.value || form.value.fromType,
    toType: form.value.toType.value || form.value.toType,
    amount: Number(form.value.amount),
    note: form.value.note,
  })
}
</script>
