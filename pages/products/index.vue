<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import type { Prisma } from '@prisma/client'
import {
    useFindManyProduct,
    useUpdateProduct,
    useUpdateManyProduct,
    useCreatePurchaseOrder,
    useUpdateVariant,
    useCountProduct,
    useDeleteProduct
} from '~/lib/hooks';

definePageMeta({
    auth: true,
});

const UpdateProduct = useUpdateProduct();
const DeleteProduct = useDeleteProduct();
const UpdateManyProduct = useUpdateManyProduct();
const Updatevariant = useUpdateVariant();
const CreatePurchaseOrder = useCreatePurchaseOrder();
const router = useRouter();
const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const isAddPhotoModelOpen = ref(false)

// Columns
const columns = [
    {
        key: 'name',
        label: 'name',
        sortable: true,
    },
    {
        key: 'variants',
        label: 'Variants',
        sortable: false,
    },
    {
        key: 'stocks',
        label: 'Stocks',
        sortable: false,
    },
    {
        key: 'status',
        label: 'Status',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
];


const variantcolumns = [
    {
        key: 'name',
        label: 'Name',
        sortable: true,
    },
    {
        key: 'code',
        label: 'Code',
        sortable: true,
    },
    {
        key: 'qty',
        label: 'Qty',
        sortable: true,
    },
    {
        key: 'sprice',
        label: 'Price',
        sortable: true,
    },
    {
        key: 'dprice',
        label: 'discount',
        sortable: true,
    },
    {
        key: 'tax',
        label: 'Tax',
        sortable: true,
    },
    {
        key: 'status',
        label: 'Status',
        sortable: true,
    },
    
];

const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

// Selected Rows
const selectedRows = ref([]);
const isAdd = ref(false);


// Actions
const active = (selectedRows) => [
    [
        {
            key: 'active',
            label: 'Active',
            icon: 'i-heroicons-check',
            click: () =>
                multiToggle(
                    selectedRows.map((item) => {
                        return item.id;
                    }),
                    true,
                ),
        },
    ],
    [
        {
            key: 'inactive',
            label: 'Inactive',
            icon: 'i-heroicons-x-mark',
            click: () =>
                multiToggle(
                    selectedRows.map((item) => {
                        return item.id;
                    }),
                    false,
                ),
        },
    ],
    [
        {
            key: 'delete',
            label: 'Delete',
            icon: 'i-heroicons-trash',
        },
    ],
];

const action = (row) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`products/edit/${row.id}`),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => removeProduct(row.id),
        },
    ],
];

// Filters
const todoStatus = [
    {
        key: 'inactive',
        label: 'Inactive',
        value: false,
    },
    {
        key: 'active',
        label: 'Active',
        value: true,
    },
    {
        key: 'reset',
        label: 'Reset',
        value: true,
    },  
];

const search = ref('');
const selectedStatus = ref<any>([]);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};

// Pagination
const sort = ref({ column: 'createdAt', direction: 'desc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('10');
const { data: pageTotal }  = useCountProduct({where: { companyId: useAuth().session.value?.companyId }})
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value),
);

// Data
const queryArgs = computed<Prisma.ProductFindManyArgs>(() => {
    const selectedStatusCondition =
        selectedStatus.value.length > 0
            ? {
                  OR: selectedStatus.value.map((item) => {
                      return { status: item.value };
                  }),
              }
            : {};

            return {
    where: {
        AND: [
            { companyId: useAuth().session.value?.companyId },
            {
                OR: [
                    { name: { contains: search.value, mode: 'insensitive' } },
                    {
                        variants: {
                            some: {
                                code: { contains: search.value, mode: 'insensitive' }
                            }
                        }
                    }
                ]
            },
            selectedStatusCondition,
        ],
    },
    include: {
        variants: true,
    },
    orderBy: {
        [sort.value.column]: sort.value.direction,
    },
    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value),
};

});

const {
    data: products,
    isLoading,
    error,
    refetch,
} = useFindManyProduct(queryArgs);

const removeProduct = async(id:string) => {
  try {
    await DeleteProduct.mutateAsync({ where: { id } });
  } catch (err) {
    console.log(err);
  }
};

async function multiToggle(ids, status: boolean) {
    try {
        await UpdateManyProduct.mutateAsync({
            where: { id: { in: ids } },
            data: { 
                status: status,
                variants: {
                        updateMany: {
                            where: {},  
                            data: {
                                status: updatedStatus  
                            }
                        }
                    }

             },
        });
    } catch (error) {
        console.error('Error updating product status:', error);
    }
}



async function toggleStatus(id: string) {
    if (products.value) {
        const productToUpdate = products.value.find((item) => item.id === id);
        if (!productToUpdate) return;

        const updatedStatus = !productToUpdate.status;

        try {
            await UpdateProduct.mutateAsync({
                where: { id },
                data: {
                    status: updatedStatus,  // Update product status
                    variants: {
                        updateMany: {
                            where: {},  // Apply to all related variants
                            data: {
                                status: updatedStatus  // Update status of all variants
                            }
                        }
                    }
                },
            });
        } catch (error) {
            console.error('Error updating product status:', error);
        }
    }
}

