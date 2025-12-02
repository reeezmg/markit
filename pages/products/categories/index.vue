<script setup lang="ts">
import { Switch } from '@headlessui/vue';

import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import {
    useUpdateCategory,
    useUpdateManyCategory,
    useFindManyCategory,
    useDeleteCategory,
    useDeleteProduct
} from '~/lib/hooks';
const DeleteCategory = useDeleteCategory({ optimisticUpdate: true });
const UpdateCategory = useUpdateCategory({ optimisticUpdate: true });
const DeleteProduct = useDeleteProduct({ optimisticUpdate: true });
const UpdateManyCategory = useUpdateManyCategory({ optimisticUpdate: true });
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const isCategoryDeleteModalOpen = ref(false)
const deletingCategoryRowIdentity = ref({})
const isProductDeleteModalOpen = ref(false)
const deletingProductRowIdentity = ref({})

// Columns
const columns = [
    {
        key: 'name',
        label: 'Name',
        sortable: true,
    },
    {
        key: 'shortCut',
        label: 'Code',
        sortable: true,
    },
    {
        key: 'products',
        label: 'Products',
        sortable: true,
    },
    {
        key: 'qty',
        label: 'Qty',
        sortable: true,
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


const subcategorycolumns = [
     {
        key: 'name',
        label: 'Name',
        sortable: true,
    },
   {
        key: 'products',
        label: 'Products',
        sortable: true,
    },
    {
        key: 'qty',
        label: 'Qty',
        sortable: true,
    },

];


const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

// Selected Rows
const selectedRows = ref([]);

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
            click: () => router.push(`categories/edit/${row.id}`),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => {
                isCategoryDeleteModalOpen.value = true
                deletingCategoryRowIdentity.value = {name:row.name,id:row.id, productsLength:row.products.length}
                }
        },
    ],
];

const productAction = (row) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`/products/edit/${row.id}`),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
             click: () => {
                isProductDeleteModalOpen.value = true
                deletingProductRowIdentity.value = {name:row.name,id:row.id}
                }
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
];

const search = ref('');
const selectedStatus = ref<any>([]);
const searchStatus = ref(undefined);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};

