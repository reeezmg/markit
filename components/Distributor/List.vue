<script setup lang="ts">
import {
useFindManyDistributorCompany,
  useUpdateDistributorCompany,
  useCreateDistributorPayment
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import QrcodeVue from 'qrcode.vue'

const emit = defineEmits(['modal-toggle']);
const UpdateDistributorCompany = useUpdateDistributorCompany();
const CreateDistributorPayment = useCreateDistributorPayment();

const useAuth = () => useNuxtApp().$auth;

const sort = ref({ column: 'distributorId', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref('10');
const isOpen = ref(false)
const distributorId = ref<string | null>(null)
const companyId = ref<string | null>(null)
const expand = ref({ openedRows: [], row: null });

const form = ref({
  amount: 0,
  remarks: '',
  paymentType:''
})

const columns = [
  { key: 'distributor.name', label: 'Distributor Name', sortable: true },
  { key: 'purchaseorders.length', label: 'Total Order', sortable: true },
  { key: 'totalAmount', label: 'Total(₹)', sortable: true },
  { key: 'paidAmount', label: 'Paid (₹)', sortable: true },
  { key: 'totalDue', label: 'Due (₹)', sortable: true },
  {
        key: 'actions',
        label: 'Actions',
    },

];

const PaymentColumns = [
    { key: 'amount', label: 'Amount', sortable: true },
    { key: 'remarks', label: 'Remarks', sortable: true },
    { key: 'paymentType', label: 'Payment Type', sortable: true },
];


const action = (row:any) => [

    [
    {
            label: 'Pay',
            icon: 'i-heroicons-banknotes-20-solid',
            click: () => handleOpenForm(row),
        },
    ] , 
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => emit('edit', row),
        },
    
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => emit('delete',row.id),
        },
    ],
    
];

const queryArgs = computed<Prisma.DistributorCompanyFindManyArgs>(() => {
  return {
    where: {
      companyId: useAuth().session.value?.companyId,
    },
    select: {
      distributorId: true,
      companyId: true,
      distributor: {
        select: {
          id: true,
          name: true,
          accHolderName:true,
          ifsc:true,
          accountNo:true,
          bankName:true,
          upiId:true
        }
      },
      purchaseOrders: {
        select: {
          id: true,
          paymentType:true
        }
      },
      distributorPayments:{
        select:{
            id:true,
            amount:true,
            remarks:true,
            paymentType:true
        }
      }
    },
    orderBy: {
      [sort.value.column === 'name' ? 'distributor' : sort.value.column]: 
        sort.value.column === 'name' ? { name: sort.value.direction } : sort.value.direction
    },
    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value),
  };
});


const { data, isLoading, error } = useFindManyDistributorCompany(queryArgs);

const distributors = computed(() => {
  return data.value?.map(distributor => {
    const creditOrders = distributor.purchaseOrders?.filter(po => po.paymentType === 'CREDIT') || []
    const totalAmount = creditOrders.reduce((sum, po) => sum + (po.amount || 0), 0)

    const paidAmount = (distributor.distributorPayments || []).reduce(
      (sum, payment) => sum + (payment.amount || 0),
      0
    )  

    return {
      ...distributor,
      totalAmount,
      paidAmount
    }
  })
})

watch(distributors, (newVal) => {
  if (newVal) {
    console.log(newVal)
  }
});

 
const  pageTotal = computed(() => distributors.value?.length) ;
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);
const handlePay = async () => {
  if (form.value.amount && distributorId.value && companyId.value) {
    const res = await CreateDistributorPayment.mutateAsync({
      data: {
        amount: form.value.amount,
        remarks: form.value.remarks || 'Initial Payment',
        paymentType: form.value.paymentType,
        
        distributorCompany: {
            connect: {
                distributorId_companyId: {
                    distributorId: distributorId.value,
                    companyId: companyId.value,
                    }
            }
        }
      },
      select: {
        id: true
      }
    });

    await UpdateDistributorCompany.mutateAsync({
  where: {
    distributorId_companyId: {
      distributorId: distributorId.value,
      companyId: useAuth().session.value?.companyId!, // Ensure this value is not undefined
    }
  },
  data: {
      paidAmount: {
        increment: form.value.amount,
      }
  }
});

    isOpen.value = false;
    form.value = { amount: 0, remarks: '' };
  }
};

