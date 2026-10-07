<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
    startOfDay,
    endOfDay,
    subDays,
    subMonths,
    format,
    isSameDay,
} from 'date-fns';

const auth = useNuxtApp().$auth;
const toast = useToast();
const { printReport } = usePrint();
const route = useRoute();
const initialDate = (value: unknown, fallback: Date) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value))
        ? new Date(value + 'T12:00:00')
        : fallback;
const selectedDate = ref({
    start: initialDate(route.query.from, new Date()),
    end: initialDate(route.query.to, new Date()),
});
const companyName = computed(() => auth.session.value?.companyName || '');
const companyId = computed(() => auth.session.value?.companyId);
const canUseCleanupToggle = computed(
    () => auth.session.value?.cleanup === true
);
const showCleanedValues = ref(false);
const dashboard = ref<any>(null);
const loading = ref(true);
const error = ref('');
const exportLoading = ref('');
const lastUpdated = ref<Date | null>(null);
let version = 0;
let controller: AbortController | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const period = computed(() =>
    isSameDay(selectedDate.value.start, selectedDate.value.end)
        ? format(selectedDate.value.start, 'd MMM yyyy')
        : `${format(selectedDate.value.start, 'd MMM yyyy')} – ${format(
              selectedDate.value.end,
              'd MMM yyyy'
          )}`
);
const params = computed(() => ({
    startDate: startOfDay(selectedDate.value.start).toISOString(),
    endDate: endOfDay(selectedDate.value.end).toISOString(),
    showCleanedValues: canUseCleanupToggle.value && showCleanedValues.value,
}));
const currency = computed(() => dashboard.value?.financial?.currency || 'INR');
const money = (value: any) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency.value,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));
const financial = computed(() => dashboard.value?.financial);
const position = computed(
    () =>
        financial.value?.balances?.total || { opening: 0, delta: 0, closing: 0 }
);
const hasActivity = computed(() =>
    Boolean(
        dashboard.value &&
            (dashboard.value.totalSales ||
                dashboard.value.totalExpenses ||
                dashboard.value.totalPurchaseExpense ||
                financial.value.accounts.some((a: any) => a.debit || a.credit))
    )
);

