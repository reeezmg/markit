<script setup lang="ts">

import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import { useQueryClient } from '@tanstack/vue-query'
import { getQueryKey } from '@zenstackhq/tanstack-query/runtime-v5'
const paymentOptions = ['Cash', 'UPI', 'Card']
const allPaymentOptions = ['Cash', 'UPI', 'Card', 'Credit', 'Split']
const paymentOptionsInsplit = ['Cash', 'UPI', 'Card', 'Credit']
const queryClient = useQueryClient()
const billStore = useBillStore()
const timeZone = 'Asia/Kolkata'
const salesTableStore = useSalesTableStore()
const toast = useToast();
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const isMobile = ref(false);
const isOpen = ref(false);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const paymentMethod = ref('Cash');
const activeBillInfo = ref({});
const isChangePaymentMethodOpen = ref(false)
const changePaymentMethodDraft = ref('Cash')
const changePaymentMethodBill = ref<any | null>(null)
const isSplitModalOpen = ref(false)
const splitTempSplits = ref<Record<string, { method: string; amount: number | string }>>({})
const splitBillContext = ref<any | null>(null)
const isPostChangeActionOpen = ref(false)


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
      { key: 'grandTotal', label: 'Grand Total', sortable: true },
      { key: 'paymentMethod', label: 'Method', sortable: true },
      { key: 'paymentStatus', label: 'Payment', sortable: true },
      { key: 'notes', label: 'Notes', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false },
    ];
  }

  return [
    { key: 'invoiceNumber', label: 'Inv#', sortable: true },
    { key: 'grandTotal', label: 'Grand Total', sortable: true },
    { key: 'paymentMethod', label: 'Method', sortable: true },
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
  const items = [
    [
      {
        label: 'Print',
        icon: 'i-heroicons-printer',
        click: () => print(row.id),
      },
    ],
  ]

  if (row?.paymentMethod) {
    items.push([
      {
        label: 'Change method',
        icon: 'i-heroicons-credit-card',
        click: () => openChangePaymentMethod(row),
      },
    ])
  }

  items.push(
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
  )

  return items
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
    selectedDate.value = { start: new Date(), end: new Date() };
};

const summaryCards = computed(() => [
  { label: 'Total Sales',  value: salesTotals.value.total,  method: null,     icon: 'i-heroicons-banknotes',     color: 'primary' },
  { label: 'Cash',         value: salesTotals.value.cash,   method: 'Cash',   icon: 'i-heroicons-currency-rupee', color: 'green'   },
  { label: 'Card',         value: salesTotals.value.card,   method: 'Card',   icon: 'i-heroicons-credit-card',    color: 'blue'    },
  { label: 'UPI',          value: salesTotals.value.upi,    method: 'UPI',    icon: 'i-heroicons-device-phone-mobile', color: 'violet' },
  { label: 'Credit',       value: salesTotals.value.credit, method: 'Credit', icon: 'i-heroicons-clock',          color: 'orange'  },
])

const activeCardMethod = computed(() => {
  if (selectedPaymentMethods.value.length === 0) return null
  if (selectedPaymentMethods.value.length === 1) return selectedPaymentMethods.value[0]
  return '__multi__'
})

const handleCardClick = (method: string | null) => {
  if (method === null) {
    selectedPaymentMethods.value = []
  } else if (
    selectedPaymentMethods.value.length === 1 &&
    selectedPaymentMethods.value[0] === method
  ) {
    selectedPaymentMethods.value = []
  } else {
    selectedPaymentMethods.value = [method]
  }
  page.value = 1
}

const formatCurrency = (val: number) =>
  '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })



// Pagination
const sort = ref({ column: 'invoiceNumber', direction: 'desc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('5');
const sales = ref([])
const pageTotal = ref(0)
const isLoading = ref(false)
const isDownloadLoading = ref(false)
const lastFetchId = ref(0)
const salesTotals = ref({ total: 0, cash: 0, card: 0, upi: 0, credit: 0 })

const paymentMethodFilterOptions = [
  { label: 'Cash', value: 'Cash' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'Card' },
  { label: 'Credit', value: 'Credit' },
  { label: 'Split', value: 'Split' },
]

const formatInvoiceForExport = (invoiceNumber: string | number) => {
  const prefix = useAuth().session.value?.billPrefix
  return prefix ? `${prefix}-${invoiceNumber}` : String(invoiceNumber ?? '')
}

const formatDateTimeForExport = (value: string | Date) =>
  format(new Date(value), 'd MMM yyyy, hh:mm a')

const getSalesExportFilename = (extension: 'xlsx' | 'pdf') =>
  `Sales (${format(selectedDate.value.start, 'dd-MM-yyyy')} to ${format(selectedDate.value.end, 'dd-MM-yyyy')}).${extension}`

const getUtcDateRangeForApi = () => ({
  startDate: startOfDay(selectedDate.value?.start),
  endDate: endOfDay(selectedDate.value?.end),
})

const getBillDiscountAmount = (row: any) => {
  const subtotal = Number(row.subtotal || 0)
  const tax = Number(row.tax || 0)
  const grandTotal = Number(row.grandTotal || 0)
  return Math.max(0, subtotal + tax - grandTotal)
}

const formatPdfCurrency = (val: number) =>
  `Rs ${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
        ...getUtcDateRangeForApi(),
        page: page.value,
        pageCount: Number(pageCount.value),
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
        excludeMarkit: true,
        closingDate: useAuth().session.value?.closingDate ?? null,
      },
    })

    if (fetchId !== lastFetchId.value) return
    sales.value = res.rows
    pageTotal.value = res.total   // ✅ REAL TOTAL
    if (res.totals) salesTotals.value = res.totals
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

const styledSales = computed(() =>
  (sales.value || []).map(row => ({
    ...row,
    class: row.precedence ? 'bg-red-50 text-red-600' : undefined
  }))
)

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
    salesTableStore.$patch({
      search: search.value,
      selectedStatus: selectedStatus.value,
      selectedPaymentMethods: selectedPaymentMethods.value,
      minGrandTotal: minGrandTotal.value,
      maxGrandTotal: maxGrandTotal.value,
      selectedDate: selectedDate.value
        ? { start: selectedDate.value.start.toISOString(), end: selectedDate.value.end.toISOString() }
        : null,
      page: page.value,
      pageCount: pageCount.value,
      sort: sort.value,
      selectedColumnKeys: selectedColumnKeys.value,
    })
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
  {
    const saved = salesTableStore
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
    if (Array.isArray(saved.selectedColumnKeys) && saved.selectedColumnKeys.length > 0) {
      selectedColumns.value = columns.value.filter((c: any) =>
        saved.selectedColumnKeys.includes(c.key)
      )
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
        ...getUtcDateRangeForApi(),
        page: exportPage,
        pageCount: exportPageCount,
        sortColumn: sort.value.column,
        sortDirection: sort.value.direction,
        excludeMarkit: true,
        closingDate: useAuth().session.value?.closingDate ?? null,
      },
    })

    totalRows = Number(res?.total || 0)
    allRows.push(...(res?.rows || []))
    hasMore = allRows.length < totalRows && (res?.rows || []).length > 0
    exportPage += 1
  }

  return allRows
}

const buildSalesExportData = (rows: any[]) => {
  const summaryRows = [
    { label: 'Total Sales', value: rows.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0) },
    { label: 'Total Sales - Cash', value: rows.filter((row) => row.paymentMethod === 'Cash').reduce((sum, row) => sum + Number(row.grandTotal || 0), 0) },
    { label: 'Total Sales - Card', value: rows.filter((row) => row.paymentMethod === 'Card').reduce((sum, row) => sum + Number(row.grandTotal || 0), 0) },
    { label: 'Total Sales - UPI', value: rows.filter((row) => row.paymentMethod === 'UPI').reduce((sum, row) => sum + Number(row.grandTotal || 0), 0) },
    { label: 'Total Sales - Credit', value: rows.filter((row) => row.paymentMethod === 'Credit').reduce((sum, row) => sum + Number(row.grandTotal || 0), 0) },
    { label: 'Total Discount', value: rows.reduce((sum, row) => sum + getBillDiscountAmount(row), 0) },
    { label: 'Total Tax Collected', value: rows.reduce((sum, row) => sum + Number(row.tax || 0), 0) },
  ]

  const billRows = rows.map((row: any) => ({
    invoiceNumber: formatInvoiceForExport(row.invoiceNumber),
    date: row.createdAt ? formatDateTimeForExport(row.createdAt) : '',
    subtotal: Number(row.subtotal || 0),
    discount: getBillDiscountAmount(row),
    grandTotal: Number(row.grandTotal || 0),
    taxCollected: Number(row.tax || 0),
    payment: row.paymentMethod || '',
  }))

  return { summaryRows, billRows }
}

const handleDownloadExcel = async () => {
  isDownloadLoading.value = true
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
    const worksheet = workbook.addWorksheet('Sales Report')
    const { summaryRows, billRows } = buildSalesExportData(rows)

    worksheet.columns = [
      { header: 'A', key: 'col1', width: 28 },
      { header: 'B', key: 'col2', width: 18 },
      { header: 'C', key: 'col3', width: 18 },
      { header: 'D', key: 'col4', width: 18 },
      { header: 'E', key: 'col5', width: 18 },
      { header: 'F', key: 'col6', width: 18 },
      { header: 'G', key: 'col7', width: 18 },
    ]

    worksheet.mergeCells('A1:B1')
    worksheet.getCell('A1').value = 'Sales Summary'
    worksheet.getCell('A1').font = { bold: true, size: 14 }

    worksheet.addRow(['Metric', 'Amount'])
    summaryRows.forEach((row) => {
      worksheet.addRow([row.label, row.value])
    })

    const summaryHeaderRow = worksheet.getRow(2)
    summaryHeaderRow.font = { bold: true }
    summaryHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      }
    })

    worksheet.addRow([])
    const billsTitleRowIndex = worksheet.lastRow!.number + 1
    worksheet.mergeCells(`A${billsTitleRowIndex}:G${billsTitleRowIndex}`)
    worksheet.getCell(`A${billsTitleRowIndex}`).value = 'Bills'
    worksheet.getCell(`A${billsTitleRowIndex}`).font = { bold: true, size: 14 }

    const billsHeaderRow = worksheet.addRow([
      'Invoice Number',
      'Date',
      'Subtotal',
      'Discount',
      'Grand Total',
      'Total Tax Collected',
      'Payment',
    ])
    billsHeaderRow.font = { bold: true }
    billsHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      }
    })

    billRows.forEach((row) => {
      worksheet.addRow([
        row.invoiceNumber,
        row.date,
        row.subtotal,
        row.discount,
        row.grandTotal,
        row.taxCollected,
        row.payment,
      ])
    })

    for (let rowIndex = 3; rowIndex <= 2 + summaryRows.length; rowIndex++) {
      worksheet.getCell(`B${rowIndex}`).numFmt = '#,##0.00'
    }

    const billsDataStart = billsHeaderRow.number + 1
    for (let rowIndex = billsDataStart; rowIndex < billsDataStart + billRows.length; rowIndex++) {
      worksheet.getCell(`C${rowIndex}`).numFmt = '#,##0.00'
      worksheet.getCell(`D${rowIndex}`).numFmt = '#,##0.00'
      worksheet.getCell(`E${rowIndex}`).numFmt = '#,##0.00'
      worksheet.getCell(`F${rowIndex}`).numFmt = '#,##0.00'
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = getSalesExportFilename('xlsx')
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
  } finally {
    isDownloadLoading.value = false
  }
}

const handleDownloadPdf = async () => {
  isDownloadLoading.value = true
  try {
    const rows = await fetchFilteredSalesForExport()
    if (!rows.length) {
      toast.add({
        title: 'No data to export',
        color: 'orange',
      })
      return
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const { summaryRows, billRows } = buildSalesExportData(rows)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
    const session = useAuth().session.value
    const margin = 14
    const pageWidth = doc.internal.pageSize.getWidth()
    const address = session?.address || {}
    const addressLines = [
      [address.street, address.locality].filter(Boolean).join(', '),
      [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    ].filter(Boolean)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(session?.companyName || 'Sales Report', margin, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    let headerY = 23
    addressLines.forEach((line) => {
      doc.text(line, margin, headerY)
      headerY += 5
    })
    if (session?.companyPhone) {
      doc.text(`Phone: ${session.companyPhone}`, margin, headerY)
      headerY += 5
    }

    doc.setFont('helvetica', 'bold')
    doc.text('Sales Report', pageWidth - margin, 16, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.text(
      `Period: ${format(selectedDate.value.start, 'd MMM yyyy')} - ${format(selectedDate.value.end, 'd MMM yyyy')}`,
      pageWidth - margin,
      23,
      { align: 'right' }
    )
    doc.text(`Generated on: ${format(new Date(), 'd MMM yyyy, hh:mm a')}`, pageWidth - margin, 28, { align: 'right' })

    autoTable(doc, {
      startY: Math.max(36, headerY + 4),
      head: [['Metric', 'Amount']],
      body: summaryRows.map((row) => [row.label, formatPdfCurrency(row.value)]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { halign: 'right', cellWidth: 35 },
      },
    })

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[
        'Invoice Number',
        'Date',
        'Subtotal',
        'Discount',
        'Grand Total',
        'Total Tax Collected',
        'Payment',
      ]],
      body: billRows.map((row) => [
        row.invoiceNumber,
        row.date,
        formatPdfCurrency(row.subtotal),
        formatPdfCurrency(row.discount),
        formatPdfCurrency(row.grandTotal),
        formatPdfCurrency(row.taxCollected),
        row.payment,
      ]),
      tableWidth: pageWidth - margin * 2,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 34 },
        1: { cellWidth: 44 },
        2: { halign: 'right', cellWidth: 34 },
        3: { halign: 'right', cellWidth: 34 },
        4: { halign: 'right', cellWidth: 34 },
        5: { halign: 'right', cellWidth: 42 },
        6: { cellWidth: 42 },
      },
    })

    doc.save(getSalesExportFilename('pdf'))
  } catch (error: any) {
    toast.add({
      title: 'Failed to export sales PDF',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  } finally {
    isDownloadLoading.value = false
  }
}

const downloadItems = [[
  {
    label: 'Excel',
    icon: 'i-heroicons-table-cells',
    click: () => handleDownloadExcel(),
  },
  {
    label: 'PDF',
    icon: 'i-heroicons-document',
    click: () => handleDownloadPdf(),
  },
]]
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

const buildSplitTempSplits = (splitPayments: any[] = []) => {
  const existingPayments = Array.isArray(splitPayments) ? splitPayments : []
  return paymentOptionsInsplit.reduce((acc, method) => {
    const existing = existingPayments.find((payment) => payment.method === method)
    acc[method] = {
      method,
      amount: existing?.amount ?? '',
    }
    return acc
  }, {} as Record<string, { method: string; amount: number | string }>)
}

const buildPrintDataFromSale = (sale: any, session: any) => ({
  invoiceNumber: sale.invoiceNumber,
  phone: session?.companyPhone,
  description: session?.description,
  thankYouNote: session?.thankYouNote,
  refundPolicy: session?.refundPolicy,
  returnPolicy: session?.returnPolicy,
  date: new Date(sale.createdAt).toISOString(),

  entries: sale.entries.map((entry: any) => {
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

  tqty: sale.entries.reduce((sum: number, e: any) => sum + Number(e.qty || 1), 0),
  tvalue: sale.entries.reduce(
    (sum: number, e: any) => sum + Number(e.qty || 1) * Number(e.rate || 0),
    0
  ),
  ttvalue: sale.entries.reduce(
    (sum: number, e: any) => sum + Number(e.value || 0),
    0
  ),
  tdiscount: sale.entries.reduce((sum: number, e: any) => {
    const qty = Number(e.qty || 1)
    const rate = Number(e.rate || 0)
    const d = Number(e.discount || 0)
    if (d < 0) return sum + Math.abs(d) * qty
    return sum + ((rate * d) / 100) * qty
  }, 0),
})

const openChangePaymentMethod = (row: any) => {
  if (row?.paymentMethod === 'Split') {
    openSplitModal(row)
    return
  }
  changePaymentMethodBill.value = { ...row }
  changePaymentMethodDraft.value = row.paymentMethod || 'Cash'
  isChangePaymentMethodOpen.value = true
}

const openSplitModal = (row: any) => {
  splitBillContext.value = { ...row }
  splitTempSplits.value = buildSplitTempSplits(row?.splitPayments || [])
  isSplitModalOpen.value = true
}

watch(changePaymentMethodDraft, (value) => {
  if (value === 'Split' && changePaymentMethodBill.value) {
    isChangePaymentMethodOpen.value = false
    openSplitModal(changePaymentMethodBill.value)
  }
})

const updateBillPaymentMethod = async () => {
  if (!changePaymentMethodBill.value) return

  try {
    await $fetch('/api/billSale/updatePaymentMethod', {
      method: 'POST',
      body: {
        billId: changePaymentMethodBill.value.id,
        companyId: useAuth().session.value?.companyId,
        paymentMethod: changePaymentMethodDraft.value,
        splitPayments: null,
      },
    })

    const updatedSale = {
      ...changePaymentMethodBill.value,
      paymentMethod: changePaymentMethodDraft.value,
    }

    if (changePaymentMethodDraft.value !== 'Split') {
      updatedSale.splitPayments = changePaymentMethodBill.value.splitPayments || []
    }

    printData.value = buildPrintDataFromSale(updatedSale, useAuth().session.value)
    isChangePaymentMethodOpen.value = false
    isPostChangeActionOpen.value = true

    toast.add({
      title: 'Payment method updated successfully',
      color: 'green',
    })

    await fetchSales()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update payment method',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}

const onSplitConfirmed = async (confirmedPayments: Array<{ method: string; amount: number | string }>) => {
  if (!changePaymentMethodBill.value && !splitBillContext.value) return

  const bill = splitBillContext.value || changePaymentMethodBill.value

  try {
    await $fetch('/api/billSale/updatePaymentMethod', {
      method: 'POST',
      body: {
        billId: bill.id,
        companyId: useAuth().session.value?.companyId,
        paymentMethod: 'Split',
        splitPayments: confirmedPayments,
      },
    })

    const updatedSale = {
      ...bill,
      paymentMethod: 'Split',
      splitPayments: confirmedPayments,
    }

    printData.value = buildPrintDataFromSale(updatedSale, useAuth().session.value)
    isSplitModalOpen.value = false
    isPostChangeActionOpen.value = true

    toast.add({
      title: 'Split payment updated successfully',
      color: 'green',
    })

    await fetchSales()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update split payment',
      description: error?.message || 'Something went wrong',
      color: 'red',
    })
  }
}

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
  
  printData.value = buildPrintDataFromSale(sale, session)
  isPrintOpen.value = true

}

const send = async () => {
  isPrintOpen.value = false
  isPostChangeActionOpen.value = false
  try {
    if (!printData.value?.clientPhone) {
      throw new Error('Client phone number is missing')
    }

    await $fetch('/api/whatsapp/send-payment-template', {
      method: 'POST',
      body: {
        phone: printData.value.clientPhone,
        name: printData.value.clientName,
        billName: printData.value.companyName,
        amount: printData.value.grandTotal,
        paymentDate: printData.value.date,
        receiptId: crypto.randomUUID?.() || String(Date.now()),
      },
    })

    toast.add({
      title: 'Receipt sent successfully',
      color: 'green',
    })
  } catch (err: any) {
    isPostChangeActionOpen.value = true
    toast.add({
      title: 'Receipt send failed!',
      description: err.message,
      color: 'red',
    })
  }
}

const printCurrentReceipt = async () => {
  isPrintOpen.value = false
  isPostChangeActionOpen.value = false
  try {
    await printBill(printData.value)
    toast.add({
      title: 'Printing Success!',
      color: 'green',
    })
  } catch (err: any) {
    isPostChangeActionOpen.value = true
    toast.add({
      title: 'Printing failed!',
      description: err.message,
      color: 'red',
    })
  }
}

const download = async () => {
  isPrintOpen.value = false
  isPostChangeActionOpen.value = false
  try {
    const { generateThermalReceiptPDF } = await import('~/utils/thermal-receipt.client')
    await generateThermalReceiptPDF(printData.value, 'receipt.pdf')
    toast.add({
      title: 'Download success!',
      color: 'green',
    })
  } catch (err: any) {
    isPostChangeActionOpen.value = true
    toast.add({
      title: 'Download failed!',
      description: err.message,
      color: 'red',
    })
  }
}


</script>

<template>
    <UDashboardPanelContent class="pb-24">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <button
            v-for="card in summaryCards"
            :key="card.label"
            class="text-left rounded-lg border px-4 py-3 transition-all focus:outline-none"
            :class="[
              (card.method === null && activeCardMethod === null) ||
              (card.method !== null && activeCardMethod === card.method)
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 dark:border-primary-400 ring-2 ring-primary-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500',
            ]"
            @click="handleCardClick(card.method)"
          >
            <div class="flex items-center gap-2 mb-1">
              <UIcon :name="card.icon" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ card.label }}</span>
            </div>
            <div class="text-base font-semibold text-gray-900 dark:text-white truncate">
              {{ formatCurrency(card.value) }}
            </div>
          </button>
        </div>

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

                    <UDropdown :items="downloadItems" :ui="{ width: 'w-32' }">
                        <UButton
                            icon="i-heroicons-arrow-down-tray"
                            color="gray"
                            size="xs"
                            trailing
                            :loading="isDownloadLoading"
                            :disabled="isDownloadLoading"
                        >
                            Download
                        </UButton>
                    </UDropdown>

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

            <!-- Table -->
            <UTable
                v-model="selectedRows"
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="styledSales"
                :columns="columnsTable"
                :loading="isLoading"
                :multiple-expand="false"
                sort-mode="manual"
                class="w-full"
            >

                <template #invoiceNumber-data="{ row }">
                    {{ useAuth().session.value?.billPrefix ? `${useAuth().session.value.billPrefix}-${row.invoiceNumber}` : row.invoiceNumber }}
                </template>

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
                    <span>{{ row.grandTotal }}</span>
                </template>

                <template #paymentMethod-data="{ row }">
                    <button
                      v-if="row.paymentMethod === 'Split'"
                      type="button"
                      class="text-primary-600 dark:text-primary-400 underline underline-offset-2"
                      @click="openSplitModal(row)"
                    >
                      Split
                    </button>
                    <span v-else>{{ row.paymentMethod }}</span>
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

  <UModal v-model="isChangePaymentMethodOpen">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
      <template #header>
        Change payment method
      </template>

      <div class="space-y-4">
        <USelect
          v-model="changePaymentMethodDraft"
          :options="allPaymentOptions"
          class="w-full"
          placeholder="Choose payment method"
        />
      </div>

      <template #footer>
        <div class="flex gap-2 w-full">
          <UButton :disabled="!changePaymentMethodDraft" @click="updateBillPaymentMethod">Save</UButton>
          <UButton color="red" variant="ghost" @click="isChangePaymentMethodOpen = false">Cancel</UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <BillingSplitModal
    v-model="isSplitModalOpen"
    v-model:tempSplits="splitTempSplits"
    :grand-total="Number(splitBillContext?.grandTotal || changePaymentMethodBill?.grandTotal || 0)"
    :payment-options-in-split="paymentOptionsInsplit"
    @confirmed="onSplitConfirmed"
  />

  <UModal v-model="isPostChangeActionOpen">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
      <template #header>
        What would you like to do next?
      </template>

      <div class="space-y-2">
        <div class="text-sm text-gray-500">
          Choose how to use the updated bill receipt.
        </div>
      </div>

      <template #footer>
        <div class="flex flex-wrap gap-2 w-full">
          <UButton @click="printCurrentReceipt">Print</UButton>
          <UButton color="gray" variant="soft" @click="send">Send</UButton>
          <UButton color="gray" variant="outline" @click="download">Download</UButton>
          <UButton color="red" variant="ghost" @click="isPostChangeActionOpen = false">Close</UButton>
        </div>
      </template>
    </UCard>
  </UModal>

    </UDashboardPanelContent>
    
</template>


