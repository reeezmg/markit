<script setup lang="ts">
import { format } from 'date-fns'
import {
    useFindManySalesOrder,
    useCountSalesOrder,
    useUpdateSalesOrder,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

// ─── Selected order & detail panel ───
const selectedOrder = ref<any>(null)
const activeTab = ref(0)
const isNewOrderOpen = ref(false)

const selectOrder = (row: any) => {
    selectedOrder.value = row
}

const closeDetail = () => {
    selectedOrder.value = null
}

const tabs = [
    { label: 'Sales Order Details', icon: 'i-heroicons-document-text' },
    { label: 'Activity Logs', icon: 'i-heroicons-clock' },
]

// ─── Filters ───
const search = ref('')
const page = ref(1)
const pageCount = ref(10)
const selectedStatus = ref<any[]>([])
const sort = ref({ column: 'createdAt', direction: 'desc' as const })

const statusOptions = [
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Confirmed', value: 'CONFIRMED' },
    { label: 'Closed', value: 'CLOSED' },
    { label: 'Cancelled', value: 'CANCELLED' },
]

const resetFilters = () => {
    search.value = ''
    selectedStatus.value = []
}

// ─── Table columns ───
const columns = [
    { key: 'orderDate', label: 'DATE', sortable: true },
    { key: 'orderNumber', label: 'SALES ORDER#', sortable: true },
    { key: 'referenceNumber', label: 'REFERENCE#', sortable: true },
    { key: 'clientName', label: 'CUSTOMER NAME', sortable: true },
    { key: 'status', label: 'STATUS', sortable: true },
    { key: 'total', label: 'AMOUNT', sortable: true },
    { key: 'expectedShipmentDate', label: 'EXPECTED SHIPMENT DATE', sortable: true },
    { key: 'deliveryMethod', label: 'DELIVERY METHOD', sortable: true },
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
                { companyId, deleted: false },
                search.value
                    ? {
                        OR: [
                            { orderNumber: { contains: search.value, mode: 'insensitive' } },
                            { client: { name: { contains: search.value, mode: 'insensitive' } } },
                            { referenceNumber: { contains: search.value, mode: 'insensitive' } },
                        ],
                    }
                    : {},
                statusCondition,
            ],
        },
        include: { client: true, items: true, project: true },
        orderBy: { [sort.value.column]: sort.value.direction },
        skip: (page.value - 1) * pageCount.value,
        take: pageCount.value,
    }
})

const { data: salesOrders, isLoading } = useFindManySalesOrder(queryArgs)
const { data: pageTotal } = useCountSalesOrder(computed(() => ({ where: queryArgs.value.where })))

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value || 0))

// ─── Mutations ───
const UpdateSalesOrder = useUpdateSalesOrder({ optimisticUpdate: true })

const isDeleting = ref(false)