// Pagination
const sort = ref({ column: 'id', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref(10);
const pageTotal = ref(0); // This value should be dynamic coming from the API
const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1);
const pageTo = computed(() =>
    Math.min(page.value * pageCount.value, pageTotal.value),
);



// Data
const queryArgs = reactive({
    where: {
        AND: [
            { name: { contains: search.value } },
            { companyId: useAuth().session.value?.companyId },
            {
                OR: [{ status: true }, { status: false }],
            },
        ],
    },
    orderBy: {
        [sort.value.column]: sort.value.direction,
    },
    skip: (page.value - 1) * pageCount.value,
    take: pageCount.value,
    select: {
        id:true,
        shortCut:true,
        name:true,
        status:true,
        image:true,  
        products: {
            select:{
                id:true,
                name:true,
                status:true,
                variants:{
                    select:{
                        images:true,
                        sprice:true,
                        items:{
                            select: {
                                qty: true,
                            },
                        }
                    }
                }
            }
        },
        subcategories:{
            select:{
            id:true,
            name:true,
            image:true,
            products: {
                select:{
                    id:true,
                    name:true,
                    status:true,
                    variants:{
                        select:{
                            images:true,
                            sprice:true,
                            items:{
                                select: {
                                    qty: true,
                                },
                            }
                        }
                    }
                }
            },

        }
        }
    },
});

const {
    data: products,
    isLoading,
    error,
    refetch,
} = useFindManyCategory(queryArgs);

watch(products, () => {
    pageTotal.value = products.value ? products.value.length : 0;
    console.log(products);
});

watchEffect(() => {
    queryArgs.where.AND[0].name.contains = search.value;
    queryArgs.where.AND[0].OR = selectedStatus.value?.map((item) => {
        return { status: item.value };
    });
    queryArgs.orderBy = {
        [sort.value.column]: sort.value.direction,
    };
    queryArgs.skip = (page.value - 1) * pageCount.value;
    queryArgs.take = parseInt(pageCount.value);

    refetch();
});

const removeCategory = () => {
    if(deletingCategoryRowIdentity.value.productsLength){
        toast.add({
            title: 'Category Deletion failed!',
            description:`Please clear product of category "${deletingCategoryRowIdentity.value.name}" either by deleting or changing its category.`,
            color: 'red'
        });
    }else{
  try {
     DeleteCategory.mutate({ where: { id:deletingCategoryRowIdentity.value.id } });
  } catch (err) {
    console.log(err);
  }finally{
    isCategoryDeleteModalOpen.value = false;
    }
}
};

const removeProduct = () => {
  try {
     DeleteProduct.mutate({ where: { id:deletingProductRowIdentity.value.id } });
  } catch (err) {
    console.log(err);
  }
  finally{
    isProductDeleteModalOpen.value = false;
    }
};


 function multiToggle(ids, status: boolean) {
    console.log(ids);
    try {
         UpdateManyCategory.mutate({
            where: { id: { in: ids } },
            data: { status: status },
        });
    } catch (error) {
        // Handle error
        console.error('Error updating product status:', error);
    }
}

 function toggleStatus(id) {
    const productToUpdate = products.value.find((item) => item.id === id);
    if (!productToUpdate) return;

    const updatedStatus = !productToUpdate.status;

    try {
         UpdateCategory.mutate({
            where: { id },
            data: { status: updatedStatus },
        });
    } catch (error) {
        console.error('Error updating product status:', error);
    }
}
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

      <div class="flex flex-col sm:flex-row justify-between gap-3 px-4 py-3 w-full">
  <!-- Left side: Search + Status -->
  <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
    <UInput
      v-model="search"
      icon="i-heroicons-magnifying-glass-20-solid"
      placeholder="Search..."
      class="w-full sm:w-60"
    />
    <USelectMenu
      v-model="selectedStatus"
      :options="todoStatus"
      multiple
      placeholder="Status"
      class="w-full sm:w-60"
    />
  </div>

  <!-- Right side: Add Button aligned to end -->
  <div class="w-full sm:w-auto flex justify-end">
    <UButton
      icon="i-heroicons-plus"
      size="sm"
      color="primary"
      variant="solid"
      label="Add Category"
      class="w-full sm:w-40"
      @click="() => router.push('categories/add')"
    />
  </div>
</div>

           
            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5 sm:block hidden">Rows per page:</span>
                    <USelect
                        v-model="pageCount"
                        :options="[3, 5, 10, 20, 30, 40]"
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
                sort-asc-icon="i-heroicons-arrow-up"
                sort-desc-icon="i-heroicons-arrow-down"
                sort-mode="manual"
                
                :ui="{

                    default: { checkbox: { color: 'gray' } },
                }"
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
                    <NuxtLink :to="``">
                        <div class="flex flex-row items-center">
                            <UAvatar
                                :src="`https://images.markit.co.in/${row.image || ''}`"
                                :alt="row.name"
                                size="lg"
                            />
                            <div class="ms-3">{{ row.name }}</div>
                        </div>
                    </NuxtLink>
                </template>

                <template #qty-data="{ row }">
                    {{
                        row.products?.reduce((productTotal, product) => {
                        const variantQty = product.variants?.reduce((variantTotal, variant) => {
                            const itemQty = variant.items?.reduce((itemTotal, item) => {
                            return itemTotal + (item.qty || 0);
                            }, 0) || 0;
                            return variantTotal + itemQty;
                        }, 0) || 0;
                        return productTotal + variantQty;
                        }, 0) || 0
                    }}
                    </template>



                <template #products-data="{ row }">
                    {{ row.products.length }}
                </template>

                <template #expand="{ row }">
                    <div class="ps-4">
                    <UTable 
                        :rows="row.subcategories" 
                        :columns="subcategorycolumns"
                    >

                      

                <template #name-data="{ row }">
                    <div class="flex flex-row items-center">
                        <UAvatar
                            :src="`https://images.markit.co.in/${row.image}`"
                            :alt="row.name"
                            size="lg"
                        />
                        <div class="ms-3">{{ row.name }}</div>
                    </div>
                </template>

           <template #products-data="{ row }">
                    {{ row.products.length }}
                </template>

                <template #qty-data="{ row }">
                    {{
                        row.products?.reduce((productTotal, product) => {
                        const variantQty = product.variants?.reduce((variantTotal, variant) => {
                            const itemQty = variant.items?.reduce((itemTotal, item) => {
                            return itemTotal + (item.qty || 0);
                            }, 0) || 0;
                            return variantTotal + itemQty;
                        }, 0) || 0;
                        return productTotal + variantQty;
                        }, 0) || 0
                    }}
                    </template>


                    
                    </UTable>
                    </div>
                </template>
            </UTable>

            <!-- Number of rows & Pagination -->
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
                        :page-count="pageCount"
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

    
  <UDashboardModal
        v-model="isCategoryDeleteModalOpen"
        title="Delete Category"
        :description="`Are you sure you want to delete category ${deletingCategoryRowIdentity.name}?`"
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
                @click="() =>  removeCategory()"
            />
            <UButton color="white" label="Cancel" @click="isCategoryDeleteModalOpen = false" />
        </template>
    </UDashboardModal>

  <UDashboardModal
        v-model="isProductDeleteModalOpen"
        title="Delete Product"
        :description="`Are you sure you want to delete Product ${deletingProductRowIdentity.name}?`"
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
                @click="() =>  removeProduct()"
            />
            <UButton color="white" label="Cancel" @click="isProductDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
</template>
