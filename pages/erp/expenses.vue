<script setup lang="ts">
import { ref } from 'vue';
import ExpenseForm from '~/components/Expense/ExpenseForm.vue';
import ExpenseList from '~/components/Expense/ExpenseList.vue';
import AwsService from '~/composables/aws';
import {
    useCreateExpense,
    useUpdateExpense,
    useDeleteExpense,
} from '~/lib/hooks';



const createExpense = useCreateExpense({ optimisticUpdate: true });
const updateExpense = useUpdateExpense({ optimisticUpdate: true });
const deleteExpense = useDeleteExpense({ optimisticUpdate: true });
const useAuth = () => useNuxtApp().$auth;

const addExpense = (expense: any) => {
    try{
        createExpense.mutate({
        data: {
            ...(expense.date && {
                expenseDate: new Date(expense.date).toISOString(),
            }),
            expensecategory: {
                connect: {
                    id: expense.category.id,
                },
            },
            totalAmount: expense.amount || 0,
            paymentMode: expense.paymentMode,
            status: expense.status,
            ...(expense.note && { note: expense.note }),
            company: {
                connect: {
                    id: useAuth().session.value?.companyId,
                },
            },
        },
        
    })
    $fetch('/api/notifications/notify', {
      method: 'POST',
      body: {
        userId:useAuth().session.value?.id,
        type: 'EXPENSE',
        Note: expense.note,
        companyId: useAuth().session.value?.companyId,
        id: expense.id,
        // expenseCategory : expense.expensecategory.name,
        amount: expense.totalAmount
      }
    })

}catch(error){
    console.log(error)
}
};

const editExpense = (id: string, editExpense: any) => {
    console.log(id,editExpense)
    updateExpense.mutate({
        where: {
            id,
        },
        data: {
            ...(editExpense.date && {
                expenseDate: new Date(editExpense.date).toISOString(),
            }),
            expensecategory: {
                connect: {
                    id: editExpense.category.id,
                },
            },
            totalAmount: editExpense.amount,
            paymentMode: editExpense.paymentMode,
            status: editExpense.status,
            ...(editExpense.note && { note: editExpense.note }),
        },
    });
};

const deleteExpenseRow = (id: string) => {
        deleteExpense.mutate({
        where: {
            id,
        },
    });
};

const showForm = ref(false);
const selectedExpense = ref<any | null>(null);

const openForm = (expense = null) => {
    selectedExpense.value = expense;
    showForm.value = true;
    console.log(expense)
};

const closeForm = () => {
    showForm.value = false;
    selectedExpense.value = null;
};

const saveExpense = (form: any) => {
    try{
    if (selectedExpense.value) {
       editExpense(selectedExpense.value.id, form);
    } else {
        addExpense(form);
    }
}
catch(error){
    console.log(error)
}
finally{
    closeForm();
};
};
</script>

<template>
    <UDashboardPanelContent class="pb-24">
            <div>
                <ExpenseList @edit="openForm" @delete="deleteExpenseRow"  @open="openForm"/>

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