const deleteOrder = async (order: any) => {
    isDeleting.value = true
    try {
        await UpdateSalesOrder.mutateAsync({
            where: { id: order.id },
            data: { deleted: true },
        })
        if (selectedOrder.value?.id === order.id) {
            selectedOrder.value = null
        }
        toast.add({ title: 'Sales order deleted', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to delete sales order', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    } finally {
        isDeleting.value = false
    }
}

const updateStatus = async (order: any, status: string) => {
    try {
        await UpdateSalesOrder.mutateAsync({
            where: { id: order.id },
            data: { status },
        })
        if (selectedOrder.value?.id === order.id) {
            selectedOrder.value = { ...selectedOrder.value, status }
        }
        toast.add({ title: `Sales order marked as ${status}`, icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to update status', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    }
}

// ─── Actions dropdown ───
const orderActions = (row: any) => [
    [{
        label: 'Edit',
        icon: 'i-heroicons-pencil-square',
        click: () => { editingOrder.value = row; isNewOrderOpen.value = true },
    }],
    [{
        label: 'Mark as Confirmed',
        icon: 'i-heroicons-check-circle',
        click: () => updateStatus(row, 'CONFIRMED'),
    },
    {
        label: 'Mark as Closed',
        icon: 'i-heroicons-lock-closed',
        click: () => updateStatus(row, 'CLOSED'),
    },
    {
        label: 'Mark as Cancelled',
        icon: 'i-heroicons-x-circle',
        click: () => updateStatus(row, 'CANCELLED'),
    }],
    [{
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteOrder(row),
    }],
]

// ─── Helpers ───
const statusColor = (status: string) => {
    switch (status) {
        case 'DRAFT': return 'gray'
        case 'CONFIRMED': return 'green'
        case 'CLOSED': return 'blue'
        case 'CANCELLED': return 'red'
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

const editingOrder = ref<any>(null)

const onNewOrder = () => {
    editingOrder.value = null
    isNewOrderOpen.value = true
}

const onOrderSaved = () => {
    isNewOrderOpen.value = false
    editingOrder.value = null
}

// ─── Send dropdown ───
const sendOptions = (row: any) => [[
    {
        label: 'Email',
        icon: 'i-heroicons-envelope',
        click: () => {
            updateStatus(row, 'CONFIRMED')
        },
    },
]]

// ─── Convert dropdown ───
const convertOptions = (row: any) => [[
    {
        label: 'Convert to Invoice',
        icon: 'i-heroicons-document-text',
        disabled: true,
        click: () => {},
    },
]]
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- ─── Left: Sales Order List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedOrder ? 'w-[30%] min-w-[240px]' : 'w-full'
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
                            <div class="flex" :class="[selectedOrder ? 'w-full justify-between items-center' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search sales orders..."
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
                                    v-if="!selectedOrder"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="New"
                                    @click="onNewOrder"
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
                    <div v-if="!selectedOrder">
                        <UTable
                            v-model:sort="sort"
                            :rows="salesOrders"
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
                            @select="selectOrder"
                        >
                            <template #orderDate-data="{ row }">
                                {{ formatDate(row.orderDate) }}
                            </template>
                            <template #orderNumber-data="{ row }">
                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ row.orderNumber }}</span>
                            </template>
                            <template #clientName-data="{ row }">
                                {{ row.client?.name || '-' }}
                            </template>
                            <template #status-data="{ row }">
                                <UBadge :color="statusColor(row.status)" size="sm" variant="subtle">
                                    {{ row.status }}
                                </UBadge>
                            </template>
                            <template #total-data="{ row }">
                                {{ formatCurrency(row.total) }}
                            </template>
                            <template #expectedShipmentDate-data="{ row }">
                                {{ formatDate(row.expectedShipmentDate) }}
                            </template>
                            <template #deliveryMethod-data="{ row }">
                                {{ row.deliveryMethod || '-' }}
                            </template>
                        </UTable>
                    </div>

                    <!-- Compact list view (when detail panel is open) -->
                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading sales orders...</div>
                        <div v-else-if="!salesOrders?.length" class="p-4 text-sm text-gray-500">No sales orders found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in salesOrders"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedOrder?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectOrder(row)"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium text-primary-600 dark:text-primary-400">
                                            {{ row.orderNumber }}
                                        </p>
                                        <p class="mt-0.5 truncate text-xs text-gray-500">
                                            {{ row.client?.name || '-' }} &middot; {{ formatDate(row.orderDate) }}
                                        </p>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-sm font-medium">{{ formatCurrency(row.total) }}</span>
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
                <div v-if="selectedOrder" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex items-center gap-3">
                            <div>
                                <div class="font-semibold text-sm">{{ selectedOrder.orderNumber }}</div>
                                <div class="text-xs text-gray-500">
                                    <UBadge :color="statusColor(selectedOrder.status)" size="xs" variant="subtle">
                                        {{ selectedOrder.status }}
                                    </UBadge>
                                    &middot; Total: {{ formatCurrency(selectedOrder.total) }}
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
                                @click="() => { editingOrder = selectedOrder; isNewOrderOpen = true }"
                            />
                            <UDropdown :items="sendOptions(selectedOrder)">
                                <UButton
                                    icon="i-heroicons-paper-airplane"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Send"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UDropdown :items="convertOptions(selectedOrder)">
                                <UButton
                                    icon="i-heroicons-arrow-path-rounded-square"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Convert"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UButton
                                v-if="selectedOrder.status === 'DRAFT'"
                                icon="i-heroicons-check-circle"
                                color="primary"
                                variant="soft"
                                size="xs"
                                label="Mark as Confirmed"
                                @click="updateStatus(selectedOrder, 'CONFIRMED')"
                            />
                            <UDropdown :items="orderActions(selectedOrder)">
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

                    <!-- What's Next Banner (for DRAFT orders) -->
                    <div v-if="selectedOrder.status === 'DRAFT'" class="mx-4 mt-4 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                        <h4 class="text-sm font-semibold text-primary-700 dark:text-primary-300 mb-2">WHAT'S NEXT?</h4>
                        <div class="flex items-center gap-3">
                            <UButton
                                icon="i-heroicons-paper-airplane"
                                color="primary"
                                variant="solid"
                                size="sm"
                                label="Send Sales Order"
                                @click="updateStatus(selectedOrder, 'CONFIRMED')"
                            />
                            <UButton
                                icon="i-heroicons-check-circle"
                                color="gray"
                                variant="solid"
                                size="sm"
                                label="Mark as Confirmed"
                                @click="updateStatus(selectedOrder, 'CONFIRMED')"
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
                                <!-- Sales Order Details Tab -->
                                <template v-if="index === 0">
                                    <div class="space-y-6">
                                        <!-- Order Info -->
                                        <div>
                                            <h3 class="text-sm font-semibold mb-3">
                                                {{ selectedOrder.orderNumber }}
                                                <UBadge :color="statusColor(selectedOrder.status)" size="sm" variant="subtle" class="ml-2">
                                                    {{ selectedOrder.status }}
                                                </UBadge>
                                            </h3>
                                            <p class="text-xs text-gray-500 mb-4">Total: {{ formatCurrency(selectedOrder.total) }}</p>

                                            <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Sales Order#</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.orderNumber }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Reference#</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.referenceNumber || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Sales Order Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedOrder.orderDate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Expected Shipment Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedOrder.expectedShipmentDate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Payment Terms</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.paymentTerms || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Delivery Method</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.deliveryMethod || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Salesperson</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.salesperson || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Project</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedOrder.project?.name || '-' }}</p>
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
                                                            v-if="selectedOrder.client?.name"
                                                            :alt="selectedOrder.client.name"
                                                            size="2xs"
                                                            :ui="{ background: 'bg-primary-100 dark:bg-primary-900' }"
                                                        />
                                                        <span class="font-medium">{{ selectedOrder.client?.name || '-' }}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Billing Address</span>
                                                    <p class="mt-0.5 font-medium">-</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Shipping Address</span>
                                                    <p class="mt-0.5 font-medium">-</p>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Items Table -->
                                        <div>
                                            <h4 class="text-sm font-semibold mb-3">
                                                Items
                                                <UBadge color="gray" size="xs" variant="subtle" class="ml-1">
                                                    {{ selectedOrder.items?.length || 0 }}
                                                </UBadge>
                                            </h4>
                                            <UTable
                                                :rows="selectedOrder.items || []"
                                                :columns="[
                                                    { key: 'serialNo', label: 'S.NO' },
                                                    { key: 'name', label: 'ITEM' },
                                                    { key: 'quantity', label: 'QTY' },
                                                    { key: 'rate', label: 'PRICE' },
                                                    { key: 'amount', label: 'AMOUNT' },
                                                ]"
                                                :ui="{
                                                    td: { base: 'text-sm' },
                                                    th: { base: 'text-xs' },
                                                }"
                                            >
                                                <template #quantity-data="{ row }">
                                                    <div>
                                                        <span>{{ row.quantity }}</span>
                                                        <p v-if="row.unit" class="text-xs text-gray-400">{{ row.unit }}</p>
                                                    </div>
                                                </template>
                                                <template #rate-data="{ row }">
                                                    {{ formatCurrency(row.rate) }}
                                                </template>
                                                <template #amount-data="{ row }">
                                                    {{ formatCurrency(row.amount) }}
                                                </template>
                                            </UTable>
                                        </div>

                                        <!-- Summary -->
                                        <div class="flex justify-end">
                                            <div class="w-64 space-y-2 text-sm">
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Sub Total</span>
                                                    <span class="font-medium">{{ formatCurrency(selectedOrder.subTotal) }}</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Discount</span>
                                                    <span class="font-medium">{{ formatCurrency(selectedOrder.discount || 0) }}</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Adjustment</span>
                                                    <span class="font-medium">{{ selectedOrder.adjustment || 0 }}</span>
                                                </div>
                                                <div class="flex justify-between border-t pt-2 border-gray-200 dark:border-gray-700">
                                                    <span class="font-semibold">Total</span>
                                                    <span class="font-semibold">{{ formatCurrency(selectedOrder.total) }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Notes -->
                                        <div v-if="selectedOrder.notes">
                                            <h4 class="text-sm font-semibold mb-2">Notes</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">{{ selectedOrder.notes }}</p>
                                        </div>

                                        <!-- Terms & Conditions -->
                                        <div>
                                            <h4 class="text-sm font-semibold mb-2">Terms and Conditions</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">
                                                {{ selectedOrder.termsAndConditions || 'No Terms and Conditions' }}
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

        <!-- New Sales Order Modal -->
        <SalesOrdersNewSalesOrderModal
            v-model="isNewOrderOpen"
            :editing-order="editingOrder"
            @saved="onOrderSaved"
        />
    </UDashboardPanelContent>
</template>
