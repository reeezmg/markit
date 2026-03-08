<script setup lang="ts">
import { format } from 'date-fns'
import {
    useFindManyCouponClient,
    useCountCouponClient,
    useFindManyCouponUsage,
    useCountCouponUsage,
    useCreateCouponClient,
    useDeleteCouponClient,
    useFindManyCompanyClient,
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'

const props = defineProps<{
    coupon: any
}>()

const emit = defineEmits(['close'])

const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const activeTab = ref(0)
const isAddClientModalOpen = ref(false)
const clientSearch = ref('')

const CreateCouponClient = useCreateCouponClient({ optimisticUpdate: true });
const DeleteCouponClient = useDeleteCouponClient({ optimisticUpdate: true });

// ─── localStorage keys ───
const LS_USAGE_PAGE_COUNT = 'couponDetail_usagePageCount'
const LS_ALLOWED_PAGE_COUNT = 'couponDetail_allowedPageCount'

// ─── Dynamic tabs based on audienceType ───
const tabs = computed(() => {
    const base = [{ label: 'Usage History', icon: 'i-heroicons-clock' }]
    if (props.coupon?.audienceType === 'SPECIFIC') {
        base.push({ label: 'Allowed Clients', icon: 'i-heroicons-user-plus' })
    } else if (props.coupon?.audienceType === 'GENERATE') {
        base.push({ label: 'Generated Clients', icon: 'i-heroicons-gift' })
    }
    return base
})

// ─── Coupon info helpers ───
const formatDiscount = computed(() => {
    const c = props.coupon
    if (!c) return '-'
    if (c.type === 'PERCENTAGE') return `${c.discountValue}%${c.maxDiscountAmount ? ` (Max: ${c.maxDiscountAmount})` : ''}`
    if (c.type === 'GIFT') return 'Gift'
    return `${c.discountValue} Flat`
})

const isCurrentlyActive = computed(() => {
    const c = props.coupon
    if (!c) return false
    const now = new Date()
    return c.isActive && now >= new Date(c.startDate) && now <= new Date(c.endDate)
})

const daysRemaining = computed(() => {
    const c = props.coupon
    if (!c) return 0
    const now = new Date()
    const end = new Date(c.endDate)
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
})

// ─── Usage History Tab ───
const usagePage = ref(1)
const usagePageCount = ref(parseInt(localStorage.getItem(LS_USAGE_PAGE_COUNT) || '10'))
const usageSearch = ref('')

watch(usagePageCount, (v) => { localStorage.setItem(LS_USAGE_PAGE_COUNT, String(v)); usagePage.value = 1 })

const usageWhereArgs = computed(() => ({
    couponId: props.coupon?.id,
    ...(usageSearch.value.trim() && {
        client: {
            name: { contains: usageSearch.value.trim(), mode: 'insensitive' },
        },
    }),
}))

const usageQueryArgs = computed<Prisma.CouponUsageFindManyArgs>(() => ({
    where: usageWhereArgs.value,
    include: {
        client: true,
        bill: {
            select: {
                id: true,
                invoiceNumber: true,
                grandTotal: true,
            }
        }
    },
    orderBy: { usedAt: 'desc' },
    skip: (usagePage.value - 1) * usagePageCount.value,
    take: Number(usagePageCount.value),
}))

const { data: couponUsages, isLoading: usageLoading } = useFindManyCouponUsage(
    computed(() => props.coupon?.id ? usageQueryArgs.value : undefined)
)

const { data: usageTotalCount } = useCountCouponUsage(
    computed(() => props.coupon?.id ? { where: usageWhereArgs.value } : undefined)
)

const usageColumns = [
    { key: 'client.name', label: 'Client' },
    { key: 'client.phone', label: 'Phone' },
    { key: 'usedAt', label: 'Used At' },
    { key: 'bill.invoiceNumber', label: 'Invoice #' },
]

const formattedUsages = computed(() => {
    if (!couponUsages.value) return []
    return couponUsages.value.map((u: any) => ({
        ...u,
        'client.name': u.client?.name || '-',
        'client.phone': u.client?.phone || '-',
        'bill.invoiceNumber': u.bill?.invoiceNumber || '-',
        usedAt: format(new Date(u.usedAt), 'd MMM yyyy, hh:mm a'),
    }))
})

// ─── Allowed / Generated Clients Tab (shared query) ───
const allowedPage = ref(1)
const allowedPageCount = ref(parseInt(localStorage.getItem(LS_ALLOWED_PAGE_COUNT) || '10'))
const allowedSearch = ref('')

watch(allowedPageCount, (v) => { localStorage.setItem(LS_ALLOWED_PAGE_COUNT, String(v)); allowedPage.value = 1 })

const allowedWhereArgs = computed(() => ({
    couponId: props.coupon?.id,
    ...(allowedSearch.value.trim() && {
        client: {
            name: { contains: allowedSearch.value.trim(), mode: 'insensitive' },
        },
    }),
}))

const allowedQueryArgs = computed<Prisma.CouponClientFindManyArgs>(() => ({
    where: allowedWhereArgs.value,
    include: {
        client: true,
    },
    orderBy: { createdAt: 'desc' },
    skip: (allowedPage.value - 1) * allowedPageCount.value,
    take: Number(allowedPageCount.value),
}))

const { data: allowedClients, isLoading: allowedLoading } = useFindManyCouponClient(
    computed(() => props.coupon?.id && props.coupon?.audienceType !== 'ALL' ? allowedQueryArgs.value : undefined)
)

const { data: allowedTotalCount } = useCountCouponClient(
    computed(() => props.coupon?.id && props.coupon?.audienceType !== 'ALL' ? { where: allowedWhereArgs.value } : undefined)
)

const allowedColumns = computed(() => {
    const cols = [
        { key: 'client.name', label: 'Client' },
        { key: 'client.phone', label: 'Phone' },
        { key: 'createdAt', label: 'Added On' },
    ]
    if (props.coupon?.audienceType === 'SPECIFIC') {
        cols.push({ key: 'actions', label: '' })
    }
    return cols
})

const formattedAllowed = computed(() => {
    if (!allowedClients.value) return []
    return allowedClients.value.map((ac: any) => ({
        ...ac,
        'client.name': ac.client?.name || '-',
        'client.phone': ac.client?.phone || '-',
        createdAt: format(new Date(ac.createdAt), 'd MMM yyyy'),
    }))
})

const removeClient = (couponClientId: string) => {
    try {
        DeleteCouponClient.mutate({
            where: { id: couponClientId },
        })
        toast.add({ title: 'Client removed from coupon', color: 'green' })
    } catch (e: any) {
        toast.add({ title: 'Error removing client', description: e.message, color: 'red' })
    }
}

// ─── Add Client Modal (only for SPECIFIC) ───
const companyClientsArgs = computed<Prisma.CompanyClientFindManyArgs>(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
        ...(clientSearch.value.trim() && {
            client: {
                OR: [
                    { name: { contains: clientSearch.value.trim(), mode: 'insensitive' } },
                    { phone: { contains: clientSearch.value.trim() } },
                ],
            },
        }),
    },
    include: {
        client: true,
    },
    take: 20,
}))