async function toggleVariantStatus(id: string, status:boolean) {

        const updatedStatus = !status;

        try {
            await Updatevariant.mutateAsync({
                where: { id },
                data: { status: updatedStatus },
            });
        } catch (error) {
            console.error('Error updating variant status:', error);
        }
    }


const handleAdd = async() => {
    isAdd.value =true
    const res = await CreatePurchaseOrder.mutateAsync({
        data:{
            company: {
            connect: { id: useAuth().session.value?.companyId },
          },
        },
        select: { id: true }
    })
    console.log(res)
    router.push(`products/add?poId=${res?.id}`)
}
isAdd.value =false
</script>

<template>
    <UDashboardPanelContent class="pb-24">
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
            <div class="flex items-center justify-between gap-3 px-4 py-3">
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    placeholder="Search..."
                />
                <div class="flex flex-row">
                    <USelectMenu
                        v-model="selectedStatus"
                        :options="todoStatus"
                        multiple
                        placeholder="Status"
                        class="w-40"
                    />
                    <UButton
                        class="ms-5"
                        icon="i-heroicons-plus"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Add Product"
                        :loading=isAdd
                        @click="handleAdd"
                    />
                    <UButton
                        class="ms-5"
                        icon="i-heroicons-camera"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Add Photo"
                        @click="isAddPhotoModelOpen = true"
                    />
                </div>
            </div>

            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5">Rows per page:</span>
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
                        :disabled="search === '' && selectedStatus.length === 0"
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
                :rows="products"
                :columns="columnsTable"
                :loading="isLoading"
                sort-mode="manual"
                class="w-full"
            >
                <template #actions-data="{ row }">
                    <UDropdown :items="action(row)">
                        <UButton
                            color="gray"
                            variant="ghost"
                            icon="i-heroicons-ellipsis-horizontal-20-solid"
                        />
                    </UDropdown>
                </template>

                <template #variants-data="{ row }">
                    {{ row.variants.reduce((total,variant) => total + (variant.qty || 0),0)}}
                </template>
                <template #stocks-data="{ row }">
                    {{ row.variants.reduce((total,variant) => total + (variant.sprice * variant.qty || 0),0)}}
                </template>

                <template #status-data="{ row }">
                    <Switch
                        v-model="row.status"
                        @click="toggleStatus(row.id)"
                        :class="[
                            row.status ? 'bg-orange-400' : 'bg-gray-200',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2',
                        ]"
                    >
                        <span class="sr-only">Use setting</span>
                        <span
                            :class="[
                                row.status ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                            ]"
                        >
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-0 duration-100 ease-out'
                                        : 'opacity-100 duration-200 ease-in',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-gray-400"
                                    fill="none"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </span>
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-100 duration-200 ease-in'
                                        : 'opacity-0 duration-100 ease-out',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-orange-400"
                                    fill="currentColor"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z"
                                    />
                                </svg>
                            </span>
                        </span>
                    </Switch>
                </template>

                <template #name-data="{ row }">
                    <div class="flex flex-row items-center">
                        <UAvatar
                            :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${row.variants[0]?.images[0]}`"
                            :alt="row.name"
                            size="lg"
                        />
                        <div class="ms-3">{{ row.name }}</div>
                    </div>
                </template>
                <template #expand="{ row }">
                    <div class="ps-4">
                    <UTable 
                        :rows="row.variants" 
                        :columns="variantcolumns"
                    >
                    <template #name-data="{ row }">
                    <div class="flex flex-row items-center">
                        <UAvatar
                            :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${row.images[0]}`"
                            :alt="row.name"
                            size="lg"
                        />
                        <div class="ms-3">{{ row.name }}</div>
                    </div>
                </template>
                    <template #status-data="{ row }">
                    <Switch
                        v-model="row.status"
                        @click="toggleVariantStatus(row.id, row.status)"
                        :class="[
                            row.status ? 'bg-orange-400' : 'bg-gray-200',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2',
                        ]"
                    >
                        <span class="sr-only">Use setting</span>
                        <span
                            :class="[
                                row.status ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                            ]"
                        >
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-0 duration-100 ease-out'
                                        : 'opacity-100 duration-200 ease-in',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-gray-400"
                                    fill="none"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </span>
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-100 duration-200 ease-in'
                                        : 'opacity-0 duration-100 ease-out',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-orange-400"
                                    fill="currentColor"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z"
                                    />
                                </svg>
                            </span>
                        </span>
                    </Switch>
                </template>
                    </UTable>
                    </div>
                </template>
            </UTable>

            <!-- Number of rows & Pagination -->
            <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5">
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

        
    </UDashboardPanelContent>

    
    <UModal v-model="isAddPhotoModelOpen">
      <UCard >
        
       
      </UCard>
    </UModal>
</template>
