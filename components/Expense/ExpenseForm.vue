<script setup lang="ts">
import {
    useFindManyExpenseCategory,
    useCreateExpenseCategory,
    useDeleteExpenseCategory,
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'

const props = defineProps({
    expense: {
        type: Object,
        required: false
    }
});

const emit = defineEmits(['save', 'cancel']);
const toast = useToast();
const createExpenseCategory = useCreateExpenseCategory({ optimisticUpdate: true });
const deleteExpenseCategory = useDeleteExpenseCategory({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;

// ✅ Form Initialization with category ID
const expenseData = computed(() => ({
  date: props.expense?.createdAt
    ? new Date(props.expense.createdAt).toLocaleDateString('en-CA') // ✅ local YYYY-MM-DD
    : new Date().toLocaleDateString('en-CA'),

  category: props.expense?.expensecategory || null,
  amount: props.expense?.totalAmount || '',
  status: props.expense?.status || 'Paid',
  paymentMode: props.expense?.paymentMode || 'CASH',
  note: props.expense?.note || '',
}));


const form = ref({ ...expenseData.value });

// ✅ Fetch categories
const queryArgs = computed<Prisma.ExpenseCategoryFindManyArgs>(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
    },
    select: {
        id: true,
        name: true
    }
}));

const { data: categories, isLoading, error, refetch } = useFindManyExpenseCategory(queryArgs);

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
        const newCategory = await createExpenseCategory.mutateAsync({
            data: {
                name: category.name,
                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    }
                }
            }
        });

        form.value.category = newCategory;
        await refetch(); // Refresh the categories list
    } catch (error) {
        console.error('Failed to create category:', error);
        toast.add({
            title: 'Failed to create category',
            description: error.message,
            color: 'red',
        });
    }
};

const removeCategory = async(category) => {
    try {
        await deleteExpenseCategory.mutateAsync({
            where: {
                id: category.id
            }
        });
        
        // If the deleted category is the currently selected one, clear the selection
        if (form.value.category?.id === category.id) {
            form.value.category = null;
        }
        
        await refetch(); // Refresh the categories list
    }catch (error: any) {
  console.error('Failed to remove category:', error);

  const prismaCode = error?.info?.code;

  if (prismaCode === 'P2003') {
    toast.add({
      title: 'Cannot delete category',
      description: 'This category is used in one or more expenses.',
      color: 'red',
    });
  } else {
    toast.add({
      title: 'Error',
      description: 'Failed to delete category. Please try again.',
      color: 'red',
    });
  }
}

};

const saveForm = () => {
    if (!form.value.category || !form.value.category.id) {
        toast.add({
            title: 'Please select a category!',
            color: 'red',
        });
        return;
    }

    emit('save', form.value);
};
</script>

<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="saveForm">
      <div class="grid grid-cols-2 gap-4">
        <!-- ✅ Date -->
        <UFormGroup label="Date" required>
          <UInput v-model="form.date" type="date" />
        </UFormGroup>

        <!-- ✅ Category with ID binding -->
        <UFormGroup label="Category" required>
          <USelectMenu
            v-model="form.category"
            by="id"
            name="categories"
            :loading="isLoading"
            :options="categories"
            option-attribute="name"
            searchable
            creatable
            show-create-option-when="always"
            placeholder="Select or create categories"
            @update:modelValue="handleCategoryChange"
          >
            <!-- Custom label for selected value -->
            <template #label>
              <div v-if="form.category?.name">{{ form.category.name }}</div>
              <div v-else>Select a category</div>
            </template>

            <!-- Custom rendering for dropdown options -->
            <template #option="{ option }">
              <div class="flex items-center justify-between w-full space-x-2">
                <span class="truncate">{{ option.name }}</span>
                <div
                  class="text-primary hover:text-red-500 cursor-pointer"
                   @mousedown.prevent.stop="removeCategory(option)"
                >
                  <UIcon name="i-heroicons-x-circle" color="red" class="w-4 h-4" />
                </div>
              </div>
            </template>
          </USelectMenu>
        </UFormGroup>

        <!-- ✅ Amount -->
        <UFormGroup label="Amount" required>
          <UInput v-model="form.amount" type="number" placeholder="0.00" />
        </UFormGroup>

        <!-- ✅ Payment Mode -->
        <UFormGroup label="Payment mode" required>
          <USelectMenu
            v-model="form.paymentMode"
            :options="[
              { label: 'Cash', value: 'CASH' },
              { label: 'Card', value: 'CARD' },
              { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
              { label: 'UPI', value: 'UPI' }
            ]"
          />
        </UFormGroup>

        <!-- ✅ Status -->
        <UFormGroup label="Status">
          <USelectMenu v-model="form.status" :options="['Paid', 'Pending', 'Approved', 'Rejected']" />
        </UFormGroup>
      </div>

      <!-- ✅ Notes -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea
          v-model="form.note"
          color="white"
          variant="outline"
          placeholder="Note..."
        />
      </UFormGroup>

      <div class="flex justify-end mt-4">
        <UButton color="gray" variant="solid" @click="emit('cancel')">Cancel</UButton>
        <UButton color="primary" variant="solid" class="ml-3" type="submit">Save</UButton>
      </div>
    </UForm>
  </UCard>
</template>