<script setup lang="ts">
const props = defineProps<{ bank?: any }>()
const emit = defineEmits(['save', 'cancel'])

const form = ref({
  bankName: props.bank?.bankName ?? '',
  accHolderName: props.bank?.accHolderName ?? '',
  accountNo: props.bank?.accountNo ?? '',
  ifsc: props.bank?.ifsc ?? '',
  gstin: props.bank?.gstin ?? '',
  upiId: props.bank?.upiId ?? '',
  openingBalance: props.bank?.openingBalance ?? '0',
})

const submit = () => emit('save', form.value)
</script>

<template>
  <UCard>
    <div class="text-lg font-semibold mb-4">
      {{ props.bank ? 'Edit Bank Account' : 'Add Bank Account' }}
    </div>

    <div class="grid grid-cols-1 gap-3">
      <UInput v-model="form.bankName" placeholder="Bank Name" />
      <UInput v-model="form.accHolderName" placeholder="Account Holder Name" />
      <UInput v-model="form.accountNo" placeholder="Account Number" />
      <UInput v-model="form.ifsc" placeholder="IFSC Code" />
      <UInput v-model="form.upiId" placeholder="UPI ID" />
      <UInput v-model="form.gstin" placeholder="GSTIN (optional)" />
      <UInput
        v-model="form.openingBalance"
        type="number"
        placeholder="Opening Balance"
      />
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <UButton color="gray" @click="$emit('cancel')">Cancel</UButton>
      <UButton color="primary" @click="submit">Save</UButton>
    </div>
  </UCard>
</template>
