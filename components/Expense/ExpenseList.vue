<script setup lang="ts">
import {
    useFindManyExpense,
    useCountExpense,
    useFindManyExpenseCategory,
    useUpdateManyExpense,
    useFindManyCompanyUser
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
// import { saveAs } from 'file-saver';
import { startOfDay, endOfDay } from 'date-fns'

const emit = defineEmits(['edit','delete','open','values']);
const useAuth = () => useNuxtApp().$auth;
const toast = useToast()
const EXPENSE_TABLE_STATE_KEY = 'erp_expense_table_state_v1'
const UpdateManyExpense = useUpdateManyExpense({ optimisticUpdate: true });
const selectedRows = ref([]);
const selectedStatus = ref([]);
const selectedCategory = ref([]);
const selectedUsers = ref<string[]>([]);
const minAmount = ref<number | null>(null);
const maxAmount = ref<number | null>(null);
const search = ref('');
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const isFilterModalOpen = ref(false)
const draftSelectedStatus = ref([])
const draftSelectedCategory = ref([])
const draftSelectedUsers = ref<string[]>([])
const draftMinAmount = ref<number | null>(null)
const draftMaxAmount = ref<number | null>(null)
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
        key: 'paymentMode',
        label: 'Payment Mode',
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
const userQueryArgs = computed(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
        deleted: false,
        status: true,
    },
    select: {
        userId: true,
        name: true,
    },
}))
const { data: companyUsers } = useFindManyCompanyUser(userQueryArgs)
const userFilterOptions = computed(() =>
    (companyUsers.value || []).map((u: any) => ({
        label: u.name || 'Unknown',
        value: u.userId
    }))
)

