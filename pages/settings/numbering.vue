<script setup lang="ts">
import { useUpdateCompany } from '~/lib/hooks';
import { startNewYear, updatePrefixes } from '~/auth/composables/auth';

const UpdateCompany = useUpdateCompany({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();

// ── Financial Year ──
const closingDate = ref(useAuth().session.value?.closingDate ? new Date(useAuth().session.value.closingDate).toISOString().split('T')[0] : '');
const newClosingDate = ref('');
const isStartingNewYear = ref(false);
const isNewYearConfirmOpen = ref(false);

const onStartNewYear = async () => {
  if (!newClosingDate.value) {
    toast.add({ title: 'Please select a closing date', color: 'red', icon: 'i-heroicons-x-circle' });
    return;
  }
  isStartingNewYear.value = true;
  try {
    if (!navigator.onLine) {
      throw createError({ statusCode: 0, statusMessage: 'No internet connection' });
    }
    const companyId = useAuth().session.value?.companyId;
    const closingDateValue = new Date(newClosingDate.value).toISOString();

    await $fetch('/api/bill/startNewYear', {
      method: 'POST',
      body: { companyId, closingDate: closingDateValue },
    });

    await startNewYear(closingDateValue);
    closingDate.value = newClosingDate.value;
    isNewYearConfirmOpen.value = false;
    toast.add({ title: 'New financial year started! All counters and numbers have been reset.', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error starting new year', description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isStartingNewYear.value = false;
  }
};

// ── Prefixes ──
const billPrefix = ref(useAuth().session.value?.billPrefix ?? '');
const quotePrefix = ref(useAuth().session.value?.quotePrefix ?? 'QT');
const salesOrderPrefix = ref(useAuth().session.value?.salesOrderPrefix ?? 'SO');
const invoicePrefix = ref(useAuth().session.value?.invoicePrefix ?? 'INV');
const paymentPrefix = ref(useAuth().session.value?.paymentPrefix ?? '');
const expensePrefix = ref(useAuth().session.value?.expensePrefix ?? 'EXP');
const distributorPrefix = ref(useAuth().session.value?.distributorPrefix ?? 'DIST');
const distributorPaymentPrefix = ref(useAuth().session.value?.distributorPaymentPrefix ?? 'DP');
const distributorCreditPrefix = ref(useAuth().session.value?.distributorCreditPrefix ?? 'DC');
const clientPrefix = ref(useAuth().session.value?.clientPrefix ?? 'CL');
const userPrefix = ref(useAuth().session.value?.userPrefix ?? '');
const accountPrefix = ref(useAuth().session.value?.accountPrefix ?? 'ACC');
const isUpdatingPrefixes = ref(false);

const isPrefixChanged = computed(() =>
  billPrefix.value !== (useAuth().session.value?.billPrefix ?? '') ||
  quotePrefix.value !== (useAuth().session.value?.quotePrefix ?? 'QT') ||
  salesOrderPrefix.value !== (useAuth().session.value?.salesOrderPrefix ?? 'SO') ||
  invoicePrefix.value !== (useAuth().session.value?.invoicePrefix ?? 'INV') ||
  paymentPrefix.value !== (useAuth().session.value?.paymentPrefix ?? '') ||
  expensePrefix.value !== (useAuth().session.value?.expensePrefix ?? 'EXP') ||
  distributorPrefix.value !== (useAuth().session.value?.distributorPrefix ?? 'DIST') ||
  distributorPaymentPrefix.value !== (useAuth().session.value?.distributorPaymentPrefix ?? 'DP') ||
  distributorCreditPrefix.value !== (useAuth().session.value?.distributorCreditPrefix ?? 'DC') ||
  clientPrefix.value !== (useAuth().session.value?.clientPrefix ?? 'CL') ||
  userPrefix.value !== (useAuth().session.value?.userPrefix ?? '') ||
  accountPrefix.value !== (useAuth().session.value?.accountPrefix ?? 'ACC')
);

const prefixItems = computed(() => [
  { key: 'bill', label: 'Bill', model: billPrefix, example: billPrefix.value ? `${billPrefix.value}-00001` : '1' },
  { key: 'quote', label: 'Quote', model: quotePrefix, example: quotePrefix.value ? `${quotePrefix.value}-000001` : '1' },
  { key: 'salesOrder', label: 'Sales Order', model: salesOrderPrefix, example: salesOrderPrefix.value ? `${salesOrderPrefix.value}-00001` : '1' },
  { key: 'invoice', label: 'Invoice', model: invoicePrefix, example: invoicePrefix.value ? `${invoicePrefix.value}-000001` : '1' },
  { key: 'payment', label: 'Payment', model: paymentPrefix, example: paymentPrefix.value ? `${paymentPrefix.value}-00001` : '1' },
  { key: 'expense', label: 'Expense', model: expensePrefix, example: expensePrefix.value ? `${expensePrefix.value}-00001` : '1' },
  { key: 'distributor', label: 'Distributor', model: distributorPrefix, example: distributorPrefix.value ? `${distributorPrefix.value}-00001` : '1' },
  { key: 'distributorPayment', label: 'Distributor Payment', model: distributorPaymentPrefix, example: distributorPaymentPrefix.value ? `${distributorPaymentPrefix.value}-00001` : '1' },
  { key: 'distributorCredit', label: 'Distributor Credit', model: distributorCreditPrefix, example: distributorCreditPrefix.value ? `${distributorCreditPrefix.value}-00001` : '1' },
  { key: 'client', label: 'Client', model: clientPrefix, example: clientPrefix.value ? `${clientPrefix.value}-00001` : '1' },
  { key: 'user', label: 'User', model: userPrefix, example: userPrefix.value ? `${userPrefix.value}-00001` : '1' },
  { key: 'account', label: 'Account', model: accountPrefix, example: accountPrefix.value ? `${accountPrefix.value}-00001` : '1' },
]);

const onPrefixSave = async () => {
  isUpdatingPrefixes.value = true;
  try {
    if (!navigator.onLine) {
      throw createError({ statusCode: 0, statusMessage: 'No internet connection' });
    }
    const companyId = useAuth().session.value?.companyId;
    const prefixData = {
      billPrefix: billPrefix.value,
      quotePrefix: quotePrefix.value,
      salesOrderPrefix: salesOrderPrefix.value,
      invoicePrefix: invoicePrefix.value,
      paymentPrefix: paymentPrefix.value,
      expensePrefix: expensePrefix.value,
      distributorPrefix: distributorPrefix.value,
      distributorPaymentPrefix: distributorPaymentPrefix.value,
      distributorCreditPrefix: distributorCreditPrefix.value,
      clientPrefix: clientPrefix.value,
      userPrefix: userPrefix.value,
      accountPrefix: accountPrefix.value,
    };

    UpdateCompany.mutate({
      where: { id: companyId },
      data: prefixData,
    });

    await updatePrefixes(prefixData);
    toast.add({ title: 'Prefixes updated', icon: 'i-heroicons-check-circle' });
  } catch (error) {
    toast.add({ title: 'Error updating prefixes', description: error.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' });
  } finally {
    isUpdatingPrefixes.value = false;
  }
};
</script>

<template>
  <UDashboardPanelContent class="pb-24">

    <!-- ========== NUMBER PREFIXES ========== -->
    <div class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Number Prefixes</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Set a prefix for each document type. Leave empty for plain numbers. The prefix will appear before the number (e.g. INV-000001).</p>

      <div class="space-y-4">
        <div
          v-for="item in prefixItems"
          :key="item.key"
          class="grid grid-cols-2 gap-4 items-center"
        >
          <UFormGroup
            :name="item.key + 'Prefix'"
            :label="item.label + ' Prefix'"
            :ui="{ container: '' }"
          >
            <UInput
              :model-value="item.model.value"
              @update:model-value="item.model.value = $event"
              type="text"
              size="md"
              :placeholder="`e.g. ${item.label.substring(0, 3).toUpperCase()}`"
            />
          </UFormGroup>
          <div class="text-sm text-gray-500 dark:text-gray-400 pt-5">
            Preview: <span class="font-mono font-medium text-gray-700 dark:text-gray-300">{{ item.example }}</span>
          </div>
        </div>
      </div>

      <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
          <UButton
            label="Save Prefixes"
            size="md"
            :loading="isUpdatingPrefixes"
            :disabled="!isPrefixChanged"
            @click="onPrefixSave"
          />
        </div>
      </div>
    </div>

    <!-- ========== FINANCIAL YEAR ========== -->
    <div class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Financial Year</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Start a new financial year by setting a closing date. All counters (Bill, Quote, Sales Order, Invoice, Payment) will reset to 1. Existing documents after the closing date will be renumbered. Reports and searches will show data from after the closing date.</p>

      <div v-if="closingDate" class="mb-4 flex items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-blue-500 shrink-0" />
        <span class="text-sm font-medium text-blue-800 dark:text-blue-300">
          Current closing date: {{ new Date(closingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) }}
        </span>
      </div>

      <UFormGroup
        name="closingDate"
        label="New Closing Date"
        description="Bills, invoices, and reports after this date will start the new financial year."
        class="grid grid-cols-2 gap-2 mb-4"
        :ui="{ container: '' }"
      >
        <UInput v-model="newClosingDate" type="date" size="md" />
      </UFormGroup>

      <div class="my-4 grid grid-cols-2 gap-2">
        <div></div>
        <div>
          <UButton
            label="Start New Year"
            color="red"
            size="md"
            icon="i-heroicons-arrow-path"
            :disabled="!newClosingDate"
            @click="isNewYearConfirmOpen = true"
          />
        </div>
      </div>

      <UModal v-model="isNewYearConfirmOpen">
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Confirm New Financial Year</h3>
          </template>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Are you sure you want to start a new financial year?
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
            <strong>Closing date:</strong> {{ new Date(newClosingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) }}
          </p>
          <p class="text-sm text-red-600 dark:text-red-400 font-medium">
            This will reset all counters (Bill, Quote, Sales Order, Invoice, Payment) to 1 and renumber existing documents after this date.
          </p>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton label="Cancel" color="gray" variant="ghost" @click="isNewYearConfirmOpen = false" />
              <UButton
                label="Confirm & Start New Year"
                color="red"
                :loading="isStartingNewYear"
                @click="onStartNewYear"
              />
            </div>
          </template>
        </UCard>
      </UModal>
    </div>

  </UDashboardPanelContent>
</template>
