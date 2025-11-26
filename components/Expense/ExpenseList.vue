<script setup lang="ts">
import {
    useFindManyExpense,
    useCountExpense,
    useFindManyExpenseCategory,
    useUpdateManyExpense
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
// import { saveAs } from 'file-saver';
import { startOfDay, endOfDay } from 'date-fns'

const emit = defineEmits(['edit','delete','open']);
const useAuth = () => useNuxtApp().$auth;
const UpdateManyExpense = useUpdateManyExpense({ optimisticUpdate: true });
const selectedRows = ref([]);
const selectedStatus = ref([]);
const selectedCategory = ref([]);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const selectedDate = ref({ 
    start: new Date(new Date().setHours(0, 0, 0, 0)) , 
    end: new Date(new Date().setHours(23, 59, 59, 999)) 
});

const sort = ref({ column: 'id', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref('10');


const columns = [
    {
        key: 'expenseDate',
        label: 'Date',
        sortable: true,
    },
    {
        key: 'expensecategory.name',
        label: 'Category',
        sortable: true,
    },
    {
        key: 'user.name',
        label: 'User',
        sortable: true,
    },
    {
        key: 'note',
        label: 'note',
        sortable: true,
    },
    {
        key: 'totalAmount',
        label: 'Amount',
        sortable: true,
    },
    {
        key: 'status',
        label: 'Status',
        sortable: true,
    },
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
            click: () => emit('edit', row),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => {
                isDeleteModalOpen.value = true
                deletingRowIdentity.value = {name:row.expensecategory.name,id:row.id}
                }
        },
    ],
    // ...(row.receipt ?
    //     [
    //         {
    //             label: 'Download',
    //             icon: 'i-heroicons-arrow-down-tray-20-solid',
    //             click: () =>download(row.receipt),
    //         },
    //     ] : []
    // )
    
];

const active = (selectedRows) => [
    [
        {
            label: 'Paid',
            click: () => multiUpdate('Paid',selectedRows.id),
        },
        {
            label: 'Pending',
            click: () => multiUpdate('Pending',selectedRows.id),
        },
        {
            label: 'Approved',
            click: () => multiUpdate('Approved',selectedRows.id),
        },
        {
            label: 'Rejected',
            click: () => multiUpdate('Rejected',selectedRows.id),
        },
    ],
];

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const categoryQueryArgs = computed<Prisma.ExpenseCategoryFindManyArgs>(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
    },
    select: {
        id: true,
        name: true
    }
}));

const { data: categories, isLoading:categoryIsLoading,} = useFindManyExpenseCategory(categoryQueryArgs);

// Data
const queryArgs = computed<Prisma.ExpenseFindManyArgs>(() => {
    return {
        where: {
            companyId: useAuth().session.value?.companyId,
            
            ...(selectedStatus.value.length && {
                OR: selectedStatus.value.map((item) => ({ status: item }))
            }),

                ...(selectedDate.value && {
                expenseDate: {
                    gte: startOfDay(selectedDate.value.start),
                    lte: endOfDay(selectedDate.value.end),
                }
                }),

            ...(selectedCategory.value.length && {
                expensecategoryId: { in: selectedCategory }
            })
        },

        include:{
            expensecategory:true,
            user:true
        },
        orderBy: {
            [sort.value.column]: sort.value.direction,
        },
        skip: (page.value - 1) * parseInt(pageCount.value),
        take: parseInt(pageCount.value),
    };
},{ enabled: !!useAuth().session.value?.companyId });

const { data: sales, isLoading, error, refetch } = useFindManyExpense(queryArgs);
const  pageTotal = computed(() => sales.value?.length) ;

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);
const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);



watchEffect(() => {
    console.log(sales.value);
    console.log(pageTotal.value);

});

const resetFilters = () => {
    selectedStatus.value = [];
   selectedDate.value = ({
        start: new Date(new Date().setHours(0, 0, 0, 0)) , 
        end: new Date(new Date().setHours(23, 59, 59, 999)) 
    })
   selectedCategory.value = [];
};

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const multiUpdate = async(status:string,ids:any) => {
    await UpdateManyExpense.mutateAsync({
        where: {
            id: { in: ids },        
        },
        data: {
            status: status        
        }

    })
}

// const download = async (filePath:string) => {
//     if (!filePath) {
//         console.error('No file path provided');
//         return;
//     }

//     const baseUrl = 'https://images.markit.co.in/';
//     const fileUrl = `${baseUrl}${filePath}`;

//     try {
//         const response = await fetch(fileUrl);
//         if (!response.ok) {
//             throw new Error(`Failed to fetch file: ${response.statusText}`);
//         }

//         const blob = await response.blob();
//         const filename = filePath;
        
//         saveAs(blob, filename);

//     } catch (error) {
//         console.error('Error downloading file:', error);
//     }
// };

</script>

<template>
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
                    <div class="flex sm:flex-row flex-col gap-3 w-full sm:w-auto">
                       <div class="flex flex-row gap-3 w-full sm:w-auto">    
                        <USelectMenu
                            v-model="selectedStatus"
                            :options="['Paid','Pending', 'Approved', 'Rejected']"
                            multiple
                            placeholder="Status"
                             class="w-full sm:w-40"
                        />

                        <USelectMenu
                            v-model="selectedCategory"
                            :options="categories"
                            option-attribute="name"
                            value-attribute="id"
                            multiple
                            placeholder="Category"
                            class="w-full sm:w-40"
                        />
                        </div>
                        <UPopover :popper="{ placement: 'bottom-start' }" class=" z-10">
                        <UButton icon="i-heroicons-calendar-days-20-solid" class=" w-full sm:w-60">
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

                            <DatePicker v-model="selectedDate" @close="close"  />
                        </div>
                        </template>
                    </UPopover>
                    </div>
                    <UButton color="primary" @click=" emit('open')" block class="w-full sm:w-40" >
                        Add Expense
                    </UButton>
                </div>
            </template>
            
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
                        @click="resetFilters"
                    >
                        Reset
                    </UButton>
                </div>
            </div>
            <UTable
                v-model="selectedRows"
                v-model:sort="sort"
                :rows="sales"
                :columns="columnsTable"
                sort-mode="manual"
                :loading="isLoading"
            >
            <template #status-data="{row}">
                <UBadge 
                    size="sm" 
                    :color="row.status === 'Paid' ? 'green' 
                        : row.status === 'Pending' ? 'orange' 
                        : row.status === 'Approved' ? 'blue' 
                        : 'red'" 
                    variant="subtle"
                >
                    {{ row.status }}
                </UBadge>
            </template>

        <template #expenseDate-data="{row}">
            {{ format(row.expenseDate, 'd MMM, yyy') }}
        </template>
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

    <UDashboardModal
        v-model="isDeleteModalOpen"
        title="Delete Expense"
        :description="`Are you sure you want to delete expense of category ${deletingRowIdentity.name}?`"
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
                @click="() =>  {emit('delete',deletingRowIdentity.id);isDeleteModalOpen = false;}"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
</template>
