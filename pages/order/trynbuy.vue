<script setup lang="ts">
import { Switch } from '@headlessui/vue';


import type { Period, Range } from '~/types';
import {
    useUpdateBill,
    useUpdateManyCategory,
    useFindManyBill,
    useCountBill,
    useFindManyTrynbuy,
    useCountTrynbuy
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'

const UpdateBill = useUpdateBill();
const UpdateManyCategory = useUpdateManyCategory();
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]
const selectedDate = ref({ start: sub(new Date(), { days: 2 }), end: new Date() })

// Columns
const columns = [
  { key: 'orderNumber', label: 'Order#', sortable: true },
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'deliveryType', label: 'Delivery', sortable: true },
  { key: 'deliveryTime', label: 'Delivery Time', sortable: true },
  { key: 'orderStatus', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false }
]

// Subtable: Cart Items with Variant + Item size
const itemColumns = [
  { key: 'item.barcode', label: 'Barcode', sortable: true },
  { key: 'variant.name', label: 'Variant', sortable: true },
  { key: 'item.size', label: 'Size', sortable: true },
  { key: 'quantity', label: 'Qty', sortable: true },
  { key: 'variant.sprice', label: 'Rate', sortable: true },
  { key: 'variant.tax', label: 'Tax', sortable: true }
]




// Actions
const active = (selectedRows) => [
    [
        {
            key: 'delete',
            label: 'Delete',
            icon: 'i-heroicons-trash',
        },
    ],
];

const action = (row) => [
    [

        {
            label: 'Pack',
            icon: 'i-heroicons-clipboard-document-check-20-solid',
            click: () => router.push(`./pack?id=${row.id}`),
        },
        {
            label: 'Bill',
            icon: 'i-heroicons-clipboard-document-check-20-solid',
            click: () => router.push(`/erp/edit/${row.id}`),
        }
    ],
    
];

// Filters
const todoStatus = [
    {
        label: 'Paid',
        value: 'PAID',
    },
    {
        label: 'Pending',
        value: 'PENDING',
    },
];




const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

// Selected Rows
const selectedRows = ref([]);
const notes = ref<any>({})

const search = ref<number | null>(null);
const selectedStatus = ref<any>([]);
const searchStatus = ref(undefined);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};

// Pagination
const sort = ref({ column: 'id', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('10');

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

// Data
// Prisma query for Trynbuy
const queryArgs = computed<Prisma.TrynbuyFindManyArgs>(() => {
  return {
    where: {
      AND: [
        { companyId: useAuth().session.value?.companyId },
        ...(search.value ? [{ orderNumber: search.value }] : []),
        ...(selectedStatus.value.length
          ? [
              {
                OR: selectedStatus.value.map((item: any) => ({
                  orderStatus: item.value
                }))
              }
            ]
          : []),
        ...(selectedDate.value
          ? [
              { createdAt: { gte: selectedDate.value.start.toISOString() } },
              { createdAt: { lte: selectedDate.value.end.toISOString() } }
            ]
          : [])
      ]
    },
    include: {
      cartItems: {
        include: {
          variant: true,
          item: true,
        }
      }
    },
    orderBy: { [sort.value.column]: sort.value.direction },
    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value)
  }
})


const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));


const { data: trynbuys, isLoading, refetch } = useFindManyTrynbuy(queryArgs)
const { data: pageTotal } = useCountTrynbuy(countArgs);



watch(trynbuys,(newtrynbuys) => {
    console.log(newtrynbuys)
})




const handleUpdate = async (id:string) => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            notes:notes.value[id]
        }
    })

    console.log(res)

};

const handleChange = (value:string, row:any) => {
    notes.value[row.id] = value;
};

</script>

