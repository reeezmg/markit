<script setup lang="ts">
import { hash } from '~/composables/hash';
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import {
    useFindManyCompanyUser,
    useUpdateUser,
    useUpdateCompanyUser,
    useCreateUser,
    useFindUniqueUser,
    useCountCompanyUser,
    useFindManyEntry,
    useCountEntry,
    useFindManyExpense,
    useCountExpense,
    useFindManyExpenseCategory,
} from '~/lib/hooks';
import { useCompanyEntries } from '~/composables/companyReports'

const userStore = useUserStore()
const toast = useToast();
const isSaving = ref(false)
const isDeleting = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentinty = ref({})
const CreateUser = useCreateUser({ optimisticUpdate: true });
const UpdateUser = useUpdateUser({ optimisticUpdate: true });
const UpdateCompanyUser = useUpdateCompanyUser({ optimisticUpdate: true });
const router = useRouter();
const route = useRoute();
const isOpen = ref(false);
const useAuth = () => useNuxtApp().$auth;

// ─── Selected user & detail panel ───
const selectedUser = ref<any>(null)
const activeTab = ref(0)

const selectUser = (row: any) => {
    selectedUser.value = row
    salesPage.value = 1
    expensePage.value = 1
}

const closeDetail = () => {
    selectedUser.value = null
}

const tabs = [
    { label: 'Sales', icon: 'i-heroicons-chart-bar' },
    { label: 'Expenses', icon: 'i-heroicons-banknotes' },
]

// ─── Sales tab state ───
const salesPage = ref(1)
const salesPageCount = ref(10)
const salesSearch = ref('')
const salesSelectedDate = ref({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(new Date().setHours(23, 59, 59, 999)),
})
const salesLoading = ref(false)
const salesEntries = ref<any[]>([])
const salesTotalCount = ref(0)

const salesFilterOpen          = ref(false)
const salesBillStatus          = ref<string[]>([])
const salesPaymentMethods      = ref<string[]>([])
const salesMinValue            = ref<number | null>(null)
const salesMaxValue            = ref<number | null>(null)
const draftSalesBillStatus     = ref<string[]>([])
const draftSalesPaymentMethods = ref<string[]>([])
const draftSalesMinValue       = ref<number | null>(null)
const draftSalesMaxValue       = ref<number | null>(null)

const salesPaymentOptions = [
    { label: 'Cash',   value: 'Cash' },
    { label: 'UPI',    value: 'UPI' },
    { label: 'Card',   value: 'Card' },
    { label: 'Credit', value: 'Credit' },
    { label: 'Split',  value: 'Split' },
]

const openSalesFilter = () => {
    draftSalesBillStatus.value = [...salesBillStatus.value]
    draftSalesPaymentMethods.value = [...salesPaymentMethods.value]
    draftSalesMinValue.value = salesMinValue.value
    draftSalesMaxValue.value = salesMaxValue.value
    salesFilterOpen.value = true
}

const applySalesFilters = () => {
    salesBillStatus.value = [...draftSalesBillStatus.value]
    salesPaymentMethods.value = [...draftSalesPaymentMethods.value]
    salesMinValue.value = draftSalesMinValue.value
    salesMaxValue.value = draftSalesMaxValue.value
    salesPage.value = 1
    salesFilterOpen.value = false
}

const hasSalesFilter = computed(() =>
    salesBillStatus.value.length > 0 || salesPaymentMethods.value.length > 0 ||
    salesMinValue.value !== null || salesMaxValue.value !== null
)

const salesColumns = [
    { key: 'categoryName', label: 'Category', sortable: true },
    { key: 'name', label: 'Product', sortable: true },
    { key: 'rate', label: 'Rate', sortable: true },
    { key: 'qty', label: 'Qty', sortable: true },
    { key: 'value', label: 'Value', sortable: true },
]

const salesEntryArgs = computed(() => {
    if (!selectedUser.value) return null
    const companyId = useAuth().session.value?.companyId
    return {
        where: {
            companyId,
            companyUser: {
                userId: selectedUser.value.userId,
                companyId,
            },
            ...(salesSearch.value?.trim() && {
                OR: [
                    { name: { contains: salesSearch.value.trim(), mode: 'insensitive' } },
                    { category: { name: { contains: salesSearch.value.trim(), mode: 'insensitive' } } },
                ],
            }),
            bill: {
                deleted: false,
                createdAt: {
                    gte: startOfDay(salesSelectedDate.value.start),
                    lte: endOfDay(salesSelectedDate.value.end),
                },
                ...(salesPaymentMethods.value.length && {
                    paymentMethod: { in: salesPaymentMethods.value },
                }),
                ...(salesBillStatus.value.length && {
                    paymentStatus: { in: salesBillStatus.value },
                }),
            },
            ...(salesMinValue.value !== null && { value: { gte: salesMinValue.value } }),
            ...(salesMaxValue.value !== null && { value: { lte: salesMaxValue.value } }),
        },
        include: {
            category: { select: { name: true } },
            bill: { select: { discount: true, paymentMethod: true, paymentStatus: true } },
        },
        orderBy: { bill: { createdAt: 'desc' as const } },
        skip: (salesPage.value - 1) * Number(salesPageCount.value),
        take: Number(salesPageCount.value),
    }
})

