<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import { sub } from 'date-fns';
import type { Period, Range } from '~/types';
import type { Prisma } from '@prisma/client'
import AwsService from '~/composables/aws';
import Quagga from '@ericblade/quagga2'
import {
    useFindManyProduct,
    useUpdateProduct,
    useUpdateManyProduct,
    useCreatePurchaseOrder,
    useUpdateVariant,
    useCountProduct,
    useDeleteProduct,
    useFindFirstItem
} from '~/lib/hooks';
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { useLocalStorageRef } from '~/composables/useLocalStorageRef'


interface ImageData {
    file: File;
    uuid: string;
}

const awsService = new AwsService();
const toast = useToast();
const UpdateProduct = useUpdateProduct({ optimisticUpdate: true });
const DeleteProduct = useDeleteProduct({ optimisticUpdate: true });
const UpdateManyProduct = useUpdateManyProduct({ optimisticUpdate: true });
const Updatevariant = useUpdateVariant({ optimisticUpdate: true });
const CreatePurchaseOrder = useCreatePurchaseOrder({ optimisticUpdate: true });
const router = useRouter();
const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const isAddPhotoModelOpen = ref(false)
const isBarcodeLoading = ref(false);
const isModalOpen = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentity = ref({})
const activeImages = ref<string[]>([])
const activeImagesDate = ref<string[]>([])
let images = reactive<ImageData[]>([]);
const isMobile = ref(false);

onMounted(() => {
  isMobile.value = window.innerWidth < 1024;
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 1024;
  });
});



// ==========================
// 🟢 DISCOUNT MODAL LOGIC
// ==========================
const isDiscountModalOpen = ref(false)
const isDiscountApplying = ref(false)
const discountPercentage = ref<number | null>(null)
const discountFilters = reactive({
  categoryId: '',
  subcategoryId: '',
  startDate: '',
  endDate: '',
  brand: '',
  minMargin: '',
  maxSprice: '',
  minDprice: '',
  minRating: '',
  status: '',
})

const categoryOptions = computed(() =>
  products.value
    ? [
        ...new Map(
          products.value
            .filter((p) => p.category)
            .map((p) => [p.category?.id, p.category])
        ).values(),
      ].map((c) => ({ label: c.name, value: c.id }))
      .sort((a, b) => a.label.localeCompare(b.label))
    : []
)

const subcategoryOptions = computed(() =>
  products.value
    ? [
        ...new Map(
          products.value
            .filter((p) => p.subcategory)
            .map((p) => [p.subcategory?.id, p.subcategory])
        ).values(),
      ].map((s) => ({ label: s.name, value: s.id }))
      .sort((a, b) => a.label.localeCompare(b.label))
    : []
)


watch(isDiscountModalOpen, (open) => {
  if (!open) {
    Object.assign(discountFilters, {
      categoryId: '',
      subcategoryId: '',
      startDate: '',
      endDate: '',
      brand: '',
      minMargin: '',
      maxSprice: '',
      minDprice: '',
      minRating: '',
      status: null,
    })
    discountPercentage.value = null
  }
})

const applyDiscount = async () => {
  if (!discountPercentage.value || discountPercentage.value <= 0) {
    return toast.add({
      title: 'Invalid Discount',
      description: 'Please enter a valid discount percentage.',
      color: 'red',
    })
  }

  try {
    isDiscountApplying.value = true

    const res = await $fetch('/api/discount/apply', {
      method: 'POST',
      body: JSON.parse(
        JSON.stringify({
          companyId: useAuth().session.value?.companyId,
          discountPercentage: discountPercentage.value,
          filters: discountFilters,
        })
      ),
    })

    toast.add({
      title: 'Discount Applied',
      description: `Applied ${discountPercentage.value}% discount to ${res.updatedCount} variants.`,
      color: 'green',
    })

    isDiscountModalOpen.value = false
    discountPercentage.value = null
    await refetch()
  } catch (err: any) {
    console.error('Discount Error:', err)
    toast.add({
      title: 'Error Applying Discount',
      description: err?.message || 'Unexpected error occurred.',
      color: 'red',
    })
  } finally {
    isDiscountApplying.value = false
  }
}


// ==========================
// 🟢 Filter MODAL LOGIC
// ==========================
const isFilterModalOpen = ref(false)
const isFilterApplying = ref(false)
const filters = reactive({
  categoryId: '',
  subcategoryId: '',
  startDate: '',
  endDate: '',
  brand: '',
  minMargin: '',
  maxSprice: '',
  minDprice: '',
  minRating: '',
  status: null,
})