<template>
    <UDashboardPanelContent class="pb-24">
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
            <!-- Filters -->
            <template #header>
             <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                <div class="flex sm:flex-row flex-col gap-3 w-full sm:w-auto">
                <div class="flex flex-row gap-3 w-full sm:w-auto">    
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    type="number"
                    placeholder="Search Invoice"
                    class="w-full sm:w-40"
                />
                 <USelectMenu
                    v-model="selectedStatus"
                    :options="todoStatus"
                    multiple
                    placeholder="Status"
                   class="w-full sm:w-40"
                />
                </div>
          
                    <UPopover :popper="{ placement: 'bottom-start' }" class=" z-10">
                        <UButton icon="i-heroicons-calendar-days-20-solid" class="w-full sm:w-60">
                        {{ format(selectedDate.start, 'd MMM, yyy') }} - {{ format(selectedDate.end, 'd MMM, yyy') }}
                        </UButton>

                        <template #panel="{ close }">
                        <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                            <div class="hidden sm:flex flex-col py-4">
                            <UButton
                                v-for="(range, index) in ranges"
                                :key="index"
                                :label="range.label"
                                color="gray"
                                variant="ghost"
                                class="rounded-none px-6 hidden sm:block"
                                :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                                truncate
                                @click="selectRange(range.duration)"
                            />
                            </div>

                            <DatePicker v-model="selectedDate" @close="close" />
                        </div>
                        </template>
                    </UPopover>
                </div>
               
            </div>
        </template>
            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
                    <USelect
                        v-model="pageCount"
                        :options="[3, 5, 10, 20, 30, 40].map(num => ({ label: num, value: num }))"
                        class="me-2 w-20"
                        size="xs"
                    />
                </div>

                <div class="flex gap-1.5 items-center z-10">
                    <UDropdown
                        v-if="selectedRows.length > 1"
                        :items="active(selectedRows)"
                        :ui="{ width: 'w-36' }"
                    >
                        <UButton
                            icon="i-heroicons-chevron-down"
                            trailing
                            color="gray"
                            size="xs"
                        >
                            Mark as
                        </UButton>
                    </UDropdown>

                    <USelectMenu
                        v-model="selectedColumns"
                        :options="columns"
                        multiple
                    >
                        <UButton
                            icon="i-heroicons-view-columns"
                            color="gray"
                            size="xs"
                        >
                            Columns
                        </UButton>
                    </USelectMenu>

                    <UButton
                        icon="i-heroicons-funnel"
                        color="gray"
                        size="xs"
                        :disabled="search === '' && selectedStatus.length === 0"
                        @click="resetFilters"
                    >
                        Reset
                    </UButton>
                </div>
            </div>

            <!-- Table -->
            <UTable
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="trynbuys"
                :columns="columns"
                :loading="isLoading"
                :multiple-expand="false"
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

                <template #createdAt-data="{ row }">
                {{ new Date(row.createdAt).toLocaleString('en-GB', { 
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit' 
                }) }}
                </template>

                <template #deliveryTime-data="{ row }">
                {{ row.deliveryTime 
                    ? new Date(row.deliveryTime).toLocaleString('en-GB', { 
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit' 
                        }) 
                    : '-' }}
                </template>
                


               
               <template #orderStatus-data="{ row }">
                <UBadge
                    size="sm"
                    :color="
                    row.orderStatus === 'BILLED'
                        ? 'green'
                        : row.orderStatus === 'ALL_RETURNED'
                        ? 'purple'
                        : row.orderStatus === 'CANCELLED'
                        ? 'red'
                        : row.orderStatus === 'DELIVERED'
                        ? 'orange'
                        : row.orderStatus === 'ORDER_RECEIVED'
                        ? 'yellow'
                        : 'gray'
                    "
                    variant="subtle"
                >
                     {{
                    row.orderStatus
                    ? row.orderStatus
                        .split('_')
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ')
                    : '-'
                }}
                </UBadge>
                </template>




                
                
                  <template #expand="{ row }">
                    <UTable :rows="row.cartItems" :columns="itemColumns" />
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
    </UDashboardPanelContent>
    
</template>


