<script setup lang="ts">
import { format } from 'date-fns'
import {
    useFindManyPayment,
    useCountPayment,
    useUpdatePayment,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

// ─── Selected payment & detail panel ───
const selectedPayment = ref<any>(null)
const activeTab = ref(0)
const isNewPaymentOpen = ref(false)

const selectPayment = (row: any) => {
    selectedPayment.value = row
}

const closeDetail = () => {
    selectedPayment.value = null
}

const tabs = [
    { label: 'Payment Details', icon: 'i-heroicons-document-text' },
    { label: 'Activity Logs', icon: 'i-heroicons-clock' },
]

// ─── Filters ───
const search = ref('')
const page = ref(1)
const pageCount = ref(10)
const selectedStatus = ref<any[]>([])
const sort = ref({ column: 'createdAt', direction: 'desc' as const })

const statusOptions = [
    { label: 'Completed', value: 'Completed' },
    { label: 'Pending', value: 'Pending' },
]

const resetFilters = () => {
    search.value = ''
    selectedStatus.value = []
}

// ─── Table columns ───
const columns = [
    { key: 'paymentDate', label: 'DATE', sortable: true },
    { key: 'paymentNumber', label: 'PAYMENT #', sortable: true },
    { key: 'referenceNumber', label: 'REFERENCE NUMBER', sortable: true },
    { key: 'clientName', label: 'CUSTOMER NAME', sortable: true },
    { key: 'invoiceCode', label: 'INVOICE#', sortable: false },
    { key: 'paymentMode', label: 'MODE', sortable: true },
    { key: 'amount', label: 'AMOUNT', sortable: true },
    { key: 'unusedAmount', label: 'UNUSED AMOUNT', sortable: true },
    { key: 'status', label: 'STATUS', sortable: true },
]

// ─── Data fetching ───
const queryArgs = computed(() => {
    const statusCondition =
        selectedStatus.value.length > 0
            ? { status: { in: selectedStatus.value.map((s: any) => s.value || s) } }
            : {}

    return {
        where: {
            AND: [
                { companyId, deleted: false, paymentNumber: { not: null } },
                search.value
                    ? {
                        OR: [
                            { client: { name: { contains: search.value, mode: 'insensitive' } } },
                            { referenceNumber: { contains: search.value, mode: 'insensitive' } },
                        ],
                    }
                    : {},
                statusCondition,
            ],
        },
        include: { client: true, bill: true },
        orderBy: { [sort.value.column]: sort.value.direction },
        skip: (page.value - 1) * pageCount.value,
        take: pageCount.value,
    }
})

const { data: payments, isLoading } = useFindManyPayment(queryArgs)
const { data: pageTotal } = useCountPayment(computed(() => ({ where: queryArgs.value.where })))

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value || 0))

// ─── Mutations ───
const UpdatePayment = useUpdatePayment({ optimisticUpdate: true })

