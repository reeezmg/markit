<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import {
    useUpdateBill,
    useFindManyAccount,
    useCreateAccount,
    useUpdateAccount,
    useDeleteAccount,
    useCountAccount
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { format } from 'date-fns'
const toast = useToast();
const UpdateBill = useUpdateBill({ optimisticUpdate: true });
const CreateAccount = useCreateAccount({ optimisticUpdate: true });
const UpdateAccount = useUpdateAccount({ optimisticUpdate: true });
const DeleteAccount = useDeleteAccount({ optimisticUpdate: true });
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const accountsTableStore = useAccountsTableStore()
const isSavingAcc = ref(false);
const isOpen = ref(false);
const account = ref({
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
});
const isDeleteAccountModalOpen = ref(false)
const deletingAccountRowIdentity = ref({});
const isDeleteBillModalOpen = ref(false)
const deletingBillRowIdentity = ref({});
const isPaymentMethodModalOpen = ref(false)
const paymentMethodForPaid = ref<'Cash' | 'UPI' | 'Card'>('Cash')
const paymentMethodBillCtx = ref<{ id: string; billNo: string; row?: any } | null>(null)

const isMobile = ref(false)

// Columns
const billColumns = [
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

const desktopColumns = [
  { key: 'accountNumber', label: '#', sortable: true },
  { key: 'name',    label: 'Name',    sortable: true  },
  { key: 'phone',   label: 'Phone',   sortable: true  },
  { key: 'pending', label: 'Pending', sortable: true  },
  { key: 'actions', label: 'Actions', sortable: false },
]
const mobileColumns = [
  { key: 'name',    label: 'Name',    sortable: true  },
  { key: 'pending', label: 'Pending', sortable: true  },
  { key: 'actions', label: 'Actions', sortable: false },
]
const allColumns = computed(() => isMobile.value ? mobileColumns : desktopColumns)
const selectedColumns = ref([...desktopColumns])
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))
const columnsTable = computed(() =>
  allColumns.value.filter(c => selectedColumns.value.some((s: any) => s.key === c.key))
)
watch(allColumns, cols => { selectedColumns.value = [...cols] })

const action = (row:any) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`./edit/${row.id}`),
        },
       
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
             click: () => {
                isDeleteBillModalOpen.value = true
                deletingBillRowIdentity.value = {name:row.invoiceNumber,id:row.id}
            }
        },
    ],
    [
         {
            label: 'Send Reminder',
            icon: 'i-simple-icons-whatsapp',
            click: () => sendPendingWhatsappApi(row),
        },
    ]
];
const actionAccount = (row:any) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => openEditModal(row),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => {
                isDeleteAccountModalOpen.value = true
                deletingAccountRowIdentity.value = {name:row.name,id:row.id}
            }
        },
    ],
];

// Filters
const status = [
    {
        label: 'Paid',
        value: 'PAID',
    },
    {
        label: 'Pending',
        value: 'PENDING',
    },
];

const notes = ref<any>({})

const search = ref<string>('');
const selectedStatus = ref<any>([]);
const isFilterModalOpen = ref(false)
const draftSelectedStatus = ref<any>([])

const openFilterModal = () => {
  draftSelectedStatus.value = [...selectedStatus.value]
  isFilterModalOpen.value = true
}
const applyFilters = () => {
  selectedStatus.value = [...draftSelectedStatus.value]
  page.value = 1
  isFilterModalOpen.value = false
}
const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};



