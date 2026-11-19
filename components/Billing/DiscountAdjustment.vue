<script setup lang="ts">
const discount = defineModel<string | number>('discount', { default: 0 })
const adjustment = defineModel<string | number>('adjustment', { default: 0 })
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ enter: [] }>()
const adjustmentInput = ref<any>(null)
</script>

<template>
  <div class="billing-summary-pair grid grid-cols-2 gap-2">
    <div>
      <label class="block text-gray-700 font-medium">Discount</label>
      <UInput v-model="discount" type="text" inputmode="decimal" aria-label="Bill discount" placeholder="2 or -2" title="2 = 2% off; -2 = ₹2 off" :disabled="disabled" :color="String(discount).includes('+') ? 'red' : undefined" @keydown="$event.key === '+' && $event.preventDefault()" @keydown.enter.prevent="adjustmentInput?.$el?.querySelector('input')?.focus()" />
    </div>
    <div>
      <label class="block text-gray-700 font-medium">Adjustment</label>
      <UInput ref="adjustmentInput" v-model="adjustment" type="text" inputmode="decimal" aria-label="Bill adjustment" placeholder="2 or -2" title="2 adds ₹2; -2 subtracts ₹2" :disabled="disabled" @keydown.enter.prevent="emit('enter')" />
    </div>
  </div>
</template>
