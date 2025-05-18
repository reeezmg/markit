<script setup lang="ts">
import {
useFindManyDistributorCompany,
  useDeleteDistributorCompany
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import QrcodeVue from 'qrcode.vue'
const toast = useToast();
const emit = defineEmits(['modal-open','edit']);

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




const action = (row:any) => [

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


 
const  pageTotal = computed(() => distributors.value?.length) ;
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);







const selectedDistributor = computed(() => {
  return distributors.value?.find(d => d.distributorId === distributorId.value);
});



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
                    <UButton color="primary" @click=" emit('modal-open')">
                        Add Distributor
                    </UButton>
                </div>
            </template>

            <template #default="{ row }">
                <UTable
                  
                    v-model:sort="sort"
                    :rows="distributors"
                    :columns="columns"
                    :loading="isLoading"
                    sort-mode="manual"
                    
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
  

</template>