const { data: companyClients, isLoading: clientsLoading } = useFindManyCompanyClient(
    computed(() => isAddClientModalOpen.value ? companyClientsArgs.value : undefined)
)

// All coupon clients (no pagination) for checking added state in modal
const allAllowedArgs = computed<Prisma.CouponClientFindManyArgs>(() => ({
    where: { couponId: props.coupon?.id },
    select: { id: true, clientId: true },
}))

const { data: allAllowedClients } = useFindManyCouponClient(
    computed(() => isAddClientModalOpen.value && props.coupon?.id ? allAllowedArgs.value : undefined)
)

const addedClientMap = computed(() => {
    const map = new Map<string, string>()
    if (!allAllowedClients.value) return map
    allAllowedClients.value.forEach((ac: any) => map.set(ac.clientId, ac.id))
    return map
})

const toggleClient = (clientId: string) => {
    const couponClientId = addedClientMap.value.get(clientId)
    if (couponClientId) {
        removeClient(couponClientId)
    } else {
        addClient(clientId)
    }
}

const addClient = (clientId: string) => {
    try {
        CreateCouponClient.mutate({
            data: {
                coupon: { connect: { id: props.coupon.id } },
                client: { connect: { id: clientId } },
            },
        })
        toast.add({ title: 'Client added to coupon', color: 'green' })
    } catch (e: any) {
        toast.add({ title: 'Error adding client', description: e.message, color: 'red' })
    }
}

// ─── Pagination helpers ───
const pageCountOptions = [5, 10, 20, 30, 50].map(n => ({ label: String(n), value: n }))

const usagePageFrom = computed(() => (usagePage.value - 1) * usagePageCount.value + 1)
const usagePageTo = computed(() => Math.min(usagePage.value * usagePageCount.value, usageTotalCount.value || 0))

