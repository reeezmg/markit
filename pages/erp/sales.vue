<script setup lang="ts">
const companyScope = useCompanyScope('table');
const $fetch = companyScope.fetch;


import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
import { startOfDay, endOfDay } from 'date-fns'
import { useQueryClient } from '@tanstack/vue-query'
import { invoiceBalance } from '~/utils/invoice-flow'
import { salesViews, salesView as readSalesView, salesInvoiceView, salesExportColumns } from '~/utils/sales-view'
import { billingErrorMessage } from '~/utils/billing-error'
import { receiptStatus } from '~/utils/bill-credit'
import BillingPreferences from '~/components/Billing/Preferences.vue'
import SalesDetailPanel from '~/components/Sales/DetailPanel.vue'
import { emptyBillingPreferences } from '~/utils/billing-preferences'
import { getQueryKey } from '@zenstackhq/tanstack-query/runtime-v5'
const paymentOptions = ['Cash', 'UPI', 'Card']
const allPaymentOptions = ['Cash', 'UPI', 'Card', 'Credit', 'Split']
const paymentOptionsInsplit = ['Cash', 'UPI', 'Card', 'Credit']
const queryClient = useQueryClient()
const billStore = useBillStore()
const timeZone = 'Asia/Kolkata'
const salesTableStore = useSalesTableStore()
const toast = useToast();
const route = useRoute()
const salesView = computed(() => readSalesView(route.query.view))
const invoiceView = computed(() => salesInvoiceView(salesView.value))
const dateFilter = ref<'all'|'range'>(invoiceView.value ? 'all' : 'range')
const preferenceDocument = computed(() => invoiceView.value ? 'invoice' as const : 'sale' as const)
const documentBusy = ref(''), loadError = ref('')
const preferencesOpen = ref(false), preferences = ref(emptyBillingPreferences('sale'))
const preferenceCompanyId = computed(() => companyScope.readIds.value.length === 1 ? companyScope.readIds.value[0] : companyScope.companyId.value)
let preferenceVersion = 0
async function loadPreferences() {
  const version = ++preferenceVersion
  try {
    const result = await $fetch<any>('/api/settings/billing-preferences', { query: { document: preferenceDocument.value }, headers: { 'x-company-id': preferenceCompanyId.value } })
    if (version === preferenceVersion) {
      preferences.value = result.preferences
      if (result.configured) {
        if (pageCount.value !== String(result.preferences.pageSize)) page.value = 1
        pageCount.value = String(result.preferences.pageSize)
      }
    }
  } catch { if (version === preferenceVersion) preferences.value = emptyBillingPreferences('sale') }
}
watch([preferenceCompanyId, preferenceDocument], loadPreferences)
onBeforeUnmount(() => { preferenceVersion++ })
const router = useRouter();
const useAuth = () => companyScope.auth;
const { forOwner } = useOrganizationActions();
const canUseCleanupToggle = computed(() => useAuth().session.value?.cleanup === true)
const showCleanedValues = ref(false)
const canSeeCleanupRealValues = computed(() => canUseCleanupToggle.value && !showCleanedValues.value)
const isMobile = ref(false);
const isOpen = ref(false);
const creditReceiptOpen = ref(false);
const creditReceiptBill = ref<any>(null);
const creditReceiptMode = ref<'collect' | 'reverse'>('collect');
const canCollectPayment = (bill: any) => bill.paymentStatus !== 'PAID' && Number(bill.balanceDue ?? invoiceBalance(bill).balanceDue) > 0;
const hasReversiblePayments = (bill: any) => bill.payments?.some((payment: any) => payment.status === receiptStatus && !payment.deleted) === true;
const openCreditCollection = (bill: any, mode: 'collect' | 'reverse' = 'collect') => {
  creditReceiptBill.value = { ...bill };
  creditReceiptMode.value = mode;
  creditReceiptOpen.value = true;
};
const showRequiredReversal = (row: any) => {
  isDeleteModalOpen.value = false;
  isChangePaymentMethodOpen.value = false;
  isSplitModalOpen.value = false;
  toast.add({title:'Reverse collected payments first',description:'You need to reverse all collected payments first, then retry Delete or Change method.',color:'orange'});
  openCreditCollection({...row,companyId:row.companyId || useAuth().session.value?.companyId}, 'reverse');
};
const requireReceiptReversal = (row: any, error?: any) => {
  const code = error?.data?.data?.code || error?.data?.code;
  if (code !== 'BILL_RECEIPTS_REQUIRE_REVERSAL' && !row?.payments?.some((p:any)=>p.status === receiptStatus && !p.deleted)) return false;
  showRequiredReversal(row);
  return true;
};
const openDeleteBill = (row: any) => {
  if (requireReceiptReversal(row)) return;
  deletingRowIdentity.value = {...row,name:row.invoiceNumber};
  isDeleteModalOpen.value = true;
};
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref<any>({})
const paymentMethod = ref('Cash');
const activeBillInfo = ref<any>({});
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
const selectedSale = ref<any>(null)
const detailRevision = ref(0)
let ignoreSaleClick = false
const rememberSaleClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  ignoreSaleClick = Boolean(target?.closest('button,a,input,select,textarea,[role="checkbox"],[role="combobox"]'))
}
const selectSale = (row: any) => { selectedSale.value = row }
const selectSaleRow = (row: any) => { if (!ignoreSaleClick) selectSale(row) }
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

