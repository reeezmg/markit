<script setup lang="ts">
import { format } from 'date-fns'
import {
    useFindManyQuote,
    useCountQuote,
    useUpdateQuote,
    useDeleteQuote,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

// ─── Selected quote & detail panel ───
const selectedQuote = ref<any>(null)
const activeTab = ref(0)
const isNewQuoteOpen = ref(false)

const selectQuote = (row: any) => {
    selectedQuote.value = row
}

const closeDetail = () => {
    selectedQuote.value = null
}

const tabs = [
    { label: 'Quote Details', icon: 'i-heroicons-document-text' },
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
    { label: 'Sent', value: 'SENT' },
    { label: 'Accepted', value: 'ACCEPTED' },
    { label: 'Declined', value: 'DECLINED' },
    { label: 'Expired', value: 'EXPIRED' },
]

const resetFilters = () => {
    search.value = ''
    selectedStatus.value = []
}

// ─── Table columns ───
const columns = [
    { key: 'quoteDate', label: 'DATE', sortable: true },
    { key: 'quoteNumber', label: 'QUOTE NUMBER', sortable: true },
    { key: 'referenceNumber', label: 'REFERENCE NUMBER', sortable: true },
    { key: 'clientName', label: 'CUSTOMER NAME', sortable: true },
    { key: 'status', label: 'STATUS', sortable: true },
    { key: 'total', label: 'AMOUNT', sortable: true },
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
                            { quoteNumber: { contains: search.value, mode: 'insensitive' } },
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

const { data: quotes, isLoading } = useFindManyQuote(queryArgs)
const { data: pageTotal } = useCountQuote(computed(() => ({ where: queryArgs.value.where })))

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value || 0))

// ─── Mutations ───
const UpdateQuote = useUpdateQuote({ optimisticUpdate: true })
const DeleteQuote = useDeleteQuote({ optimisticUpdate: true })

const isDeleting = ref(false)