const applyFilter = async () => {
  isFilterApplying.value = true
  isFilterModalOpen.value = false
  console.log("Applying filters:", filters)

  try {
    await refetch()
  } catch (err: any) {
    console.error('Filter error:', err)
    toast.add({
      title: "Error Applying Filter",
      description: err.message || "Unexpected error occurred.",
      color: "red",
    })
  } finally {
    isFilterApplying.value = false
  }
}


// Columns
const columns = [
    {
        key: 'name',
        label: 'name',
        sortable: true,
    },
    {
        key: 'category',
        label: 'Category',
        sortable: false,
    },
    {
        key: 'subcategory',
        label: 'subcategory',
        sortable: false,
    },
    {
        key: 'variants',
        label: 'Variants',
        sortable: false,
    },
    {
        key: 'qty',
        label: 'Qty',
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
        key: 'barcode',
        label: 'Barcode',
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
const STORAGE_KEY = 'selectedColumns';

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Ensure stored columns are still valid
      selectedColumns.value = columns.filter(col =>
        parsed.some((savedCol: any) => savedCol.key === col.key)
      );
    } catch (e) {
      console.error('Failed to parse selectedColumns from localStorage:', e);
    }
  }
});

// Persist
watch(selectedColumns, (newVal) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));
}, { deep: true });

const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

// Selected Rows
const selectedRows = ref([]);
const isAdd = ref(false);
const itemBarcode = ref('');
const isPhotoSaving = ref(false);


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
            click: () => {
                isDeleteModalOpen.value = true
                deletingRowIdentity.value = {name:row.name,id:row.id}
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
    Object.keys(filters).forEach(k => filters[k] = '')
    refetch()
};



// Pagination
const sort = useLocalStorageRef('sort', { column: 'createdAt', direction: 'desc' as const }, 'product');

const expand = { openedRows: [], row: null };

const page = useLocalStorageRef('page', 1, 'product');

const pageCount = useLocalStorageRef('pageCount', '10','product');




// Data
const queryArgs = computed<Prisma.ProductFindManyArgs>(() => {

  const filterConditions: any[] = [{ companyId: useAuth().session.value?.companyId }]

  if (filters.categoryId)
    filterConditions.push({ categoryId: filters.categoryId })

  if (filters.subcategoryId)
    filterConditions.push({ subcategoryId: filters.subcategoryId })

  if (filters.brand)
    filterConditions.push({ brand: { contains: filters.brand, mode: 'insensitive' } })

  if (filters.minMargin)
    filterConditions.push({ margin: { gte: parseFloat(filters.minMargin) } })

if (filters.status !== "" && filters.status !== null && filters.status !== undefined) {
  const statusBoolean =
    filters.status === "true" ? true :
    filters.status === "false" ? false :
    filters.status;

  filterConditions.push({ status: statusBoolean });
}

  if (filters.maxSprice)
    filterConditions.push({
      variants: {
        some: {
          sprice: { lte: parseFloat(filters.maxSprice) },
        },
      },
    })

  if (filters.minDprice)
    filterConditions.push({
      variants: {
        some: {
          dprice: { gte: parseFloat(filters.minDprice) },
        },
      },
    })

  if (filters.minRating)
    filterConditions.push({ rating: { gte: parseFloat(filters.minRating) } })

  if (filters.startDate && filters.endDate)
    filterConditions.push({
      createdAt: {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      },
    })

  return {
    where: {
      AND: [
        ...filterConditions,
        {
          OR: [
            { name: { contains: search.value, mode: 'insensitive' } },

            {
              variants: {
                some: { code: { contains: search.value, mode: 'insensitive' } },
              },
            },

            {
              variants: {
                some: {
                  items: {
                    some: {
                      barcode: { contains: search.value, mode: 'insensitive' },
                    },
                  },
                },
              },
            },

            {
              category: {
                name: { contains: search.value, mode: 'insensitive' },
              },
            },

            {
              subcategory: {
                name: { contains: search.value, mode: 'insensitive' },
              },
            },
          ],
        },
      ],
    },

    include: {
      variants: { include: { items: true }},
      category: true,
      subcategory: true,
    },

    orderBy: {
      [sort.value.column]: sort.value.direction,
    },

    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value),
  }
})


const {
    data: products,
    isLoading,
    error,
    refetch,
} = useFindManyProduct(queryArgs);


const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));