const getColumns = (isMobile: boolean) => {
  if (!isMobile) {
    const desktopColumns = [
      { key: 'invoiceNumber', label: 'Sale / invoice', sortable: true },
      ...(useAuth().session.value?.allStores ? [{ key: 'companyName', label: 'Store', sortable: false }] : []),
      { key: 'createdAt', label: 'Date', sortable: true },
      { key: 'customer', label: 'Customer', sortable: true },
      { key: 'grandTotal', label: 'Grand Total', sortable: true },
      { key: 'paymentMethod', label: 'Method', sortable: true },
      { key: 'paymentStatus', label: 'Payment', sortable: true },
      { key: 'notes', label: 'Notes', sortable: true },
      { key: 'actions', label: 'Actions', sortable: false },
    ];
    if (canSeeCleanupRealValues.value) {
      desktopColumns.splice(4, 0, { key: 'originalGrandTotal', label: 'Real Total', sortable: false })
    }
    return desktopColumns
  }

  const mobileColumns = [
    { key: 'invoiceNumber', label: 'Sale / invoice', sortable: true },
    ...(useAuth().session.value?.allStores ? [{ key: 'companyName', label: 'Store', sortable: false }] : []),
    { key: 'grandTotal', label: 'Grand Total', sortable: true },
    { key: 'paymentMethod', label: 'Method', sortable: true },
    { key: 'createdAt', label: 'Date', sortable: true },
    { key: 'customer', label: 'Customer', sortable: true },
    { key: 'paymentStatus', label: 'Payment', sortable: true },
    { key: 'notes', label: 'Notes', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false },
  ];
  if (canSeeCleanupRealValues.value) {
    mobileColumns.splice(2, 0, { key: 'originalGrandTotal', label: 'Real Total', sortable: false })
  }
  return mobileColumns
};

// Call it with the current isMobile value
const columns = computed(() => {
  const result = getColumns(isMobile.value)
  if (invoiceView.value) {
    const index = result.findIndex(column => column.key === 'grandTotal') + 1
    result.splice(index, 0,
      {key:'dueDate',label:'Due date',sortable:true},
      {key:'amountReceived',label:'Received',sortable:true},
      {key:'balanceDue',label:'Balance',sortable:true},
      {key:'invoicePaymentTerms',label:'Payment terms',sortable:false},
      {key:'subject',label:'Subject',sortable:false},
      {key:'sendStatus',label:'Sending',sortable:false},
    )
  }
  return result
});


