<script setup lang="ts">
import { format } from 'date-fns'
import {
    useFindManyBill,
    useCountBill,
    useUpdateBill,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

// ─── Selected invoice & detail panel ───
const selectedInvoice = ref<any>(null)
const activeTab = ref(0)
const isNewInvoiceOpen = ref(false)

const selectInvoice = (row: any) => {
    selectedInvoice.value = row
}

const closeDetail = () => {
    selectedInvoice.value = null
}

const tabs = [
    { label: 'Invoice Details', icon: 'i-heroicons-document-text' },
    { label: 'Activity Logs', icon: 'i-heroicons-clock' },
]

// ─── Filters ───
const search = ref('')
const page = ref(1)
const pageCount = ref(10)
const selectedStatus = ref<any[]>([])
const sort = ref({ column: 'createdAt', direction: 'desc' as const })

const statusOptions = [
    { label: 'Pending', value: 'PENDING' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
    { label: 'Overdue', value: 'OVERDUE' },
]

const resetFilters = () => {
    search.value = ''
    selectedStatus.value = []
}

// ─── Table columns ───
const columns = [
    { key: 'createdAt', label: 'DATE', sortable: true },
    { key: 'invoiceCode', label: 'INVOICE#', sortable: true },
    { key: 'orderNumber', label: 'ORDER NUMBER', sortable: true },
    { key: 'clientName', label: 'CUSTOMER NAME', sortable: true },
    { key: 'paymentStatus', label: 'STATUS', sortable: true },
    { key: 'dueDate', label: 'DUE DATE', sortable: true },
    { key: 'grandTotal', label: 'AMOUNT', sortable: true },
    { key: 'balanceDue', label: 'BALANCE DUE', sortable: true },
]

// ─── Data fetching ───
const queryArgs = computed(() => {
    const statusCondition =
        selectedStatus.value.length > 0
            ? { paymentStatus: { in: selectedStatus.value.map((s: any) => s.value || s) } }
            : {}

    return {
        where: {
            AND: [
                { companyId, deleted: false, invoiceCode: { not: null } },
                search.value
                    ? {
                        OR: [
                            { invoiceCode: { contains: search.value, mode: 'insensitive' } },
                            { client: { name: { contains: search.value, mode: 'insensitive' } } },
                        ],
                    }
                    : {},
                statusCondition,
            ],
        },
        include: { client: true, entries: true, salesOrder: true, project: true },
        orderBy: { [sort.value.column]: sort.value.direction },
        skip: (page.value - 1) * pageCount.value,
        take: pageCount.value,
    }
})

const { data: invoices, isLoading } = useFindManyBill(queryArgs)
const { data: pageTotal } = useCountBill(computed(() => ({ where: queryArgs.value.where })))

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value || 0))

// ─── Mutations ───
const UpdateBill = useUpdateBill({ optimisticUpdate: true })

const isDeleting = ref(false)