const salesCountArgs = computed(() => {
    if (!salesEntryArgs.value) return null
    return { where: salesEntryArgs.value.where }
})

const { data: rawSalesEntries, isLoading: salesIsLoading } = useFindManyEntry(
    () => salesEntryArgs.value ?? { where: { id: '__none__' }, take: 0 },
)
const { data: salesTotal } = useCountEntry(
    () => salesCountArgs.value ?? { where: { id: '__none__' } },
)

const formattedSalesEntries = computed(() => {
    if (!rawSalesEntries.value) return []
    return rawSalesEntries.value.map((entry: any) => ({
        ...entry,
        categoryName: entry.category?.name || '-',
    }))
})

const salesPageFrom = computed(() => (salesPage.value - 1) * salesPageCount.value + 1)
const salesPageTo = computed(() => Math.min(salesPage.value * salesPageCount.value, salesTotal.value || 0))

// ─── Expense tab state ───
const expensePage = ref(1)
const expensePageCount = ref(10)
const expenseSearch = ref('')
const expenseSelectedStatus = ref<string[]>([])
const expenseSelectedCategory = ref<string[]>([])

const expenseFilterOpen          = ref(false)
const expensePaymentModes        = ref<string[]>([])
const expenseMinAmount           = ref<number | null>(null)
const expenseMaxAmount           = ref<number | null>(null)
const draftExpenseStatus         = ref<string[]>([])
const draftExpensePaymentModes   = ref<string[]>([])
const draftExpenseMinAmount      = ref<number | null>(null)
const draftExpenseMaxAmount      = ref<number | null>(null)

const expensePaymentOptions = [
    { label: 'Cash',   value: 'CASH' },
    { label: 'Bank',   value: 'BANK' },
    { label: 'UPI',    value: 'UPI' },
    { label: 'Card',   value: 'CARD' },
    { label: 'Cheque', value: 'CHEQUE' },
]

const openExpenseFilter = () => {
    draftExpenseStatus.value = [...expenseSelectedStatus.value]
    draftExpensePaymentModes.value = [...expensePaymentModes.value]
    draftExpenseMinAmount.value = expenseMinAmount.value
    draftExpenseMaxAmount.value = expenseMaxAmount.value
    expenseFilterOpen.value = true
}

const applyExpenseFilters = () => {
    expenseSelectedStatus.value = [...draftExpenseStatus.value]
    expensePaymentModes.value = [...draftExpensePaymentModes.value]
    expenseMinAmount.value = draftExpenseMinAmount.value
    expenseMaxAmount.value = draftExpenseMaxAmount.value
    expensePage.value = 1
    expenseFilterOpen.value = false
}

const hasExpenseFilter = computed(() =>
    expenseSelectedStatus.value.length > 0 || expensePaymentModes.value.length > 0 ||
    expenseMinAmount.value !== null || expenseMaxAmount.value !== null
)
const expenseSelectedDate = ref({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(new Date().setHours(23, 59, 59, 999)),
})

