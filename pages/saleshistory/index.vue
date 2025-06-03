   <script setup lang="ts">
import {
    useFindManyBill,
    useUpdateBill
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'

const UpdateBill = useUpdateBill();
const search = ref<number | null>(null);
const useAuth = () => useNuxtApp().$auth;
const router = useRouter();
const toast = useToast();

// Reuse columns in both parent and expanded tables
const columns = [
  {
    key: 'invoiceNumber',
    label: 'Inv#',
    sortable: true,
  },
  {
    key: 'createdAt',
    label: 'Date',
    sortable: true,
  },
  {
    key: 'grandTotal',
    label: 'Total',
    sortable: true,
  },
  {
    key: 'paymentStatus',
    label: 'Payment',
    sortable: true,
  },
  {
    key: 'notes',
    label: 'Notes',
    sortable: true,
  },
  {
    key: 'deleted',
    label: 'Deleted',
    sortable: true,
  },
     {
    key: 'action',
    label: '',
  },
]
const historycolumns = [
   {
    key: 'invoice_number',
    label: 'Inv#',
    sortable: true,
  },
  {
    key: 'changedAt',
    label: 'Date',
    sortable: true,
  },
 
  {
    key: 'grand_total',
    label: 'Total',
    sortable: true,
  },
    {
    key: 'payment_status',
    label: 'Payment',
    sortable: true,
  },
  {
    key: 'notes',
    label: 'Notes',
    sortable: true,
  },
  {
    key: 'operation',
    label: 'Operation',
    sortable: true,
  },
  {
    key: 'action',
    label: '',
  },
]

const action = (row: any) => {
    const actions = [];

    if (row.deleted) {
        actions.push({
            label: 'Restore',
            icon: 'i-heroicons-arrow-path',

        });
    }

    actions.push({
        label: 'View',
        icon: 'i-heroicons-eye',
    });

    return [actions];
};


// Pagination
const sort = ref({ column: 'invoiceNumber', direction: 'desc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('20');

const queryArgs = computed<Prisma.BillFindManyArgs>(() => {
  return {
    where: {
      companyId: useAuth().session.value?.companyId,
      ...(search.value && { invoiceNumber: search.value }),
      billHistories: {
        some: {}, // <- Filters only bills with at least one history
      },
    },
    include: {
      billHistories: true,
    },
    orderBy: {
      [sort.value.column]: sort.value.direction,
    },
    // skip: (page.value - 1) * parseInt(pageCount.value),
    // take: parseInt(pageCount.value),
  };
});


const {
    data: bills,
    isLoading,
    error,
    refetch,
} = useFindManyBill(queryArgs);

const restoreBill = async (id:string) => {
  console.log(id)
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            deleted:false
        }
    })
    console.log(res)

      toast.add({
        title: 'Bill Restored!',
       color: 'green',
         });

};

</script>

<template>
    <UDashboardPanelContent class="pb-24">
      <UCard 
       :ui="{
          base: 'h-full flex flex-col',
          rounded: '',
         divide: 'divide-y divide-gray-200 dark:divide-gray-700',
          body: {
            padding: '',
            base: 'grow divide-y divide-gray-200 dark:divide-gray-700'
          },
          footer: {
            base: ' divide-y divide-gray-200 dark:divide-gray-700',
            padding:''
          }
        }">

    <UTable
      :columns="columns"
      :rows="bills"
      :loading="isLoading"
      v-model:expand="expand"
    :multiple-expand="false"
       sort-mode="manual"
    >
   <template #createdAt-data="{ row }">
        {{ row.createdAt.toLocaleDateString('en-GB') }}
    </template>
    <template #action-data="{ row }">
      
              <UButton
                v-if="row.deleted"
                color="primary"
                variant="ghost"
                icon="i-heroicons-arrow-path"
                @click="restoreBill(row.id)"
              />
            </template>
      <!-- Expanded Row Template -->
      <template #expand="{ row }">
          <UTable
            :columns="historycolumns"
            :rows="(row.billHistories).map(h => ({ ...h.data,id:h.id, operation: h.operation, changedAt:h.changedAt }))"
            class="text-sm"
          >
          
            <!-- Format specific fields if needed -->
            <template #changedAt-data="{ row }">
            {{ new Date(row.changedAt).toLocaleString('en-GB') }}
            </template>

            
            <template #grand_total-data="{ row }">
              ₹{{ row.grand_total?.toFixed(2) }}
            </template>

            <template #action-data="{ row }">
              <UButton
                color="primary"
                variant="ghost"
                icon="i-heroicons-eye"
                @click="() => router.push(`/saleshistory/${row.id}`)"
              />
            </template>
          </UTable>
      </template>
    </UTable>

  </UCard>
    </UDashboardPanelContent>
</template>
