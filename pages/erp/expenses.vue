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

definePageMeta({
    auth: true,
});

const CreateExpense = useCreateExpense();
const UpdateExpense = useUpdateExpense();
const DeleteExpense = useDeleteExpense();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;

const addExpense = async (expense: any) => {

    try{
    if (expense.receipt) {
            const base64 = await prepareFileForApi(expense.receipt.file);
            const base64file = { base64, uuid: expense.receipt.receipt };

            console.log(base64file);

            const awsres = await awsService.uploadBase64File(base64file.base64, base64file.uuid)
    }
        
    await CreateExpense.mutateAsync({
        data: {
            ...(expense.date && {
                expenseDate: new Date(expense.date).toISOString(),
            }),
            expensecategory: {
                connect: {
                    id: expense.category.id,
                },
            },
            totalAmount: expense.amount,
            paymentMode: expense.paymentMode,
            ...(expense.receipt && {
                receipt:expense.receipt.receipt,
                receiptName:expense.receipt.receiptName
            }),
            status: expense.status,
            ...(expense.note && { note: expense.note }),
            company: {
                connect: {
                    id: useAuth().session.value?.companyId,
                },
            },
        },
        include: {
    company: true   },
    })
    await $fetch('/api/notifications/notify', {
      method: 'POST',
      body: {
        userId:useAuth().session.value?.id,
        type: 'EXPENSE',
        Note: expense.note,
        companyId: useAuth().session.value?.companyId,
        id: expense.id,
        expenseCategory : expense.expensecategory.name,
        amount: expense.totalAmount
      }
    })

}catch(error){
    console.log(error)
}
};

const editExpense = async (id: string, editExpense: any) => {
    await UpdateExpense.mutateAsync({
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

const deleteExpense = async (id: string) => {
    await DeleteExpense.mutateAsync({
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
    if (selectedExpense.value) {
        editExpense(selectedExpense.value.id, form);
    } else {
        addExpense(form);
    }
    closeForm();
};
</script>

<template>
    <UDashboardPanelContent class="pb-24">
        

            <div>
                <ExpenseList @edit="openForm" @delete="deleteExpense"  @open="openForm"/>

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