const expenseColumns = [
    { key: 'expenseDate', label: 'Date', sortable: true },
    { key: 'expensecategory.name', label: 'Category', sortable: true },
    { key: 'note', label: 'Note', sortable: true },
    { key: 'paymentMode', label: 'Payment', sortable: true },
    { key: 'totalAmount', label: 'Amount', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
]

const expenseCategoryArgs = computed(() => ({
    where: { companyId: useAuth().session.value?.companyId },
    select: { id: true, name: true },
}))
const { data: expenseCategories } = useFindManyExpenseCategory(expenseCategoryArgs)

const expenseQueryArgs = computed(() => {
    if (!selectedUser.value) return null
    const companyId = useAuth().session.value?.companyId
    return {
        where: {
            companyId,
            userId: selectedUser.value.userId,
            ...(expenseSearch.value?.trim() && {
                OR: [
                    { note: { contains: expenseSearch.value.trim(), mode: 'insensitive' } },
                    { expensecategory: { name: { contains: expenseSearch.value.trim(), mode: 'insensitive' } } },
                ],
            }),
            ...(expenseSelectedStatus.value.length && {
                status: { in: expenseSelectedStatus.value },
            }),
            ...(expenseSelectedCategory.value.length && {
                expensecategoryId: { in: expenseSelectedCategory.value },
            }),
            ...(expensePaymentModes.value.length && {
                paymentMode: { in: expensePaymentModes.value },
            }),
            ...((expenseMinAmount.value !== null || expenseMaxAmount.value !== null) && {
                totalAmount: {
                    ...(expenseMinAmount.value !== null ? { gte: expenseMinAmount.value } : {}),
                    ...(expenseMaxAmount.value !== null ? { lte: expenseMaxAmount.value } : {}),
                },
            }),
            expenseDate: {
                gte: startOfDay(expenseSelectedDate.value.start),
                lte: endOfDay(expenseSelectedDate.value.end),
            },
        },
        include: {
            expensecategory: true,
            user: true,
        },
        orderBy: { expenseDate: 'desc' as const },
        skip: (expensePage.value - 1) * Number(expensePageCount.value),
        take: Number(expensePageCount.value),
    }
})

const expenseCountArgs = computed(() => {
    if (!expenseQueryArgs.value) return null
    return { where: expenseQueryArgs.value.where }
})

const { data: expenses, isLoading: expenseIsLoading } = useFindManyExpense(
    () => expenseQueryArgs.value ?? { where: { id: '__none__' }, take: 0 },
)
const { data: expenseTotal } = useCountExpense(
    () => expenseCountArgs.value ?? { where: { id: '__none__' } },
)

const expensePageFrom = computed(() => (expensePage.value - 1) * expensePageCount.value + 1)
const expensePageTo = computed(() => Math.min(expensePage.value * expensePageCount.value, expenseTotal.value || 0))

// Date range helpers (shared for sales & expense)
const ranges = [
    { label: 'Last 7 days', duration: { days: 7 } },
    { label: 'Last 14 days', duration: { days: 14 } },
    { label: 'Last 30 days', duration: { days: 30 } },
    { label: 'Last 3 months', duration: { months: 3 } },
    { label: 'Last 6 months', duration: { months: 6 } },
    { label: 'Last year', duration: { years: 1 } },
]

function isRangeSelected(dateRef: any, duration: Duration) {
    return isSameDay(dateRef.start, sub(new Date(), duration)) && isSameDay(dateRef.end, new Date())
}

function selectRange(dateRef: any, duration: Duration) {
    dateRef.start = sub(new Date(), duration)
    dateRef.end = new Date()
}

// Reset page on filter change
watch([salesSearch, () => salesSelectedDate.value.start, () => salesSelectedDate.value.end], () => {
    salesPage.value = 1
})
watch([expenseSearch, expenseSelectedStatus, expenseSelectedCategory, () => expenseSelectedDate.value.start, () => expenseSelectedDate.value.end], () => {
    expensePage.value = 1
}, { deep: true })

// ─── Original users table logic ───

const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'code', label: 'Code', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false },
]

const formData = reactive({
    email: '',
    name: '',
    role: { label: '', value: '' },
    id:''
});


const openEdit = (row) => {
    isOpen.value = true
    formData.email = row.user.email
    formData.name = row.name
    formData.role.label = row.role
    formData.role.value = row.role
    formData.id = row.userId
    }


const action = (row) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => openEdit(row),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
           click: () => {
                isDeleteModalOpen.value = true
                deletingRowIdentinty.value = {name:row.name,id:row.userId}
                }
        },
    ],
];

// Filters
const todoStatus = [
    {
        key: 'inactive',
        label: 'Inactive',
        value: false,
    },
    {
        key: 'active',
        label: 'Active',
        value: true,
    },
];

const search = ref('');
const selectedStatus = ref<any>([]);



const options = [
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Biller', value: 'biller' },
    { label: 'Accountant', value: 'accountant' },
    { label: 'User', value: 'user' },

];

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};


const { data: existingUser, refetch: refetchUser } = useFindUniqueUser(
  () => ({ where: { email: formData.email } }),
  { enabled: false }
);



// Pagination
const sort = ref({ column: 'name', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref(10);


const deleteUser = async (id: string) => {
  isDeleting.value = true

  const companyId = useAuth().session.value?.companyId!
  const currentUserId = useAuth().session.value?.id

  try {
    if (!users.value || users.value.length === 0) {
      throw new Error('User list not loaded')
    }

    const userToDelete = users.value.find(u => u.userId === id)
    if (!userToDelete) return

    if (userToDelete.role === 'admin') {
      const adminCount = users.value.filter(u => u.role === 'admin' && !u.deleted).length

      if (adminCount <= 1) {
        alert('At least one admin must remain in the company')
            toast.add({
            title: 'At least one admin must remain in the company!',
            description: 'You cannot delete the last admin user.',
            color: 'red',
            id: 'modal-success',
        });
        return
      }
    }

     UpdateCompanyUser.mutate({
      where: {
        companyId_userId: {
          companyId,
          userId: id,
        },
      },
        data: {
            deleted: true,
            status: false
        },
    });


    if (id === currentUserId) {
      await authLogout()
    }

    // Close detail if deleting selected user
    if (selectedUser.value?.userId === id) {
      selectedUser.value = null
    }

    await userStore.fetchUsers(companyId)
  } catch (error) {
    console.error('Failed to delete user:', error)
  } finally {
    isDeleting.value = false
    isDeleteModalOpen.value = false
  }
}


const queryArgs = computed(() => {
  const selectedStatusCondition =
    selectedStatus.value.length > 0
      ? {
          OR: selectedStatus.value.map((item) => ({
            status: item.value,
          })),
        }
      : {};

  return {
    where: {
      AND: [
        {
          companyId: useAuth().session.value?.companyId,
          deleted: false
        },
        {
          name: {
            contains: search.value,
            mode: 'insensitive',
          },
        },
        selectedStatusCondition,
      ],
    },
    include: {
      user: true,
      company: true,
    },
    orderBy: sort.value.column === 'email'
      ? { user: { email: sort.value.direction } }
      : { [sort.value.column]: sort.value.direction },
    skip: (page.value - 1) * pageCount.value,
    take: pageCount.value,
  };
});

const { data: users, isLoading } = useFindManyCompanyUser(queryArgs);

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal } = useCountCompanyUser(countArgs);

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1);
const pageTo = computed(() =>
    Math.min(page.value * pageCount.value, pageTotal.value),
);

