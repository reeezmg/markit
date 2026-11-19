<script setup lang="ts">
import BillingPaymentTerms from '~/components/Billing/PaymentTerms.vue'

const dueDate = defineModel<string>('dueDate')
const terms = defineModel<string>('terms')
const reference = defineModel<string>('reference')
withDefaults(defineProps<{ invoiceDate?: string; disabled?: boolean; showPaymentDetails?: boolean; showDueDate?: boolean; showReference?: boolean }>(), { showPaymentDetails: true, showDueDate: true, showReference: true })
</script>
<template>
  <div class="grid gap-3 border-t border-gray-200 px-3 py-3 dark:border-gray-800 sm:grid-cols-3">
    <UFormGroup v-if="showDueDate" label="Due date" required><UInput v-model="dueDate" type="date" :min="invoiceDate" :disabled="disabled" aria-label="Invoice due date" /></UFormGroup>
    <UFormGroup v-if="showPaymentDetails" label="Payment terms"><BillingPaymentTerms v-model:terms="terms" v-model:due-date="dueDate" :invoice-date="invoiceDate || ''" :disabled="disabled" /></UFormGroup>
    <UFormGroup v-if="showPaymentDetails && showReference" label="Customer reference"><UInput v-model="reference" placeholder="PO or enquiry reference" maxlength="500" :disabled="disabled" aria-label="Invoice customer reference" /></UFormGroup>
  </div>
</template>
