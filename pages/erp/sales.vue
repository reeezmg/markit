<script setup lang="ts">

import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import { useQueryClient } from '@tanstack/vue-query'
import { getQueryKey } from '@zenstackhq/tanstack-query/runtime-v5'
const paymentOptions = ['Cash', 'UPI', 'Card']
const queryClient = useQueryClient()
const billStore = useBillStore()
const timeZone = 'Asia/Kolkata'
const SALES_TABLE_STATE_KEY = 'erp_sales_table_state_v1'
const toast = useToast();
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const isMobile = ref(false);
const isOpen = ref(false);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const paymentMethod = ref('Cash');
const activeBillInfo = ref({});


const { printBill } = usePrint();
const printData = ref(null);
const isPrintOpen = ref(false)
const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

const selectedDate = ref({ 
    start: new Date() , 
    end: new Date() 
});

const getColumns = (isMobile) => {
  if (!isMobile) {
    return [
      { key: 'invoiceNumber', label: 'Inv#', sortable: true },
      { key: 'createdAt', label: 'Date', sortable: true },
      { key: 'customer', label: 'Customer', sortable: true },
      { key: 'subtotal', label: 'Sub Total', sortable: true },
      { key: 'grandTotal', label: 'Grand Total', sortable: true },
      { key: 'paymentStatus', label: 'Payment', sortable: true },
      { key: 'notes', label: 'Notes', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false },
    ];
  }

  return [
    { key: 'invoiceNumber', label: 'Inv#', sortable: true },
    { key: 'subtotal', label: 'Sub Total', sortable: true },
    { key: 'grandTotal', label: 'Grand Total', sortable: true },
    { key: 'createdAt', label: 'Date', sortable: true },
    { key: 'customer', label: 'Customer', sortable: true },
    { key: 'paymentStatus', label: 'Payment', sortable: true },
    { key: 'notes', label: 'Notes', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false },
  ];
};

// Call it with the current isMobile value
const columns = computed(() => getColumns(isMobile.value));


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
        key: 'rate',
        label: 'Rate',
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
        key: 'value',
        label: 'Value',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
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
const action = (row: any) => {
  if (row.isMarkit) {
    return [
      [
        {
          label: 'Open',
          icon: 'i-heroicons-eye-20-solid',
          click: () => router.push(`./edit/${row.id}`),
        },
      ],
    ];
  }

  return [
    [
      {
        label: 'Print',
        icon: 'i-heroicons-printer',
        click: () => print(row.id),
      },
    ],
    [
      {
        label: 'Details',
        icon: 'i-heroicons-document-magnifying-glass',
        click: () => openBill(row.id),
      },
    ],
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
          isDeleteModalOpen.value = true;
          deletingRowIdentity.value = { name: row.invoiceNumber, id: row.id };
        },
      },
    ],
  ];
};


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



const selectedColumns = ref([]);
watch(columns, (newColumns) => {
  selectedColumns.value = [...newColumns];
}, { immediate: true });
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))

const columnsTable = computed(() =>
  columns.value.filter((column) => selectedColumns.value.includes(column))
);
// Selected Rows
const selectedRows = ref([]);
const notes = ref<any>({})

const search = ref('');
const selectedStatus = ref<any>([]);
const searchStatus = ref(undefined);
const selectedPaymentMethods = ref<any>([]);
const minGrandTotal = ref<number | null>(null);
const maxGrandTotal = ref<number | null>(null);
const isFilterModalOpen = ref(false);
const draftSelectedStatus = ref<any>([]);
const draftSelectedPaymentMethods = ref<any>([]);
const draftMinGrandTotal = ref<number | null>(null);
const draftMaxGrandTotal = ref<number | null>(null);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
    selectedPaymentMethods.value = [];
    minGrandTotal.value = null;
    maxGrandTotal.value = null;
};



