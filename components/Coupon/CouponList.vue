<script setup lang="ts">
import {
    useFindManyCoupon,
    useCountCoupon,
    useUpdateManyCoupon
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { format} from 'date-fns'

const props = defineProps<{
    selectedCoupon?: any
}>()
const emit = defineEmits(['edit','delete','open','select']);
const useAuth = () => useNuxtApp().$auth;
const UpdateManyCoupon = useUpdateManyCoupon({ optimisticUpdate: true });
const selectedRows = ref([]);
const selectedType = ref([]);
const selectedAudienceType = ref([]);
const selectedStatus = ref([]);
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const sort = ref({ column: 'id', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref(localStorage.getItem('couponList_pageCount') || '10');

watch(pageCount, (v) => { localStorage.setItem('couponList_pageCount', v); page.value = 1 })

const columns = [
    {
        key: 'code',
        label: 'Code',
        sortable: true,
    },
    {
        key: 'type',
        label: 'Type',
        sortable: true,
    },
    {
        key: 'discountValue',
        label: 'Discount',
        sortable: true,
    },
    {
        key: 'audienceType',
        label: 'Audience Type',
        sortable: true,
    },
    {
        key: 'startDate',
        label: 'Start Date',
        sortable: true,
    },
    {
        key: 'endDate',
        label: 'End Date',
        sortable: true,
    },
    {
        key: 'timesUsed',
        label: 'Used',
        sortable: true,
    },
    {
        key: 'isActive',
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
                deletingRowIdentity.value = {code: row.code, id: row.id}
                }
        },
    ],
];

const active = (selectedRows) => [
    [
        {
            label: 'Activate',
            click: () => multiUpdate(true, selectedRows.id),
        },
        {
            label: 'Deactivate',
            click: () => multiUpdate(false, selectedRows.id),
        },
    ],
];

// Data
const queryArgs = computed<Prisma.CouponFindManyArgs>(() => {
    return {
        where: {
            companyId: useAuth().session.value?.companyId,
            
            ...(selectedType.value.length && {
                OR: selectedType.value.map((item) => ({ type: item }))
            }),

            ...(selectedAudienceType.value.length && {
                OR: selectedAudienceType.value.map((item) => ({ audienceType: item }))
            }),

            ...(selectedStatus.value.length && {
                OR: selectedStatus.value.map((item) => ({ isActive: item }))
            }),
        },
        orderBy: {
            [sort.value.column]: sort.value.direction,
        },
        skip: (page.value - 1) * parseInt(pageCount.value),
        take: parseInt(pageCount.value),
    };
},{ enabled: !!useAuth().session.value?.companyId });

const { data: coupons, isLoading, error, refetch } = useFindManyCoupon(queryArgs);
const pageTotal = computed(() => coupons.value?.length);

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);
const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

watchEffect(() => {
    console.log(coupons.value);
    console.log(pageTotal.value);
});

const resetFilters = () => {
    selectedType.value = [];
    selectedAudienceType.value = [];
    selectedStatus.value = [];
};


const multiUpdate = async(status: boolean, ids: any) => {
    await UpdateManyCoupon.mutateAsync({
        where: {
            id: { in: ids },        
        },
        data: {
            isActive: status        
        }
    })
}

const formatDiscount = (coupon: any) => {
    if (coupon.type === 'PERCENTAGE') {
        return `${coupon.discountValue}%${coupon.maxDiscountAmount ? ` (Max: ${coupon.maxDiscountAmount})` : ''}`;
    } else if(coupon.type === 'GIFT'){
        return coupon.giftBarcode ? `Gift: ${coupon.giftBarcode}` : 'Gift'
    }
    else {
        return `${coupon.discountValue} Flat`;
    }
}

const formatAudienceType = (coupon: any) => {
    console.log(coupon)
    switch(coupon.audienceType) {
        case 'ALL': return 'All';
        case 'GENERATE': return 'Generate';
        case 'SPECIFIC': return 'Specific';
        default: return coupon.audienceType;
    }
}

const isCurrentlyActive = (row: any) => {
  const now = new Date()
  const start = new Date(row.startDate)
  const end = new Date(row.endDate)

  return row.isActive && now >= start && now <= end
}

</script>

