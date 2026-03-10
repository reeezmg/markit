<script setup>
const props = defineProps({
  grandTotal: { type: Number, required: true },
  paymentOptionsInSplit: { type: Array, required: true },
})
const emit = defineEmits(['confirmed'])

const open = defineModel()
const tempSplits = defineModel('tempSplits')

const totalSplitAmount = computed(() =>
  Object.values(tempSplits.value || {}).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
)

const handleAmountEntry = (method) => {
  const entry = tempSplits.value[method]
  // Ensure the entry exists (reactive update was already applied via v-model)
  if (!entry) return
}

const submit = () => {
  if (totalSplitAmount.value !== props.grandTotal) {
    alert(`Total split amount must be exactly ${props.grandTotal}`)
    return
  }
  const splitPayments = Object.values(tempSplits.value)
    .filter(entry => entry.amount)
    .map(entry => ({ method: entry.method, amount: entry.amount }))
  emit('confirmed', splitPayments)
  open.value = false
}
</script>

<template>
  <UModal v-model="open">
    <div class="p-4 space-y-4">
      <h2 class="text-lg font-semibold">Split Payment</h2>

      <div
        v-for="method in paymentOptionsInSplit"
        :key="method"
        class="flex gap-2 items-center"
      >
        <USelect
          v-model="tempSplits[method].method"
          :options="[method]"
          disabled
          class="w-1/2"
        />
        <UInput
          v-model.number="tempSplits[method].amount"
          type="number"
          placeholder="Enter amount"
          class="w-1/2"
          @update:modelValue="() => handleAmountEntry(method)"
        />
      </div>

      <div class="mt-4">
        <p class="text-sm font-medium">Total Entered: ₹{{ totalSplitAmount }}</p>
        <p
          class="text-sm"
          :class="{
            'text-green-600': totalSplitAmount === grandTotal,
            'text-red-600': totalSplitAmount !== grandTotal
          }"
        >
          Grand Total: ₹{{ grandTotal }}
        </p>
      </div>

      <UButton
        :disabled="totalSplitAmount !== grandTotal"
        color="green"
        block
        class="mt-4"
        @click="submit"
      >
        Submit Split Payment
      </UButton>
    </div>
  </UModal>
</template>