const { data: pageTotal }  = useCountProduct(countArgs)
const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value),
);

watch(products, (newProducts) => {
   if(page.value > pageTotal.value) {
       page.value = 1;
   }
});


const {
    data:items,
    isLoading:isItemLoading,
    refetch:imageRefetch
} = useFindFirstItem({
    where: computed(() => ({
        barcode: itemBarcode.value,
    })),
    include: {
        variant: {
            include: {
            product: {
                select: {
                category: true,
                subcategory: true,
                id: true,
                updatedAt: true
                },
            },
            },
        },
},

},{enabled:!!itemBarcode})

watch(items, (newItems) => {
    console.log('Item data updated:', newItems);
});

const handleRefetch = async() => {
    console.log("refetching parent" )
    await handleGetItemInfo();
}


const result = ref('')
const showCamera = ref(false)
const videoRef = ref(null)

const handleGetItemInfo = async() => {
    isBarcodeLoading.value = true
    const {data} = await imageRefetch()
    isBarcodeLoading.value = false
}

const requestCameraAccess = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: 'environment' },
      },
    })
    console.log('✅ Camera permission granted')
  } catch (err) {
    console.error('🚫 Error accessing camera:', err)
    toast.add({
      title: 'Camera Access Blocked',
      description:
        'Unable to access camera. Please allow permission from your browser settings.',
      color: 'red',
    })
  }
}

const askCameraPermission = async () => {
  if (!('permissions' in navigator)) return requestCameraAccess()

  try {
    const res = await navigator.permissions.query({ name: 'camera' })
    if (res.state === 'granted') {
      console.log('✅ Camera already granted')
    } else {
      requestCameraAccess()
    }
  } catch (e) {
    console.warn('❗Permissions API error:', e)
    requestCameraAccess()
  }
}

const startCamera = async () => {
  await askCameraPermission()

  result.value = ''
  showCamera.value = true

  try {
    await nextTick()

    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: videoRef.value,
          constraints: {
            facingMode: 'environment',
          },
        },
        locator: {
          patchSize: 'medium',
          halfSample: true,
        },
        decoder: {
        readers: ['code_128_reader'],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          console.error('Quagga init error:', err)
          toast.add({
            title: 'Camera Error',
            description: err.message,
            color: 'red',
          })
          return
        }
        Quagga.start()
      }
    )

    Quagga.onDetected(async (data) => {
      const scanned = data?.codeResult?.code
      if (!scanned) return

      result.value = scanned
      itemBarcode.value = scanned
        await handleGetItemInfo()

      stopCamera()
    })
  } catch (err) {
    console.error('Camera access error:', err)

    if (err.name === 'NotAllowedError') {
      toast.add({
        title: 'Camera Permission Denied',
        description: 'Please allow camera access in your browser settings.',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle',
      })
    } else if (err.name === 'NotFoundError') {
      toast.add({
        title: 'No Camera Found',
        description: 'We could not detect a camera on this device.',
        color: 'orange',
        icon: 'i-heroicons-video-camera-slash',
      })
    } else {
      toast.add({
        title: 'Unexpected Error',
        description:
          err.message || 'Something went wrong while accessing the camera.',
        color: 'gray',
        icon: 'i-heroicons-bug-ant',
      })
    }

    stopCamera()
  }
}

const stopCamera = () => {
  try {
    Quagga.stop()
    Quagga.offDetected()
    result.value = ''
  } catch (e) {
    console.warn('⚠️ Error while stopping Quagga:', e)
  }
  showCamera.value = false
}

onUnmounted(() => {
  stopCamera()
})

function openImageViewer(images: string[], updatedAt: Date) {
  activeImages.value = images
  activeImagesDate.value = updatedAt
  isModalOpen.value = true
}

