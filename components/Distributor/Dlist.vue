<script setup lang="ts">
import {
useFindManyDistributorCompany,
  useDeleteDistributorCompany,
  useDeletePurchaseOrder
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client';
import QrcodeVue from 'qrcode.vue'
const toast = useToast();
const emit = defineEmits(['modal-open','edit']);
const router = useRouter();
const DeleteDistributorCompany = useDeleteDistributorCompany({ optimisticUpdate: true })
const DeletePurchaseOrder = useDeletePurchaseOrder({ optimisticUpdate: true })
const useAuth = () => useNuxtApp().$auth;
const isSaving = ref(false)

const sort = ref({ column: 'distributor.name', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('10');
const isOpenPay = ref(false)
const isOpenCredit = ref(false)
const distributorId = ref<string | null>(null)
const companyId = ref<string | null>(null)
const isPurchaseOrderDeleteModalOpen = ref(false)
const deletingPurchaseOrderRowIdentity = ref({})
const isDistributorDeleteModalOpen = ref(false)
const deletingDistributorRowIdentity = ref({})



const columns = [
  { key: 'distributor.name', label: 'Distributor', sortable: true },
  { key: 'purchaseOrders.length', label: 'Orders', sortable: true },
  { key: 'totalAmount', label: 'Total', sortable: true },
  { key: 'paidAmount', label: 'Paid', sortable: true },
  { key: 'totalDue', label: 'Due', sortable: true },
  {
        key: 'actions',
        label: 'Actions',
    },

];

const purchaseColumns = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'products.length', label: 'Products', sortable: true },
  { key: 'totalAmount', label: 'Total Value', sortable: true },
  { key: 'paymentType', label: 'Payment Type', sortable: true },
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
             click: () => {
                isDistributorDeleteModalOpen.value = true
                deletingDistributorRowIdentity.value = {name:row.distributor.name,id:row.distributor.id}
                }
        },
    ],
    
];

const purchaseOrderAction = (row:any) => [

    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`/products/add/${row.id}`),
        },
    
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => {
                isPurchaseOrderDeleteModalOpen.value = true
                deletingPurchaseOrderRowIdentity.value = {id:row.id}
                }
        },
    ],
    
];

const removePurchaseOrder = () => {
  try {
    DeletePurchaseOrder.mutate({ where: { id :deletingPurchaseOrderRowIdentity.value.id} });
  } catch (err) {
    console.log(err);
  }finally{
     isPurchaseOrderDeleteModalOpen.value = false;
  }
};


const removeDistributor = () => {
  try {
   const res = DeleteDistributorCompany.mutate({
          where:{
            distributorId_companyId: {
              distributorId:deletingDistributorRowIdentity.value.id,
              companyId:useAuth().session.value?.companyId as string,
            },
          },
        })
    } catch (err) {
    console.log(err);
    }finally{
    isDistributorDeleteModalOpen.value = false;
    }
};




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
      },
      purchaseOrders:{
        select:{
          id:true,
          createdAt:true,
          products:true,
          paymentType:true,
          totalAmount:true
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


 console.log(distributors.value)
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
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                    <div class="flex flex-row">
    
                    </div>
                    <UButton color="primary" @click=" emit('modal-open')" block class="w-full sm:w-40">
                        Add Distributor
                    </UButton>
                </div>
            </template>

    
                <UTable
                    v-model:sort="sort"
                    :rows="distributors"
                    :columns="columns"
                    :loading="isLoading"
                     v-model:expand="expand"
                    sort-mode="manual"
                     class="w-full"
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

                  <template #expand="{row}">
                    <div>
                      <UTable
                      :rows="row.purchaseOrders"
                      :columns="purchaseColumns">
                        <template #createdAt-data="{ row }">
                      {{ new Date(row.createdAt).toLocaleString() }}
                    </template>

                    <template #actions-data="{ row }">
                    <UDropdown :items="purchaseOrderAction(row)">
                        <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                    </template>

                    </UTable>
                    </div>
                  </template>
                </UTable>

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

  
  <UDashboardModal
        v-model="isDistributorDeleteModalOpen"
        title="Delete Distributor"
        :description="`Are you sure you want to delete Distributor ${deletingDistributorRowIdentity.name}?`
        "
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            } as any,
            footer: {
                base: 'ml-16',
            } as any,
        }"
    >
        <template #footer>
            <UButton
                color="red"
                label="Delete"
                @click="() =>  removeDistributor()"
            />
            <UButton color="white" label="Cancel" @click="isDistributorDeleteModalOpen = false" />
        </template>
    </UDashboardModal>

  <UDashboardModal
        v-model="isPurchaseOrderDeleteModalOpen"
        title="Delete Purchase Order"
        :description="`Are you sure you want to delete this Purchase?
        you will loose all products connected to this order.`"
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            } as any,
            footer: {
                base: 'ml-16',
            } as any,
        }"
    >
        <template #footer>
            <UButton
                color="red"
                label="Delete"
                @click="() =>  removePurchaseOrder()"
            />
            <UButton color="white" label="Cancel" @click="isPurchaseOrderDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
  

</template>