const allowedPageFrom = computed(() => (allowedPage.value - 1) * allowedPageCount.value + 1)
const allowedPageTo = computed(() => Math.min(allowedPage.value * allowedPageCount.value, allowedTotalCount.value || 0))

// Reset search when search changes to go back to page 1
watch(usageSearch, () => { usagePage.value = 1 })
watch(allowedSearch, () => { allowedPage.value = 1 })

watch(() => props.coupon?.id, () => {
    activeTab.value = 0
    usagePage.value = 1
    allowedPage.value = 1
    usageSearch.value = ''
    allowedSearch.value = ''
    clientSearch.value = ''
})
</script>

<template>
    <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-ticket" class="text-lg text-primary-500" />
                <div>
                    <div class="font-semibold text-sm">{{ coupon.code }}</div>
                    <div class="flex items-center gap-1 mt-0.5">
                        <UBadge
                            :color="coupon.type === 'PERCENTAGE' ? 'blue' : coupon.type === 'FLAT' ? 'green' : 'orange'"
                            size="xs"
                            variant="subtle"
                        >{{ coupon.type }}</UBadge>
                        <UBadge color="purple" size="xs" variant="subtle">{{ coupon.audienceType }}</UBadge>
                    </div>
                </div>
            </div>
            <UButton
                icon="i-heroicons-x-mark"
                color="red"
                variant="soft"
                size="sm"
                @click="emit('close')"
            />
        </div>

        <!-- Coupon Info Summary -->
        <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <div class="grid grid-cols-3 gap-3">
                <!-- Discount -->
                <div class="flex flex-col items-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <UIcon name="i-heroicons-receipt-percent" class="text-blue-500 mb-1" />
                    <span class="text-[10px] text-gray-500 uppercase tracking-wide">Discount</span>
                    <span class="text-xs font-semibold text-gray-900 dark:text-gray-100 text-center">{{ formatDiscount }}</span>
                </div>
                <!-- Status -->
                <div class="flex flex-col items-center p-2 rounded-lg" :class="isCurrentlyActive ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
                    <UIcon name="i-heroicons-signal" :class="isCurrentlyActive ? 'text-green-500' : 'text-red-500'" class="mb-1" />
                    <span class="text-[10px] text-gray-500 uppercase tracking-wide">Status</span>
                    <span class="text-xs font-semibold" :class="isCurrentlyActive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
                        {{ isCurrentlyActive ? 'Active' : 'Inactive' }}
                    </span>
                </div>
                <!-- Usage -->
                <div class="flex flex-col items-center p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                    <UIcon name="i-heroicons-chart-bar" class="text-purple-500 mb-1" />
                    <span class="text-[10px] text-gray-500 uppercase tracking-wide">Used</span>
                    <span class="text-xs font-semibold text-gray-900 dark:text-gray-100">{{ coupon.timesUsed }} / {{ coupon.usageLimit || '∞' }}</span>
                </div>
            </div>

            <!-- Second row: dates + extra info -->
            <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <div class="flex items-center gap-1">
                    <UIcon name="i-heroicons-calendar" class="text-gray-400 text-sm" />
                    <span>{{ format(new Date(coupon.startDate), 'd MMM yyyy') }}</span>
                    <span class="text-gray-400">-</span>
                    <span>{{ format(new Date(coupon.endDate), 'd MMM yyyy') }}</span>
                    <UBadge v-if="isCurrentlyActive && daysRemaining <= 7" color="amber" size="xs" variant="subtle">
                        {{ daysRemaining }}d left
                    </UBadge>
                </div>
                <div v-if="coupon.minOrderValue" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-shopping-cart" class="text-gray-400 text-sm" />
                    <span>Min Order: <strong>{{ coupon.minOrderValue }}</strong></span>
                </div>
                <div v-if="coupon.perClientLimit" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-user" class="text-gray-400 text-sm" />
                    <span>Per Client: <strong>{{ coupon.perClientLimit }}</strong></span>
                </div>
                <div v-if="coupon.audienceType === 'GENERATE' && coupon.minBillAmount" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-banknotes" class="text-gray-400 text-sm" />
                    <span>Min Bill: <strong>{{ coupon.minBillAmount }}</strong></span>
                </div>
                <div v-if="coupon.audienceType === 'GENERATE'" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-arrow-path" class="text-gray-400 text-sm" />
                    <span>Combine: <strong>{{ coupon.isBillCombine ? 'Yes' : 'No' }}</strong></span>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <UTabs
            v-model="activeTab"
            :items="tabs"
            class="flex-1 flex flex-col overflow-hidden"
            color="primary"
            :ui="{ list: {
                tab: { active: 'text-primary-600 dark:text-primary-400' },
                background: 'bg-gray-50 dark:bg-gray-800/50'
            }}"
        >
            <template #item="{ item, index }">
                <div class="flex-1 flex flex-col overflow-auto p-4">
                    <!-- Usage History Tab (always index 0) -->
                    <template v-if="index === 0">
                        <UCard
                            class="w-full"
                            :ui="{
                                base: '',
                                ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                                divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                                header: { padding: 'px-4 py-3' },
                                body: { padding: '' },
                                footer: { padding: 'px-4 py-3' },
                            }"
                        >
                         <template #header>
                            <div class="flex justify-start">
                                <UInput
                                v-model="usageSearch"
                                icon="i-heroicons-magnifying-glass-20-solid"
                                placeholder="Search client name..."
                                size="sm"
                                class="w-60"
                                />
                            </div>
                            </template>

                            <UTable
                                :rows="formattedUsages"
                                :columns="usageColumns"
                                :loading="usageLoading"
                                class="w-full"
                                :ui="{ td: { base: 'max-w-[0] truncate' } }"
                            >
                                <template #empty-state>
                                    <div class="flex flex-col items-center justify-center py-6 gap-3">
                                        <UIcon name="i-heroicons-clock" class="text-3xl text-gray-400" />
                                        <span class="text-sm text-gray-500">No usage history yet</span>
                                    </div>
                                </template>
                            </UTable>

                            <template #footer>
                                <div class="flex flex-wrap justify-between items-center gap-2">
                                    <div class="flex items-center gap-2">
                                        <USelect
                                            v-model="usagePageCount"
                                            :options="pageCountOptions"
                                            size="xs"
                                            class="w-18"
                                        />
                                        <span class="text-xs text-gray-500">
                                            {{ usagePageFrom }}-{{ usagePageTo }} of {{ usageTotalCount || 0 }}
                                        </span>
                                    </div>
                                    <UPagination
                                        v-model="usagePage"
                                        :page-count="usagePageCount"
                                        :total="usageTotalCount || 0"
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
                    </template>

                    <!-- Allowed Clients Tab (SPECIFIC - index 1) -->
                    <template v-if="index === 1 && coupon.audienceType === 'SPECIFIC'">
                        <UCard
                            class="w-full"
                            :ui="{
                                base: '',
                                ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                                divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                                header: { padding: 'px-4 py-3' },
                                body: { padding: '' },
                                footer: { padding: 'px-4 py-3' },
                            }"
                        >
                            <template #header>
                                <div class="w-full flex justify-between items-center ">
                                    
                                    <UInput
                                        v-model="allowedSearch"
                                        icon="i-heroicons-magnifying-glass-20-solid"
                                        placeholder="Search client name..."
                                        size="sm"
                                        class="w-60"
                                    />
                                   
                                    <UButton
                                        icon="i-heroicons-plus"
                                        size="sm"
                                        color="primary"
                                        label="Add Client"
                                        @click="isAddClientModalOpen = true"
                                    />
                                </div>
                            </template>

                            <UTable
                                :rows="formattedAllowed"
                                :columns="allowedColumns"
                                :loading="allowedLoading"
                                class="w-full"
                                :ui="{ td: { base: 'max-w-[0] truncate' } }"
                            >
                                <template #actions-data="{ row }">
                                    <UButton
                                        icon="i-heroicons-trash"
                                        color="red"
                                        variant="ghost"
                                        size="xs"
                                        @click="removeClient(row.id)"
                                    />
                                </template>
                                <template #empty-state>
                                    <div class="flex flex-col items-center justify-center py-6 gap-3">
                                        <UIcon name="i-heroicons-users" class="text-3xl text-gray-400" />
                                        <span class="text-sm text-gray-500">No clients added yet</span>
                                        <UButton
                                            size="sm"
                                            color="primary"
                                            label="Add Client"
                                            @click="isAddClientModalOpen = true"
                                        />
                                    </div>
                                </template>
                            </UTable>

                            <template #footer>
                                <div class="flex flex-wrap justify-between items-center gap-2">
                                    <div class="flex items-center gap-2">
                                        <USelect
                                            v-model="allowedPageCount"
                                            :options="pageCountOptions"
                                            size="xs"
                                            class="w-18"
                                        />
                                        <span class="text-xs text-gray-500">
                                            {{ allowedPageFrom }}-{{ allowedPageTo }} of {{ allowedTotalCount || 0 }}
                                        </span>
                                    </div>
                                    <UPagination
                                        v-model="allowedPage"
                                        :page-count="allowedPageCount"
                                        :total="allowedTotalCount || 0"
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
                    </template>

                    <!-- Generated Clients Tab (GENERATE - index 1) -->
                    <template v-if="index === 1 && coupon.audienceType === 'GENERATE'">
                        <UCard
                            class="w-full"
                            :ui="{
                                base: '',
                                ring: 'ring-1 ring-primary-200 dark:ring-primary-800',
                                divide: 'divide-y divide-primary-100 dark:divide-primary-900/40',
                                header: { padding: 'px-4 py-3' },
                                body: { padding: '' },
                                footer: { padding: 'px-4 py-3' },
                            }"
                        >
                            <template #header>
                                <div class="flex items-center gap-2">
                                    <UInput
                                        v-model="allowedSearch"
                                        icon="i-heroicons-magnifying-glass-20-solid"
                                        placeholder="Search client name..."
                                        size="sm"
                                        class="flex-1"
                                    />
                                    <UBadge color="blue" size="xs" variant="subtle">Auto-generated</UBadge>
                                </div>
                            </template>

                            <UTable
                                :rows="formattedAllowed"
                                :columns="allowedColumns"
                                :loading="allowedLoading"
                                class="w-full"
                                :ui="{ td: { base: 'max-w-[0] truncate' } }"
                            >
                                <template #empty-state>
                                    <div class="flex flex-col items-center justify-center py-6 gap-3">
                                        <UIcon name="i-heroicons-gift" class="text-3xl text-gray-400" />
                                        <span class="text-sm text-gray-500">No clients have earned this coupon yet</span>
                                    </div>
                                </template>
                            </UTable>

                            <template #footer>
                                <div class="flex flex-wrap justify-between items-center gap-2">
                                    <div class="flex items-center gap-2">
                                        <USelect
                                            v-model="allowedPageCount"
                                            :options="pageCountOptions"
                                            size="xs"
                                            class="w-18"
                                        />
                                        <span class="text-xs text-gray-500">
                                            {{ allowedPageFrom }}-{{ allowedPageTo }} of {{ allowedTotalCount || 0 }}
                                        </span>
                                    </div>
                                    <UPagination
                                        v-model="allowedPage"
                                        :page-count="allowedPageCount"
                                        :total="allowedTotalCount || 0"
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
                    </template>
                </div>
            </template>
        </UTabs>

        <!-- Add Client Modal (only for SPECIFIC) -->
        <UModal v-model="isAddClientModalOpen">
            <UCard>
                <template #header>
                    <div class="flex items-center justify-between">
                        <h3 class="text-base font-semibold">Add Client to Coupon</h3>
                        <UButton
                            icon="i-heroicons-x-mark"
                            color="gray"
                            variant="ghost"
                            size="sm"
                            @click="isAddClientModalOpen = false"
                        />
                    </div>
                </template>

                <div class="space-y-4">
                    <UInput
                        v-model="clientSearch"
                        icon="i-heroicons-magnifying-glass-20-solid"
                        placeholder="Search by name or phone..."
                        autofocus
                    />

                    <div v-if="clientsLoading" class="py-4 text-center text-sm text-gray-500">
                        Loading clients...
                    </div>
                    <div v-else-if="!companyClients?.length" class="py-4 text-center text-sm text-gray-500">
                        {{ clientSearch ? 'No matching clients found' : 'No clients available' }}
                    </div>
                    <div v-else class="divide-y divide-gray-200 dark:divide-gray-700 max-h-80 overflow-y-auto">
                        <div
                            v-for="cc in companyClients"
                            :key="cc.clientId"
                            class="flex items-center justify-between py-3 px-2 hover:bg-gray-50 dark:hover:bg-gray-800/40 rounded"
                        >
                            <div class="flex items-center gap-3">
                                <UAvatar :alt="cc.client?.name" size="sm" />
                                <div>
                                    <div class="text-sm font-medium">{{ cc.client?.name }}</div>
                                    <div class="text-xs text-gray-500">{{ cc.client?.phone }}</div>
                                </div>
                            </div>
                            <UButton
                                :icon="addedClientMap.has(cc.clientId) ? 'i-heroicons-minus' : 'i-heroicons-plus'"
                                size="xs"
                                :color="addedClientMap.has(cc.clientId) ? 'red' : 'primary'"
                                variant="soft"
                                :label="addedClientMap.has(cc.clientId) ? 'Remove' : 'Add'"
                                @click="toggleClient(cc.clientId)"
                            />
                        </div>
                    </div>
                </div>
            </UCard>
        </UModal>
    </div>
</template>