const upiLink = computed(() => {
  const distributor = distributors.value?.find(d => d.distributorId === distributorId.value);
  if (!distributor|| !distributor.distributor.upiId || !form.value.amount || form.value.paymentType !== 'UPI') return '';

  const upiId = distributor.distributor.upiId;
  const name = encodeURIComponent(distributor.distributor.name || '');
  const amount = form.value.amount.toFixed(2);
  const remarks = encodeURIComponent(form.value.remarks || 'Payment');

  return `upi://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR&tn=${remarks}`;
});

const selectedDistributor = computed(() => {
  return distributors.value?.find(d => d.distributorId === distributorId.value);
});


const handleOpenForm = (row) => {
  isOpen.value = true;
  distributorId.value = row.distributorId;
  companyId.value = row.companyId;
};



</script>

<template>
  <div class="p-6 space-y-6">
    <UCard
            class="w-full"
            :ui="{
                base: '',

                divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                header: { padding: 'px-4 py-5' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
        <template #header>
                <div class="flex items-center justify-between gap-3">
                    <div class="flex flex-row">
    
                    </div>
                    <UButton color="primary" @click=" emit('modal-toggle')">
                        Add Distributor
                    </UButton>
                </div>
            </template>

            <template #default="{ row }">
                <UTable
                    v-model:expand="expand"
                    v-model:sort="sort"
                    :rows="distributors"
                    :columns="columns"
                    :loading="isLoading"
                    sort-mode="manual"
                    :multiple-expand="false"
                >

                    <template #actions-data="{ row }">
                    <UDropdown :items="action(row)">
                        <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                    </template>

                    <template #totalDue-data="{ row }">
                    {{ row.totalAmount - row.paidAmount }}
                    </template>

                    <template #purchaseorders.length-data="{ row }">
                    {{ row.purchaseOrders.length }}
                    </template>

                    <template #expand="{ row }">
                    <UTable 
                        :rows="row.distributorPayments" 
                        :columns="PaymentColumns"
                    >
                
                    </UTable>
                </template>

                </UTable>
                </template>


            <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5">
                            Showing
                            <span class="font-medium">{{ pageFrom }}</span>
                            to
                            <span class="font-medium">{{ pageTo }}</span>
                            of
                            <span class="font-medium">{{ pageTotal }}</span>
                            results
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="pageTotal"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded:
                                '!rounded-full min-w-[32px] justify-center',
                            default: {
                                activeButton: {
                                    variant: 'outline',
                                },
                            },
                        }"
                    />
                </div>
            </template>
     
    </UCard>

    <div v-if="error" class="text-red-500">Failed to load data: {{ error.message }}</div>
  </div>
  <UModal v-model="isOpen">
  <UCard>
    <div class="p-4 space-y-4">
        <!-- Amount -->
        <UFormGroup label="Amount" name="amount" required>
          <UInput v-model.number="form.amount" type="number" placeholder="Enter amount" />
        </UFormGroup>

        <!-- Remarks -->
        <UFormGroup label="Remarks" name="remarks">
          <UInput v-model="form.remarks" placeholder="Optional remarks" />
        </UFormGroup>

        <UFormGroup label="Payment Type" name="paymentType">
            <USelect
                v-model="form.paymentType"
                :options="[
                    { label: 'Cash', value: 'CASH' },
                    { label: 'UPI', value: 'UPI' },
                    { label: 'Bank Transfer', value: 'BANK_TRANSFER' }
                ]"
                option-attribute="label"
                value-attribute="value"
                placeholder="Payment Type"
                />
        </UFormGroup>

        <div class="flex flex-col items-center" v-if="form.paymentType === 'UPI'">
        <p v-if="upiLink" class="mb-2 text-sm font-medium">Scan to Pay via UPI</p>
        <QrcodeVue v-if="upiLink" :value="upiLink" :size="160"  @click="window.open(upiLink, '_blank')" />
            <div v-if="upiLink">
                {{ upiLink }}
            </div>
            <div v-if="!upiLink">UPI ID is not stored for this distributor</div>
        </div>

        <div class="flex flex-col items-center" v-if="form.paymentType === 'BANK_TRANSFER' && selectedDistributor">
        <p><strong>Account Holder Name:</strong> {{ selectedDistributor.distributor.accHolderName }}</p>
        <p><strong>Bank Name:</strong> {{ selectedDistributor.distributor.bankName }}</p>
        <p><strong>Account Number:</strong> {{ selectedDistributor.distributor.accountNo }}</p>
        <p><strong>IFSC Code:</strong> {{ selectedDistributor.distributor.ifsc }}</p>
        </div>


        <!-- Submit -->
        <div class="pt-4">
          <UButton color="primary" @click="handlePay" block>Submit</UButton>
        </div>
    </div>
  </UCard>
</UModal>

</template>