// Data
const queryArgs = computed<Prisma.ExpenseFindManyArgs>(() => {
    const hasMinAmount = minAmount.value !== null && Number.isFinite(Number(minAmount.value))
    const hasMaxAmount = maxAmount.value !== null && Number.isFinite(Number(maxAmount.value))
    const selectedUserIds = (selectedUsers.value || [])
      .map((u: any) => (typeof u === 'string' ? u : u?.value))
      .filter((id: any) => typeof id === 'string' && id.length > 0)
    return {
        where: {
            companyId: useAuth().session.value?.companyId,
            ...(search.value?.trim() && {
                OR: [
                    {
                        note: {
                            contains: search.value.trim(),
                            mode: 'insensitive'
                        }
                    },
                    {
                        expensecategory: {
                            name: {
                                contains: search.value.trim(),
                                mode: 'insensitive'
                            }
                        }
                    },
                    {
                        user: {
                            name: {
                                contains: search.value.trim(),
                                mode: 'insensitive'
                            }
                        }
                    }
                ]
            }),

            ...(selectedStatus.value.length && {
                status: { in: selectedStatus.value }
            }),

                ...(selectedDate.value && {
                expenseDate: {
                    gte: startOfDay(selectedDate.value.start),
                    lte: endOfDay(selectedDate.value.end),
                }
                }),

            ...(selectedCategory.value.length && {
                expensecategoryId: { in: selectedCategory }
            }),

            ...(selectedUserIds.length && {
                userId: { in: selectedUserIds }
            }),

            ...((hasMinAmount || hasMaxAmount) && {
                totalAmount: {
                    ...(hasMinAmount ? { gte: Number(minAmount.value) } : {}),
                    ...(hasMaxAmount ? { lte: Number(maxAmount.value) } : {}),
                }
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
const totalAmount = computed(() => {
  if (!sales.value) return 0;

  return sales.value.reduce((sum, item) => {
    return sum + Number(item.totalAmount || 0);
  }, 0);
});

watch(
  [pageTotal, totalAmount],
  ([newPageTotal, newTotalAmount]) => {
    console.log(sales.value)
    emit('values', {
      pageTotal: newPageTotal,
      totalAmount: newTotalAmount,
    });
  },
  { immediate: true }
);

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);
const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))



watchEffect(() => {
    console.log(sales.value);
    console.log(pageTotal.value);

});

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
   selectedDate.value = ({
        start: new Date(new Date().setHours(0, 0, 0, 0)) , 
        end: new Date(new Date().setHours(23, 59, 59, 999)) 
    })
   selectedCategory.value = [];
   selectedUsers.value = [];
   minAmount.value = null;
   maxAmount.value = null;
};

const openFilterModal = () => {
  draftSelectedStatus.value = [...selectedStatus.value]
  draftSelectedCategory.value = [...selectedCategory.value]
  draftSelectedUsers.value = [...selectedUsers.value]
  draftMinAmount.value = minAmount.value
  draftMaxAmount.value = maxAmount.value
  isFilterModalOpen.value = true
}

const applyFilters = () => {
  selectedStatus.value = [...draftSelectedStatus.value]
  selectedCategory.value = [...draftSelectedCategory.value]
  selectedUsers.value = [...draftSelectedUsers.value]
  minAmount.value = draftMinAmount.value
  maxAmount.value = draftMaxAmount.value
  page.value = 1
  isFilterModalOpen.value = false
}

watch(
  [
    search,
    selectedStatus,
    selectedCategory,
    selectedUsers,
    minAmount,
    maxAmount,
    pageCount,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
  ],
  () => {
    if (page.value !== 1) page.value = 1
  },
  { deep: true }
)

watch(
  [
    search,
    selectedStatus,
    selectedCategory,
    selectedUsers,
    minAmount,
    maxAmount,
    page,
    pageCount,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
    () => sort.value.column,
    () => sort.value.direction,
    selectedColumnKeys,
  ],
  () => {
    if (!process.client) return
    localStorage.setItem(
      EXPENSE_TABLE_STATE_KEY,
      JSON.stringify({
        search: search.value,
        selectedStatus: selectedStatus.value,
        selectedCategory: selectedCategory.value,
        selectedUsers: selectedUsers.value,
        minAmount: minAmount.value,
        maxAmount: maxAmount.value,
        selectedDate: selectedDate.value,
        page: page.value,
        pageCount: pageCount.value,
        sort: sort.value,
        selectedColumnKeys: selectedColumnKeys.value,
      })
    )
  },
  { deep: true }
)

onMounted(() => {
  if (!process.client) return
  const raw = localStorage.getItem(EXPENSE_TABLE_STATE_KEY)
  if (!raw) return

  try {
    const saved = JSON.parse(raw)
    search.value = saved.search ?? ''
    selectedStatus.value = saved.selectedStatus ?? []
    selectedCategory.value = saved.selectedCategory ?? []
    selectedUsers.value = saved.selectedUsers ?? []
    minAmount.value = saved.minAmount ?? null
    maxAmount.value = saved.maxAmount ?? null
    if (saved.selectedDate?.start && saved.selectedDate?.end) {
      selectedDate.value = {
        start: new Date(saved.selectedDate.start),
        end: new Date(saved.selectedDate.end),
      }
    }
    page.value = Number(saved.page || 1)
    pageCount.value = String(saved.pageCount || '10')
    if (saved.sort?.column && saved.sort?.direction) {
      sort.value = saved.sort
    }
    if (Array.isArray(saved.selectedColumnKeys)) {
      selectedColumns.value = columns.filter((c: any) =>
        saved.selectedColumnKeys.includes(c.key)
      )
    }
  } catch (e) {
    console.warn('Failed to parse expense table state', e)
  }
})

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

const handleDownloadExcel = async () => {
  try {
    const rows = sales.value || []
    if (!rows.length) {
      toast.add({
        title: 'No data to export',
        color: 'orange',
      })
      return
    }

    const [{ Workbook }, { saveAs }] = await Promise.all([
      import('exceljs'),
      import('file-saver'),
    ])

    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('Expenses')

    worksheet.columns = [
      { header: 'Date', key: 'expenseDate', width: 16 },
      { header: 'Category', key: 'category', width: 24 },
      { header: 'User', key: 'user', width: 24 },
      { header: 'Note', key: 'note', width: 32 },
      { header: 'Payment Mode', key: 'paymentMode', width: 14 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ]

    rows.forEach((row: any) => {
      worksheet.addRow({
        expenseDate: row.expenseDate ? format(row.expenseDate, 'd MMM yyyy') : '',
        category: row.expensecategory?.name || '',
        user: row.user?.name || '',
        note: row.note || '',
        paymentMode: row.paymentMode || '',
        amount: Number(row.totalAmount || 0),
        status: row.status || '',
      })
    })

    worksheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `expenses-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    )
  } catch (error: any) {
    toast.add({
      title: 'Failed to export expenses',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
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
                <div class="flex justify-between items-center gap-3 w-full">
                    <div class="flex items-center gap-3">
                        <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
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
                        <UInput
                          v-model="search"
                          icon="i-heroicons-magnifying-glass-20-solid"
                          type="text"
                          placeholder="Search note / category / user"
                          class="w-full sm:w-56"
                        />
                    </div>
                    <div class="flex items-center gap-2">
                      <UButton color="primary" @click=" emit('open')" block class="w-full sm:w-40" >
                          Add Expense
                      </UButton>
                    </div>
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
                        icon="i-heroicons-arrow-down-tray"
                        color="gray"
                        size="xs"
                        @click="handleDownloadExcel"
                    >
                        Download
                    </UButton>

                    <UButton
                        icon="i-heroicons-funnel"
                        color="gray"
                        size="xs"
                        @click="openFilterModal"
                    >
                        Filters
                    </UButton>

                    <UButton
                        icon="i-heroicons-arrow-path"
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

            <template #paymentMode-data="{row}">
                <UBadge 
                    size="sm" 
                    :color="row.paymentMode === 'CASH' ? 'green' 
                        : row.paymentMode === 'BANK' ? 'blue' 
                        : 'red'" 
                    variant="subtle"
                >
                    {{ row.paymentMode }}
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

    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Expense Filters</div>
        </template>
        <div class="space-y-3">
          <USelectMenu
            v-model="draftSelectedStatus"
            :options="['Paid','Pending', 'Approved', 'Rejected']"
            multiple
            placeholder="Status"
          />
          <USelectMenu
            v-model="draftSelectedCategory"
            :options="categories"
            option-attribute="name"
            value-attribute="id"
            multiple
            placeholder="Category"
          />
          <USelectMenu
            v-model="draftSelectedUsers"
            :options="userFilterOptions"
            multiple
            placeholder="User"
          />
          <div class="grid grid-cols-2 gap-3">
            <UInput
              v-model.number="draftMinAmount"
              type="number"
              placeholder="Amount >= "
            />
            <UInput
              v-model.number="draftMaxAmount"
              type="number"
              placeholder="Amount <= "
            />
          </div>
        </div>
        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isFilterModalOpen = false">Cancel</UButton>
            <UButton color="primary" @click="applyFilters">Apply Filter</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
</template>