const entrycolumns = computed(() => [
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
    ...(canSeeCleanupRealValues.value ? [{
        key: 'originalRate',
        label: 'Real Rate',
        sortable: true,
    }] : []),
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
    ...(canSeeCleanupRealValues.value ? [{
        key: 'originalDiscount',
        label: 'Real Discount',
        sortable: true,
    }] : []),
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
    ...(canSeeCleanupRealValues.value ? [{
        key: 'originalValue',
        label: 'Real Value',
        sortable: true,
    }] : []),
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
]);




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
  const items: Array<Array<{label:string;icon:string;click:()=>void|Promise<unknown>;disabled?:boolean}>> = [
    [
      {
        label: 'Print',
        icon: 'i-heroicons-printer',
        click: () => print(row.id),
      },
      {
        label: 'View / share receipt',
        icon: 'i-heroicons-share',
        click: () => navigateTo(`/receipt/${encodeURIComponent(row.id)}${row.companyId ? `?companyId=${encodeURIComponent(row.companyId)}` : ''}`),
      },
    ],
  ]
  if (row.invoiceCode) items[0].push(
    { label: row.sendStatus === 'Not sent' ? 'Send invoice' : 'Resend invoice', icon:'i-heroicons-paper-airplane', click:()=>sendSale(row) },
    { label:'Download PDF',icon:'i-heroicons-arrow-down-tray',click:()=>downloadSale(row) },
  )
  if (row.paymentMethod === 'Credit' || row.splitPayments?.some((part: any) => part.method === 'Credit')) items.push([
    {label:'Record payment',icon:'i-heroicons-banknotes',disabled:Number(row.balanceDue ?? invoiceBalance(row).balanceDue)<=0,click:()=>openCreditCollection(row)},
    {label:'Payment history',icon:'i-heroicons-clock',click:()=>openCreditCollection(row,'reverse')},
  ])
  else if (row.payments?.length) items.push([
    {label:'Payment history',icon:'i-heroicons-clock',click:()=>openCreditCollection(row,'reverse')},
  ])

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
        click: () => router.push({path:`/erp/edit/${row.id}`,query:{entryCompany:row.companyId}}),
      },
    ],
    [
      {
        label: 'Delete',
        icon: 'i-heroicons-trash-20-solid',
        click: () => openDeleteBill(row),
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



const selectedColumns = ref<ReturnType<typeof getColumns>>([]);
watch(columns, (newColumns) => {
  selectedColumns.value = [...newColumns];
}, { immediate: true });
const selectedColumnKeys = computed(() => selectedColumns.value.map((c: any) => c.key))

const columnsTable = computed(() =>
  columns.value.filter((column) => selectedColumns.value.some(selected => selected.key === column.key))
);
// Selected Rows
const selectedRows = ref([]);
const notes = ref<any>({})

const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
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
    dateFilter.value = invoiceView.value ? 'all' : 'range'
};

watch(salesView, () => {
  selectedStatus.value = []; selectedPaymentMethods.value = []; page.value = 1
  selectedRows.value = []; expand.value = { openedRows: [], row: null }
  dateFilter.value = invoiceView.value ? 'all' : 'range'
})
watch(() => route.query.q, value => { search.value = typeof value === 'string' ? value : '' })

const summaryCards = computed(() => invoiceView.value ? [
  {label:'Sales total',value:salesTotals.value.total,method:null,icon:'i-heroicons-document-text',color:'primary'},
  {label:'Received',value:salesTotals.value.received || 0,method:null,icon:'i-heroicons-banknotes',color:'green'},
  {label:'Balance due',value:salesTotals.value.balance || 0,method:null,icon:'i-heroicons-clock',color:'orange'},
  {label:'Overdue',value:salesTotals.value.overdue || 0,method:null,icon:'i-heroicons-exclamation-circle',color:'red'},
] : [
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
const salesTotals = ref({ total: 0, cash: 0, card: 0, upi: 0, credit: 0, received:0, balance:0, overdue:0 })
const collectionsTotal = ref<number | null>(null)
const collectionMethods = ['Cash', 'UPI', 'Card', 'Bank', 'Cheque'] as const
const collectionsByMethod = ref<Partial<Record<typeof collectionMethods[number], number>> | null>(null)

const paymentMethodFilterOptions = [
  { label: 'Cash', value: 'Cash' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'Card' },
  { label: 'Credit', value: 'Credit' },
  { label: 'Split', value: 'Split' },
]

const formatInvoiceForExport = (invoiceNumber: string | number, prefix?: string | null) => {
  return prefix ? `${prefix}-${invoiceNumber}` : String(invoiceNumber ?? '')
}

const formatDateTimeForExport = (value: string | Date) =>
  format(new Date(value), 'd MMM yyyy, hh:mm a')

const getSalesExportFilename = (extension: 'xlsx' | 'pdf') =>
  `Sales - ${salesViews.find(view=>view.value===salesView.value)?.label} (${dateFilter.value==='all'?'All dates':format(selectedDate.value.start, 'dd-MM-yyyy')+' to '+format(selectedDate.value.end, 'dd-MM-yyyy')}).${extension}`

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
  loadError.value = ''
  const fetchId = ++lastFetchId.value
  try {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      body: {
        companyId: useAuth().session.value?.companyId,
        search: search.value?.trim(),
        salesView: salesView.value,
        dateFilter: dateFilter.value,
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
        showCleanedValues: canUseCleanupToggle.value && showCleanedValues.value,
      },
    })

    if (fetchId !== lastFetchId.value) return
    sales.value = res.rows
    detailRevision.value++
    pageTotal.value = res.total   // ✅ REAL TOTAL
    if (res.totals) salesTotals.value = res.totals
    collectionsTotal.value = res.collections?.creditRepayments ?? null
    collectionsByMethod.value = res.collections?.byMethod ?? null
  } catch (err) {
    if (fetchId !== lastFetchId.value) return
    sales.value = []
    pageTotal.value = 0
    collectionsTotal.value = null
    collectionsByMethod.value = null
    salesTotals.value = {total:0,cash:0,card:0,upi:0,credit:0,received:0,balance:0,overdue:0}
    loadError.value = billingErrorMessage(err)
  } finally{
    if (fetchId === lastFetchId.value) {
      isLoading.value = false
    }
  }
}

await companyScope.ready;
const initialSales = await useAsyncData('erp-sales:' + companyScope.readIds.value.join(',') + ':' + salesView.value + ':' + search.value, async () => {
  await fetchSales();
  return { rows: sales.value, total: pageTotal.value, totals: salesTotals.value, collections: collectionsTotal.value, collectionsByMethod: collectionsByMethod.value };
});
if (initialSales.data.value) {
  sales.value = initialSales.data.value.rows;
  pageTotal.value = initialSales.data.value.total;
  salesTotals.value = initialSales.data.value.totals;
  collectionsTotal.value = initialSales.data.value.collections;
  collectionsByMethod.value = initialSales.data.value.collectionsByMethod;
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
    salesView,
    dateFilter,
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
    showCleanedValues,
  ],
  fetchSales
)