<template>
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
                <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                    <div class="flex flex-wrap gap-2 flex-1 min-w-0" :class="[selectedCoupon ? 'w-full' : '']">
                        <USelectMenu
                            v-model="selectedType"
                            :options="['PERCENTAGE', 'FLAT', 'GIFT']"
                            multiple
                            placeholder="Type"
                            class="w-28"
                            size="sm"
                        />

                        <USelectMenu
                            v-if="!selectedCoupon"
                            v-model="selectedAudienceType"
                            :options="['ALL', 'SPECIFIC', 'GENERATE']"
                            multiple
                            placeholder="Audience"
                            class="w-28"
                            size="sm"
                        />

                        <USelectMenu
                            v-if="!selectedCoupon"
                            v-model="selectedStatus"
                            :options="[true, false]"
                            multiple
                            placeholder="Status"
                            class="w-28"
                            size="sm"
                        >
                            <template #label>
                                <span v-if="selectedStatus.length === 0">Status</span>
                                <span v-else>
                                    {{ selectedStatus.map(s => s ? 'Active' : 'Inactive').join(', ') }}
                                </span>
                            </template>
                            <template #option="{ option }">
                                {{ option ? 'Active' : 'Inactive' }}
                            </template>
                        </USelectMenu>

                    </div>
                    <UButton
                        v-if="!selectedCoupon"
                        color="primary"
                        @click="emit('open')"
                        size="sm"
                        icon="i-heroicons-plus"
                        label="Create"
                    />
                    <UButton
                        v-else
                        color="primary"
                        @click="emit('open')"
                        size="sm"
                        icon="i-heroicons-plus"
                    />
                </div>
            </template>

            <div v-if="!selectedCoupon" class="flex justify-between items-center w-full px-4 py-3">
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

                    <UButton
                        icon="i-heroicons-funnel"
                        color="gray"
                        size="xs"
                        :disabled="!selectedType.length && !selectedAudienceType.length && !selectedStatus.length"
                        @click="resetFilters"
                    >
                        Reset
                    </UButton>
                </div>
            </div>

            <!-- Full table view (no coupon selected) -->
            <div v-if="!selectedCoupon">
                <UTable
                    v-model="selectedRows"
                    v-model:sort="sort"
                    :rows="coupons"
                    :columns="columnsTable"
                    sort-mode="manual"
                    :loading="isLoading"
                    :ui="{
                        tr: { base: 'cursor-pointer' },
                    }"
                    @select="(row) => emit('select', row)"
                >
                    <template #type-data="{ row }">
                       <UBadge
                            size="sm"
                            :color="row.type === 'PERCENTAGE'
                                        ? 'blue'
                                        : row.type === 'FLAT'
                                        ? 'green'
                                        : row.type === 'GIFT'
                                            ? 'orange'
                                            : 'gray'"
                            variant="subtle"
                            >
                            {{ row.type }}
                            </UBadge>
                    </template>

                    <template #discountValue-data="{ row }">
                        {{ formatDiscount(row) }}
                    </template>

                    <template #audienceType-data="{ row }">
                        {{ formatAudienceType(row) }}
                    </template>

                    <template #startDate-data="{ row }">
                        {{ format(row.startDate, 'd MMM, yyy') }}
                    </template>

                    <template #endDate-data="{ row }">
                        {{ format(row.endDate, 'd MMM, yyy') }}
                    </template>

                    <template #timesUsed-data="{ row }">
                        {{ row.timesUsed }} / {{ row.usageLimit || '∞' }}
                    </template>

                   <template #isActive-data="{ row }">
                        <UBadge
                            size="sm"
                            :color="isCurrentlyActive(row) ? 'green' : 'red'"
                            variant="subtle"
                        >
                            {{ isCurrentlyActive(row) ? 'Active' : 'Inactive' }}
                        </UBadge>
                    </template>

                    <template #actions-data="{ row }">
                        <div @click.stop>
                            <UDropdown :items="action(row)">
                                <UButton
                                    color="gray"
                                    variant="ghost"
                                    icon="i-heroicons-ellipsis-horizontal-20-solid"
                                />
                            </UDropdown>
                        </div>
                    </template>
                </UTable>
            </div>

            <!-- Compact sidebar list (coupon selected) -->
            <div v-else>
                <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading coupons...</div>
                <div v-else-if="!coupons?.length" class="p-4 text-sm text-gray-500">No coupons found.</div>
                <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                    <button
                        v-for="row in coupons"
                        :key="row.id"
                        type="button"
                        class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                        :class="selectedCoupon?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                        @click="emit('select', row)"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <div class="min-w-0 flex-1">
                                <p
                                    class="truncate text-sm"
                                    :class="selectedCoupon?.id === row.id
                                        ? 'font-semibold text-primary-700 dark:text-primary-300'
                                        : 'font-medium text-gray-900 dark:text-gray-100'"
                                >
                                    {{ row.code }}
                                </p>
                                <div class="flex items-center gap-1 mt-1">
                                    <UBadge
                                        :color="row.audienceType === 'SPECIFIC' ? 'purple' : row.audienceType === 'GENERATE' ? 'blue' : 'gray'"
                                        size="xs"
                                        variant="subtle"
                                    >{{ row.audienceType }}</UBadge>
                                    <UBadge
                                        :color="isCurrentlyActive(row) ? 'green' : 'red'"
                                        size="xs"
                                        variant="subtle"
                                    >{{ isCurrentlyActive(row) ? 'Active' : 'Inactive' }}</UBadge>
                                </div>
                            </div>
                            <div @click.stop>
                                <UDropdown :items="action(row)">
                                    <UButton
                                        color="gray"
                                        variant="ghost"
                                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                                        size="xs"
                                    />
                                </UDropdown>
                            </div>
                        </div>
                    </button>
                </div>
            </div>

            <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-xs leading-5">
                            {{ pageFrom }}-{{ pageTo }} of {{ pageTotal }}
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="pageTotal"
                        size="xs"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded: '!rounded-full min-w-[28px] justify-center',
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
        title="Delete Coupon"
        :description='`Are you sure you want to delete coupon "${deletingRowIdentity.code}"?`'
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
                @click="() => { emit('delete', deletingRowIdentity.id); isDeleteModalOpen = false; }"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
</template>
