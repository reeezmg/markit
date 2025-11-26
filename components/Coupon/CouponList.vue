<script setup lang="ts">
import {
    useFindManyCoupon,
    useCountCoupon,
    useUpdateManyCoupon
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { format} from 'date-fns'

const emit = defineEmits(['edit','delete','open']);
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
const pageCount = ref('10');

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
    [
        {
            label: 'Details',
            icon: 'i-heroicons-document-magnifying-glass',
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
        return '-'
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
            <template #header>
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                    <div class="flex sm:flex-row flex-col gap-3 w-full sm:w-auto">
                       <div class="flex flex-row gap-3 w-full sm:w-auto">    
                        <USelectMenu
                            v-model="selectedType"
                            :options="['PERCENTAGE', 'FLAT']"
                            multiple
                            placeholder="Type"
                            class="w-full sm:w-40"
                        />

                        <USelectMenu
                            v-model="selectedAudienceType"
                            :options="['ALL', 'SPECIFIC']"
                            multiple
                            placeholder="Audience Type"
                            class="w-full sm:w-40"
                        />

                        <USelectMenu
                            v-model="selectedStatus"
                            :options="[true, false]"
                            multiple
                            placeholder="Status"
                            class="w-full sm:w-40"
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
                    </div>
                    <UButton color="primary" @click="emit('open')" block class="w-full sm:w-40">
                        Create Coupon
                    </UButton>
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

                    <UButton
                        icon="i-heroicons-funnel"
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
                :rows="coupons"
                :columns="columnsTable"
                sort-mode="manual"
                :loading="isLoading"
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
                            rounded: '!rounded-full min-w-[32px] justify-center',
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