watch(
  [
    search,
    dateFilter,
    selectedStatus,
    selectedPaymentMethods,
    minGrandTotal,
    maxGrandTotal,
    pageCount,
    () => selectedDate.value?.start,
    () => selectedDate.value?.end,
    showCleanedValues,
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

onMounted(async () => {
  {
    const saved = salesTableStore
    search.value = typeof route.query.q === 'string' ? route.query.q : saved.search ?? ''
    selectedStatus.value = route.query.view ? [] : saved.selectedStatus ?? []
    selectedPaymentMethods.value = route.query.view ? [] : saved.selectedPaymentMethods ?? []
    minGrandTotal.value = route.query.view ? null : saved.minGrandTotal ?? null
    maxGrandTotal.value = route.query.view ? null : saved.maxGrandTotal ?? null
    if (saved.selectedDate?.start && saved.selectedDate?.end) {
      selectedDate.value = {
        start: new Date(saved.selectedDate.start),
        end: new Date(saved.selectedDate.end),
      }
    }
    page.value = route.query.view || route.query.q ? 1 : Number(saved.page || 1)
    pageCount.value = String(saved.pageCount || '5')
    if (saved.sort?.column && saved.sort?.direction) {
      sort.value = saved.sort
    }
    if (!invoiceView.value && Array.isArray(saved.selectedColumnKeys) && saved.selectedColumnKeys.length > 0) {
      selectedColumns.value = columns.value.filter((c: any) =>
        saved.selectedColumnKeys.includes(c.key)
      )
    }
  }

  isMobile.value = window.innerWidth < 640
  window.addEventListener('resize', onResize)
  await loadPreferences()
  fetchSales()
})
function onResize() { isMobile.value = window.innerWidth < 640 }
onBeforeUnmount(() => { window.removeEventListener('resize', onResize); lastFetchId.value++ })



watch(() => billStore.lastUpdate, fetchSales)

const fetchFilteredSalesForExport = async () => {
  const allRows: any[] = []
  let exportPage = 1
  const exportPageCount = 500
  let hasMore = true
  let totalRows = 0
  const filters = JSON.parse(JSON.stringify({
    companyId:useAuth().session.value?.companyId,search:search.value?.trim(),salesView:salesView.value,dateFilter:dateFilter.value,
    selectedStatus:selectedStatus.value,selectedPaymentMethods:selectedPaymentMethods.value,
    minGrandTotal:minGrandTotal.value,maxGrandTotal:maxGrandTotal.value,...getUtcDateRangeForApi(),
    sortColumn:sort.value.column,sortDirection:sort.value.direction,excludeMarkit:true,
    closingDate:useAuth().session.value?.closingDate ?? null,showCleanedValues:canUseCleanupToggle.value && showCleanedValues.value,
  }))
  const headers = {'x-company-id':companyScope.companyId.value,'x-company-filter':companyScope.readIds.value.length===1?companyScope.readIds.value[0]:'*'}

  while (hasMore) {
    const res = await $fetch('/api/billSale/findManyBills', {
      method: 'POST',
      headers,
      body: {
        ...filters,
        page: exportPage,
        pageCount: exportPageCount,
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
    invoiceNumber: row.invoiceCode || formatInvoiceForExport(row.invoiceNumber, row.billPrefix),
    companyName: row.companyName || '',
    date: row.createdAt ? formatDateTimeForExport(row.createdAt) : '',
    subtotal: Number(row.subtotal || 0),
    discount: getBillDiscountAmount(row),
    grandTotal: Number(row.grandTotal || 0),
    taxCollected: Number(row.tax || 0),
    payment: row.paymentMethod || '',
    customer: row.client?.name || row.client?.phone || '',
    dueDate: row.dueDate || '',
    amountReceived: Number(row.amountReceived ?? invoiceBalance(row).amountReceived),
    balanceDue: Number(row.balanceDue ?? invoiceBalance(row).balanceDue),
    paymentStatus: invoiceBalance(row).invoicePaymentStatus,
  }))

  return { summaryRows, billRows }
}

const handleDownloadExcel = async () => {
  isDownloadLoading.value = true
  const exportColumns = salesExportColumns(invoiceView.value)
  const filename = getSalesExportFilename('xlsx')
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
      { header: 'H', key: 'col8', width: 22 },
      ...(exportColumns.length>8?[{header:'I',key:'col9',width:22}]:[]),
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
    worksheet.mergeCells(`A${billsTitleRowIndex}:${exportColumns.length>8?'I':'H'}${billsTitleRowIndex}`)
    worksheet.getCell(`A${billsTitleRowIndex}`).value = 'Bills'
    worksheet.getCell(`A${billsTitleRowIndex}`).font = { bold: true, size: 14 }

    const billsHeaderRow = worksheet.addRow(exportColumns.map(column=>column.label))
    billsHeaderRow.font = { bold: true }
    billsHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      }
    })

    billRows.forEach((row) => {
      worksheet.addRow(exportColumns.map(column=>row[column.key]))
    })

    for (let rowIndex = 3; rowIndex <= 2 + summaryRows.length; rowIndex++) {
      worksheet.getCell(`B${rowIndex}`).numFmt = '#,##0.00'
    }

    const billsDataStart = billsHeaderRow.number + 1
    for (let rowIndex = billsDataStart; rowIndex < billsDataStart + billRows.length; rowIndex++) {
      exportColumns.forEach((column,index)=>{if(column.numeric) worksheet.getRow(rowIndex).getCell(index+1).numFmt='#,##0.00'})
    }

    const buffer = await workbook.xlsx.writeBuffer()
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
  const exportColumns = salesExportColumns(invoiceView.value)
  const filename = getSalesExportFilename('pdf')
  const period = dateFilter.value==='all'?'All dates':`${format(selectedDate.value.start, 'd MMM yyyy')} - ${format(selectedDate.value.end, 'd MMM yyyy')}`
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
    doc.text(session?.allStores ? 'All Stores' : session?.companyName || 'Sales Report', margin, 16)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    let headerY = 23
    if (!session?.allStores) addressLines.forEach((line) => {
      doc.text(line, margin, headerY)
      headerY += 5
    })
    if (!session?.allStores && session?.companyPhone) {
      doc.text(`Phone: ${session.companyPhone}`, margin, headerY)
      headerY += 5
    }

    doc.setFont('helvetica', 'bold')
    doc.text('Sales Report', pageWidth - margin, 16, { align: 'right' })

    doc.setFont('helvetica', 'normal')
    doc.text(
      `Period: ${period}`,
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
      head: [exportColumns.map(column=>column.label)],
      body: billRows.map(row=>exportColumns.map(column=>column.numeric?formatPdfCurrency(row[column.key]):row[column.key])),
      tableWidth: pageWidth - margin * 2,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(exportColumns.map((column,index)=>[index,{halign:column.numeric?'right':'left'}])),
    })

    doc.save(filename)
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
  dateFilter.value = 'range'
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}