function toggleStatus(userId: string) {
  if (!users.value) return

  const user = users.value.find(u => u.userId === userId)
  if (!user) return

  const companyId = useAuth().session.value?.companyId!

  try {
    UpdateCompanyUser.mutate({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
      data: {
        status: !user.status,
      },
    })
  } catch (error) {
    console.error('Error updating user status:', error)
  }
}


// ─── Downloads ───
const isDownloadingSales    = ref(false)
const isDownloadingExpenses = ref(false)

const downloadSales = async (format: 'excel' | 'pdf') => {
    isDownloadingSales.value = true
    try {
        const res = await $fetch.raw(`/api/downloads/user-sales.${format}`, {
            method: 'GET',
            params: {
                userId:         selectedUser.value.userId,
                startDate:      startOfDay(salesSelectedDate.value.start).toISOString(),
                endDate:        endOfDay(salesSelectedDate.value.end).toISOString(),
                search:         salesSearch.value || undefined,
                status:         salesBillStatus.value.length     ? salesBillStatus.value.join(',')     : undefined,
                paymentMethods: salesPaymentMethods.value.length ? salesPaymentMethods.value.join(',') : undefined,
                minValue:       salesMinValue.value ?? undefined,
                maxValue:       salesMaxValue.value ?? undefined,
            },
        })
        const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        const ext  = format === 'pdf' ? 'pdf' : 'xlsx'
        const blob = new Blob([res._data as ArrayBuffer], { type: mime })
        const url  = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `sales-${selectedUser.value.name}.${ext}`; a.click(); URL.revokeObjectURL(url)
    } catch (err: any) {
        toast.add({ title: 'Download failed', color: 'red', description: err.message })
    } finally {
        isDownloadingSales.value = false
    }
}

const downloadExpenses = async (format: 'excel' | 'pdf') => {
    isDownloadingExpenses.value = true
    try {
        const res = await $fetch.raw(`/api/downloads/user-expenses.${format}`, {
            method: 'GET',
            params: {
                userId:       selectedUser.value.userId,
                startDate:    startOfDay(expenseSelectedDate.value.start).toISOString(),
                endDate:      endOfDay(expenseSelectedDate.value.end).toISOString(),
                search:       expenseSearch.value || undefined,
                status:       expenseSelectedStatus.value.length   ? expenseSelectedStatus.value.join(',')   : undefined,
                category:     expenseSelectedCategory.value.length ? expenseSelectedCategory.value.join(',') : undefined,
                paymentModes: expensePaymentModes.value.length     ? expensePaymentModes.value.join(',')     : undefined,
                minAmount:    expenseMinAmount.value ?? undefined,
                maxAmount:    expenseMaxAmount.value ?? undefined,
            },
        })
        const mime = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        const ext  = format === 'pdf' ? 'pdf' : 'xlsx'
        const blob = new Blob([res._data as ArrayBuffer], { type: mime })
        const url  = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `expenses-${selectedUser.value.name}.${ext}`; a.click(); URL.revokeObjectURL(url)
    } catch (err: any) {
        toast.add({ title: 'Download failed', color: 'red', description: err.message })
    } finally {
        isDownloadingExpenses.value = false
    }
}

const salesDownloadItems = [
    [
        { label: 'Excel (.xlsx)', icon: 'i-heroicons-table-cells',    click: () => downloadSales('excel') },
        { label: 'PDF',           icon: 'i-heroicons-document-text',  click: () => downloadSales('pdf') },
    ],
]

const expensesDownloadItems = [
    [
        { label: 'Excel (.xlsx)', icon: 'i-heroicons-table-cells',    click: () => downloadExpenses('excel') },
        { label: 'PDF',           icon: 'i-heroicons-document-text',  click: () => downloadExpenses('pdf') },
    ],
]