// Pagination
const sort = ref({ column: 'invoiceNumber', direction: 'desc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('5');
const sales = ref([])
const pageTotal = ref(0)
const isLoading = ref(false)
const lastFetchId = ref(0)

const paymentMethodFilterOptions = [
  { label: 'Cash', value: 'Cash' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'Card' },
  { label: 'Credit', value: 'Credit' },
  { label: 'Split', value: 'Split' },
]

const fetchSales = async () => {
  isLoading.value = true
  const fetchId = ++lastFetchId.value
  try {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      body: {
        companyId: useAuth().session.value?.companyId,
        search: search.value?.trim(),
        selectedStatus: selectedStatus.value,
        selectedPaymentMethods: selectedPaymentMethods.value,
        minGrandTotal: minGrandTotal.value,
        maxGrandTotal: maxGrandTotal.value,
        startDate: startOfDay(selectedDate.value?.start).toISOString(),
        endDate: endOfDay(selectedDate.value?.end).toISOString(),
        page: page.value,
        pageCount: Number(pageCount.value),
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
      },
    })

    if (fetchId !== lastFetchId.value) return
    sales.value = res.rows
    pageTotal.value = res.total   // ✅ REAL TOTAL
  } catch (err) {
    if (fetchId !== lastFetchId.value) return
    sales.value = []
    pageTotal.value = 0
  } finally{
    if (fetchId === lastFetchId.value) {
      isLoading.value = false
    }
  }
}

watch(sales, (newSales) => {
   if(page.value > pageTotal.value) {
       page.value = 1;
   }
});


// 🔁 Immediate refetch for others
watch(
  [
    page,
    pageCount,
    search,
    selectedStatus,
    selectedPaymentMethods,
    minGrandTotal,
    maxGrandTotal,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
    () => sort.value.column,
    () => sort.value.direction,
  ],
  fetchSales
)

watch(
  [
    search,
    selectedStatus,
    selectedPaymentMethods,
    minGrandTotal,
    maxGrandTotal,
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
    selectedPaymentMethods,
    minGrandTotal,
    maxGrandTotal,
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
      SALES_TABLE_STATE_KEY,
      JSON.stringify({
        search: search.value,
        selectedStatus: selectedStatus.value,
        selectedPaymentMethods: selectedPaymentMethods.value,
        minGrandTotal: minGrandTotal.value,
        maxGrandTotal: maxGrandTotal.value,
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

const openFilterModal = () => {
  draftSelectedStatus.value = [...selectedStatus.value]
  draftSelectedPaymentMethods.value = [...selectedPaymentMethods.value]
  draftMinGrandTotal.value = minGrandTotal.value
  draftMaxGrandTotal.value = maxGrandTotal.value
  isFilterModalOpen.value = true
}

const applyFilters = async () => {
  selectedStatus.value = [...draftSelectedStatus.value]
  selectedPaymentMethods.value = [...draftSelectedPaymentMethods.value]
  minGrandTotal.value = draftMinGrandTotal.value
  maxGrandTotal.value = draftMaxGrandTotal.value
  page.value = 1
  isFilterModalOpen.value = false
  await fetchSales()
}

onMounted(() => {
  if (process.client) {
    const raw = localStorage.getItem(SALES_TABLE_STATE_KEY)
    if (raw) {
      try {
        const saved = JSON.parse(raw)
        search.value = saved.search ?? ''
        selectedStatus.value = saved.selectedStatus ?? []
        selectedPaymentMethods.value = saved.selectedPaymentMethods ?? []
        minGrandTotal.value = saved.minGrandTotal ?? null
        maxGrandTotal.value = saved.maxGrandTotal ?? null
        if (saved.selectedDate?.start && saved.selectedDate?.end) {
          selectedDate.value = {
            start: new Date(saved.selectedDate.start),
            end: new Date(saved.selectedDate.end),
          }
        }
        page.value = Number(saved.page || 1)
        pageCount.value = String(saved.pageCount || '5')
        if (saved.sort?.column && saved.sort?.direction) {
          sort.value = saved.sort
        }
        if (Array.isArray(saved.selectedColumnKeys)) {
          selectedColumns.value = columns.value.filter((c: any) =>
            saved.selectedColumnKeys.includes(c.key)
          )
        }
      } catch (e) {
        console.warn('Failed to parse sales table state', e)
      }
    }
  }

  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 640
  })
  fetchSales()
})



watch(
  () => billStore.lastUpdate,
  async () => {
    const res = await fetchSales()
  },
  { immediate: true }
)

const fetchFilteredSalesForExport = async () => {
  const allRows: any[] = []
  let exportPage = 1
  const exportPageCount = 500
  let hasMore = true
  let totalRows = 0

  while (hasMore) {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      body: {
        companyId: useAuth().session.value?.companyId,
        search: search.value?.trim(),
        selectedStatus: selectedStatus.value,
        selectedPaymentMethods: selectedPaymentMethods.value,
        minGrandTotal: minGrandTotal.value,
        maxGrandTotal: maxGrandTotal.value,
        startDate: startOfDay(selectedDate.value?.start).toISOString(),
        endDate: endOfDay(selectedDate.value?.end).toISOString(),
        page: exportPage,
        pageCount: exportPageCount,
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
      },
    })

    totalRows = Number(res?.total || 0)
    allRows.push(...(res?.rows || []))
    hasMore = allRows.length < totalRows && (res?.rows || []).length > 0
    exportPage += 1
  }

  return allRows
}

