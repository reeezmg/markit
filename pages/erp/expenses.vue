<script setup lang="ts">
import { ref } from 'vue';
import ExpenseForm from '~/components/Expense/ExpenseForm.vue';
import ExpenseList from '~/components/Expense/ExpenseList.vue';

import {
    useCreateExpense,
    useUpdateExpense,
    useDeleteExpense,
} from '~/lib/hooks';

const createExpense = useCreateExpense({ optimisticUpdate: true });
const updateExpense = useUpdateExpense({ optimisticUpdate: true });
const deleteExpense = useDeleteExpense({ optimisticUpdate: true });
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;

/* ---------------------------------------------------
   CREATE EXPENSE
--------------------------------------------------- */
const addExpense =  (expense: any) => {
    try {
        createExpense.mutate({
            data: {
                ...(expense.date && {
                    expenseDate: new Date(expense.date).toISOString(),
                }),

                // ⭐ CATEGORY
                expensecategory: {
                    connect: { id: expense.categoryId },
                },

                // ⭐ FROM (CompanyUser)
                ...(expense.userId && {
                    user: {
                        connect: {
                            companyId_userId: {
                                companyId: useAuth().session.value?.companyId,
                                userId: expense.userId,
                            },
                        },
                    },
                }),

                totalAmount: Number(expense.amount) || 0,
                paymentMode: expense.paymentMode,
                status: expense.status || 'Paid',
                ...(expense.note && { note: expense.note }),

                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    },
                },
            },
        });

        // OPTIONAL NOTIFICATION
        // await $fetch('/api/notifications/notify', {
        //     method: 'POST',
        //     body: {
        //         userId: useAuth().session.value?.id,
        //         type: 'EXPENSE',
        //         note: expense.note,
        //         companyId: useAuth().session.value?.companyId,
        //         amount: expense.amount,
        //         category: expense.category?.name,
        //     }
        // });

    // $fetch('/api/notifications/notify', {
    //   method: 'POST',
    //   body: {
    //     userId:useAuth().session.value?.id,
    //     type: 'EXPENSE',
    //     Note: expense.note,
    //     companyId: useAuth().session.value?.companyId,
    //     id: expense.id,
    //     // expenseCategory : expense.expensecategory.name,
    //     amount: expense.totalAmount
    //   }
    // })

    

        toast.add({
            title: 'Expense added',
            color: 'green',
        });

    } catch (error: any) {
        toast.add({
            title: 'Failed to create expense',
            description: error.message,
            color: 'red',
        });
    }
};

/* ---------------------------------------------------
   UPDATE EXPENSE
--------------------------------------------------- */
const editExpense = async (id: string, data: any) => {
    try {
        await updateExpense.mutateAsync({
            where: { id },
            data: {
                ...(data.date && {
                    expenseDate: new Date(data.date).toISOString(),
                }),

                expensecategory: {
                    connect: { id: data.categoryId },
                },

                // ⭐ UPDATE user USER with compound key
                ...(data.userId && {
                    user: {
                        connect: {
                            companyId_userId: {
                                companyId: useAuth().session.value?.companyId,
                                userId: data.userId,
                            },
                        },
                    },
                }),

                totalAmount: Number(data.amount),
                paymentMode: data.paymentMode,
                status: data.status,
                ...(data.note && { note: data.note }),
            },
        });

        toast.add({
            title: 'Expense updated',
            color: 'green',
        });

    } catch (error: any) {
        toast.add({
            title: 'Failed to update expense',
            description: error.message,
            color: 'red',
        });
    }
};

/* ---------------------------------------------------
   DELETE EXPENSE
--------------------------------------------------- */
const deleteExpenseRow = async (id: string) => {
    try {
        await deleteExpense.mutateAsync({
            where: { id }
        });

        toast.add({
            title: `Expense deleted successfully!`,
            color: 'green',
        });

    } catch (error: any) {
        toast.add({
            title: 'Error while deleting expense',
            description: error.message,
            color: 'red',
        });
    }
};

/* ---------------------------------------------------
   FORM TOGGLING
--------------------------------------------------- */
const showForm = ref(false);
const selectedExpense = ref<any | null>(null);

const openForm = (expense = null) => {
    selectedExpense.value = expense;
    showForm.value = true;
};

const closeForm = () => {
    showForm.value = false;
    selectedExpense.value = null;
};

/* ---------------------------------------------------
   FORM SAVE HANDLER
--------------------------------------------------- */
const saveExpense = async (form: any) => {
    try {
        if (selectedExpense.value) {
            await editExpense(selectedExpense.value.id, form);
        } else {
            await addExpense(form);
        }
    } finally {
        closeForm();
    }
};
const pageTotal = ref(0)
const totalAmount = ref(0)

const onValues = ({ pageTotal: newPageTotal, totalAmount: newTotalAmount }) => {
  pageTotal.value = newPageTotal
  totalAmount.value = newTotalAmount
  console.log(newTotalAmount)
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(v ?? 0)

</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div  class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <UCard>
          <div class="text-sm text-gray-500">Total Entry</div>
          <div class="text-xl font-semibold">
            {{ pageTotal }}
          </div>
        </UCard>
        <UCard>
          <div class="text-sm text-gray-500">Total Expense</div>
          <div class="text-xl font-semibold">
            {{ formatCurrency(totalAmount) }}
          </div>
        </UCard>
        </div>
    <div>
      <ExpenseList
        @edit="openForm"
        @delete="deleteExpenseRow"
        @open="openForm"
        @values="onValues"
      />

      <UModal v-model="showForm">
        <ExpenseForm
          :expense="selectedExpense"
          @save="saveExpense"
          @cancel="closeForm"
        />
      </UModal>
    </div>
  </UDashboardPanelContent>
</template>
