<script setup lang="ts">
import {
  useFindManyDistributorCompany,
  useCreateDistributorPayment,
  useUpdateDistributorPayment,
  useCreateDistributorCredit,
  useUpdateDistributorCredit,
  useDeleteDistributorCredit,
  useDeleteDistributorPayment,
  useDeleteDistributorCompany,
  useCreateExpense
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import QrcodeVue from 'qrcode.vue'
const toast = useToast();
const emit = defineEmits(['modal-open','edit']);
const CreateDistributorPayment = useCreateDistributorPayment();
const UpdateDistributorPayment = useUpdateDistributorPayment();
const DeleteDistributorPayment = useDeleteDistributorPayment();
const createExpense = useCreateExpense({ optimisticUpdate: true });
const CreateDistributorCredit = useCreateDistributorCredit();
const UpdateDistributorCredit = useUpdateDistributorCredit();
const DeleteDistributorCredit = useDeleteDistributorCredit();

const DeleteDistributorCompany = useDeleteDistributorCompany()
const useAuth = () => useNuxtApp().$auth;
const isSaving = ref(false)

const sort = ref({ column: 'distributor.name', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref('10');
const isOpenPay = ref(false)
const isOpenCredit = ref(false)
const distributorId = ref<string | null>(null)
const companyId = ref<string | null>(null)
const expand = ref({ openedRows: [], row: null });

const form = ref({
  amount: 0,
  remarks: '',
  paymentType:'',
  billNo:'',
  type:''
})

const columns = [
  { key: 'distributor.name', label: 'Distributor', sortable: true },
  { key: 'purchaseorders.length', label: 'Orders', sortable: true },
  { key: 'totalAmount', label: 'Total', sortable: true },
  { key: 'paidAmount', label: 'Paid', sortable: true },
  { key: 'totalDue', label: 'Due', sortable: true },
  {
        key: 'actions',
        label: 'Actions',
    },

];

const PaymentColumns = [
   
    { key: 'createdAt', label: 'Date' },
    { key: 'type', label: 'Type' },
    { key: 'amount', label: 'Amount' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'paymentType', label: 'PayType/BillNO' },
    {
        key: 'actions',
        label: 'Actions',
    },
];


const action = (row:any) => [

    [
    {
            label: 'Pay',
            icon: 'i-heroicons-banknotes-20-solid',
            click: () => handleOpenPayForm(row),
        },
    {
            label: 'Add Credit',
            icon: 'i-heroicons-banknotes-20-solid',
            click: () => handleOpenCreditForm(row),
        },
    ] , 
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => emit('edit', row.distributor),
        },
    
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => deleteDistributor(row.distributor.id),
        },
    ],
    
];

const creditaction = (row:any) => [

    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => payFormEdit(row),
        },
    
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => payDelete(row),
        },
    ],
    
];


const deleteDistributor = async(id:string) => {
   const res = await DeleteDistributorCompany.mutateAsync({
          where:{
            distributorId_companyId: {
              distributorId:id,
              companyId:useAuth().session.value?.companyId as string,
            },
          },
        }
)};

const payFormEdit = async(row:any) => {
  form.value = row
  if(form.value.type === 'CREDIT'){
     isOpenCredit.value = true
    
  }else{
    isOpenPay.value = true
  }
 
}

const payDelete = async(row:any) => {
  if(row.type === 'CREDIT'){
  const res = await DeleteDistributorCredit.mutateAsync({
          where:{
            id:row.id
          },
        })
      }else{
         const res = await DeleteDistributorPayment.mutateAsync({
          where:{
            id:row.id
          },
        })
      }
}

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
          upiId:true,
          gstin:true,
          address:{
            select:{
              street:true,
              locality:true,
              city:true,
              state:true,
              pincode:true
            }
          }
        }
      },
      distributorCredits: {
      select: {
        createdAt:true,
        id:true,
        amount:true,
        remarks:true,
        billNo:true,
      }
    },

      distributorPayments:{
        select:{
          createdAt:true,
            id:true,
            amount:true,
            remarks:true,
            paymentType:true
        }
      }
    },
    orderBy: 
      sort.value.column === 'distributor.name'
        ? { distributor: { name: sort.value.direction } }
        : { [sort.value.column]: sort.value.direction },

    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value),
  };
});


const { data, isLoading, error } = useFindManyDistributorCompany(queryArgs);

const distributors = computed(() => {
  return data.value?.map(distributor => {
    const credits = (distributor.distributorCredits || []).map(c => ({
      ...c,
      createdAt: new Date(c.createdAt),
      type: 'CREDIT',
      paymentType:c.billNo,
      class: 'bg-red-500/50 dark:bg-red-400/50'

    }));

    const payments = (distributor.distributorPayments || []).map(p => ({
      ...p,
      createdAt: new Date(p.createdAt),
      type: 'PAYMENT',
      paymentType:p.paymentType,
       class: 'bg-green-500/50 dark:bg-green-400/50'
    }));

    const transactions = [...credits, ...payments].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );

    const totalAmount = credits.reduce((sum, c) => sum + (c.amount || 0), 0);
    const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      ...distributor,
      totalAmount,
      paidAmount,
      transactions
    };
  });
});


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

const resetForm = () => {
  form.value = {
    amount: 0,
    remarks: '',
    paymentType: '',
    billNo: ''
  };
};

const showToast = (title: string, color: string, description?: string) => {
  toast.add({
    title,
    color,
    description,
  });
};