const removeProduct = async() => {
  try {
    DeleteProduct.mutate({ where: { id :deletingRowIdentity.value.id} });
  } catch (err) {
    console.log(err);
  }finally{
     isDeleteModalOpen.value = false;
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


const handleAdd = async () => {
  try {
    isAdd.value = true;

    const res = await $fetch('/api/purchaseorder/create', {
      method: 'POST',
    });
    router.push(`products/add?poId=${res?.id}`);
  } catch (error) {
    console.error('Failed to create purchase order:', error);
  } finally {
    isAdd.value = false;
  }
};


const fileValue = (data: any) => {
   console.log(data)
    images = data.files
};

const handleAddPhoto = async () => {  
  try {
    isPhotoSaving.value = true;

    // Step 1: Prepare and upload files first
    const base64files = await Promise.all(
      images
        .filter((file) => file.file instanceof File)
        .map(async (file) => {
          const base64 = await prepareFileForApi(file.file);
          return { base64, uuid: file.uuid, view: file.view };
        })
    );

    if (base64files.length > 0) {
      await Promise.all(
        base64files.map((file) =>
          awsService.uploadBase64File(
            file.base64,
            file.uuid,
            file.view,
            items.value.variant.product.category.name,
            items.value.variant.product.category.targetAudience,
            useAuth().session.value?.isAiImage
          )
        )
      );
    }

    // Step 2: Update DB after successful upload
    const res = await Updatevariant.mutateAsync({
      where: { id: items.value?.variant.id },
      data: { images: images.map((image) => image.uuid) },
    });

    console.log("DB updated with image UUIDs:", res);

    itemBarcode.value = '';
  } catch (err: any) {
    console.error(err);
    toast.add({
      title: 'Photo Upload Failed!',
      color: 'red',
      description: err.message
    });
  } finally {
    isPhotoSaving.value = false;
    isAddPhotoModelOpen.value = false;
  }
};



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
            <div
  class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-3 w-full"
>
  <!-- LEFT SIDE: Search -->
  <div class="flex flex-row gap-3 w-full sm:w-auto">
    <UInput
      v-model="search"
      icon="i-heroicons-magnifying-glass-20-solid"
      placeholder="Search..."
      class="w-full sm:w-auto"
    />
  </div>

  <!-- RIGHT SIDE -->
  <div class="flex flex-row gap-3 w-full sm:w-auto justify-end">

    <!-- 🔽 Mobile Dropdown -->
    <UDropdown
      v-if="isMobile"
      class="w-full"
      :items="[
        [
          { label: 'Filter', icon: 'i-heroicons-funnel', click: () => isFilterModalOpen = true },
          { label: 'Add Product', icon: 'i-heroicons-plus', click: handleAdd },
          { label: 'Add Photo', icon: 'i-heroicons-camera', click: () => isAddPhotoModelOpen = true },
          { label: 'Discount', icon: 'i-heroicons-percent-badge', click: () => isDiscountModalOpen = true }
        ]
      ]"
    >
      <UButton icon="i-heroicons-bars-3" color="primary" size="sm" label="Actions" class="w-full" />
    </UDropdown>

    <!-- 🖥 Desktop Buttons -->
    <template v-else>
      <UButton
        icon="i-heroicons-funnel"
        size="sm"
        color="orange"
        variant="solid"
        label="Filter"
        @click="isFilterModalOpen = true"
      />
      <UButton
        icon="i-heroicons-plus"
        size="sm"
        color="primary"
        variant="solid"
        label="Add Product"
        :loading="isAdd"
        @click="handleAdd"
      />
      <UButton
        icon="i-heroicons-camera"
        size="sm"
        color="primary"
        variant="solid"
        label="Add Photo"
        @click="isAddPhotoModelOpen = true"
      />
      <UButton
        icon="i-heroicons-percent-badge"
        size="sm"
        color="orange"
        variant="solid"
        label="Discount"
        @click="isDiscountModalOpen = true"
      />
    </template>
  </div>
</div>




            <!-- Header and Action buttons -->
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
                :columns="selectedColumns"
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

                <template #category-data="{ row }">
                    {{ row.category?.name }}
                </template>
                <template #subcategory-data="{ row }">
                    {{ row.subcategory?.name }}
                </template>

                <template #variants-data="{ row }"> 
                    {{row.variants?.length}}
                </template>
                <template #qty-data="{ row }">
                   {{
                        row.variants?.reduce((variantTotal, variant) => {
                            const itemTotal = variant.items?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
                            return variantTotal + itemTotal;
                        }, 0)
                        }}
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
                            :src="`https://images.markit.co.in/${row.variants[0]?.images[0]}?t=${row.updatedAt}`"
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
                       <template #name-data="{ row: variant }">
        <div class="flex flex-row items-center">
          <UAvatar
            :src="`https://images.markit.co.in/${variant.images[0]}?t=${row.updatedAt}`"
            :alt="variant.name"
            size="lg"
            @click="openImageViewer(variant.images, row.updatedAt)"
          />
          <div class="ms-3">
            {{ variant.name }}
           
          </div>
        </div>
      </template>

               <template #barcode-data="{ row }">
                    <UPopover mode="hover">
                        <!-- Trigger Button -->
                        <div
                            class="max-w-[180px] truncate"
                            >
                            {{ row.items?.map(i => i.barcode).join(', ') || 'No Barcodes' }}
                            </div>

                        <!-- Popover Content -->
                        <template #panel>
                        <div class="p-2">
                            <ul class="space-y-1">
                            <li 
                                v-for="item in row.items" 
                                :key="item.id" 
                                class="text-sm"
                            >
                                <span class="font-medium">{{ item.barcode }}</span>
                                <span class="text-gray-500" v-if="item.size"> - {{ item.size }}</span>
                            </li>
                            </ul>
                        </div>
                        </template>
                    </UPopover>
                    </template>

                <template #qty-data="{ row }">
                    {{
                    row.items?.reduce((variantTotal, item) => {
                        return variantTotal + (item.qty || 0);
                    }, 0)
                    }}
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
                        <span class="text-sm leading-5 hidden sm:flex">
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

    
    <UModal v-model="isAddPhotoModelOpen" prevent-close>
  <UCard>
    <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Add Photo
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isAddPhotoModelOpen = false" />
          </div>
        </template>

    <!-- 📷 Camera View -->
    <div class="relative">
      <div
        v-if="showCamera"
        ref="videoRef"
        class="w-full h-[200px] bg-black rounded-lg overflow-hidden"
      ></div>

      <!-- ❌ Close Camera Button -->
      <UButton
        v-if="showCamera"
        icon="i-heroicons-x-mark"
        size="xs"
        color="gray"
        variant="solid"
        class="absolute top-2 right-2 z-10"
        @click="() => { showCamera = false; stopCamera() }"
      />
    </div>

    <!-- 🔍 Barcode Input + Camera Button -->
    <div class="flex items-end gap-2 mt-4">
      <UFormGroup label="Enter Barcode" class="flex-1">
        <UInput
          placeholder="Enter Barcode"
          v-model="itemBarcode"

          @keydown.enter.prevent="handleGetItemInfo()"
        />
      </UFormGroup>

      <!-- 📸 Start Camera Button -->
      <UButton icon="i-heroicons-viewfinder-circle" @click="startCamera" />
    </div>

    <div v-if="isBarcodeLoading" class="mt-4">
      <p>Loading...</p>
    </div>

    <!-- 📦 Item Info -->
    <div v-if="items?.variant && !isBarcodeLoading" class="mt-4 space-y-1">
      <p><strong>Name:</strong> {{ items.variant.name }}</p>
      <p><strong>Code:</strong> {{ items.variant.code }}</p>
      <p><strong>Selling Price:</strong> ₹{{ items.variant.sprice }}</p>
      {{ items.variant.product.category.name }}
    </div>
    <div v-else class="mt-4 space-y-1">Not found</div>

    <!-- 🖼️ Image Upload -->
    <AddProductMedia
      v-if="items?.variant"
      ref="mediaRefs"
      :editFile="items?.variant?.images"
      :index="0"
      class="mt-4"
       :categoryName="items.variant.product.category.name"
       :targetAudience="items.variant.product.category.targetAudience"
       :productId="items.variant.product.id"
        :updatedAt="items.variant.product.updatedAt"
        @refetch="handleRefetch"
      @update="fileValue"
    />

    <!-- ✅ Add Photo -->
    <UButton
      class="mt-4"
      label="Add Photo"
      :loading="isPhotoSaving"
      @click="handleAddPhoto"
    />
  </UCard>
</UModal>
<UModal v-model="isModalOpen" size="xl">
    <div class="p-4 bg-black rounded-lg">
      <Swiper
        :modules="[Pagination]"
        :pagination="{ clickable: true }"
        :space-between="10"
        :slides-per-view="1"
        :loop="activeImages.length > 1"
        class="w-full"
      >
        <SwiperSlide v-for="(img, index) in activeImages" :key="index">
          <img
            :src="`https://images.markit.co.in/${img}?t=${activeImagesDate}`"
            class="max-h-[80vh] mx-auto object-contain"
          />
        </SwiperSlide>
      </Swiper>
    </div>
  </UModal>

  <UDashboardModal
        v-model="isDeleteModalOpen"
        title="Delete Product"
        :description="`Are you sure you want to delete Product ${deletingRowIdentity.name}?`"
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
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>

<!-- 🟢 DISCOUNT MODAL -->
<UModal v-model="isDiscountModalOpen" size="xl" prevent-close>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Apply Discount</h3>
        <UButton
          icon="i-heroicons-x-mark"
          variant="ghost"
          @click="isDiscountModalOpen = false"
        />
      </div>
    </template>

    <!-- Filters -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <UFormGroup label="Category">
        <USelect
          v-model="discountFilters.categoryId"
          :options="categoryOptions"
          placeholder="Select Category"
        />
      </UFormGroup>

      <UFormGroup label="Sub Category">
        <USelect
          v-model="discountFilters.subcategoryId"
          :options="subcategoryOptions"
          placeholder="Select Category"
        />
      </UFormGroup>

      <UFormGroup label="Start Date">
        <UInput type="date" v-model="discountFilters.startDate" />
      </UFormGroup>

      <UFormGroup label="End Date">
        <UInput type="date" v-model="discountFilters.endDate" />
      </UFormGroup>

      <UFormGroup label="Brand">
        <UInput placeholder="Brand" v-model="discountFilters.brand" />
      </UFormGroup>

      <UFormGroup label="Min Margin">
        <UInput type="number" v-model="discountFilters.minMargin" />
      </UFormGroup>

      <UFormGroup label="Max sprice">
        <UInput type="number" v-model="discountFilters.maxSprice" />
      </UFormGroup>

      <UFormGroup label="Min dprice">
        <UInput type="number" v-model="discountFilters.minDprice" />
      </UFormGroup>

      <UFormGroup label="Min Rating">
        <UInput type="number" v-model="discountFilters.minRating" />
      </UFormGroup>

          <UFormGroup label="Status">
        <USelect
          v-model="discountFilters.status"
          :options="[
            { label: 'Active', value: true },
            { label: 'Inactive', value: false },
            { label: 'All', value: null }
          ]"
          placeholder="Select Status"
        />

      </UFormGroup>
    </div>

    <!-- Discount Input -->
    <UFormGroup label="Discount Percentage (%)" class="mt-4">
      <UInput
        type="number"
        min="1"
        max="90"
        v-model="discountPercentage"
        placeholder="Enter discount (e.g., 10)"
      />
    </UFormGroup>

    <div class="flex justify-end mt-6 gap-3">
      <UButton color="white" label="Cancel" @click="isDiscountModalOpen = false" />
      <UButton
        color="orange"
        :loading="isDiscountApplying"
        label="Apply Discount"
        @click="applyDiscount"
      />
    </div>
  </UCard>