const deletePayment = async (payment: any) => {
    try {
        await UpdatePayment.mutateAsync({
            where: { id: payment.id },
            data: { deleted: true },
        })
        if (selectedPayment.value?.id === payment.id) {
            selectedPayment.value = null
        }
        toast.add({ title: 'Payment deleted', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to delete payment', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    }
}

// ─── Actions dropdown ───
const paymentActions = (row: any) => [
    [{
        label: 'Edit',
        icon: 'i-heroicons-pencil-square',
        click: () => { editingPayment.value = row; isNewPaymentOpen.value = true },
    }],
    [{
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deletePayment(row),
    }],
]

// ─── Helpers ───
const statusColor = (status: string) => {
    switch (status) {
        case 'Completed': return 'green'
        case 'Pending': return 'orange'
        default: return 'gray'
    }
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

const editingPayment = ref<any>(null)

const onNewPayment = () => {
    editingPayment.value = null
    isNewPaymentOpen.value = true
}

const onPaymentSaved = () => {
    isNewPaymentOpen.value = false
    editingPayment.value = null
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
            <!-- ─── Left: Payment List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedPayment ? 'w-[30%] min-w-[240px]' : 'w-full'
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
                            <div class="flex" :class="[selectedPayment ? 'w-full justify-between items-center' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search payments..."
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
                                    v-if="!selectedPayment"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="New"
                                    @click="onNewPayment"
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
                    <div v-if="!selectedPayment">
                        <UTable
                            v-model:sort="sort"
                            :rows="payments"
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
                            @select="selectPayment"
                        >
                            <template #paymentDate-data="{ row }">
                                {{ formatDate(row.paymentDate) }}
                            </template>
                            <template #paymentNumber-data="{ row }">
                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ row.paymentNumber }}</span>
                            </template>
                            <template #clientName-data="{ row }">
                                {{ row.client?.name || '-' }}
                            </template>
                            <template #invoiceCode-data="{ row }">
                                {{ row.bill?.invoiceCode || '-' }}
                            </template>
                            <template #amount-data="{ row }">
                                {{ formatCurrency(row.amount) }}
                            </template>
                            <template #unusedAmount-data="{ row }">
                                {{ formatCurrency(row.unusedAmount || 0) }}
                            </template>
                            <template #status-data="{ row }">
                                <UBadge :color="statusColor(row.status)" size="sm" variant="subtle">
                                    {{ row.status }}
                                </UBadge>
                            </template>
                        </UTable>
                    </div>

                    <!-- Compact list view (when detail panel is open) -->
                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading payments...</div>
                        <div v-else-if="!payments?.length" class="p-4 text-sm text-gray-500">No payments found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in payments"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedPayment?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectPayment(row)"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium text-primary-600 dark:text-primary-400">
                                            {{ row.client?.name || '-' }}
                                        </p>
                                        <p class="mt-0.5 truncate text-xs text-gray-500">
                                            {{ row.paymentNumber }} &middot; {{ formatDate(row.paymentDate) }}
                                        </p>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-sm font-medium">{{ formatCurrency(row.amount) }}</span>
                                        <UBadge :color="statusColor(row.status)" size="xs" variant="subtle">
                                            {{ row.status }}
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
                <div v-if="selectedPayment" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex items-center gap-3">
                            <div>
                                <div class="font-semibold text-sm">{{ selectedPayment.paymentNumber }}</div>
                                <div class="text-xs text-gray-500">
                                    <UBadge :color="statusColor(selectedPayment.status)" size="xs" variant="subtle">
                                        {{ selectedPayment.status }}
                                    </UBadge>
                                    &middot; {{ selectedPayment.paymentMode }}
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
                                @click="() => { editingPayment = selectedPayment; isNewPaymentOpen = true }"
                            />
                            <UDropdown :items="sendOptions(selectedPayment)">
                                <UButton
                                    icon="i-heroicons-paper-airplane"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Send"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UDropdown :items="paymentActions(selectedPayment)">
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
                                <!-- Payment Details Tab -->
                                <template v-if="index === 0">
                                    <div class="space-y-6">
                                        <!-- Payment Receipt Card -->
                                        <div class="border rounded-lg p-6 bg-white dark:bg-gray-900">
                                            <!-- Status ribbon -->
                                            <div class="flex justify-between items-start mb-6">
                                                <div>
                                                    <UBadge :color="statusColor(selectedPayment.status)" size="lg" variant="subtle">
                                                        {{ selectedPayment.status }}
                                                    </UBadge>
                                                </div>
                                                <div class="text-right">
                                                    <div class="bg-green-600 text-white px-4 py-2 rounded-md text-center">
                                                        <p class="text-xs">Amount Received</p>
                                                        <p class="text-lg font-bold">{{ formatCurrency(selectedPayment.amount) }}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <h3 class="text-lg font-semibold text-center mb-6 text-primary-600">PAYMENT RECEIPT</h3>

                                            <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                                <div>
                                                    <span class="text-gray-500">Payment Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedPayment.paymentDate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Payment #</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedPayment.paymentNumber }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Reference Number</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedPayment.referenceNumber || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Payment Mode</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedPayment.paymentMode }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Deposit To</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedPayment.depositTo || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Bank Charges</span>
                                                    <p class="mt-0.5 font-medium">{{ formatCurrency(selectedPayment.bankCharges || 0) }}</p>
                                                </div>
                                            </div>

                                            <!-- Received From -->
                                            <div class="mt-6 border-t pt-4">
                                                <span class="text-sm text-gray-500">Received From</span>
                                                <p class="mt-1 text-sm font-medium text-primary-600">{{ selectedPayment.client?.name || '-' }}</p>
                                            </div>
                                        </div>

                                        <!-- Payment for (Invoice link) -->
                                        <div v-if="selectedPayment.bill">
                                            <h4 class="text-sm font-semibold mb-3">Payment for</h4>
                                            <div class="border rounded-md overflow-hidden">
                                                <table class="w-full text-sm">
                                                    <thead class="bg-gray-50 dark:bg-gray-800">
                                                        <tr>
                                                            <th class="px-3 py-2 text-left font-medium text-xs text-gray-500">Invoice Number</th>
                                                            <th class="px-3 py-2 text-left font-medium text-xs text-gray-500">Invoice Date</th>
                                                            <th class="px-3 py-2 text-right font-medium text-xs text-gray-500">Invoice Amount</th>
                                                            <th class="px-3 py-2 text-right font-medium text-xs text-gray-500">Payment Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td class="px-3 py-2 text-primary-600">{{ selectedPayment.bill.invoiceCode }}</td>
                                                            <td class="px-3 py-2">{{ formatDate(selectedPayment.bill.createdAt) }}</td>
                                                            <td class="px-3 py-2 text-right">{{ formatCurrency(selectedPayment.bill.grandTotal) }}</td>
                                                            <td class="px-3 py-2 text-right">{{ formatCurrency(selectedPayment.amount) }}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <!-- Notes -->
                                        <div v-if="selectedPayment.notes">
                                            <h4 class="text-sm font-semibold mb-2">Notes</h4>
                                            <p class="text-sm text-gray-600 dark:text-gray-400">{{ selectedPayment.notes }}</p>
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

        <!-- Record Payment Modal -->
        <PaymentsRecordPaymentModal
            v-model="isNewPaymentOpen"
            :editing-payment="editingPayment"
            @saved="onPaymentSaved"
        />
    </UDashboardPanelContent>
</template>