const deleteQuote = async (quote: any) => {
    isDeleting.value = true
    try {
        await UpdateQuote.mutateAsync({
            where: { id: quote.id },
            data: { deleted: true },
        })
        if (selectedQuote.value?.id === quote.id) {
            selectedQuote.value = null
        }
        toast.add({ title: 'Quote deleted', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to delete quote', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    } finally {
        isDeleting.value = false
    }
}

const updateStatus = async (quote: any, status: string) => {
    try {
        await UpdateQuote.mutateAsync({
            where: { id: quote.id },
            data: { status },
        })
        if (selectedQuote.value?.id === quote.id) {
            selectedQuote.value = { ...selectedQuote.value, status }
        }
        toast.add({ title: `Quote marked as ${status}`, icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to update status', icon: 'i-heroicons-exclamation-circle', color: 'red' })
    }
}

// ─── Actions dropdown ───
const quoteActions = (row: any) => [
    [{
        label: 'Edit',
        icon: 'i-heroicons-pencil-square',
        click: () => { editingQuote.value = row; isNewQuoteOpen.value = true },
    }],
    [{
        label: 'Mark as Sent',
        icon: 'i-heroicons-paper-airplane',
        click: () => updateStatus(row, 'SENT'),
    },
    {
        label: 'Mark as Accepted',
        icon: 'i-heroicons-check-circle',
        click: () => updateStatus(row, 'ACCEPTED'),
    },
    {
        label: 'Mark as Declined',
        icon: 'i-heroicons-x-circle',
        click: () => updateStatus(row, 'DECLINED'),
    }],
    [{
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteQuote(row),
    }],
]

// ─── Helpers ───
const statusColor = (status: string) => {
    switch (status) {
        case 'DRAFT': return 'gray'
        case 'SENT': return 'blue'
        case 'ACCEPTED': return 'green'
        case 'DECLINED': return 'red'
        case 'EXPIRED': return 'orange'
        default: return 'gray'
    }
}

const formatDate = (date: string | Date) => {
    try {
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

const editingQuote = ref<any>(null)

const onNewQuote = () => {
    editingQuote.value = null
    isNewQuoteOpen.value = true
}

const onQuoteSaved = () => {
    isNewQuoteOpen.value = false
    editingQuote.value = null
}

// ─── Send dropdown ───
const sendOptions = (row: any) => [[
    {
        label: 'Email',
        icon: 'i-heroicons-envelope',
        click: () => {
            updateStatus(row, 'SENT')
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
    {
        label: 'Convert to Sales Order',
        icon: 'i-heroicons-clipboard-document-list',
        disabled: true,
        click: () => {},
    },
]]
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- ─── Left: Quote List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedQuote ? 'w-[30%] min-w-[240px]' : 'w-full'
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
                            <div class="flex" :class="[selectedQuote ? 'w-full justify-between items-center' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search quotes..."
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
                                    v-if="!selectedQuote"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="New"
                                    @click="onNewQuote"
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
                    <div v-if="!selectedQuote">
                        <UTable
                            v-model:sort="sort"
                            :rows="quotes"
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
                            @select="selectQuote"
                        >
                            <template #quoteDate-data="{ row }">
                                {{ formatDate(row.quoteDate) }}
                            </template>
                            <template #quoteNumber-data="{ row }">
                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ row.quoteNumber }}</span>
                                <UIcon v-if="row.status === 'SENT'" name="i-heroicons-envelope" class="ml-1 text-gray-400" />
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
                        </UTable>
                    </div>

                    <!-- Compact list view (when detail panel is open) -->
                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading quotes...</div>
                        <div v-else-if="!quotes?.length" class="p-4 text-sm text-gray-500">No quotes found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in quotes"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedQuote?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectQuote(row)"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium text-primary-600 dark:text-primary-400">
                                            {{ row.quoteNumber }}
                                        </p>
                                        <p class="mt-0.5 truncate text-xs text-gray-500">
                                            {{ row.client?.name || '-' }} &middot; {{ formatDate(row.quoteDate) }}
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
                <div v-if="selectedQuote" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div class="flex items-center gap-3">
                            <div>
                                <div class="font-semibold text-sm">{{ selectedQuote.quoteNumber }}</div>
                                <div class="text-xs text-gray-500">
                                    <UBadge :color="statusColor(selectedQuote.status)" size="xs" variant="subtle">
                                        {{ selectedQuote.status }}
                                    </UBadge>
                                    &middot; Total: {{ formatCurrency(selectedQuote.total) }}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <!-- Action buttons -->
                            <UButton
                                icon="i-heroicons-pencil-square"
                                color="gray"
                                variant="ghost"
                                size="xs"
                                label="Edit"
                                @click="() => { editingQuote = selectedQuote; isNewQuoteOpen = true }"
                            />
                            <UDropdown :items="sendOptions(selectedQuote)">
                                <UButton
                                    icon="i-heroicons-paper-airplane"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Send"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UDropdown :items="convertOptions(selectedQuote)">
                                <UButton
                                    icon="i-heroicons-arrow-path-rounded-square"
                                    color="gray"
                                    variant="ghost"
                                    size="xs"
                                    label="Convert"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UDropdown :items="quoteActions(selectedQuote)">
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
                                <!-- Quote Details Tab -->
                                <template v-if="index === 0">
                                    <div class="space-y-6">
                                        <!-- Quote Info -->
                                        <div>
                                            <h3 class="text-sm font-semibold mb-3">
                                                {{ selectedQuote.quoteNumber }}
                                                <UBadge :color="statusColor(selectedQuote.status)" size="sm" variant="subtle" class="ml-2">
                                                    {{ selectedQuote.status }}
                                                </UBadge>
                                            </h3>
                                            <p class="text-xs text-gray-500 mb-4">Total: {{ formatCurrency(selectedQuote.total) }}</p>

                                            <div class="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Quote Type</span>
                                                    <p class="mt-0.5 font-medium">Invoice</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Quote Number</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedQuote.quoteNumber }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Quote Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedQuote.quoteDate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Creation Date</span>
                                                    <p class="mt-0.5 font-medium">{{ formatDate(selectedQuote.createdAt) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">Salesperson</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedQuote.salesperson || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-primary-600 dark:text-primary-400">PDF Template</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedQuote.pdfTemplate || 'Spreadsheet Template' }}</p>
                                                </div>
                                                <div class="col-span-2">
                                                    <span class="text-primary-600 dark:text-primary-400">Subject</span>
                                                    <p class="mt-0.5 font-medium">{{ selectedQuote.subject || 'NA' }}</p>
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
                                                            v-if="selectedQuote.client?.name"
                                                            :alt="selectedQuote.client.name"
                                                            size="2xs"
                                                            :ui="{ background: 'bg-primary-100 dark:bg-primary-900' }"
                                                        />
                                                        <span class="font-medium">{{ selectedQuote.client?.name || '-' }}</span>
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
                                                    {{ selectedQuote.items?.length || 0 }}
                                                </UBadge>
                                            </h4>
                                            <UTable
                                                :rows="selectedQuote.items || []"
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
                                                    <span class="font-medium">{{ formatCurrency(selectedQuote.subTotal) }}</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Discount</span>
                                                    <span class="font-medium">{{ formatCurrency(selectedQuote.discount || 0) }}</span>
                                                </div>
                                                <div class="flex justify-between">
                                                    <span class="text-gray-500">Adjustment</span>
                                                    <span class="font-medium">{{ selectedQuote.adjustment || 0 }}</span>
                                                </div>
                                                <div class="flex justify-between border-t pt-2 border-gray-200 dark:border-gray-700">
                                                    <span class="font-semibold">Total</span>
                                                    <span class="font-semibold">{{ formatCurrency(selectedQuote.total) }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Notes -->
                                        <div v-if="selectedQuote.notes">
                                            <h4 class="text-sm font-semibold mb-2">Notes</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">{{ selectedQuote.notes }}</p>
                                        </div>

                                        <!-- Terms & Conditions -->
                                        <div>
                                            <h4 class="text-sm font-semibold mb-2">Terms and Conditions</h4>
                                            <p class="text-sm text-primary-600 dark:text-primary-400">
                                                {{ selectedQuote.termsAndConditions || 'No Terms and Conditions' }}
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

        <!-- New Quote Modal -->
        <QuotesNewQuoteModal
            v-model="isNewQuoteOpen"
            :editing-quote="editingQuote"
            @saved="onQuoteSaved"
        />
    </UDashboardPanelContent>
</template>