const handleSubmit = async (e: Event) => {
    isSaving.value = true
    try {
        if(formData.id){
            await UpdateUser.mutateAsync({
    where: { id: formData.id },
    data: {
        companies: {
        update: {
            where: {
            companyId_userId: {
                companyId: useAuth().session.value?.companyId!,
                userId: formData.id
            }
            },
            data: {
            name: formData.name,
            role: formData.role.value
            }
        }
        }
    }
    });
    toast.add({
            title: 'user updated !',
            id: 'modal-success',
        });
        }
    else{
        const { data } = await refetchUser();
         if (data) {
        await UpdateUser.mutateAsync({
            where: { id: data.id },
            data: {
                companies: {
                    create: [{
                        company: {
                            connect: { id: useAuth().session.value?.companyId },
                            },
                        name: formData.name,
                        role: formData.role.value,
                    }],
                },
            },
            });

        } else {
            const res = await CreateUser.mutateAsync({
            data: {
                email: formData.email || '',
                password: await hash(formData.email),
                companies: {
                    create: {
                        name: formData.name,
                        role: formData.role.value,
                        company: {
                            connect: {
                                id: useAuth().session.value?.companyId!,
                            },
                        },
                    },
                },
            },
        });
        }

        toast.add({
            title: 'user added !',
            id: 'modal-success',
        });
    }

        formData.email = ''
        formData.name = ''
        formData.role = { label: '', value: '' }
        formData.id = ''

        isOpen.value = false;

        await userStore.fetchUsers(useAuth().session.value?.companyId!)
    } catch (err: any) {
        console.log(err.info?.message ?? err);
         toast.add({
            title: 'Unable to add user !',
            description: `${err.info?.message ?? err}`
        });
    }finally{
        isSaving.value = false
    }
};
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md ">
            <!-- ─── Left: User List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedUser ? 'w-[30%] min-w-[240px]' : 'w-full'
                ]"
            >
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
                        <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                            <div class="flex " :class="[selectedUser ? 'w-full justify-between items-center ' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search..."
                                    
                                    size="sm"
                                />
                                <USelectMenu
                                    v-model="selectedStatus"
                                    :options="todoStatus"
                                    multiple
                                    placeholder="Status"
                                    
                                    size="sm"
                                />
                            </div>
                            <div>
                                <UButton
                                    v-if="!selectedUser"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="Add user"
                                    @click="() => (isOpen = true)"
                                />
                            </div>
                        </div>
                    </template>

                    <div class="flex justify-between items-center w-full px-4 py-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
                            <USelect
                                v-model="pageCount"
                                :options="[3, 5, 10, 20, 30, 40]"
                                class="me-2 w-20"
                                size="xs"
                            />
                        </div>
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

                    <div v-if="!selectedUser">
                        <UTable
                            v-model:sort="sort"
                            :rows="users"
                            :columns="columns"
                            :loading="isLoading"
                            sort-asc-icon="i-heroicons-arrow-up"
                            sort-desc-icon="i-heroicons-arrow-down"
                            sort-mode="manual"
                            class="w-full"
                            :ui="{
                                td: { base: 'max-w-[0] truncate' },
                                tr: { base: 'cursor-pointer' },
                            }"
                            @select="selectUser"
                        >
                            <template #name-data="{ row }">
                                <div class="font-medium">{{ row.name }}</div>
                            </template>
                            <template #email-data="{ row }">
                                <div>{{ row.user?.email || '-' }}</div>
                            </template>
                            <template #role-data="{ row }">
                                <UBadge
                                    :color="row.role === 'admin' ? 'red' : row.role === 'manager' ? 'blue' : row.role === 'biller' ? 'green' : row.role === 'accountant' ? 'purple' : 'gray'"
                                    size="sm"
                                    variant="subtle"
                                >
                                    {{ row.role?.toUpperCase() }}
                                </UBadge>
                            </template>
                            <template #status-data="{ row }">
                                <UToggle
                                    :model-value="row.status"
                                    size="xs"
                                    @click.stop="toggleStatus(row.userId)"
                                />
                            </template>
                           <template #actions-data="{ row }">
                            <div @click.stop>
                                <UDropdown :items="action(row)">
                                <UButton
                                    color="gray"
                                    variant="ghost"
                                    icon="i-heroicons-ellipsis-horizontal-20-solid"
                                />
                                </UDropdown>
                            </div>
                            </template>
                        </UTable>
                    </div>

                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading users...</div>
                        <div v-else-if="!users?.length" class="p-4 text-sm text-gray-500">No users found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in users"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedUser?.userId === row.userId ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectUser(row)"
                            >
                                <div class="flex items-start gap-3">
                                    <UAvatar :alt="row.name" size="sm" />
                                    <div class="min-w-0 flex-1">
                                        
                                        <p class="mt-1 truncate text-xs text-gray-500">
                                            {{ row.role?.toUpperCase() }} - {{ row.code || '-' }}
                                        </p>
                                    </div>
                                    <div class="flex items-start justify-between gap-2">
                                        <p
                                            class="truncate text-sm"
                                            :class="selectedUser?.userId === row.userId
                                            ? 'font-semibold text-primary-700 dark:text-primary-300'
                                            : 'font-medium text-gray-900 dark:text-gray-100'"
                                        >
                                            {{ row.name }}
                                        </p>

                                        <div class="flex items-center gap-1">
                                            <div @click.stop>
                                            <UDropdown :items="action(row)">
                                                <UButton
                                                color="gray"
                                                variant="ghost"
                                                icon="i-heroicons-ellipsis-horizontal-20-solid"
                                                />
                                            </UDropdown>
                                            </div>
                                        </div>
                                        </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <!-- Pagination -->
                    <template #footer>
                        <div class="flex flex-wrap justify-between items-center">
                            <div>
                                <span class="text-xs leading-5">
                                    {{ pageFrom }}-{{ pageTo }} of {{ pageTotal }}
                                </span>
                            </div>

                            <UPagination
                                v-model="page"
                                :page-count="pageCount"
                                :total="pageTotal"
                                size="xs"
                                :ui="{
                                    wrapper: 'flex items-center gap-1',
                                    rounded: '!rounded-full min-w-[28px] justify-center',
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
            </div>

            <!-- ─── Right: Detail Panel ─── -->
            <Transition
                enter-active-class="transition-all duration-300 ease-in-out"
                enter-from-class="opacity-0 translate-x-4"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 translate-x-4"
            >
                <div v-if="selectedUser" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex items-center gap-3">
                            <UAvatar :alt="selectedUser.name" size="sm" />
                            <div>
                                <div class="font-semibold text-sm">{{ selectedUser.name }}</div>
                                <div class="text-xs text-gray-500">{{ selectedUser.user?.email }} &middot;
                                    <UBadge
                                        :color="selectedUser.role === 'admin' ? 'red' : selectedUser.role === 'manager' ? 'blue' : selectedUser.role === 'biller' ? 'green' : selectedUser.role === 'accountant' ? 'purple' : 'gray'"
                                        size="xs"
                                        variant="subtle"
                                    >{{ selectedUser.role?.toUpperCase() }}</UBadge>
                                </div>
                            </div>
                        </div>
                        <UButton
                            icon="i-heroicons-x-mark"
                            color="red"
                            variant="soft"
                            size="sm"
                            @click="closeDetail"
                        />
                    </div>
                    <!-- Tabs -->
                    <UTabs
                        v-model="activeTab"
                        :items="tabs"
                        class="flex-1 flex flex-col overflow-hidden"
                        color="primary"
                        :ui="{ list: 
                            { 
                                tab: { active: 'text-primary-600 dark:text-primary-400' },
                                background: 'bg-gray-50 dark:bg-gray-800/50 '
                            },
                          
                             }"
                    >
                        <template #item="{ item, index }">
                            <div class="flex-1 flex flex-col overflow-auto p-4">
                                <template v-if="index === 0">
                                    <UCard
                                        class="w-full"
                                        :ui="{
                                            base: '',
                                            ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                                            divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                                            header: { padding: 'px-4 py-3' },
                                            body: { padding: '' },
                                            footer: { padding: 'px-4 py-3' },
                                        }"
                                    >
                                        <template #header>
                                            <div class="flex flex-wrap items-center gap-2">
                                                <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
                                                    <UButton icon="i-heroicons-calendar-days-20-solid" size="xs" color="gray" variant="outline" truncate class="max-w-[200px]">
                                                        {{ format(salesSelectedDate.start, 'd MMM yy') }} – {{ format(salesSelectedDate.end, 'd MMM yy') }}
                                                    </UButton>
                                                    <template #panel="{ close }">
                                                        <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                                                            <div class="hidden sm:flex flex-col py-4">
                                                                <UButton
                                                                    v-for="(range, i) in ranges"
                                                                    :key="i"
                                                                    :label="range.label"
                                                                    color="gray"
                                                                    variant="ghost"
                                                                    class="rounded-none px-6"
                                                                    :class="isRangeSelected(salesSelectedDate, range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                                                                    truncate
                                                                    @click="selectRange(salesSelectedDate, range.duration)"
                                                                />
                                                            </div>
                                                            <DatePicker v-model="salesSelectedDate" @close="close" />
                                                        </div>
                                                    </template>
                                                </UPopover>
                                                <UInput
                                                    v-model="salesSearch"
                                                    icon="i-heroicons-magnifying-glass-20-solid"
                                                    placeholder="Search product / category"
                                                    class="w-48"
                                                    size="xs"
                                                />
                                            </div>
                                        </template>

                                        <div class="flex items-center justify-between gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-xs text-gray-500">Rows:</span>
                                                <USelect v-model="salesPageCount" :options="[5, 10, 20, 50]" size="xs" class="w-16" />
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <UButton
                                                    icon="i-heroicons-funnel"
                                                    size="xs"
                                                    :color="hasSalesFilter ? 'primary' : 'gray'"
                                                    variant="outline"
                                                    @click="openSalesFilter"
                                                />
                                                <UDropdown :items="salesDownloadItems">
                                                    <UButton icon="i-heroicons-arrow-down-tray" size="xs" color="gray" variant="outline" :loading="isDownloadingSales" />
                                                </UDropdown>
                                            </div>
                                        </div>

                                        <UTable
                                            :rows="formattedSalesEntries"
                                            :columns="salesColumns"
                                            :loading="salesIsLoading"
                                            class="w-full"
                                            :ui="{ td: { base: 'max-w-[0] truncate' } }"
                                        >
                                            <template #categoryName-data="{ row }">
                                                <span :class="{ 'text-red-600': row.return }">{{ row.categoryName }}</span>
                                            </template>
                                            <template #name-data="{ row }">
                                                <span :class="{ 'text-red-600': row.return }">{{ row.name || '-' }}</span>
                                            </template>
                                            <template #rate-data="{ row }">
                                                <span :class="{ 'text-red-600': row.return }">{{ row.rate }}</span>
                                            </template>
                                            <template #qty-data="{ row }">
                                                <span :class="{ 'text-red-600': row.return }">{{ row.qty }}</span>
                                            </template>
                                            <template #value-data="{ row }">
                                                <span :class="{ 'text-red-600': row.return }">{{ row.value }}</span>
                                            </template>
                                        </UTable>

                                        <template #footer>
                                            <div class="flex justify-between items-center">
                                                <span class="text-xs text-gray-500">
                                                    {{ salesPageFrom }}-{{ salesPageTo }} of {{ salesTotal || 0 }}
                                                </span>
                                                <UPagination
                                                    v-model="salesPage"
                                                    :page-count="salesPageCount"
                                                    :total="salesTotal || 0"
                                                    size="xs"
                                                    :ui="{
                                                        wrapper: 'flex items-center gap-1',
                                                        rounded: '!rounded-full min-w-[28px] justify-center',
                                                        default: { activeButton: { variant: 'outline' } },
                                                    }"
                                                />
                                            </div>
                                        </template>
                                    </UCard>
                                </template>

                                <template v-if="index === 1">
                                    <UCard
                                        class="w-full"
                                        :ui="{
                                            base: '',
                                            ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                                            divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                                            header: { padding: 'px-4 py-3' },
                                            body: { padding: '' },
                                            footer: { padding: 'px-4 py-3' },
                                        }"
                                    >
                                        <template #header>
                                            <div class="flex flex-wrap items-center gap-2">
                                                <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
                                                    <UButton icon="i-heroicons-calendar-days-20-solid" size="xs" color="gray" variant="outline" truncate class="max-w-[200px]">
                                                        {{ format(expenseSelectedDate.start, 'd MMM yy') }} – {{ format(expenseSelectedDate.end, 'd MMM yy') }}
                                                    </UButton>
                                                    <template #panel="{ close }">
                                                        <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                                                            <div class="hidden sm:flex flex-col py-4">
                                                                <UButton
                                                                    v-for="(range, i) in ranges"
                                                                    :key="i"
                                                                    :label="range.label"
                                                                    color="gray"
                                                                    variant="ghost"
                                                                    class="rounded-none px-6"
                                                                    :class="isRangeSelected(expenseSelectedDate, range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
                                                                    truncate
                                                                    @click="selectRange(expenseSelectedDate, range.duration)"
                                                                />
                                                            </div>
                                                            <DatePicker v-model="expenseSelectedDate" @close="close" />
                                                        </div>
                                                    </template>
                                                </UPopover>
                                                <UInput
                                                    v-model="expenseSearch"
                                                    icon="i-heroicons-magnifying-glass-20-solid"
                                                    placeholder="Search note / category"
                                                    class="w-44"
                                                    size="xs"
                                                />
                                                
                                            </div>
                                        </template>

                                        <div class="flex items-center justify-between gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                            <div class="flex items-center gap-1.5">
                                                <span class="text-xs text-gray-500">Rows:</span>
                                                <USelect v-model="expensePageCount" :options="[5, 10, 20, 50]" size="xs" class="w-16" />
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <UButton
                                                    icon="i-heroicons-funnel"
                                                    size="xs"
                                                    :color="hasExpenseFilter ? 'primary' : 'gray'"
                                                    variant="outline"
                                                    @click="openExpenseFilter"
                                                />
                                                <UDropdown :items="expensesDownloadItems">
                                                    <UButton icon="i-heroicons-arrow-down-tray" size="xs" color="gray" variant="outline" :loading="isDownloadingExpenses" />
                                                </UDropdown>
                                            </div>
                                        </div>

                                        <UTable
                                            :rows="expenses"
                                            :columns="expenseColumns"
                                            :loading="expenseIsLoading"
                                            class="w-full"
                                            :ui="{ td: { base: 'max-w-[0] truncate' } }"
                                        >
                                            <template #expenseDate-data="{ row }">
                                                {{ format(row.expenseDate, 'd MMM, yyy') }}
                                            </template>
                                            <template #status-data="{ row }">
                                                <UBadge
                                                    size="sm"
                                                    :color="row.status === 'Paid' ? 'green' : row.status === 'Pending' ? 'orange' : row.status === 'Approved' ? 'blue' : 'red'"
                                                    variant="subtle"
                                                >
                                                    {{ row.status }}
                                                </UBadge>
                                            </template>
                                            <template #paymentMode-data="{ row }">
                                                <UBadge
                                                    size="sm"
                                                    :color="row.paymentMode === 'CASH' ? 'green' : row.paymentMode === 'BANK' ? 'blue' : 'gray'"
                                                    variant="subtle"
                                                >
                                                    {{ row.paymentMode }}
                                                </UBadge>
                                            </template>
                                            <template #totalAmount-data="{ row }">
                                                {{ Number(row.totalAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) }}
                                            </template>
                                        </UTable>

                                        <template #footer>
                                            <div class="flex justify-between items-center">
                                                <span class="text-xs text-gray-500">
                                                    {{ expensePageFrom }}-{{ expensePageTo }} of {{ expenseTotal || 0 }}
                                                </span>
                                                <UPagination
                                                    v-model="expensePage"
                                                    :page-count="expensePageCount"
                                                    :total="expenseTotal || 0"
                                                    size="xs"
                                                    :ui="{
                                                        wrapper: 'flex items-center gap-1',
                                                        rounded: '!rounded-full min-w-[28px] justify-center',
                                                        default: { activeButton: { variant: 'outline' } },
                                                    }"
                                                />
                                            </div>
                                        </template>
                                    </UCard>
                                </template>
                            </div>
                        </template>
                    </UTabs>
                </div>
            </Transition>
        </div>

        <!-- ─── Sales Filter Modal ─── -->
        <UModal v-model="salesFilterOpen">
            <UCard>
                <template #header>
                    <div class="text-base font-semibold">Sales Filters</div>
                </template>
                <div class="space-y-3">
                    <USelectMenu
                        v-model="draftSalesBillStatus"
                        :options="['PAID', 'PENDING']"
                        multiple
                        placeholder="Status"
                    />
                    <USelectMenu
                        v-model="draftSalesPaymentMethods"
                        :options="salesPaymentOptions"
                        option-attribute="label"
                        value-attribute="value"
                        multiple
                        placeholder="Payment Method"
                    />
                    <div class="grid grid-cols-2 gap-3">
                        <UInput v-model.number="draftSalesMinValue" type="number" placeholder="Min Value" />
                        <UInput v-model.number="draftSalesMaxValue" type="number" placeholder="Max Value" />
                    </div>
                </div>
                <template #footer>
                    <div class="w-full flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" @click="salesFilterOpen = false">Cancel</UButton>
                        <UButton color="primary" @click="applySalesFilters">Apply</UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Expense Filter Modal ─── -->
        <UModal v-model="expenseFilterOpen">
            <UCard>
                <template #header>
                    <div class="text-base font-semibold">Expense Filters</div>
                </template>
                <div class="space-y-3">
                    <USelectMenu
                        v-model="draftExpenseStatus"
                        :options="['Paid', 'Pending', 'Approved', 'Rejected']"
                        multiple
                        placeholder="Status"
                    />
                    <USelectMenu
                        v-model="draftExpensePaymentModes"
                        :options="expensePaymentOptions"
                        option-attribute="label"
                        value-attribute="value"
                        multiple
                        placeholder="Payment Method"
                    />
                    <div class="grid grid-cols-2 gap-3">
                        <UInput v-model.number="draftExpenseMinAmount" type="number" placeholder="Min Amount" />
                        <UInput v-model.number="draftExpenseMaxAmount" type="number" placeholder="Max Amount" />
                    </div>
                </div>
                <template #footer>
                    <div class="w-full flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" @click="expenseFilterOpen = false">Cancel</UButton>
                        <UButton color="primary" @click="applyExpenseFilters">Apply</UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <!-- ─── Modals (unchanged) ─── -->
        <UModal v-model="isOpen">
            <UCard
                :ui="{
                    ring: '',
                    divide: 'divide-y divide-gray-100 dark:divide-gray-800',
                }"
            >
                <template #header>
                    <div> Add user </div>
                </template>

                <UFormGroup name="name" label="name" class="mb-5">
                    <UInput
                        v-model="formData.name"
                        type="text"
                        placeholder="Enter users name"
                    />
                </UFormGroup>
                <UFormGroup name="email" label="email" class="mb-5">
                    <UInput
                        v-model="formData.email"
                        type="text"
                        placeholder="Enter users email"
                    />
                </UFormGroup>
                <UFormGroup name="selectMenu" label="role" class="mb-5">
                    <USelectMenu
                        v-model="formData.role"
                        placeholder="Select user role"
                        :options="options"
                    />
                </UFormGroup>

                <template #footer>
                    <UButton
                        type="submit"
                        block
                        class="mb-5"
                        @click="handleSubmit"
                        :loading = "isSaving"
                    >
                        Continue
                    </UButton>
                </template>
            </UCard>
        </UModal>

         <UDashboardModal
        v-model="isDeleteModalOpen"
        title="Delete User"
        :description="`Are you sure you want to delete user ${deletingRowIdentinty.name}?`"
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
                :loading="isDeleting"
                @click="() => deleteUser(deletingRowIdentinty.id)"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
    </UDashboardPanelContent>
</template>

