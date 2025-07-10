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

const createExpenseCategory = useCreateExpenseCategory({ optimisticUpdate: true });
const deleteExpenseCategory = useDeleteExpenseCategory({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;

watch(() => props.loading, (newLoading) => {
    console.log('Loading state changed:', newLoading);
});

// ✅ Form Initialization with category ID
const expenseData = computed(() => ({
    date: props.expense?.createdAt
        ? new Date(props.expense?.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    category: props.expense?.expensecategory || {},  // Store only ID
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

        form.value.category = newCategory;  // Assign new category ID
    } catch (error) {
        console.error('Failed to create category:', error);
    }
};


const removeCategory = async(category) => {
    console.log('Removing category:', category);
    try {
        await deleteExpenseCategory.mutateAsync({
            where: {
                id: category.id
            }
        });
        form.value.category = null;  // Clear the category from the form
    } catch (error) {
        console.error('Failed to remove category:', error);
    }
};
</script>


<template>
  <UCard class="p-6">
    <UForm :state="form" @submit="emit('save', form)">
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
              <div v-else>Category</div>
            </template>

            <!-- Custom rendering for dropdown options -->
            <template #option="{ option }">
              <div class="flex items-center justify-between w-full space-x-2">
                <span class="truncate flex-1">{{ option.name }}</span>
                <div
                  class="text-primary hover:text-red-500 cursor-pointer"
                  @mousedown.prevent.stop="removeCategory(option)"
                >
                  <UIcon name="i-heroicons-x-circle" class="w-4 h-4" />
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
