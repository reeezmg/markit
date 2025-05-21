<script setup lang="ts">
import {
    useFindManyExpenseCategory,
    useCreateExpenseCategory
} from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client'


const props = defineProps({
    expense: {
        type: Object,
        required: false
    }
});

const emit = defineEmits(['save', 'cancel']);

const createExpenseCategory = useCreateExpenseCategory();
const useAuth = () => useNuxtApp().$auth;

// ✅ Form Initialization with category ID
const expenseData = computed(() => ({
    date: props.expense?.createdAt
        ? new Date(props.expense?.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
    category: props.expense?.expensecategory || {},  // Store only ID
    amount: props.expense?.totalAmount || '',
    status: props.expense?.status || 'Paid',
    paymentMode: props.expense?.paymentMode || 'CASH',
    receiptName: props.expense?.receiptName || {},
    note: props.expense?.note || '',
}));

const form = ref({ ...expenseData.value });
const receipt = ref<File | null>(null);

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

// ✅ Handle category selection and creation
const handleCategoryChange = async (category) => {
console.log(category)

    // ✅ Existing category: Assign ID directly
    if (category.id) {
        form.value.category = category; 
        return;
    }

    // ✅ New category: Create and assign new ID
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


const handleFileChange = (fileList:any) => {
    console.log(fileList[0])
    const file = fileList[0] || null;  // Directly access the file
    if (file) {
        const uuid = uuidv4();
        form.value.receipt = {
            receiptName: file.name,
            receipt: uuid,
            file
        };
    } else {
        form.value.receipt = null;
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
                    <template #label>
                        <div v-if="form.category.name">{{ form.category.name }}</div>
                        <div v-else>Category</div>
                        
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
                    <USelectMenu v-model="form.status" :options="['Paid','Pending', 'Approved', 'Rejected']" />
                </UFormGroup>

                <!-- ✅ Receipt Upload -->
                <UFormGroup label="Receipt">
                    <UInput 
                        type="file" 
                        accept=".pdf, .jpg, .png" 
                        @change="handleFileChange" 
                    />
                    <p v-if="form.receiptName" class="text-gray-500 mt-2 truncate">{{ form.receiptName }}</p>
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
