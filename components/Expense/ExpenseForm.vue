<script setup lang="ts">
import {
    useFindManyExpenseCategory,
    useCreateExpenseCategory,
    useDeleteExpenseCategory,
    useFindManyCompanyUser
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client';

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
  status: props.expense?.status || 'Paid',
  paymentMode: props.expense?.paymentMode || 'CASH',
  note: props.expense?.note || '',
}));

const form = ref({ ...expenseData.value });

/* ---------------------------------------------------
   FETCH EXPENSE CATEGORIES
--------------------------------------------------- */
const queryArgs = computed<Prisma.ExpenseCategoryFindManyArgs>(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
    },
    select: {
        id: true,
        name: true
    }
}));

const { data: categories, isLoading, refetch } = useFindManyExpenseCategory(queryArgs);

/* ---------------------------------------------------
   FETCH COMPANY USERS (user)
--------------------------------------------------- */
const userQueryArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    deleted: false,
  },
  select: {
    userId: true,
    name: true,
    phone: true,
  }
}));

const { data: companyUsers } = useFindManyCompanyUser(userQueryArgs);

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
        await refetch();
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
const removeCategory = async(category) => {
    try {
        await deleteExpenseCategory.mutateAsync({
            where: { id: category.id }
        });

        if (form.value.category?.id === category.id) {
            form.value.category = null;
        }

        await refetch();
    } catch (error: any) {
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
        categoryId: form.value.category?.id
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
              { label: 'Card', value: 'CARD' },
              { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
              { label: 'UPI', value: 'UPI' }
            ]"
          />
        </UFormGroup>

        <!-- Status -->
        <UFormGroup label="Status">
          <USelectMenu
            v-model="form.status"
            :options="['Paid', 'Pending', 'Approved', 'Rejected']"
          />
        </UFormGroup>
      </div>

      <!-- Notes -->
      <UFormGroup label="Note" class="mt-4">
        <UTextarea v-model="form.note" placeholder="Note..." />
      </UFormGroup>

      <div class="flex justify-end mt-4">
        <UButton color="gray" @click="emit('cancel')">Cancel</UButton>
        <UButton color="primary" class="ml-3" type="submit">Save</UButton>
      </div>
    </UForm>
  </UCard>
</template>