async function refresh() {
    clearTimeout(refreshTimer);
    const request = ++version;
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = '';
    try {
        if (selectedDate.value.start > selectedDate.value.end)
            throw new Error('Choose a start date before the end date.');
        const data = await $fetch('/api/report/report', {
            params: params.value,
            signal: controller.signal,
        });
        if (request !== version) return;
        dashboard.value = data;
        lastUpdated.value = new Date();
    } catch (cause: any) {
        if (request === version && !controller.signal.aborted) {
            dashboard.value = null;
            error.value =
                cause?.data?.statusMessage ||
                cause?.message ||
                'The report could not be loaded.';
        }
    } finally {
        if (request === version) loading.value = false;
    }
}
watch(
    [params, companyId],
    () => {
        ++version;
        controller?.abort();
        loading.value = true;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 150);
    },
    { deep: true }
);
onMounted(refresh);
onUnmounted(() => {
    ++version;
    clearTimeout(refreshTimer);
    controller?.abort();
});
const ranges = [
    { label: 'Today', dates: () => ({ start: new Date(), end: new Date() }) },
    {
        label: 'Yesterday',
        dates: () => ({
            start: subDays(new Date(), 1),
            end: subDays(new Date(), 1),
        }),
    },
    {
        label: 'Last 7 days',
        dates: () => ({ start: subDays(new Date(), 6), end: new Date() }),
    },
    {
        label: 'Last 30 days',
        dates: () => ({ start: subDays(new Date(), 29), end: new Date() }),
    },
    {
        label: 'Last 3 months',
        dates: () => ({ start: subMonths(new Date(), 3), end: new Date() }),
    },
    {
        label: 'Last year',
        dates: () => ({ start: subMonths(new Date(), 12), end: new Date() }),
    },
];
const amountColumns: any[] = [
    { key: 'name', label: 'Payment method' },
    { key: 'amount', label: 'Amount', type: 'money' },
];
const balanceColumns: any[] = [
    { key: 'name', label: 'Account' },
    { key: 'debit', label: 'Debit', type: 'money' },
    { key: 'credit', label: 'Credit', type: 'money' },
    { key: 'movement', label: 'Balance', type: 'money' },
];
const itemColumns: any[] = [
    { key: 'name', label: 'Name' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    { key: 'sales', label: 'Sales', type: 'money' },
];
const salaryColumns: any[] = [
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'userName', label: 'Staff' },
    { key: 'paymentMode', label: 'Payment method' },
    { key: 'amount', label: 'Amount', type: 'money' },
];
const accountRows = computed(() =>
    (financial.value?.accounts || [])
        .filter((a: any) => ['CASH', 'BANK'].includes(a.type))
        .map((a: any) => ({
            ...a,
            href: `/accountant/chart-of-accounts?entryCompany=${a.company_id}&account=${a.id}`,
        }))
);
const accountTotal = computed(() => ({
    name: 'Total',
    debit: accountRows.value.reduce((s: number, a: any) => s + a.debit, 0),
    credit: accountRows.value.reduce((s: number, a: any) => s + a.credit, 0),
    movement: position.value.delta,
}));
const salesRows = computed(() =>
    ['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Credit'].map((name) => ({
        name,
        amount: dashboard.value?.salesByPaymentMethod?.[name] || 0,
    }))
);
const paymentModes = [
    ['Cash', 'CASH'],
    ['UPI', 'UPI'],
    ['Card', 'CARD'],
    ['BankTransfer', 'BANK'],
    ['Cheque', 'CHEQUE'],
];
const expensesRows = computed(() =>
    paymentModes.map(([key]) => ({
        name: key === 'BankTransfer' ? 'Bank transfer' : key,
        amount: Number(dashboard.value?.expensesByPaymentMethod?.[key] || 0),
    }))
);
const otherTransactionRows = computed(() => {
    const data = dashboard.value;
    return ['cash', 'bank'].map(key => {
        const isCash = key === 'cash';
        const receiptMethods = isCash ? ['Cash'] : ['UPI', 'Card', 'Bank', 'Cheque'];
        const purchaseMethods = isCash ? ['Cash'] : ['UPI', 'Card', 'BankTransfer', 'Cheque'];
        const receipts = receiptMethods.reduce(
            (sum, method) => sum + Number(data?.creditCollectionsByPaymentMethod?.[method] || 0), 0
        );
        const salary = (data?.salaryPayments || [])
            .filter((row: any) => isCash
                ? row.paymentMode === 'CASH'
                : ['UPI', 'CARD', 'BANK', 'CHEQUE'].includes(row.paymentMode))
            .reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
        const purchases = purchaseMethods.reduce(
            (sum, method) => sum + Number(data?.purchaseExpensesByPaymentMethod?.[method] || 0), 0
        );
        const movement = ['transfers', 'transactions', 'investments'].reduce(
            (sum, kind) => sum + Number(data?.[kind]?.[key]?.net || 0), 0
        );
        return { name: isCash ? 'Cash' : 'Bank', amount: receipts - salary - purchases + movement };
    });
});
const finalBalanceRows = computed(() => {
    const banks = accountRows.value.filter((account: any) => account.type === 'BANK');
    return [
        { name: 'Cash', amount: financial.value?.balances?.cash?.delta || 0 },
        ...(banks.length ? banks.map((account: any) => ({
            id: account.id, name: account.name, amount: account.movement, href: account.href,
        })) : [{ name: 'Bank', amount: 0 }]),
    ];
});
const movementColumns: any[] = [
    { key: 'name', label: 'Account' },
    { key: 'debit', label: 'Money in', type: 'money' },
    { key: 'credit', label: 'Money out', type: 'money' },
    { key: 'net', label: 'Net change', type: 'signed' },
];
const transactionDetailGroups = computed(() => [
    {
        title: 'Salary payments',
        amount: dashboard.value?.salaryExpense || 0,
        rows: dashboard.value?.salaryPayments || [],
        columns: salaryColumns,
    },
    {
        title: 'Purchase payments',
        amount: dashboard.value?.totalPurchaseExpense || 0,
        rows: paymentModes.map(([key]) => ({
            name: key === 'BankTransfer' ? 'Bank transfer' : key,
            amount: dashboard.value?.purchaseExpensesByPaymentMethod?.[key] || 0,
        })),
        columns: amountColumns,
    },
    { title: 'Account transfers', rows: dashboard.value?.transfersDisplay || [], columns: movementColumns },
    { title: 'Receive / Pay money', rows: dashboard.value?.transactionsDisplay || [], columns: movementColumns },
    { title: 'Investments', rows: dashboard.value?.investmentsDisplay || [], columns: movementColumns },
    {
        title: 'Credit repayments',
        amount: dashboard.value?.creditCollections || 0,
        rows: ['Cash', 'UPI', 'Card', 'Bank', 'Cheque'].map(name => ({
            name, amount: dashboard.value?.creditCollectionsByPaymentMethod?.[name] || 0,
        })),
        columns: amountColumns,
    },
    {
        title: 'Collections',
        amount: dashboard.value?.totalCollections || 0,
        rows: ['Cash', 'UPI', 'Card', 'Bank', 'Cheque'].map(name => ({
            name, amount: dashboard.value?.collectionsByPaymentMethod?.[name] || 0,
        })),
        columns: amountColumns,
    },
]);
const transactionDetailRows = computed(() => [
    ['Purchase payments', 'Salary payments', 'Investments'],
    ['Credit repayments', 'Collections'],
    ['Account transfers', 'Receive / Pay money'],
].map(titles => titles.map(title => transactionDetailGroups.value.find(group => group.title === title)!)));
const summaryCards = computed(() => [
    {
        name: 'Sales',
        amount: dashboard.value?.totalSales,
        rows: salesRows.value,
        columns: amountColumns,
        note: `Collections: ${money(dashboard.value?.totalCollections)}`,
    },
    {
        name: 'Expense',
        amount: Number(dashboard.value?.totalExpenses || 0) - Number(dashboard.value?.salaryExpense || 0),
        rows: expensesRows.value,
        columns: amountColumns,
        note: 'Salary is included in Other transactions.',
    },
    {
        name: 'Other transactions',
        amount: otherTransactionRows.value.reduce((sum, row) => sum + row.amount, 0),
        rows: otherTransactionRows.value,
        columns: amountColumns,
        note: '',
    },
    {
        name: 'Final balance',
        amount: position.value.delta,
        rows: finalBalanceRows.value,
        columns: amountColumns,
        note: '',
    },
]);
async function download(kind: 'pdf' | 'excel') {
    exportLoading.value = kind;
    try {
        const response = await $fetch.raw(
            `/api/report/generate-sales.${kind === 'pdf' ? 'pdf' : 'excel'}`,
            { params: params.value, responseType: 'blob' }
        );
        const url = URL.createObjectURL(response._data as Blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `daily-report-${format(
            selectedDate.value.end,
            'yyyy-MM-dd'
        )}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`;
        link.click();
        URL.revokeObjectURL(url);
    } catch {
        toast.add({
            title: 'Export failed',
            description: 'Please try again.',
            color: 'red',
        });
    } finally {
        exportLoading.value = '';
    }
}
async function print() {
    if (!dashboard.value) return;
    exportLoading.value = 'print';
    try {
        const expenses = await $fetch('/api/report/expenses', {
            params: params.value,
        });
        await printReport({
            ...dashboard.value,
            companyName: companyName.value,
            dateRange: period.value,
            expenses,
            moneyPosition: position.value,
        });
    } catch {
        toast.add({
            title: 'Print failed',
            description: 'Please try again.',
            color: 'red',
        });
    } finally {
        exportLoading.value = '';
    }
}
const exportActions = [
    [
        {
            label: 'Download PDF',
            icon: 'i-lucide-file-text',
            click: () => download('pdf'),
        },
        {
            label: 'Download Excel',
            icon: 'i-lucide-sheet',
            click: () => download('excel'),
        },
        { label: 'Print report', icon: 'i-lucide-printer', click: print },
    ],
];
</script>

<template>
    <UDashboardPanelContent>
        <div
            class="mx-auto w-full max-w-[1560px] space-y-6 pb-10 text-gray-800 dark:text-gray-200"
            :aria-busy="loading"
        >
            <header
                class="flex flex-col justify-between gap-4 xl:flex-row xl:items-center"
            >
                <div>
                    <div
                        class="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500"
                        ><UIcon
                            name="i-lucide-chart-no-axes-combined"
                            class="h-4 w-4"
                        /><span>{{ companyName }} · Reports</span></div
                    >
                    <h1
                        class="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white"
                        >Daily overview</h1
                    >
                    <p class="mt-1 text-sm text-gray-500"
                        >Sales, spending and where your money stands.</p
                    >
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <UPopover :popper="{ placement: 'bottom-end' }">
                        <UButton
                            color="white"
                            icon="i-lucide-calendar-days"
                            :label="period"
                            aria-label="Select report date range"
                        />
                        <template #panel="{ close }"
                            ><div class="flex flex-col sm:flex-row"
                                ><div
                                    class="flex flex-wrap gap-1 border-b border-gray-200 p-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r dark:border-gray-800"
                                    ><UButton
                                        v-for="range in ranges"
                                        :key="range.label"
                                        color="gray"
                                        variant="ghost"
                                        :label="range.label"
                                        @click="
                                            selectedDate = range.dates();
                                            close();
                                        " /></div
                                ><DatePicker
                                    v-model="selectedDate"
                                    @close="close" /></div
                        ></template>
                    </UPopover>
                    <UButton
                        color="white"
                        icon="i-lucide-refresh-cw"
                        :loading="loading"
                        aria-label="Refresh report"
                        @click="refresh"
                    />
                    <UDropdown :items="exportActions"
                        ><UButton
                            label="Export"
                            icon="i-lucide-download"
                            :disabled="loading || !dashboard"
                            :loading="Boolean(exportLoading)"
                    /></UDropdown>
                </div>
            </header>
            <div
                class="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500"
            >
                <p
                    >Activity for
                    <strong
                        class="font-medium text-gray-700 dark:text-gray-300"
                        >{{ period }}</strong
                    >
                    · Balances through
                    {{ format(selectedDate.end, 'd MMM yyyy') }}</p
                >
                <div class="flex items-center gap-3"
                    ><span v-if="lastUpdated && !loading"
                        >Updated {{ format(lastUpdated, 'HH:mm') }}</span
                    ><label
                        v-if="canUseCleanupToggle"
                        class="flex items-center gap-2"
                        ><UToggle
                            v-model="showCleanedValues"
                            aria-label="Use cleaned source values"
                        />Cleaned values</label
                    ></div
                >
            </div>
            <UAlert
                v-if="error"
                color="red"
                icon="i-lucide-circle-alert"
                title="Could not load this report"
                :description="error"
                :actions="[{ label: 'Try again', click: refresh }]"
            />
            <div
                v-else-if="loading"
                role="status"
                aria-label="Loading daily report"
                class="space-y-6"
                ><div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                    ><USkeleton
                        v-for="n in 4"
                        :key="n"
                        class="h-36 rounded-xl" /></div
                ><USkeleton class="h-80 rounded-xl"
            /></div>
            <template v-else-if="dashboard">
                <div
                    v-if="!hasActivity"
                    class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
                    >No activity in this period. Selected-period amounts are zero.</div
                >
                <section
                    class="daily-summary grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
                    aria-label="Report highlights"
                >
                    <UCard
                        v-for="card in summaryCards"
                        :key="card.name"
                        class="min-w-0"
                        :ui="{ body: { padding: 'p-3 sm:p-3' } }"
                    >
                        <h2 class="text-sm font-medium text-gray-500">{{ card.name }}</h2>
                        <p class="mb-2 text-xl font-semibold tabular-nums">{{
                            money(card.amount)
                        }}</p>
                        <ReportsDailyTable
                            :rows="card.rows"
                            :style="{ maxHeight: 'none' }"
                            :columns="card.columns"
                            :currency="currency"
                            :caption="card.name"
                        />
                        <p v-if="card.note" class="mt-2 text-xs text-gray-500">{{ card.note }}</p>
                    </UCard>
                </section>
                <details class="rounded-lg border border-gray-200 dark:border-gray-800">
                    <summary class="cursor-pointer px-4 py-3 text-sm font-medium">Transaction details</summary>
                    <div class="space-y-3 p-3">
                        <div v-for="(row, index) in transactionDetailRows" :key="index"
                            class="transaction-details-grid grid grid-cols-1 gap-3"
                            :class="row.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'">
                        <section v-for="group in row" :key="group.title" class="min-w-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                            <div class="flex items-center justify-between gap-3 px-3 py-3"><h2 class="text-sm font-medium">{{ group.title }}</h2><strong v-if="group.amount !== undefined" class="text-sm tabular-nums">{{ money(group.amount) }}</strong></div>
                            <ReportsDailyTable
                                :rows="group.rows"
                                :columns="group.columns"
                                :currency="currency"
                                :caption="group.title"
                            />
                        </section>
                        </div>
                    </div>
                </details>
                <section
                    id="money-position"
                    class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                    aria-labelledby="money-title"
                >
                    <div class="p-5">
                        <h2 id="money-title" class="font-semibold"
                            >Cash and bank movement - All fund accounts</h2
                        >
                        <p class="mt-1 text-xs text-gray-500"
                            >Balance = Debit minus Credit for the selected
                            period. Includes Transfers and Receive / Pay
                            money.</p
                        >
                    </div>
                    <ReportsDailyTable
                        :rows="accountRows"
                        :columns="balanceColumns"
                        :total="accountTotal"
                        :currency="currency"
                        caption="Actual dated money movement; unpaid sales are excluded"
                        empty="No fund accounts to show for this period."
                    />
                </section>
                <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <section
                        v-for="group in [
                            {
                                title: 'Sales by category',
                                rows: dashboard.categorySales,
                            },
                            {
                                title: 'Sales by brand',
                                rows: dashboard.brandSales,
                            },
                        ]"
                        :key="group.title"
                        class="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                        ><div class="p-5"
                            ><h2 class="font-semibold">{{ group.title }}</h2
                            ><p class="mt-1 text-xs text-gray-500"
                                >Item detail including credit sales.</p
                            ></div
                        ><ReportsDailyTable
                            :rows="group.rows || []"
                            :columns="itemColumns"
                            :currency="currency"
                            :caption="group.title"
                            empty="No bill items in this period."
                    /></section>
                </div>
                <p class="px-1 text-xs leading-5 text-gray-500"
                    >Sales, expenses, supplier payments and item details use
                    source records. Account balances use posted journals,
                    including imported history and reversals. Unposted history
                    is excluded.</p
                >
            </template>
        </div>
    </UDashboardPanelContent>
</template>

<style scoped>
.daily-summary :deep(table) {
    table-layout: auto;
    font-size: 12px;
}
.daily-summary :deep(th),
.daily-summary :deep(td) {
    padding: 8px 6px;
    white-space: normal;
    overflow-wrap: anywhere;
}
.daily-summary :deep(td:last-child) {
    width: 1%;
    white-space: nowrap;
    overflow-wrap: normal;
}
.transaction-details-grid :deep(table) {
    font-size: 12px;
}
.transaction-details-grid :deep(th),
.transaction-details-grid :deep(td) {
    padding: 8px 6px;
}
.transaction-details-grid :deep(th) {
    white-space: normal;
}
</style>
