<script setup lang="ts">
const props = defineProps({
    expense: {
        type: Object,
        required: false
    },
    loading: {
        type: Boolean,
        default: false,
    },
    submitLabel: {
        type: String,
        default: 'Save',
    },
});

const emit = defineEmits(['save', 'cancel']);
const toast = useToast();

const {
    categories,
    companyUsers,
    categoriesLoading: isLoading,
    loadCategories,
    loadCompanyUsers,
    createCategory,
    deleteCategory,
} = useExpenseFormOptions();

/* ---------------------------------------------------
   FORM INITIALIZATION
--------------------------------------------------- */

const expenseData = computed(() => ({
  date: props.expense?.createdAt
    ? new Date(props.expense.createdAt).toLocaleDateString('en-CA')
    : new Date().toLocaleDateString('en-CA'),

  category: props.expense?.expensecategory || null,
  user: props.expense?.user || null,

  amount: props.expense?.totalAmount || '',
  status: props.expense?.status
  ? {
      label:
        props.expense.status.charAt(0).toUpperCase() +
        props.expense.status.slice(1).toLowerCase(),
      value: props.expense.status,
    }
  : { label: 'Paid', value: 'Paid' },
  paymentMode: props.expense?.paymentMode ?
  {
      label:
        props.expense.paymentMode.charAt(0).toUpperCase() +
        props.expense.paymentMode.slice(1).toLowerCase(),
      value: props.expense.paymentMode,
  }:
  { label: 'Cash', value: 'CASH' },
  note: props.expense?.note || '',
}));

const form = ref({ ...expenseData.value });

onMounted(() => {
    loadCategories();
    loadCompanyUsers();
});

/* ---------------------------------------------------
   CATEGORY CHANGE (CREATABLE)
--------------------------------------------------- */
const handleCategoryChange = async (category) => {
    if (!category) {
        form.value.category = null;
        return;
    }

    if (category.id) {
        form.value.category = category;
        return;
    }

    try {
        form.value.category = await createCategory(category.name);
    } catch (error: any) {
        toast.add({
            title: 'Failed to create category',
            description: error.message,
            color: 'red',
        });
    }
};

/* ---------------------------------------------------
   DELETE CATEGORY
--------------------------------------------------- */
const removeCategory = async (category) => {
    const ok = await deleteCategory(category.id);
    if (ok && form.value.category?.id === category.id) {
        form.value.category = null;
    }
};

/* ---------------------------------------------------
   SAVE FORM
--------------------------------------------------- */
const saveForm = () => {
    if (!form.value.category?.id) {
        toast.add({
            title: 'Please select a category!',
            color: 'red',
        });
        return;
    }

    emit('save', {
        ...form.value,
        userId: form.value.user?.userId || null,
        categoryId: form.value.category?.id,
        paymentMode: form.value.paymentMode.value ,
        status: form.value.status.value ,

    });
};
</script>

<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">

        <!-- Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- Category -->
        <UFormGroup label="Category" required>
          <USelectMenu
            v-model="form.category"
            by="id"
            :loading="isLoading"
            :options="categories"
            option-attribute="name"
            searchable
            creatable
            show-create-option-when="always"
            placeholder="Select or create categories"
            @update:modelValue="handleCategoryChange"
          >
            <template #label>
              <div v-if="form.category?.name">{{ form.category.name }}</div>
              <div v-else>Select a category</div>
            </template>

            <template #option="{ option }">
              <div class="flex items-center justify-between w-full">
                <span>{{ option.name }}</span>
                <UIcon
                  v-if="option.name !== 'Purchase'"
                  name="i-heroicons-x-circle"
                  class="w-4 h-4 text-red-500 cursor-pointer"
                  @mousedown.prevent.stop="removeCategory(option)"
                />
              </div>
            </template>
          </USelectMenu>
        </UFormGroup>

        <!-- user (Company User) -->
        <UFormGroup label="user">
          <USelectMenu
            v-model="form.user"
            by="userId"
            :options="companyUsers"
            option-attribute="name"
            searchable
            placeholder="Select employee"
          >
            <template #label>
              <div v-if="form.user">{{ form.user.name }}</div>
              <div v-else>Select employee</div>
            </template>

            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-medium">{{ option.name }}</span>
                <span class="text-xs opacity-70">{{ option.phone }}</span>
              </div>
            </template>
          </USelectMenu>
        </UFormGroup>

        <!-- Amount -->
        <UFormGroup label="Amount" required>
          <UInput v-model="form.amount" type="number" placeholder="0.00" />
        </UFormGroup>

        <!-- Payment Mode -->
        <UFormGroup label="Payment mode" required>
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
              { label: 'Paid', value: 'Paid' },
              { label: 'Pending', value: 'Pending' },
              { label: 'Approved', value: 'Approved' },
              { label: 'Rejected', value: 'Rejected' },
            ]"
          />
        </UFormGroup>
      </div>

      <!-- Notes -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea v-model="form.note" placeholder="Note..." />
      </UFormGroup>

      <div class="flex justify-end mt-4">
        <UButton color="gray" :disabled="loading" @click="emit('cancel')">Cancel</UButton>
        <UButton color="primary" class="ml-3" type="submit" :loading="loading">{{ submitLabel }}</UButton>
      </div>
    </UForm>
  </UCard>
</template>
