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
const expenseTableStore = useExpenseTableStore()
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
const selectedPaymentMode = ref<string[]>([])
const draftSelectedPaymentMode = ref<string[]>([])
const isDownloadLoading = ref(false)

const paymentModeOptions = [
    { label: 'Cash',   value: 'CASH' },
    { label: 'Bank',   value: 'BANK' },
    { label: 'UPI',    value: 'UPI' },
    { label: 'Card',   value: 'CARD' },
    { label: 'Cheque', value: 'CHEQUE' },
]
const selectedDate = ref({ 
    start: new Date(new Date().setHours(0, 0, 0, 0)) , 
    end: new Date(new Date().setHours(23, 59, 59, 999)) 
});

const sort = ref({ column: 'id', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref('10');


const columns = [
    {
        key: 'expenseNumber',
        label: '#',
        sortable: true,
    },
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

const expenseWhere = computed<Prisma.ExpenseWhereInput>(() => {
    const hasMinAmount = minAmount.value !== null && Number.isFinite(Number(minAmount.value))
    const hasMaxAmount = maxAmount.value !== null && Number.isFinite(Number(maxAmount.value))
    const selectedUserIds = (selectedUsers.value || [])
      .map((u: any) => (typeof u === 'string' ? u : u?.value))
      .filter((id: any) => typeof id === 'string' && id.length > 0)
    return {
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

        ...(selectedPaymentMode.value.length && {
            paymentMode: { in: selectedPaymentMode.value }
        }),

        ...(selectedDate.value && {
            expenseDate: {
                gte: startOfDay(selectedDate.value.start),
                lte: endOfDay(selectedDate.value.end),
            }
        }),

        ...(selectedCategory.value.length && {
            expensecategoryId: { in: selectedCategory.value }
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
    }
})

// Data
const queryArgs = computed<Prisma.ExpenseFindManyArgs>(() => {
    return {
        where: expenseWhere.value,

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
const countQueryArgs = computed(() =>
    useAuth().session.value?.companyId
        ? { where: expenseWhere.value }
        : undefined
)
const { data: totalCount } = useCountExpense(countQueryArgs);
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
    emit('values', {
      pageTotal: newPageTotal,
      totalAmount: newTotalAmount,
    });
  },
  { immediate: true }
);

/* ── Summary cards — computed from current visible rows ── */
const expenseTotals = computed(() => {
  const rows = (sales.value || []) as any[]
  const sum = (mode: string) =>
    rows.filter((r) => r.paymentMode === mode).reduce((s, r) => s + Number(r.totalAmount || 0), 0)
  return {
    total:  rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0),
    cash:   sum('CASH'),
    card:   sum('CARD'),
    upi:    sum('UPI'),
    bank:   sum('BANK'),
    cheque: sum('CHEQUE'),
  }
})

const expenseSummaryCards = computed(() => [
  { label: 'Total Expense', value: expenseTotals.value.total,   mode: null,     icon: 'i-heroicons-banknotes' },
  { label: 'Cash',          value: expenseTotals.value.cash,    mode: 'CASH',   icon: 'i-heroicons-currency-rupee' },
  { label: 'Card',          value: expenseTotals.value.card,    mode: 'CARD',   icon: 'i-heroicons-credit-card' },
  { label: 'UPI',           value: expenseTotals.value.upi,     mode: 'UPI',    icon: 'i-heroicons-device-phone-mobile' },
  { label: 'Bank',          value: expenseTotals.value.bank,    mode: 'BANK',   icon: 'i-heroicons-building-library' },
  { label: 'Cheque',        value: expenseTotals.value.cheque,  mode: 'CHEQUE', icon: 'i-heroicons-document-text' },
])

const activeExpenseCardMode = computed(() => {
  if (!selectedPaymentMode.value.length) return null
  if (selectedPaymentMode.value.length === 1) return selectedPaymentMode.value[0]
  return '__multi__'
})

const handleExpenseCardClick = (mode: string | null) => {
  if (mode === null) {
    selectedPaymentMode.value = []
  } else if (selectedPaymentMode.value.length === 1 && selectedPaymentMode.value[0] === mode) {
    selectedPaymentMode.value = []
  } else {
    selectedPaymentMode.value = [mode]
  }
  page.value = 1
}

const formatPdfExpenseCurrency = (val: number) =>
  `Rs ${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatExpenseCurrency = (val: number) =>
  '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const getExpenseExportFilename = (extension: 'xlsx' | 'pdf') =>
  `Expense (${format(selectedDate.value.start, 'dd-MM-yyyy')} to ${format(selectedDate.value.end, 'dd-MM-yyyy')}).${extension}`

const pageFrom = computed(() => {
    if (!totalCount.value) return 0
    return (page.value - 1) * parseInt(pageCount.value) + 1
});
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), totalCount.value || 0),
);
const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))

watch(totalCount, (count) => {
  const totalPages = Math.max(1, Math.ceil(Number(count || 0) / parseInt(pageCount.value)))
  if (page.value > totalPages) {
    page.value = totalPages
  }
})




const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
   selectedDate.value = ({
        start: new Date(new Date().setHours(0, 0, 0, 0)) ,
        end: new Date(new Date().setHours(23, 59, 59, 999))
    })
   selectedCategory.value = [];
   selectedUsers.value = [];
   selectedPaymentMode.value = [];
   minAmount.value = null;
   maxAmount.value = null;
};

const openFilterModal = () => {
  draftSelectedStatus.value = [...selectedStatus.value]
  draftSelectedCategory.value = [...selectedCategory.value]
  draftSelectedUsers.value = [...selectedUsers.value]
  draftSelectedPaymentMode.value = [...selectedPaymentMode.value]
  draftMinAmount.value = minAmount.value
  draftMaxAmount.value = maxAmount.value
  isFilterModalOpen.value = true
}

const applyFilters = () => {
  selectedStatus.value = [...draftSelectedStatus.value]
  selectedCategory.value = [...draftSelectedCategory.value]
  selectedUsers.value = [...draftSelectedUsers.value]
  selectedPaymentMode.value = [...draftSelectedPaymentMode.value]
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
    selectedPaymentMode,
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
    selectedPaymentMode,
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
    expenseTableStore.$patch({
      search: search.value,
      selectedStatus: selectedStatus.value,
      selectedCategory: selectedCategory.value,
      selectedUsers: selectedUsers.value,
      selectedPaymentMode: selectedPaymentMode.value,
      minAmount: minAmount.value,
      maxAmount: maxAmount.value,
      selectedDate: { start: selectedDate.value.start.toISOString(), end: selectedDate.value.end.toISOString() },
      page: page.value,
      pageCount: pageCount.value,
      sort: sort.value,
      selectedColumnKeys: selectedColumnKeys.value,
    })
  },
  { deep: true }
)

onMounted(() => {
  const s = expenseTableStore
  search.value = s.search ?? ''
  selectedStatus.value = s.selectedStatus ?? []
  selectedCategory.value = s.selectedCategory ?? []
  selectedUsers.value = s.selectedUsers ?? []
  selectedPaymentMode.value = s.selectedPaymentMode ?? []
  minAmount.value = s.minAmount ?? null
  maxAmount.value = s.maxAmount ?? null
  if (s.selectedDate?.start && s.selectedDate?.end) {
    selectedDate.value = {
      start: new Date(s.selectedDate.start),
      end: new Date(s.selectedDate.end),
    }
  }
  page.value = Number(s.page || 1)
  pageCount.value = String(s.pageCount || '10')
  if (s.sort?.column && s.sort?.direction) {
    sort.value = s.sort
  }
  if (Array.isArray(s.selectedColumnKeys) && s.selectedColumnKeys.length > 0) {
    selectedColumns.value = columns.filter((c: any) =>
      s.selectedColumnKeys.includes(c.key)
    )
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

const buildExpenseExportData = (rows: any[]) => {
  const summaryRows = [
    { label: 'Total Expense', value: expenseTotals.value.total },
    { label: 'Cash', value: expenseTotals.value.cash },
    { label: 'Card', value: expenseTotals.value.card },
    { label: 'UPI', value: expenseTotals.value.upi },
    { label: 'Bank', value: expenseTotals.value.bank },
    { label: 'Cheque', value: expenseTotals.value.cheque },
  ]

  const billRows = rows.map((row: any) => ({
    expenseNumber: row.expenseNumber ? `${useAuth().session.value?.expensePrefix || 'EXP'}-${row.expenseNumber}` : '',
    expenseDate: row.expenseDate ? format(row.expenseDate, 'd MMM yyyy') : '',
    category: row.expensecategory?.name || '',
    user: row.user?.name || '',
    note: row.note || '',
    paymentMode: row.paymentMode || '',
    amount: Number(row.totalAmount || 0),
    status: row.status || '',
  }))

  return { summaryRows, billRows }
}

const handleDownloadExcel = async () => {
  isDownloadLoading.value = true
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
    const worksheet = workbook.addWorksheet('Expense Report')
    const { summaryRows, billRows } = buildExpenseExportData(rows)

    worksheet.columns = [
      { header: 'A', key: 'col1', width: 24 },
      { header: 'B', key: 'col2', width: 18 },
      { header: 'C', key: 'col3', width: 18 },
      { header: 'D', key: 'col4', width: 18 },
      { header: 'E', key: 'col5', width: 28 },
      { header: 'F', key: 'col6', width: 16 },
      { header: 'G', key: 'col7', width: 14 },
      { header: 'H', key: 'col8', width: 12 },
    ]

    worksheet.mergeCells('A1:B1')
    worksheet.getCell('A1').value = 'Expense Summary'
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
    const expensesTitleRowIndex = worksheet.lastRow!.number + 1
    worksheet.mergeCells(`A${expensesTitleRowIndex}:H${expensesTitleRowIndex}`)
    worksheet.getCell(`A${expensesTitleRowIndex}`).value = 'Expenses'
    worksheet.getCell(`A${expensesTitleRowIndex}`).font = { bold: true, size: 14 }

    const expenseHeaderRow = worksheet.addRow([
      'Expense #',
      'Date',
      'Category',
      'User',
      'Note',
      'Payment Mode',
      'Amount',
      'Status',
    ])
    expenseHeaderRow.font = { bold: true }
    expenseHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      }
    })

    billRows.forEach((row) => {
      worksheet.addRow([
        row.expenseNumber,
        row.expenseDate,
        row.category,
        row.user,
        row.note,
        row.paymentMode,
        row.amount,
        row.status,
      ])
    })

    for (let rowIndex = 3; rowIndex <= 2 + summaryRows.length; rowIndex++) {
      worksheet.getCell(`B${rowIndex}`).numFmt = '#,##0.00'
    }

    const expenseDataStart = expenseHeaderRow.number + 1
    for (let rowIndex = expenseDataStart; rowIndex < expenseDataStart + billRows.length; rowIndex++) {
      worksheet.getCell(`G${rowIndex}`).numFmt = '#,##0.00'
    }

    const buffer = await workbook.xlsx.writeBuffer()
    saveAs(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      getExpenseExportFilename('xlsx')
    )
  } catch (error: any) {
    toast.add({
      title: 'Failed to export expenses',
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
    const rows = sales.value || []
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

    const { summaryRows, billRows } = buildExpenseExportData(rows)
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
    const margin = 14
    const pageWidth = doc.internal.pageSize.getWidth()
    const session = useAuth().session.value
    const address = session?.address || {}
    const addressLines = [
      [address.street, address.locality].filter(Boolean).join(', '),
      [address.city, address.state, address.pincode].filter(Boolean).join(', '),
    ].filter(Boolean)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(session?.companyName || 'Expense Report', margin, 16)

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
    doc.text('Expense Report', pageWidth - margin, 16, { align: 'right' })
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
      body: summaryRows.map((row) => [row.label, formatPdfExpenseCurrency(row.value)]),
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
        'Expense #',
        'Date',
        'Category',
        'User',
        'Note',
        'Payment Mode',
        'Amount',
        'Status',
      ]],
      body: billRows.map((row) => [
        row.expenseNumber,
        row.expenseDate,
        row.category,
        row.user,
        row.note,
        row.paymentMode,
        formatPdfExpenseCurrency(row.amount),
        row.status,
      ]),
      tableWidth: pageWidth - margin * 2,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 26 },
        2: { cellWidth: 30 },
        3: { cellWidth: 28 },
        4: { cellWidth: 70 },
        5: { cellWidth: 24 },
        6: { halign: 'right', cellWidth: 26 },
        7: { cellWidth: 24 },
      },
    })

    doc.save(getExpenseExportFilename('pdf'))
  } catch (error: any) {
    toast.add({
      title: 'Failed to export expenses PDF',
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
    <!-- Expense Summary Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4">
      <button
        v-for="card in expenseSummaryCards"
        :key="card.label"
        class="text-left rounded-lg border px-4 py-3 transition-all focus:outline-none"
        :class="[
          (card.mode === null && activeExpenseCardMode === null) ||
          (card.mode !== null && activeExpenseCardMode === card.mode)
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 dark:border-primary-400 ring-2 ring-primary-400'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500',
        ]"
        @click="handleExpenseCardClick(card.mode)"
      >
        <div class="flex items-center gap-2 mb-1">
          <UIcon :name="card.icon" class="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{{ card.label }}</span>
        </div>
        <div class="text-base font-semibold text-gray-900 dark:text-white truncate">
          {{ formatExpenseCurrency(card.value) }}
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

        <template #expenseNumber-data="{row}">
            <span v-if="row.expenseNumber" class="font-mono text-xs">
              {{ (useAuth().session.value?.expensePrefix || 'EXP') + '-' + row.expenseNumber }}
            </span>
            <span v-else class="text-xs text-gray-400">-</span>
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
                            <span class="font-medium">{{ totalCount || 0 }}</span>
                            results
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="totalCount || 0"
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
            v-model="draftSelectedPaymentMode"
            :options="paymentModeOptions"
            option-attribute="label"
            value-attribute="value"
            multiple
            placeholder="Payment Method"
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
