<script setup lang="ts">
import { Switch } from '@headlessui/vue';


import type { Period, Range } from '~/types';
import {
    useUpdateBill,
    useUpdateManyCategory,
    useFindManyBill,
    useCountBill
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
const selectedDate = ref({ start: sub(new Date(), { days: 14 }), end: new Date() })

// Columns
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
        key: 'entries',
        label: 'Entries',
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
        key: 'status',
        label: 'Status',
        sortable: true,
    },
    {
        key: 'notes',
        label: 'Notes',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
];

const entrycolumns = [
    {
        key: 'barcode',
        label: 'Barcode',
        sortable: true,
    },
    {
        key: 'category.name',
        label: 'Category',
        sortable: true,
    },
    {
        key: 'name',
        label: 'Name',
        sortable: true,
    },
    {
        key: 'qty',
        label: 'Quantity',
        sortable: true,
    },
    {
        key: 'discount',
        label: 'Discount',
        sortable: true,
    },
    {
        key: 'tax',
        label: 'Tax',
        sortable: true,
    },
    {
        key: 'rate',
        label: 'Rate',
        sortable: true,
    }
];




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
        },
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
const pageCount = ref('3');
const { data: pageTotal } = useCountBill({where:{companyId: useAuth().session.value?.companyId}});
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
const queryArgs = computed<Prisma.BillFindManyArgs>(() => {


    return {
        where: {
            AND: [
                { companyId: useAuth().session.value?.companyId },
                ...(search.value ? [{ invoiceNumber: search.value }] : []),
                ...(selectedStatus.value.length
                ? [{ OR: selectedStatus.value.map((item) => ({ paymentStatus: item.value })) }]
                : []),
                ...(selectedDate.value
                ? [
                    { createdAt: { gte: new Date(selectedDate.value.start).toISOString() } },
                    { createdAt: { lte: new Date(selectedDate.value.end).toISOString() } },
                    ]
                : []),
                {
                OR: [
                    { type: 'TRY_AT_HOME' },
                    { type: 'STANDARD' },
                ],
                },
            ],
            },
        
        include:{
            entries:{
                include:{
                    category:{
                        select:{
                            name:true
                        }
                    }
                }
            }
        },
        orderBy: {
            [sort.value.column]: sort.value.direction,
        },
        skip: (page.value - 1) * parseInt(pageCount.value),
        take: parseInt(pageCount.value),
    };
});

const {
    data: sales,
    isLoading,
    error,
    refetch,
} = useFindManyBill(queryArgs);


watch(sales, (newsales) => {
    console.log( newsales);
});





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
                v-model="selectedRows"
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="sales"
                :columns="columnsTable"
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

                <template #paymentStatus-data="{row}">
                <UBadge 
                    size="sm" 
                    :color="row.paymentStatus === 'PAID' ? 'green' 
                        : row.paymentStatus === 'PENDING' ? 'orange' 
                        : row.paymentStatus === 'APPROVED' ? 'blue' 
                        : 'red'" 
                    variant="subtle"
                >
                {{ row.paymentStatus.toUpperCase() }}
                </UBadge>
            </template>

                <template #status-data="{row}">
                <UBadge 
                    size="sm" 
                    color="gray"
                    
                >
                    {{ row.status }}
                </UBadge>
            </template>

                <template #entries-data="{ row }">
                    {{ row.entries.length }}
                </template>

                <template #createdAt-data="{ row }">
                    {{ row.createdAt.toLocaleDateString('en-GB') }}
                </template>



                <template #notes-data="{ row }">
                    <UPopover> 
                        <UButton 
                            color="white" 
                            :label="row.notes ? 'Open' : 'Add'" 
                            trailing-icon="i-heroicons-chevron-down-20-solid" 
                        />
                        <template #panel>
                            <div class="p-4">
                                <UTextarea 
                                    :model-value="row.notes" 
                                    color="white" 
                                    variant="outline" 
                                    placeholder="Notes..." 
                                    :autoresize="true" 
                                    @update:modelValue="handleChange($event, row)"
                                />
                                <UButton
                                    trailingIcon="i-heroicons-cloud-arrow-up"
                                    size="sm"
                                    color="green"
                                    variant="solid"
                                    label="Update"
                                    :trailing="false"
                                    class="mt-3"
                                    @click="handleUpdate(row.id)"
                                />
                            </div>
                        </template>
                    </UPopover>
                </template>

                
                <template #expand="{ row }">
                    <UTable 
                        :rows="row.entries" 
                        :columns="entrycolumns"
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
                    </UTable>
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


