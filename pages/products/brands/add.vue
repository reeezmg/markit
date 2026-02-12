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

      <!-- 🔎 Filters + Actions -->
      <div class="flex flex-col sm:flex-row justify-between gap-3 px-4 py-3 w-full">

        <!-- Left -->
        <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search Brand..."
            class="w-full sm:w-60"
          />

          <USelectMenu
            v-model="selectedStatus"
            :options="statusOptions"
            multiple
            placeholder="Status"
            class="w-full sm:w-60"
          />
        </div>

        <!-- Right -->
        <div class="flex flex-col sm:flex-row gap-2 sm:items-center">

          <UButton
            icon="i-heroicons-plus"
            label="Add Brand"
            class="w-full sm:w-40"
            @click="isAddBrandModalOpen = true"
          />

        </div>
      </div>

      <!-- ⚙️ Header -->
      <div class="flex justify-between items-center w-full px-4 py-3">

        <div class="flex items-center gap-2">
          <span class="text-sm hidden sm:block">Rows per page:</span>
          <USelect v-model="pageCount" :options="[5,10,20,30]" size="xs" />
        </div>

      </div>

      <!-- 🏷️ BRAND TABLE -->
      <UTable
        v-model:expand="expand"
        :rows="brands"
        :columns="brandColumns"
        :loading="isLoading"
      >

        <!-- Brand Name -->
        <template #name-data="{ row }">
          <div class="flex items-center gap-3">
            <UAvatar
              :src="`https://images.markit.co.in/${row.image || ''}`"
              :alt="row.name"
              size="lg"
            />
            <div>{{ row.name }}</div>
          </div>
        </template>

        <!-- Products Count -->
        <template #products-data="{ row }">
          {{ row.products?.length || 0 }}
        </template>

        <!-- Brand Qty -->
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

        <!-- Actions -->
        <template #actions-data="{ row }">
          <UDropdown :items="brandActions(row)">
            <UButton
              icon="i-heroicons-ellipsis-horizontal-20-solid"
              color="gray"
              variant="ghost"
            />
          </UDropdown>
        </template>

        <!-- 📂 EXPAND → CATEGORY TABLE -->
        <template #expand="{ row }">
          <div class="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">

            <UTable
              :rows="categories"
              :columns="categoryColumns"
            >

              <!-- Category Name -->
              <template #name-data="{ row: cat }">
                <div class="flex items-center gap-3">
                  <UAvatar
                    :src="`https://images.markit.co.in/${cat.image || ''}`"
                    :alt="cat.name"
                  />
                  <div>{{ cat.name }}</div>
                </div>
              </template>

              <!-- Products in this Brand + Category -->
              <template #products-data="{ row: cat, parent }">
                {{
                  parent.products?.filter(
                    p => p.categoryId === cat.id
                  ).length || 0
                }}
              </template>

              <!-- Qty Brand + Category -->
              <template #qty-data="{ row: cat, parent }">
                {{
                  parent.products
                    ?.filter(p => p.categoryId === cat.id)
                    ?.reduce((productTotal, product) => {

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

      <!-- 📄 Pagination -->
      <template #footer>
        <div class="flex justify-end">
          <UPagination
            v-model="page"
            :page-count="pageCount"
            :total="pageTotal"
          />
        </div>
      </template>

    </UCard>
  </UDashboardPanelContent>

  <!-- ➕ ADD BRAND MODAL -->
  <UDashboardModal
    v-model="isAddBrandModalOpen"
    title="Add Brand"
    icon="i-heroicons-plus-circle"
    prevent-close
  >
    <div class="space-y-4">

      <UInput v-model="brandForm.name" placeholder="Brand Name" />

      <UTextarea
        v-model="brandForm.description"
        placeholder="Description"
      />

      <UInput
        v-model="brandForm.image"
        placeholder="Image URL"
      />

    </div>

    <template #footer>
      <UButton label="Save" @click="createBrand()" />
      <UButton
        color="white"
        label="Cancel"
        @click="isAddBrandModalOpen = false"
      />
    </template>
  </UDashboardModal>

  <!-- 🗑️ DELETE MODAL -->
  <UDashboardModal
    v-model="isDeleteBrandModalOpen"
    title="Delete Brand"
    icon="i-heroicons-exclamation-circle"
    prevent-close
  >
    <p>
      Are you sure you want to delete
      <b>{{ deletingBrand?.name }}</b> ?
    </p>

    <template #footer>
      <UButton color="red" label="Delete" @click="deleteBrand()" />
      <UButton
        color="white"
        label="Cancel"
        @click="isDeleteBrandModalOpen = false"
      />
    </template>
  </UDashboardModal>

</template>

<script setup lang="ts">
import { Switch } from '@headlessui/vue'
import { useRouter } from 'vue-router'

import {
  useFindManyBrand,
  useCreateBrand,
  useDeleteBrand,
  useUpdateBrand,
  useFindManyCategory
} from '~/lib/hooks'

/* ---------------- AUTH ---------------- */
const useAuth = () => useNuxtApp().$auth
const companyId = useAuth().session.value?.companyId

/* ---------------- ROUTER / TOAST ---------------- */
const router = useRouter()
const toast = useToast()

/* ---------------- MODALS ---------------- */
const isAddBrandModalOpen = ref(false)
const isDeleteBrandModalOpen = ref(false)

const deletingBrand = ref<any>(null)

/* ---------------- FORM ---------------- */
const brandForm = reactive({
  name: '',
  description: '',
  image: ''
})

/* ---------------- TABLE COLUMNS ---------------- */

const brandColumns = [
  { key: 'name', label: 'Brand', sortable: true },
  { key: 'products', label: 'Products' },
  { key: 'qty', label: 'Qty' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' }
]

const categoryColumns = [
  { key: 'name', label: 'Category' },
  { key: 'products', label: 'Products' },
  { key: 'qty', label: 'Qty' }
]

/* ---------------- FILTERS ---------------- */

const search = ref('')
const selectedStatus = ref<any[]>([])

const statusOptions = [
  { label: 'Active', value: true },
  { label: 'Inactive', value: false }
]

/* ---------------- PAGINATION ---------------- */

const page = ref(1)
const pageCount = ref(10)
const pageTotal = ref(0)

const expand = ref({
  openedRows: [],
  row: null
})

/* ---------------- BRAND QUERY ---------------- */

const brandQuery = reactive({
  where: {
    AND: [
      { name: { contains: search.value } },
      { companyId }
    ]
  },
  orderBy: { createdAt: 'desc' },
  skip: 0,
  take: pageCount.value,

  select: {
    id: true,
    name: true,
    image: true,
    status: true,

    products: {
      select: {
        id: true,
        categoryId: true,

        variants: {
          select: {
            items: {
              select: {
                qty: true
              }
            }
          }
        }
      }
    }
  }
})

/* ---------------- FETCH BRANDS ---------------- */

const {
  data: brands,
  isLoading,
  refetch
} = useFindManyBrand(brandQuery)

/* ---------------- CATEGORY QUERY ---------------- */

const {
  data: categories
} = useFindManyCategory({
  where: { companyId },
  select: {
    id: true,
    name: true,
    image: true
  }
})

/* ---------------- WATCHERS ---------------- */

watch(brands, () => {
  pageTotal.value = brands.value?.length || 0
})

watchEffect(() => {
  brandQuery.where.AND[0].name.contains = search.value

  brandQuery.skip = (page.value - 1) * pageCount.value
  brandQuery.take = Number(pageCount.value)

  refetch()
})

/* ---------------- MUTATIONS ---------------- */

const CreateBrand = useCreateBrand({ optimisticUpdate: true })
const DeleteBrand = useDeleteBrand({ optimisticUpdate: true })
const UpdateBrand = useUpdateBrand({ optimisticUpdate: true })

/* ---------------- ACTIONS ---------------- */

const brandActions = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square',
      click: () => router.push(`/brands/edit/${row.id}`)
    }
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash',
      click: () => {
        deletingBrand.value = row
        isDeleteBrandModalOpen.value = true
      }
    }
  ]
]

/* ---------------- CREATE ---------------- */

const createBrand = async () => {
  if (!brandForm.name) {
    toast.add({
      title: 'Brand name required',
      color: 'red'
    })
    return
  }

  try {
    await CreateBrand.mutate({
      data: {
        name: brandForm.name,
        description: brandForm.description,
        image: brandForm.image,
        companyId
      }
    })

    toast.add({
      title: 'Brand created'
    })

    isAddBrandModalOpen.value = false

    brandForm.name = ''
    brandForm.description = ''
    brandForm.image = ''
  } catch (err) {
    console.error(err)
  }
}

/* ---------------- DELETE ---------------- */

const deleteBrand = async () => {
  try {
    await DeleteBrand.mutate({
      where: { id: deletingBrand.value.id }
    })

    toast.add({
      title: 'Brand deleted'
    })

  } catch (err) {
    console.error(err)
  } finally {
    isDeleteBrandModalOpen.value = false
  }
}

/* ---------------- STATUS TOGGLE ---------------- */

const toggleStatus = (id: string) => {
  const brand = brands.value.find(b => b.id === id)
  if (!brand) return

  UpdateBrand.mutate({
    where: { id },
    data: { status: !brand.status }
  })
}
</script>