const deleteBill = async () => {
  try {
    const companyId = deletingRowIdentity.value.companyId || useAuth().session.value?.companyId
    const res = await $fetch('/api/billSale/deleteBill', {
      method: 'POST',
      headers: {'x-company-id':companyId},
      body: {
        billId: deletingRowIdentity.value.id,
        companyId,
      },
    })

    toast.add({
      title: `Bill No ${res.invoiceNumber} deleted successfully!`,
      color: 'green',
    })

    // 🔁 Refresh list after delete
    await fetchSales()
  } catch (error: any) {
    if (requireReceiptReversal(deletingRowIdentity.value,error)) return
    toast.add({
      title: 'Error while deleting the bill',
      description: billingErrorMessage(error),
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
  notes: sale.notes || '', termsAndConditions: sale.termsAndConditions || '',
  invoiceNumber: sale.invoiceNumber,
  phone: session?.companyPhone,
  description: session?.description,
  thankYouNote: session?.thankYouNote,
  refundPolicy: session?.refundPolicy,
  returnPolicy: session?.returnPolicy,
  date: new Date(sale.createdAt).toISOString(),
  showUnit: Array.isArray(session?.variantInputs?.unit) && session.variantInputs.unit.length > 1,

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
      unit: entry.unit || entry.variant?.unit || 'Nos',
      barcode: entry.barcode,
      tvalue: Number(entry.value || 0),
    }
  }),

  subtotal: Number(sale.subtotal || 0),
  discount: Number(sale.discount || 0),
  grandTotal: Number(sale.grandTotal || 0),
  paymentMethod: sale.paymentMethod,
  isTaxIncluded: session?.isTaxIncluded || false,

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
  if (requireReceiptReversal(row)) return
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
    const companyId = changePaymentMethodBill.value.companyId || useAuth().session.value?.companyId
    await $fetch('/api/billSale/updatePaymentMethod', {
      method: 'POST',
      headers: { 'x-company-id': companyId },
      body: {
        billId: changePaymentMethodBill.value.id,
        companyId,
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
    if (requireReceiptReversal(changePaymentMethodBill.value,error)) return
    toast.add({
      title: 'Failed to update payment method',
      description: billingErrorMessage(error),
      color: 'red',
    })
  }
}

const onSplitConfirmed = async (confirmedPayments: Array<{ method: string; amount: number | string }>) => {
  if (!changePaymentMethodBill.value && !splitBillContext.value) return

  const bill = splitBillContext.value || changePaymentMethodBill.value

  try {
    const companyId = bill.companyId || useAuth().session.value?.companyId
    await $fetch('/api/billSale/updatePaymentMethod', {
      method: 'POST',
      headers: { 'x-company-id': companyId },
      body: {
        billId: bill.id,
        companyId,
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
    if (requireReceiptReversal(bill,error)) return
    toast.add({
      title: 'Failed to update split payment',
      description: billingErrorMessage(error),
      color: 'red',
    })
  }
}

const onPaymentStatusChange = async (
  id,
  status,
  billNo,
  companyId = useAuth().session.value?.companyId
) => {
  try {
    await $fetch('/api/billSale/updatePaymentStatus', {
      method: 'POST',
      headers: { 'x-company-id': companyId },
      body: {
        billId: id,
        companyId,
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



const handleEnterPayment = (id:string, status:string, billNo:string, companyId:string) => {
    if(status === 'PENDING'){
        onPaymentStatusChange(id, status, billNo, companyId)
    }else{
        const bill = sales.value.find((b:any)=>b.id===id);
        if (bill && (bill.paymentMethod === 'Credit' || bill.splitPayments?.some(p=>p.method==='Credit'))) {
          openCreditCollection({...bill,companyId}, 'collect');return;
        }
        isOpen.value = true
        activeBillInfo.value = {id,billNo,companyId}
    }
};
const handlePaid = () => {
    onPaymentStatusChange(activeBillInfo.value.id, 'PAID', activeBillInfo.value.billNo, activeBillInfo.value.companyId)
     isOpen.value = false
};


const print = async (id) => {
  const sale = sales.value.find(s => s.id === id)
  if (!sale) {
    console.error('Sale not found for id:', id)
    return
  }

  const session = useAuth().session.value

  printData.value = session?.allStores || sale.invoiceCode
    ? await $fetch('/api/billSale/receipt', { query: { id: sale.id } })
    : buildPrintDataFromSale(sale, session)

  await printBill(printData.value)
}

async function saleDocument(row: any) {
  return $fetch<any>('/api/billSale/receipt', {query:{id:row.id},headers:{'x-company-id':row.companyId,'x-company-filter':row.companyId}})
}
async function downloadSale(row: any) {
  if (documentBusy.value) return
  documentBusy.value = row.id
  try {
    const details = await saleDocument(row)
    const { generateThermalReceiptPDF } = await import('~/utils/thermal-receipt.client')
    await generateThermalReceiptPDF(details, (row.invoiceCode || 'Receipt-'+row.invoiceNumber) + '.pdf')
  } catch(e) { toast.add({title:'Could not download invoice',description:billingErrorMessage(e),color:'red'}) }
  finally { documentBusy.value = '' }
}
async function sendSale(row: any) {
  if (documentBusy.value) return
  documentBusy.value = row.id
  try {
    const details = await saleDocument(row)
    if (!details.clientPhone) throw Error('Add a customer phone number before sending.')
    const { shareReceiptPDF } = await import('~/utils/share-receipt.client')
    const share = await shareReceiptPDF(details,row.id)
    const result = await $fetch<any>('/api/whatsapp/send-payment-template',{method:'POST',headers:{'x-company-id':row.companyId},body:{
      companyId:row.companyId,phone:details.clientPhone,name:details.clientName,billName:details.companyName,
      amount:details.grandTotal,paymentDate:details.date,receiptId:share.receiptId,
    }})
    if (!result.success) throw Error('Invoice could not be sent. Retry sending this saved invoice.')
    toast.add({title:result.trackingWarning?'Invoice sent; sending history could not be updated.':'Invoice sent',color:result.trackingWarning?'orange':'green'})
  } catch(e) { toast.add({title:'Invoice not sent',description:billingErrorMessage(e),color:'red'}) }
  finally { documentBusy.value = ''; await fetchSales() }
}


const openBill = (id) => {
  const sale = sales.value.find(s => s.id === id)


  if (!sale) {
    console.error('Sale not found for id:', id)
    return
  }

  selectSale(sale)

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



watch(companyScope.readIds, () => { selectedSale.value=null;page.value = 1; void fetchSales(); });
watch(sales, rows => {
  if (selectedSale.value) selectedSale.value=rows.find(row=>row.id===selectedSale.value.id && row.companyId===selectedSale.value.companyId) || null
})
</script>

<template>
    <UDashboardPanelContent class="pb-24">
        <BillingPreferences v-model="preferencesOpen" :document="preferenceDocument" :company-id="preferenceCompanyId" :company-name="companyScope.companyName(preferenceCompanyId)" @saved="loadPreferences" />
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-xl font-semibold">Sales</h1>
          <UButton icon="i-heroicons-plus" :to="{path:'/erp/billing',query:{billingMode:invoiceView?'invoice':'paynow',entryCompany:preferenceCompanyId}}">{{ invoiceView ? 'New invoice' : 'New sale' }}</UButton>
        </div>
        <nav aria-label="Sales views" class="mb-5 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
          <NuxtLink v-for="view in salesViews" :key="view.value" :to="{path:'/erp/sales',query:{...route.query,view:view.value}}" :aria-current="salesView===view.value?'page':undefined" class="border-b-2 px-4 py-3 text-sm font-medium transition-colors" :class="salesView===view.value?'border-primary-500 text-primary-600':'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'">{{ view.label }}</NuxtLink>
        </nav>
        <UAlert v-if="loadError" class="mb-4" color="red" title="Could not load sales" :description="loadError" />
        <!-- Summary Cards -->
        <div v-if="preferences.showSummary" class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <button
            v-for="card in summaryCards"
            :key="card.label"
            class="text-left rounded-lg border px-4 py-3 transition-all focus:outline-none"
            :disabled="invoiceView"
            :class="[
              !invoiceView && ((card.method === null && activeCardMethod === null) ||
              (card.method !== null && activeCardMethod === card.method))
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 dark:border-primary-400 ring-2 ring-primary-400'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500',
            ]"
            @click="!invoiceView && handleCardClick(card.method)"
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

        <div class="flex min-w-0 flex-col items-start gap-4 lg:flex-row">
        <UCard v-if="!selectedSale"
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
            <div class="flex flex-wrap justify-between items-center gap-3 w-full">
                    <div class="flex flex-wrap items-center gap-3">
                  <CompanyTableFilter />
                  <USelect v-model="dateFilter" :options="[{label:'All dates',value:'all'},{label:'Date range',value:'range'}]" aria-label="Sales date filter" class="w-32" />
                  
                      <UPopover v-if="dateFilter==='range'" :popper="{ placement: 'bottom-start' }" class="z-10">
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
                        placeholder="Invoice, customer or subject"
                        class="w-full sm:w-52"
                      />
                    </div>
                    <UPopover
                      mode="hover"
                      :popper="{ placement: 'bottom-end' }"
                      class="ml-auto"
                    >
                      <button type="button" class="flex items-center gap-2 rounded-md py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500" aria-label="Collections by payment method" aria-live="polite">
                      <span class="text-gray-500 dark:text-gray-400">Collections{{ dateFilter==='all'?' (all dates)':'' }}</span>
                      <span class="font-semibold tabular-nums text-gray-900 dark:text-white">
                        {{ isLoading ? '…' : collectionsTotal === null ? '—' : formatCurrency(collectionsTotal) }}
                      </span>
                      <UIcon name="i-heroicons-chevron-down" class="h-4 w-4 text-gray-400" />
                      </button>
                      <template #panel>
                        <div class="w-64 p-3">
                          <p class="text-sm font-semibold text-gray-900 dark:text-white">Collections by payment method</p>
                          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Credit repayments, net of reversals, for the selected stores and dates.</p>
                          <p v-if="isLoading" class="py-3 text-sm text-gray-500" role="status">Loading collections…</p>
                          <p v-else-if="collectionsByMethod === null" class="py-3 text-sm text-gray-500" role="status">Collection breakdown unavailable.</p>
                          <dl v-else class="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
                            <div v-for="method in collectionMethods" :key="method" class="flex items-center justify-between gap-4 py-2 text-sm">
                              <dt class="text-gray-600 dark:text-gray-300">{{ method }}</dt>
                              <dd class="font-medium tabular-nums text-gray-900 dark:text-white">{{ formatCurrency(collectionsByMethod[method] ?? 0) }}</dd>
                            </div>
                          </dl>
                        </div>
                      </template>
                    </UPopover>
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
                    <UButton icon="i-heroicons-cog-6-tooth" color="gray" size="xs" @click="preferencesOpen = true">Preference</UButton>
                    <div
                        v-if="canUseCleanupToggle"
                        class="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 dark:border-gray-700"
                    >
                        <span class="text-xs font-medium text-gray-600 dark:text-gray-300">
                            Cleaned values
                        </span>
                        <UToggle v-model="showCleanedValues" />
                    </div>

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
                @click.capture="rememberSaleClick"
                @select="selectSaleRow"
            >

                <template #invoiceNumber-data="{ row }">
                    <button type="button" class="text-primary-600 hover:underline" @click.stop="selectSale(row)">{{ row.invoiceCode || (row.billPrefix ? `${row.billPrefix}-${row.invoiceNumber}` : row.invoiceNumber) }}</button>
                    <p v-if="salesView==='all'" class="text-xs text-gray-500">{{ row.invoiceCode?'Invoice':'Pay now' }}</p>
                </template>

                <template #actions-data="{ row }">
                    <UDropdown  :items="forOwner(action(row), row.companyId)">
                        <UButton
                            color="gray"
                            variant="ghost"
                            icon="i-heroicons-ellipsis-horizontal-20-solid"
                            :disabled="!!documentBusy"
                        />
                    </UDropdown>
                </template>

                <template #dueDate-data="{ row }"><span :class="row.overdue?'font-medium text-red-500':''">{{ row.dueDate || '—' }}</span><UBadge v-if="row.overdue" color="red" variant="subtle" size="xs" class="ml-1">Overdue</UBadge></template>
                <template #amountReceived-data="{ row }">{{ formatCurrency(Number(row.amountReceived ?? invoiceBalance(row).amountReceived)) }}</template>
                <template #balanceDue-data="{ row }">{{ formatCurrency(Number(row.balanceDue ?? invoiceBalance(row).balanceDue)) }}</template>
                <template #invoicePaymentTerms-data="{ row }"><span class="whitespace-normal">{{ row.invoicePaymentTerms || '—' }}</span></template>
                <template #subject-data="{ row }"><span class="whitespace-normal">{{ row.subject || '—' }}</span></template>
                <template #sendStatus-data="{ row }">{{ row.invoiceCode ? row.sendStatus : '—' }}</template>

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
                    <div v-if="row.paymentMethod === 'Credit' || row.splitPayments?.some(p => p.method === 'Credit')" class="space-y-1">
                      <div v-if="canCollectPayment(row) || hasReversiblePayments(row)" class="inline-flex items-center gap-1 rounded-md border border-gray-200 p-0.5 dark:border-gray-700">
                        <UButton v-if="canCollectPayment(row)" label="Collect" size="xs" variant="ghost" @click="openCreditCollection(row, 'collect')" />
                        <UButton v-if="hasReversiblePayments(row)" label="Reverse" size="xs" color="red" variant="ghost" @click="openCreditCollection(row, 'reverse')" />
                      </div>
                      <div class="text-xs text-gray-500">{{ row.invoiceCode ? invoiceBalance(row).invoicePaymentStatus : row.paymentStatus }}</div>
                      <div v-if="row.invoiceCode" class="text-xs text-gray-500">Received {{ formatCurrency(invoiceBalance(row).amountReceived) }} · Due {{ formatCurrency(invoiceBalance(row).balanceDue) }}</div>
                    </div>
                    <USelect
                        v-else
                        v-model="row.paymentStatus"
                        :options="['PAID', 'PENDING']"
                        @update:model-value="status => handleEnterPayment(row.id, status,row.invoiceNumber,row.companyId)"
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
                <UDropdown :items="forOwner(action(row), row.companyId)">
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
        <template v-else>
          <aside class="w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 lg:w-72" aria-label="Sales list">
            <div class="border-b border-gray-200 p-3 dark:border-gray-800"><UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search sales" aria-label="Search sales" /></div>
            <div class="max-h-48 divide-y divide-gray-200 overflow-auto dark:divide-gray-800 lg:max-h-[65vh]">
              <div v-for="sale in styledSales" :key="`${sale.companyId}:${sale.id}`" class="flex items-center gap-1 p-2" :class="selectedSale.id===sale.id && selectedSale.companyId===sale.companyId?'bg-primary-50 dark:bg-primary-950':''">
                <button type="button" class="min-w-0 flex-1 rounded p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800" :aria-current="selectedSale.id===sale.id?'true':undefined" @click="selectSale(sale)">
                  <span class="block truncate text-sm font-medium">{{ sale.invoiceCode || `Bill #${sale.invoiceNumber}` }}</span>
                  <span class="block truncate text-xs text-gray-500">{{ sale.client?.name || sale.client?.phone || 'Walk-in customer' }}</span>
                  <span class="block text-xs">{{ formatCurrency(Number(sale.grandTotal)) }} · {{ sale.paymentStatus }}</span>
                </button>
                <UDropdown :items="forOwner(action(sale),sale.companyId)"><UButton icon="i-heroicons-ellipsis-horizontal" color="gray" variant="ghost" aria-label="Sale actions" /></UDropdown>
              </div>
            </div>
            <div class="border-t border-gray-200 p-3 dark:border-gray-800"><UPagination v-model="page" :page-count="Number(pageCount)" :total="Number(pageTotal)" size="xs" /></div>
          </aside>
          <SalesDetailPanel :bill="selectedSale" :revision="detailRevision" :fetcher="$fetch" @close="selectedSale=null" @print="print(selectedSale.id)" />
        </template>
        </div>
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

      
  <BillingCreditReceiptModal v-model="creditReceiptOpen" :bill="creditReceiptBill" :mode="creditReceiptMode" @saved="fetchSales()" />
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
        <p v-if="changePaymentMethodBill?.paymentMethod === 'Credit'" class="text-sm text-gray-500">
          Correct the original payment method. Choosing UPI or another paid method marks this bill paid. For money received later, use Collect with the payment date.
        </p>
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