// Pagination
const sort = ref({ column: 'name', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('5');

const queryArgs = computed<Prisma.AccountFindManyArgs>(() => {
  const hasBillFilter = selectedStatus.value?.length

  const billWhere: any = { deleted: false }
  if (selectedStatus.value?.length) {
    billWhere.paymentStatus = { in: selectedStatus.value.map((s: any) => s.value) }
  }

  return {
    where: {
      companyId: useAuth().session.value?.companyId,
      ...(search.value && {
        OR: [
          { name: { contains: search.value, mode: 'insensitive' } },
          { phone: { contains: search.value, mode: 'insensitive' } },
        ],
      }),
      ...(hasBillFilter && { bill: { some: billWhere } }),
    },
    select: {
      id: true,
      accountNumber: true,
      name: true,
      phone: true,
      address: true,
      bill: {
        where: {
          deleted: false,
        },
        include: {
          entries: {
            include: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
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
    data: accounts,
    isLoading,
    error,
    refetch,
} = useFindManyAccount(queryArgs);


const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal } = useCountAccount(countArgs);

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);

const getPendingAmount = (accountRow: any) => {
  return (
    accountRow.bill
      ?.filter((b: any) => b.paymentStatus === 'PENDING')
      .reduce((sum: number, b: any) => {
        if (b.paymentMethod === 'Split' && b.splitPayments) {
          const creditAmount = b.splitPayments
            .filter((sp: any) => sp.method === 'Credit')
            .reduce((cSum: number, sp: any) => cSum + (sp.amount ?? 0), 0)
          return sum + creditAmount
        }
        return sum + (b.grandTotal ?? 0)
      }, 0) ?? 0
  )
}

const handleDownloadExcel = async () => {
  try {
    const rows = accounts.value || []
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
    const worksheet = workbook.addWorksheet('Accounts')

    const accPrefix = useAuth().session.value?.accountPrefix || 'ACC'
    worksheet.columns = [
      { header: '#', key: 'accountNumber', width: 14 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Pending Amount', key: 'pending', width: 16 },
      { header: 'Bills Count', key: 'bills', width: 12 },
    ]

    rows.forEach((row: any) => {
      worksheet.addRow({
        accountNumber: row.accountNumber ? `${accPrefix}-${row.accountNumber}` : '',
        name: row.name || '',
        phone: row.phone || '',
        pending: Number(getPendingAmount(row).toFixed(2)),
        bills: Array.isArray(row.bill) ? row.bill.length : 0,
      })
    })

    worksheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `accounts-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    )
  } catch (error: any) {
    toast.add({
      title: 'Failed to export accounts',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}

watch(
  [search, selectedStatus, pageCount],
  () => {
    if (page.value !== 1) page.value = 1
  },
  { deep: true }
)

watch(
  [
    search,
    selectedStatus,
    page,
    pageCount,
    () => sort.value.column,
    () => sort.value.direction,
    selectedColumnKeys,
  ],
  () => {
    accountsTableStore.$patch({
      search: search.value,
      selectedStatus: selectedStatus.value,
      page: page.value,
      pageCount: pageCount.value,
      sort: sort.value,
      selectedColumnKeys: selectedColumnKeys.value,
    })
  },
  { deep: true }
)

onMounted(() => {
  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 640 })
  const saved = accountsTableStore
  search.value = saved.search ?? ''
  selectedStatus.value = saved.selectedStatus ?? []
  page.value = Number(saved.page || 1)
  pageCount.value = String(saved.pageCount || '5')
  if (saved.sort?.column && saved.sort?.direction) {
    sort.value = saved.sort
  }
  if (Array.isArray(saved.selectedColumnKeys) && saved.selectedColumnKeys.length > 0) {
    selectedColumns.value = desktopColumns.filter((c: any) =>
      saved.selectedColumnKeys.includes(c.key)
    )
  }
})




const deleteBillRow = () => {
    try{
        updateBill.mutate({
        where:{
            id: deletingBillRowIdentity.value.id
        },
        data:{
            deleted:true
        }
    })
     toast.add({
            title: `Bill No ${deletingBillRowIdentity.value.name} deleted successfully!`,
            color: 'green',
        });
    }catch(err){
        toast.add({
          title: 'Error while deleting the bill entries',
          description: error.message,
          color: 'red',
        });
    }finally{
        isDeleteBillModalOpen.value = false;
    }
};



const handleUpdate = async (id:string) => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            notes:notes.value[id]
        }
    })


};

const handleChange = (value:string, row:any) => {
    notes.value[row.id] = value;
};

const onPaymentStatusChange = async (id:string, status:string, billNo, paymentMethod?: 'Cash' | 'UPI' | 'Card') => {
    try{
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            paymentStatus:status,
            ...(status === 'PAID' && paymentMethod && {
                paymentMethod
            }),
            ...(status === 'PAID' && {
                createdAt: new Date().toISOString()
            })
        }
    })
     toast.add({
          title: `Bill ${billNo} status changed to ${status}`,
          color: 'green',
        });
    }catch(err){
         toast.add({
          title: 'Error while changing the bill status',
          color: 'red',
        });
    }
}

const getReceiptLink = (billId: string) => {
  if (!process.client) return ''
  return `${window.location.origin}/receipt/${billId}`
}

const getUpiPaymentLink = (row: any) => {
  const upiId = useAuth().session.value?.upiId
  if (!upiId) return ''
  const amount = Number(row?.grandTotal || 0).toFixed(2)
  const payeeName = encodeURIComponent(useAuth().session.value?.companyName || 'Store')
  const note = encodeURIComponent(`Invoice ${row?.invoiceNumber || ''}`.trim())
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${payeeName}&am=${amount}&cu=INR&tn=${note}`
}

const sendPendingWhatsappApi = async (row: any) => {
  try {
    const phone = row?.account?.phone || row?.phone
    if (!phone) {
      toast.add({
        title: 'Phone number missing',
        description: 'Add account phone to send pending request.',
        color: 'orange',
      })
      return
    }

    await $fetch('/api/whatsapp/send-pending-template', {
      method: 'POST',
      body: {
        phone,
        name: row?.account?.name || 'Customer',
        billName: useAuth().session.value?.companyName || '',
        amount: Number(row?.grandTotal || 0).toFixed(2),
        receiptId: row?.id,
      },
    })

    toast.add({
      title: 'Pending request sent on WhatsApp',
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to send WhatsApp request',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}

const handlePaymentStatusSelect = (row: any, status: string) => {
  if (status === 'PAID') {
    // Keep row stable until user confirms payment method.
    row.paymentStatus = 'PENDING'
    paymentMethodForPaid.value = ['Cash', 'UPI', 'Card'].includes(row.paymentMethod)
      ? row.paymentMethod
      : 'Cash'
    paymentMethodBillCtx.value = {
      id: row.id,
      billNo: row.invoiceNumber,
      row
    }
    isPaymentMethodModalOpen.value = true
    return
  }

  onPaymentStatusChange(row.id, status, row.invoiceNumber)
}

const confirmPaidWithMethod = async () => {
  if (!paymentMethodBillCtx.value) return

  await onPaymentStatusChange(
    paymentMethodBillCtx.value.id,
    'PAID',
    paymentMethodBillCtx.value.billNo,
    paymentMethodForPaid.value
  )

  if (paymentMethodBillCtx.value.row) {
    paymentMethodBillCtx.value.row.paymentStatus = 'PAID'
    paymentMethodBillCtx.value.row.paymentMethod = paymentMethodForPaid.value
  }

  isPaymentMethodModalOpen.value = false
  paymentMethodBillCtx.value = null
}

const cancelPaidWithMethod = () => {
  isPaymentMethodModalOpen.value = false
  paymentMethodBillCtx.value = null
}

const openEditModal = (row:any) => {
    account.value = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        street: row.address?.street || '',
        locality: row.address?.locality || '',
        city: row.address?.city || '',
        state: row.address?.state || '',
        pincode: row.address?.pincode || '',
    };
    isOpen.value = true;
};


const submitForm = async () => {
  isSavingAcc.value = true
  try {
    
    if (!account.value.name) {
        throw new Error(`Plase Fill name`);
      }
    
    if(account.value.id){
        // Update existing account
        const res = UpdateAccount.mutate({
            where: { id: account.value.id },
            data: {
                name: account.value.name,
                phone: account.value.phone,
                address: {
                    update: {
                        street: account.value.street,
                        locality: account.value.locality,
                        city: account.value.city,
                        state: account.value.state,
                        pincode: account.value.pincode,
                    },
                },
            }
        });
        toast.add({
            title: 'Account updated !',
            id: 'modal-success',
        });
    } else {
    // Atomically get next account number
    const { number: accountNumber } = await $fetch('/api/counter/increment', {
        method: 'POST',
        body: { entity: 'account' },
    });

    const res = CreateAccount.mutate({
      data: {
                accountNumber,
                name: account.value.name,
                phone: account.value.phone,
                address: {
                    create: {
                        street: account.value.street,
                        locality: account.value.locality,
                        city: account.value.city,
                        state: account.value.state,
                        pincode: account.value.pincode,
                    },
                },
                company:{
                  connect:{
                        id:useAuth().session.value?.companyId
                      }
                  }
              }
    })
    toast.add({
            title: 'Account added !',
            id: 'modal-success',
        });
    }
    isOpen.value = false
  }catch(error){
     toast.add({
        title: 'Account creation failed!',
        description: error.message,
        color: 'red',
      });
  }finally{
    isSavingAcc.value = false
  }
};

const deleteAccountRow = async () => {
    try {
        DeleteAccount.mutate({
            where: { id: deletingAccountRowIdentity.value.id },
        });
        toast.add({
            title: `Account ${deletingAccountRowIdentity.value.name} deleted successfully!`,
            color: 'green',
        });
    } catch (error) {
        toast.add({
            title: 'Error while deleting the account',
            description: error.message,
            color: 'red',
        });
        console.log(error);
    } finally {
        isDeleteAccountModalOpen.value = false;
    }
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
            <div class="flex justify-between items-center gap-3 w-full flex-wrap">
                <div class="flex items-center gap-3 flex-wrap">
                  <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid"
                    placeholder="Search..." size="sm" class="w-full sm:w-48" />
                </div>
                <UButton icon="i-heroicons-plus" size="sm" color="primary" label="Add Account" @click="isOpen = true" />
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

                    <USelectMenu v-model="selectedColumns" :options="allColumns" multiple>
                        <UButton icon="i-heroicons-view-columns" color="gray" size="xs">Columns</UButton>
                    </USelectMenu>

                    <UButton icon="i-heroicons-arrow-down-tray" color="gray" size="xs" @click="handleDownloadExcel">
                        Download
                    </UButton>

                    <UButton icon="i-heroicons-funnel" color="gray" size="xs" @click="openFilterModal">
                        Filters
                    </UButton>

                    <UButton icon="i-heroicons-arrow-path" color="gray" size="xs" @click="resetFilters">
                        Reset
                    </UButton>
                </div>
            </div>

            <!-- Table -->
            <UTable
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="accounts"
                :columns="columnsTable"
                :loading="isLoading"
                :multiple-expand="false"
                sort-mode="manual"
                class="w-full"
            >

            <template #accountNumber-data="{ row }">
              <span v-if="row.accountNumber" class="font-mono text-xs">
                {{ (useAuth().session.value?.accountPrefix || 'ACC') + '-' + row.accountNumber }}
              </span>
              <span v-else class="text-xs text-gray-400">-</span>
            </template>

            <template #pending-data="{ row }">
              {{ getPendingAmount(row).toFixed(2) }}
            </template>

            <template #phone-data="{ row }">
              {{ row.phone || '-' }}
            </template>


                <template #actions-data="{ row }">
                <UDropdown :items="actionAccount(row)">
                    <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                    />
                </UDropdown>
            </template>

                <template #expand="{ row: accountRow }">
                    <UTable 
                        :rows="accountRow.bill" 
                        :columns="billColumns"
                    >
                        <template #actions-data="{ row }">
                            <UDropdown :items="action({ ...row, account: { name: accountRow.name, phone: accountRow.phone } })">
                                <UButton
                                    color="gray"
                                    variant="ghost"
                                    icon="i-heroicons-ellipsis-horizontal-20-solid"
                                />
                            </UDropdown>
                        </template>

                        <template #entries-data="{ row }">
                            {{ row.entries.length }}
                        </template>

                        <template #grandTotal-data="{ row }">
                            <UPopover mode="hover">
                                {{ row.grandTotal }}
                                <template #panel>
                                    <div class="p-4 space-y-1">
                                        <div class="font-semibold">Payment Method:</div>
                                        <div v-if="row.paymentMethod === 'Split'">
                                            <ul class="list-disc list-inside">
                                                <li v-for="(payment, idx) in row.splitPayments" :key="idx">
                                                    {{ payment.method }} â€“ â‚¹{{ payment.amount }}
                                                </li>
                                            </ul>
                                        </div>
                                        <div v-else>
                                            {{ row.paymentMethod }}
                                        </div>
                                    </div>
                                </template>
                            </UPopover>
                        </template>

                        <template #createdAt-data="{ row }">
                            {{ row.createdAt.toLocaleDateString('en-GB') }}
                        </template>

                        <template #paymentStatus-data="{ row }">
                            <USelect
                                v-model="row.paymentStatus"
                                :options="['PAID', 'PENDING']"
                                @update:model-value="status => handlePaymentStatusSelect(row, status)"
                                size="xs"
                                class="w-28"
                            />
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
                            rounded: '!rounded-full min-w-[32px] justify-center',
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

        
  <UModal v-model="isOpen">
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Account Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UInput v-model="account.name" label="Name" placeholder="Enter full name" required />
          <UInput v-model="account.phone" label="Phone No" placeholder="Enter Phone Number" required />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="account.street" label="Street" placeholder="Enter street name" required />
          <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required />
          <UInput v-model="account.city" label="City" placeholder="Enter city name" required />
          <UInput v-model="account.state" label="State" placeholder="Enter state name" required />
          <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required />


          <!-- Submit Button -->
          <UButton @click="submitForm" :loading="isSavingAcc" block>Submit</UButton>
        </div>
      </UModal>

      <UDashboardModal
        v-model="isDeleteAccountModalOpen"
        title="Delete Account"
        :description="`Are you sure you want to delete Account ${deletingAccountRowIdentity.name}?`"
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
                @click="() =>  deleteAccountRow()"
            />
            <UButton color="white" label="Cancel" @click="isDeleteAccountModalOpen = false" />
        </template>
    </UDashboardModal>

    <UDashboardModal
      v-model="isPaymentMethodModalOpen"
      title="Select Payment Method"
      description="Choose payment method before marking bill as paid."
      icon="i-heroicons-credit-card"
      prevent-close
      :close-button="null"
    >
      <div class="px-4 pb-2">
        <USelect
          v-model="paymentMethodForPaid"
          :options="['Cash', 'UPI', 'Card']"
        />
      </div>
      <template #footer>
        <UButton color="green" label="Confirm" @click="confirmPaidWithMethod" />
        <UButton color="white" label="Cancel" @click="cancelPaidWithMethod" />
      </template>
    </UDashboardModal>

      <UDashboardModal
        v-model="isDeleteBillModalOpen"
        title="Delete Bill"
        :description="`Are you sure you want to delete Bill ${deletingBillRowIdentity.name}?`"
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
                @click="() =>  deleteBillRow()"
            />
            <UButton color="white" label="Cancel" @click="isDeleteBillModalOpen = false" />
        </template>
    </UDashboardModal>

    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header><div class="text-base font-semibold">Filters</div></template>
        <div class="space-y-3">
          <USelectMenu v-model="draftSelectedStatus" :options="status" multiple placeholder="Payment Status" />
        </div>
        <template #footer>
          <div class="w-full flex justify-end gap-2">
            <UButton color="gray" variant="ghost" @click="isFilterModalOpen = false">Cancel</UButton>
            <UButton color="primary" @click="applyFilters">Apply</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
    </UDashboardPanelContent>
</template>