const handlePay = async () => {
  isSaving.value = true;

  try {
    if (!form.value.amount) {
      showToast('Please enter Amount', 'red');
      return;
    }

    const expenseData = {
      totalAmount: form.value.amount,
      note: form.value.remarks,
      paymentMode: form.value.paymentType,
      status: 'Paid',
      companyId: companyId.value,
      userId: useAuth().session.value?.userId,
      expensecategoryId:
        useAuth().session.value?.purchaseExpenseCategoryId,
    };

    if (form.value.id) {
      /* ---------------- UPDATE ---------------- */

      await UpdateDistributorPayment.mutateAsync({
        where: { id: form.value.id },
        data: {
          amount: form.value.amount,
          remarks: form.value.remarks,
          paymentType: form.value.paymentType,

          expense: {
            update: {
              totalAmount: form.value.amount,
              note: form.value.remarks,
              paymentMode: form.value.paymentType,
            },
          },
        },
        select: { id: true },
      });

      showToast('Payment edited successfully', 'green');
    } else {
      /* ---------------- CREATE ---------------- */

      await CreateDistributorPayment.mutateAsync({
        data: {
          amount: form.value.amount,
          remarks: form.value.remarks,
          paymentType: form.value.paymentType,

          distributorCompany: {
            connect: {
              distributorId_companyId: {
                distributorId: distributorId.value,
                companyId: companyId.value,
              },
            },
          },

          expense: {
            create: expenseData,
          },
        },
        select: { id: true },
      });

      showToast('Payment added successfully', 'green');
    }

    isOpenPay.value = false;
    resetForm();
  } catch (err: any) {
    showToast('Error', 'red', err.message);
  } finally {
    isSaving.value = false;
  }
};



const handleAddCredit = async () => {
  isSaving.value = true;

  try {
    if (!form.value.amount) {
      showToast('Please enter Amount', 'red');
      return;
    }

    if (form.value.id) {
      await UpdateDistributorCredit.mutateAsync({
        where: { id: form.value.id },
        data: {
          amount: form.value.amount,
          remarks: form.value.remarks,
          billNo: form.value.billNo,
        },
        select: { id: true }
      });

      showToast('Credit edited successfully', 'green');
    } else {
      await CreateDistributorCredit.mutateAsync({
        data: {
          amount: form.value.amount,
          remarks: form.value.remarks,
          billNo: form.value.billNo,
          distributorCompany: {
            connect: {
              distributorId_companyId: {
                distributorId: distributorId.value,
                companyId: companyId.value,
              }
            }
          }
        },
        select: { id: true }
      });

      showToast('Credit added successfully', 'green');
    }

    isOpenCredit.value = false;
    resetForm();
  } catch (err) {
    showToast('Error', 'red', err.message);
  } finally {
    isSaving.value = false;
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


const handleOpenPayForm = (row) => {
  isOpenPay.value = true;
  distributorId.value = row.distributorId;
  companyId.value = row.companyId;
};
const handleOpenCreditForm = (row) => {
  isOpenCredit.value = true;
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
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                    <div class="flex flex-row">
    
                    </div>
                    <UButton color="primary" @click=" emit('modal-open')" block class="w-full sm:w-40">
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

                    <template #expand="{ row }">
                      <UTable 
                        :rows="row.transactions"
                        :columns="PaymentColumns"
                      >
                        <template #createdAt-data="{ row }">
                          {{ new Date(row.createdAt).toLocaleString() }}
                        </template>

                        <template #actions-data="{ row }">
                    <UDropdown :items="creditaction(row)">
                        <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                    </template>
                      </UTable>
                    </template>


                </UTable>
                </template>


            <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5 hidden sm:block">
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
  <UModal v-model="isOpenPay">
  <UCard>
    <div class="p-4 space-y-4">
        <!-- Amount -->
        <UFormGroup label="Amount" name="amount" required>
          <UInput v-model.number="form.amount" type="number" placeholder="Enter amount" />
        </UFormGroup>

        <!-- Remarks -->
       

        <UFormGroup label="Payment Type" name="paymentType">
            <USelect
                v-model="form.paymentType"
                :options="[
                    { label: 'Cash', value: 'CASH' },
                    { label: 'Bank', value: 'BANK' },
                    { label: 'UPI', value: 'UPI' },
                    { label: 'Card', value: 'CARD' },
                    { label: 'Cheque', value: 'CHEQUE' },
                ]"
                option-attribute="label"
                value-attribute="value"
                placeholder="Payment Type"
                />
        </UFormGroup>

         <UFormGroup label="Remarks" name="remarks">
          <UInput v-model="form.remarks" placeholder="Optional remarks" />
        </UFormGroup>


        <!-- Submit -->
        <div class="pt-4">
          <UButton color="primary" :loading="isSaving" @click="handlePay" block>Submit</UButton>
        </div>
    </div>
  </UCard>
</UModal>


  <UModal v-model="isOpenCredit">
  <UCard>
    <div class="p-4 space-y-4">

      <UFormGroup label="BillNo" name="Billno">
          <UInput v-model="form.billNo" placeholder="BillNo" />
        </UFormGroup>
        <!-- Amount -->
        <UFormGroup label="Amount" name="amount" required>
          <UInput v-model.number="form.amount" type="number" placeholder="Enter amount" />
        </UFormGroup>

        <!-- Remarks -->
        <UFormGroup label="Remarks" name="remarks">
          <UInput v-model="form.remarks" placeholder="Optional remarks" />
        </UFormGroup>
  

        <!-- Submit -->
        <div class="pt-4">
          <UButton color="primary" :loading="isSaving" @click="handleAddCredit" block>Submit</UButton>
        </div>
    </div>
  </UCard>
</UModal>

</template>