const deleteInvoice = async (invoice: any) => {
    isDeleting.value = true
    try {
        await UpdateBill.mutateAsync({
            where: { id: invoice.id },
            data: { deleted: true },
        })
        if (selectedInvoice.value?.id === invoice.id) {
            selectedInvoice.value = null
        }
        toast.add({ title: 'Invoice deleted', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to delete invoice', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    } finally {
        isDeleting.value = false
    }
}

const updatePaymentStatus = async (invoice: any, status: string) => {
    try {
        const data: any = { paymentStatus: status }
        if (status === 'PAID') {
            data.balanceDue = 0
        }
        await UpdateBill.mutateAsync({
            where: { id: invoice.id },
            data,
        })
        if (selectedInvoice.value?.id === invoice.id) {
            selectedInvoice.value = { ...selectedInvoice.value, paymentStatus: status, ...(status === 'PAID' ? { balanceDue: 0 } : {}) }
        }
        toast.add({ title: `Invoice marked as ${status}`, icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to update status', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    }
}

// ─── Actions dropdown ───
const invoiceActions = (row: any) => [
    [{
        label: 'Edit',
        icon: 'i-heroicons-pencil-square',
        click: () => { editingInvoice.value = row; isNewInvoiceOpen.value = true },
    }],
    [{
        label: 'Mark as Paid',
        icon: 'i-heroicons-check-circle',
        click: () => updatePaymentStatus(row, 'PAID'),
    },
    {
        label: 'Mark as Pending',
        icon: 'i-heroicons-clock',
        click: () => updatePaymentStatus(row, 'PENDING'),
    }],
    [{
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteInvoice(row),
    }],
]

// ─── Helpers ───
const statusColor = (status: string) => {
    switch (status) {
        case 'PENDING': return 'orange'
        case 'PAID': return 'green'
        case 'COMPLETED': return 'green'
        case 'PARTIALLY_PAID': return 'blue'
        case 'APPROVED': return 'blue'
        case 'OVERDUE': return 'red'
        case 'REJECTED': return 'red'
        case 'FAILED': return 'red'
        default: return 'gray'
    }
}

const getStatusLabel = (status: string) => {
    if (!status) return '-'
    // Check if overdue
    return status.replace(/_/g, ' ')
}

const formatDate = (date: string | Date | null) => {
    try {
        if (!date) return '-'
        return format(new Date(date), 'dd/MM/yyyy')
    } catch {
        return '-'
    }
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
    }).format(amount || 0)
}

const editingInvoice = ref<any>(null)

const onNewInvoice = () => {
    editingInvoice.value = null
    isNewInvoiceOpen.value = true
}

const onInvoiceSaved = () => {
    isNewInvoiceOpen.value = false
    editingInvoice.value = null
}

// ─── Send dropdown ───
const sendOptions = (row: any) => [[
    {
        label: 'Email',
        icon: 'i-heroicons-envelope',
        click: () => {
            toast.add({ title: 'Email sent', icon: 'i-heroicons-check-circle', color: 'green' })
        },
    },
]]
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- ─── Left: Invoice List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedInvoice ? 'w-[30%] min-w-[240px]' : 'w-full'
                ]"
            >
                <UCard
                    class="w-full"
                    :ui="{
                        base: '',
                        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                        header: { padding: 'px-4 py-5' },
                        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
                        footer: { padding: 'p-4' },
                    }"
                >
                    <!-- Filters -->
                    <template #header>
                        <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                            <div class="flex" :class="[selectedInvoice ? 'w-full justify-between items-center' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search invoices..."
                                    size="sm"
                                />
                                <USelectMenu
                                    v-model="selectedStatus"
                                    :options="statusOptions"
                                    multiple
                                    placeholder="Status"
                                    value-attribute="value"
                                    option-attribute="label"
                                    size="sm"
                                />
                            </div>
                            <div>
                                <UButton
                                    v-if="!selectedInvoice"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="New"
                                    @click="onNewInvoice"
                                />
                            </div>
                        </div>
                    </template>

                    <div class="flex justify-between items-center w-full px-4 py-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
                            <USelect
                                v-model="pageCount"
                                :options="[5, 10, 20, 30, 50]"
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

                    <!-- Full table view (no selection) -->
                    <div v-if="!selectedInvoice">
                        <UTable
                            v-model:sort="sort"
                            :rows="invoices"
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
                            @select="selectInvoice"
                        >
                            <template #createdAt-data="{ row }">
                                {{ formatDate(row.createdAt) }}
                            </template>
                            <template #invoiceCode-data="{ row }">
                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ row.invoiceCode || '-' }}</span>
                            </template>
                            <template #orderNumber-data="{ row }">
                                {{ row.salesOrder?.orderNumber || '-' }}
                            </template>
                            <template #clientName-data="{ row }">
                                {{ row.client?.name || '-' }}
                            </template>
                            <template #paymentStatus-data="{ row }">
                                <UBadge :color="statusColor(row.paymentStatus)" size="sm" variant="subtle">
                                    {{ getStatusLabel(row.paymentStatus) }}
                                </UBadge>
                            </template>
                            <template #dueDate-data="{ row }">
                                {{ formatDate(row.dueDate) }}
                            </template>
                            <template #grandTotal-data="{ row }">
                                {{ formatCurrency(row.grandTotal) }}
                            </template>
                            <template #balanceDue-data="{ row }">
                                {{ formatCurrency(row.balanceDue) }}
                            </template>
                        </UTable>
                    </div>

                    <!-- Compact list view (when detail panel is open) -->
                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading invoices...</div>
                        <div v-else-if="!invoices?.length" class="p-4 text-sm text-gray-500">No invoices found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in invoices"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedInvoice?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectInvoice(row)"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium text-primary-600 dark:text-primary-400">
                                            {{ row.invoiceCode }}
                                        </p>
                                        <p class="mt-0.5 truncate text-xs text-gray-500">
                                            {{ row.client?.name || '-' }} &middot; {{ formatDate(row.createdAt) }}
                                        </p>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-sm font-medium">{{ formatCurrency(row.grandTotal) }}</span>
                                        <UBadge :color="statusColor(row.paymentStatus)" size="xs" variant="subtle">
                                            {{ getStatusLabel(row.paymentStatus) }}
                                        </UBadge>
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
                                :total="pageTotal || 0"
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
                <div v-if="selectedInvoice" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex items-center gap-3">
                            <div>
                                <div class="font-semibold text-sm">{{ selectedInvoice.invoiceCode }}</div>
                                <div class="text-xs text-gray-500">
                                    <UBadge :color="statusColor(selectedInvoice.paymentStatus)" size="xs" variant="subtle">
                                        {{ getStatusLabel(selectedInvoice.paymentStatus) }}
                                    </UBadge>
                                    &middot; Total: {{ formatCurrency(selectedInvoice.grandTotal) }}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <UButton
                                icon="i-heroicons-pencil-square"
                                color="gray"
                                variant="ghost"
                                size="xs"
                                label="Edit"
                                @click="() => { editingInvoice = selectedInvoice; isNewInvoiceOpen = true }"
                            />
                            <UDropdown :items="sendOptions(selectedInvoice)">
                                <UButton
                                    icon="i-heroicons-paper-airplane"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Send"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UButton
                                v-if="selectedInvoice.paymentStatus !== 'PAID'"
                                icon="i-heroicons-banknotes"
                                color="primary"
                                variant="solid"
                                size="xs"
                                label="Record Payment"
                                @click="updatePaymentStatus(selectedInvoice, 'PAID')"
                            />
                            <UDropdown :items="invoiceActions(selectedInvoice)">
                                <UButton
                                    icon="i-heroicons-ellipsis-horizontal-20-solid"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                />
                            </UDropdown>
                            <UButton
                                icon="i-heroicons-x-mark"
                                color="red"
                                variant="soft"
                                size="sm"
                                @click="closeDetail"
                            />
                        </div>
                    </div>

                    <!-- What's Next Banner -->
                    <div v-if="selectedInvoice.paymentStatus === 'PENDING'" class="mx-4 mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                        <h4 class="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-2">WHAT'S NEXT?</h4>
                        <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">Invoice has been sent. Record payment for it as soon as you receive payment.</p>
                        <div class="flex items-center gap-3">
                            <UButton
                                icon="i-heroicons-banknotes"
                                color="primary"
                                variant="solid"
                                size="sm"
                                label="Record Payment"
                                @click="updatePaymentStatus(selectedInvoice, 'PAID')"
                            />
                        </div>
                    </div>

                    <!-- Associated Sales Orders -->
                    <div v-if="selectedInvoice.salesOrder" class="mx-4 mt-4">
                        <details class="border rounded-md">
                            <summary class="px-4 py-3 cursor-pointer text-sm font-medium flex items-center justify-between">
                                <span>Associated sales orders <UBadge color="primary" size="xs" variant="subtle" class="ml-1">1</UBadge></span>
                            </summary>
                            <div class="px-4 pb-3 text-sm text-gray-600 dark:text-gray-400">
                                {{ selectedInvoice.salesOrder.orderNumber }}
                            </div>
                        </details>
                    </div>

                    <!-- Tabs -->
                    <UTabs
                        v-model="activeTab"
                        :items="tabs"
                        class="flex-1 flex flex-col overflow-hidden"
                        color="primary"
                        :ui="{
                            list: {
                                tab: { active: 'text-primary-600 dark:text-primary-400' },
                                background: 'bg-gray-50 dark:bg-gray-800/50',
                            },
                        }"
                    >
                        <template #item="{ item, index }">
                            <div class="flex-1 flex flex-col overflow-auto p-4">
                                <!-- Invoice Details Tab -->
                                <template v-if="index === 0">
                                    <div class="space-y-6">
                                        <!-- Invoice Info -->
                                        <div>
                                            <h3 class="text-sm font-semibold mb-3">
                                                {{ selectedInvoice.invoiceCode }}
                                                <UBadge :color="statusColor(selectedInvoice.paymentStatus)" size="sm" variant="subtle" class="ml-2">
                                                    {{ getStatusLabel(selectedInvoice.paymentStatus) }}
                                                </UBadge>
                                            </h3>

                                            <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Invoice#</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.invoiceCode }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Sales Order#</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.salesOrder?.orderNumber || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Invoice Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedInvoice.createdAt) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Due Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedInvoice.dueDate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Payment Terms</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.invoicePaymentTerms || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Salesperson</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.salesperson || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Project</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.project?.name || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Subject</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedInvoice.subject || '-' }}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Customer Details -->
                                        <div>
                                            <h4 class="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">Customer Details</h4>
                                            <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Name</span>
                                                    <div class="mt-0.5 flex items-center gap-2">
                                                        <UAvatar
                                                            v-if="selectedInvoice.client?.name"
                                                            :alt="selectedInvoice.client.name"
                                                            size="2xs"
                                                            :ui="{ background: 'bg-primary-100 dark:bg-primary-900' }"
                                                        />
                                                        <span class="font-medium">{{ selectedInvoice.client?.name || '-' }}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Billing Address</span>
                                                    <p class="mt-0.5 font-medium">-</p>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Items Table -->
                                        <div>
                                            <h4 class="text-sm font-semibold mb-3">
                                                Items
                                                <UBadge color="gray" size="xs" variant="subtle" class="ml-1">
                                                    {{ selectedInvoice.entries?.length || 0 }}
                                                </UBadge>
                                            </h4>
                                            <UTable
                                                :rows="(selectedInvoice.entries || []).map((e: any, i: number) => ({ ...e, serialNo: i + 1 }))"
                                                :columns="[
                                                    { key: 'serialNo', label: '#' },
                                                    { key: 'name', label: 'ITEM & DESCRIPTION' },
                                                    { key: 'qty', label: 'QTY' },
                                                    { key: 'rate', label: 'RATE' },
                                                    { key: 'value', label: 'AMOUNT' },
                                                ]"
                                                :ui="{
                                                    td: { base: 'text-sm' },
                                                    th: { base: 'text-xs' },
                                                }"
                                            >
                                                <template #qty-data="{ row }">
                                                    {{ row.qty || 0 }}
                                                </template>
                                                <template #rate-data="{ row }">
                                                    {{ formatCurrency(row.rate) }}
                                                </template>
                                                <template #value-data="{ row }">
                                                    {{ formatCurrency(row.value) }}
                                                </template>
                                            </UTable>
                                        </div>

                                        <!-- Summary -->
                                        <div class="flex justify-end">
                                            <div class="w-64 space-y-2 text-sm">
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Sub Total</span>
                                                    <span class="font-medium">{{ formatCurrency(selectedInvoice.subtotal) }}</span>
                                                </div>
                                                <div v-if="selectedInvoice.discount" class="flex justify-between">
                                                    <span class="text-gray-500">Discount</span>
                                                    <span class="font-medium">{{ formatCurrency(selectedInvoice.discount) }}</span>
                                                </div>
                                                <div v-if="selectedInvoice.adjustment" class="flex justify-between">
                                                    <span class="text-gray-500">Adjustment</span>
                                                    <span class="font-medium">{{ selectedInvoice.adjustment }}</span>
                                                </div>
                                                <div class="flex justify-between border-t pt-2 border-gray-200 dark:border-gray-700">
                                                    <span class="font-semibold">Total</span>
                                                    <span class="font-semibold">{{ formatCurrency(selectedInvoice.grandTotal) }}</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="font-semibold text-primary-600">Balance Due</span>
                                                    <span class="font-semibold text-primary-600">{{ formatCurrency(selectedInvoice.balanceDue) }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Notes -->
                                        <div v-if="selectedInvoice.notes">
                                            <h4 class="text-sm font-semibold mb-2">Notes</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">{{ selectedInvoice.notes }}</p>
                                        </div>

                                        <!-- Terms & Conditions -->
                                        <div>
                                            <h4 class="text-sm font-semibold mb-2">Terms and Conditions</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">
                                                {{ selectedInvoice.termsAndConditions || 'No Terms and Conditions' }}
                                            </p>
                                        </div>
                                    </div>
                                </template>

                                <!-- Activity Logs Tab -->
                                <template v-if="index === 1">
                                    <div class="text-sm text-gray-500 text-center py-8">
                                        No activity logs yet.
                                    </div>
                                </template>
                            </div>
                        </template>
                    </UTabs>
                </div>
            </Transition>
        </div>

        <!-- New Invoice Modal -->
        <InvoicesNewInvoiceModal
            v-model="isNewInvoiceOpen"
            :editing-invoice="editingInvoice"
            @saved="onInvoiceSaved"
        />
    </UDashboardPanelContent>
</template>