</UModal>

<UModal v-model="isFilterModalOpen" size="xl" prevent-close>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">Filter</h3>
        <UButton
          icon="i-heroicons-x-mark"
          variant="ghost"
          @click="isFilterModalOpen = false"
        />
      </div>
    </template>

    <!-- Filters -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <UFormGroup label="Category">
        <USelect
          v-model="filters.categoryId"
          :options="categoryOptions"
          placeholder="Select Category"
        />
      </UFormGroup>
      
      <UFormGroup label="Sub Category">
        <USelect
          v-model="filters.subcategoryId"
          :options="subcategoryOptions"
          placeholder="Select Sub Category"
        />
      </UFormGroup>

      <UFormGroup label="Start Date">
        <UInput type="date" v-model="filters.startDate" />
      </UFormGroup>

      <UFormGroup label="End Date">
        <UInput type="date" v-model="filters.endDate" />
      </UFormGroup>

      <UFormGroup label="Brand">
        <UInput placeholder="Brand" v-model="filters.brand" />
      </UFormGroup>

      <UFormGroup label="Min Margin">
        <UInput type="number" v-model="filters.minMargin" />
      </UFormGroup>

      <UFormGroup label="Max sprice">
        <UInput type="number" v-model="filters.maxSprice" />
      </UFormGroup>

      <UFormGroup label="Min dprice">
        <UInput type="number" v-model="filters.minDprice" />
      </UFormGroup>

      <UFormGroup label="Min Rating">
        <UInput type="number" v-model="filters.minRating" />
      </UFormGroup>

       <UFormGroup label="Status">
          <USelect
            v-model="filters.status"
            :options="[
              { label: 'Active', value: true },
              { label: 'Inactive', value: false },
              { label: 'All', value: null }
            ]"
            placeholder="Select Status"
          />

    </UFormGroup>


      
    </div>

   
    <div class="flex justify-end mt-6 gap-3">
      <UButton color="white" label="Cancel" @click="isFilterModalOpen = false" />
      <UButton
        color="orange"
        :loading="isFilterApplying"
        label="Filter"
        @click="applyFilter"
      />
    </div>
  </UCard>
</UModal>


</template>