const handleDownloadExcel = async () => {
  try {
    const rows = await fetchFilteredSalesForExport()
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
    const worksheet = workbook.addWorksheet('Sales')

    worksheet.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 14 },
      { header: 'Date', key: 'createdAt', width: 22 },
      { header: 'Customer Name', key: 'customerName', width: 24 },
      { header: 'Customer Phone', key: 'customerPhone', width: 18 },
      { header: 'Sub Total', key: 'subtotal', width: 14 },
      { header: 'Grand Total', key: 'grandTotal', width: 14 },
      { header: 'Payment Status', key: 'paymentStatus', width: 14 },
      { header: 'Payment Method', key: 'paymentMethod', width: 16 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]

    rows.forEach((row: any) => {
      worksheet.addRow({
        invoiceNumber: row.invoiceNumber ?? '',
        createdAt: row.createdAt
          ? new Date(row.createdAt).toLocaleString()
          : '',
        customerName: row.client?.name ?? '',
        customerPhone: row.client?.phone ?? '',
        subtotal: Number(row.subtotal || 0),
        grandTotal: Number(row.grandTotal || 0),
        paymentStatus: row.paymentStatus ?? '',
        paymentMethod: row.paymentMethod ?? '',
        notes: row.notes ?? '',
      })
    })

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      }
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = `sales-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      filename
    )
  } catch (error: any) {
    toast.add({
      title: 'Failed to export sales',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}
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

const deleteBill = async () => {
  try {
    const res = await $fetch('/api/billSale/deleteBill', {
      method: 'POST',
      body: {
        billId: deletingRowIdentity.value.id,
        companyId: useAuth().session.value?.companyId,
      },
    })

    toast.add({
      title: `Bill No ${res.invoiceNumber} deleted successfully!`,
      color: 'green',
    })

    // 🔁 Refresh list after delete
    await fetchSales()
  } catch (error: any) {
    toast.add({
      title: 'Error while deleting the bill',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  } finally {
    isDeleteModalOpen.value = false
  }
}

const handleUpdate = async (id: string) => {
  try {
    await $fetch('/api/billSale/updateBillNotes', {
      method: 'POST',
      body: {
        billId: id,
        companyId: useAuth().session.value?.companyId,
        notes: notes.value[id],
      },
    })
    await fetchSales()
    toast.add({
      title: 'Notes updated successfully',
      color: 'green',
    })
  } catch (error: any) {
    toast.add({
      title: 'Failed to update notes',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}


const handleChange = (value:string, row:any) => {
    notes.value[row.id] = value;
};

const onPaymentStatusChange = async (
  id,
  status,
  billNo
) => {
  try {
    await $fetch('/api/billSale/updatePaymentStatus', {
      method: 'POST',
      body: {
        billId: id,
        companyId: useAuth().session.value?.companyId,
        status,
        paymentMethod: paymentMethod.value,
      },
    })

    toast.add({
      title: `Bill ${billNo} payment status changed to ${status}`,
      color: 'green',
    })

    // 🔁 Refresh list
    await fetchSales()
  } catch (err: any) {
    toast.add({
      title: 'Error while changing the bill status',
      description: err?.message || 'Something went wrong',
      color: 'red',
    })
  }
}



const handleEnterPayment = (id:string, status:string, billNo:string) => {
    if(status === 'PENDING'){
        onPaymentStatusChange(id, status, billNo)
    }else{
        isOpen.value = true
        activeBillInfo.value = {id,billNo}
    }
};
const handlePaid = () => {
    onPaymentStatusChange(activeBillInfo.value.id, 'PAID', activeBillInfo.value.billNo)
     isOpen.value = false
};


const print = async (id) => {
  const sale = sales.value.find(s => s.id === id)
  if (!sale) {
    console.error('Sale not found for id:', id)
    return
  }

  const session = useAuth().session.value

  const buildPrintDataFromSale = (sale, session) => ({
    invoiceNumber: sale.invoiceNumber,
    phone: session?.companyPhone,
    description: session?.description,
    thankYouNote: session?.thankYouNote,
    refundPolicy: session?.refundPolicy,
    returnPolicy: session?.returnPolicy,
    date: new Date(sale.createdAt).toISOString(),

    entries: sale.entries.map(entry => {
      const discountVal =
        Number(entry.discount) < 0
          ? Number(entry.discount)
          : Number(entry.discount) > 0
          ? `${Number(entry.discount)}%`
          : 0

      return {
        description: entry.barcode ? entry.name : entry.category,
        hsn: entry.hsn || '',
        qty: Number(entry.qty || 1),
        mrp: Number(entry.rate || 0),
        discount: discountVal,
        tax: Number(entry.tax || 0),
        value: Number(entry.qty || 1) * Number(entry.rate || 0),
        size: entry.size || '',
        barcode: entry.barcode,
        tvalue: Number(entry.value || 0),
      }
    }),

    subtotal: Number(sale.subtotal || 0),
    discount: Number(sale.discount || 0),
    grandTotal: Number(sale.grandTotal || 0),
    paymentMethod: sale.paymentMethod,

    companyName: session?.companyName || '',
    companyAddress: session?.address || {},
    gstin: session?.gstin || '',

    ...(sale.paymentMethod === 'Split' && {
      splitPayments: sale.splitPayments || [],
    }),

    accHolderName: session?.accHolderName || '',
    upiId: session?.upiId || '',

    clientName: sale.client?.name || '',
    clientPhone: sale.client?.phone || '',

    tqty: sale.entries.reduce((sum, e) => sum + Number(e.qty || 1), 0),
    tvalue: sale.entries.reduce(
      (sum, e) => sum + Number(e.qty || 1) * Number(e.rate || 0),
      0
    ),
    ttvalue: sale.entries.reduce(
      (sum, e) => sum + Number(e.value || 0),
      0
    ),
    tdiscount: sale.entries.reduce((sum, e) => {
      const qty = Number(e.qty || 1)
      const rate = Number(e.rate || 0)
      const d = Number(e.discount || 0)
      if (d < 0) return sum + Math.abs(d) * qty
      return sum + ((rate * d) / 100) * qty
    }, 0),
  })

  printData.value = buildPrintDataFromSale(sale, session)

  await printBill(printData.value)
}


const openBill = async (id) => {
  const sale = sales.value.find(s => s.id === id)


  if (!sale) {
    console.error('Sale not found for id:', id)
    return
  }

  const session = useAuth().session.value

  const buildPrintDataFromSale = (sale, session) => ({
    invoiceNumber: sale.invoiceNumber,
    phone: session?.companyPhone,
    description: session?.description,
    thankYouNote: session?.thankYouNote,
    refundPolicy: session?.refundPolicy,
    returnPolicy: session?.returnPolicy,
    date: new Date(sale.createdAt).toISOString(),

    entries: sale.entries.map(entry => {
      const discountVal =
        Number(entry.discount) < 0
          ? Number(entry.discount)
          : Number(entry.discount) > 0
          ? `${Number(entry.discount)}%`
          : 0

      return {
        description: entry.barcode ? entry.name : entry.category,
        hsn: entry.hsn || '',
        qty: Number(entry.qty || 1),
        mrp: Number(entry.rate || 0),
        discount: discountVal,
        tax: Number(entry.tax || 0),
        value: Number(entry.qty || 1) * Number(entry.rate || 0),
        size: entry.size || '',
        barcode: entry.barcode,
        tvalue: Number(entry.value || 0),
      }
    }),

    subtotal: Number(sale.subtotal || 0),
    discount: Number(sale.discount || 0),
    grandTotal: Number(sale.grandTotal || 0),
    paymentMethod: sale.paymentMethod,

    companyName: session?.companyName || '',
    companyAddress: session?.address || {},
    gstin: session?.gstin || '',

    ...(sale.paymentMethod === 'Split' && {
      splitPayments: sale.splitPayments || [],
    }),

    accHolderName: session?.accHolderName || '',
    upiId: session?.upiId || '',

    clientName: sale.client?.name || '',
    clientPhone: sale.client?.phone || '',

    tqty: sale.entries.reduce((sum, e) => sum + Number(e.qty || 1), 0),
    tvalue: sale.entries.reduce(
      (sum, e) => sum + Number(e.qty || 1) * Number(e.rate || 0),
      0
    ),
    ttvalue: sale.entries.reduce(
      (sum, e) => sum + Number(e.value || 0),
      0
    ),
    tdiscount: sale.entries.reduce((sum, e) => {
      const qty = Number(e.qty || 1)
      const rate = Number(e.rate || 0)
      const d = Number(e.discount || 0)
      if (d < 0) return sum + Math.abs(d) * qty
      return sum + ((rate * d) / 100) * qty
    }, 0),
  })
  
  printData.value = buildPrintDataFromSale(sale, session)
  isPrintOpen.value = true

}


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
            <div class="flex justify-between items-center gap-3 w-full">
                    <div class="flex items-center gap-3">
                      <UPopover :popper="{ placement: 'bottom-start' }" class="z-10">
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
                      <UInput
                        v-model="search"
                        icon="i-heroicons-magnifying-glass-20-solid"
                        type="text"
                        placeholder="Search Invoice"
                        class="w-full sm:w-52"
                      />
                    </div>
            </div>
        </template>
            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5 sm:block hidden">Rows per page:</span>
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
                        :disabled="search === '' && selectedStatus.length === 0 && selectedPaymentMethods.length === 0 && !minGrandTotal && !maxGrandTotal"
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
                    <UDropdown  :items="action(row)">
                        <UButton
                            color="gray"
                            variant="ghost"
                            icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                </template>

                <template #customer-data="{ row }">
                   <div class="flex flex-col">
                    {{ row.client?.phone || '-' }}<br/>
                    <div class="text-xs text-gray-500">
                        {{ row.client?.name }}
                    </div>
                   </div>
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
                                {{ payment.method }} – ₹{{ payment.amount }}
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
                    {{ new Date(row.createdAt).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) }}
                    </template>


               <template #paymentStatus-data="{ row }">
                    <USelect
                        v-model="row.paymentStatus"
                        :options="['PAID', 'PENDING']"
                        @update:model-value="status => handleEnterPayment(row.id, status,row.invoiceNumber)"
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
                        <span class="text-sm leading-5 sm:block hidden">
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
        title="Delete Bill"
        :description="`Are you sure you want to delete Bill No ${deletingRowIdentity.name}?`"
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
                @click="() =>  deleteBill()"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>

    <UModal v-model="isFilterModalOpen">
      <UCard>
        <template #header>
          <div class="text-base font-semibold">Sales Filters</div>
        </template>

        <div class="space-y-3">
          <USelectMenu
            v-model="draftSelectedStatus"
            :options="todoStatus"
            multiple
            placeholder="Status"
          />
          <USelectMenu
            v-model="draftSelectedPaymentMethods"
            :options="paymentMethodFilterOptions"
            multiple
            placeholder="Payment Method"
          />
          <div class="grid grid-cols-2 gap-3">
            <UInput
              v-model.number="draftMinGrandTotal"
              type="number"
              placeholder="Min Total"
            />
            <UInput
              v-model.number="draftMaxGrandTotal"
              type="number"
              placeholder="Max Total"
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

      
  <UModal v-model="isOpen">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
    <template #header>
      Payment method
    </template>

    <!-- default slot = body -->
    <div class="space-y-4">
      <USelect
        ref="paymentref"
        v-model="paymentMethod"
        :options="paymentOptions"
        class="w-full"
        placeholder="Choose payment method"
      />
    </div>

    <template #footer>
      <div class="flex gap-2 w-full">
        <UButton @click="handlePaid" >Submit</UButton>
      </div>
    </template>
    </UCard>
  </UModal>

  <UModal v-model="isPrintOpen">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
    <template #header>
      
    </template>

    <!-- default slot = body -->
   <ThermalReceipt :data="printData" />

    <template #footer>
      <div class="flex gap-2 w-full">
        <UButton @click="printBill(printData)" >Print</UButton>
        <UButton color="red" @click="isPrintOpen = false" >Close</UButton>
      </div>
    </template>
    </UCard>
  </UModal>

    </UDashboardPanelContent>
    
</template>


