<template>
  <UDashboardPanelContent class="pb-24">

    <UCard
      class="w-full"
      :ui="{
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: {
          padding: '',
          base: 'divide-y divide-gray-200 dark:divide-gray-700'
        },
        footer: { padding: 'p-4' }
      }"
    >

      <!-- 🔍 FILTERS / ACTIONS -->
      <div class="flex flex-col sm:flex-row justify-between gap-3 px-4 py-3 w-full">

        <!-- LEFT -->
        <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">

          <UInput
            v-model="search"
            icon="i-heroicons-magnifying-glass-20-solid"
            placeholder="Search brand..."
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

        <!-- RIGHT -->
        <div class="flex flex-col sm:flex-row gap-2 sm:justify-end">

          <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            label="Add Brand"
            class="w-full sm:w-40"
            @click="() => router.push('brands/add')"
          />

        </div>

      </div>

      <!-- ⚙️ HEADER CONTROLS -->
      <div class="flex justify-between items-center w-full px-4 py-3">

        <div class="flex items-center gap-1.5">
          <span class="text-sm hidden sm:block">Rows per page:</span>

          <USelect
            v-model="pageCount"
            :options="[5,10,20,30]"
            class="w-20"
            size="xs"
          />

        </div>

        <div class="flex gap-2">

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

      <!-- 🧾 BRAND TABLE -->
      <UTable
        v-model="selectedRows"
        v-model:sort="sort"
        v-model:expand="expand"
        :rows="brands" 
        :columns="columnsTable"
        :loading="isLoading"
        sort-mode="manual"
      >

        <!-- 🏷️ BRAND NAME + IMAGE -->
        <template #name-data="{ row }">

          <div class="flex items-center">

            <UAvatar
              :src="row.image
                ? `https://images.markit.co.in/${row.image}`
                : ''"
              :alt="row.name"
              size="lg"
            />

            <div class="ms-3 font-medium">
              {{ row.name }}
            </div>

          </div>

        </template>

        <!-- 📦 PRODUCTS COUNT -->
        <template #products-data="{ row }">
          {{ row.products?.length || 0 }}
        </template>

        <!-- 📊 BRAND TOTAL QTY -->
        <template #qty-data="{ row }">

          {{
            row.products?.reduce((productTotal, product) => {

              const variantQty = product.variants?.reduce((variantTotal, variant) => {

                const itemQty = variant.items?.reduce((itemTotal, item) => {
                  return itemTotal + (item.qty || 0)
                }, 0) || 0

                return variantTotal + itemQty

              }, 0) || 0

              return productTotal + variantQty

            }, 0) || 0
          }}

        </template>

        <!-- 🔘 STATUS -->
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

        <!-- ⚙️ ACTIONS -->
        <template #actions-data="{ row }">

          <UDropdown :items="action(row)">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-ellipsis-horizontal-20-solid"
            />
          </UDropdown>

        </template>

        <!-- 🔽 EXPAND → CATEGORY TABLE -->
        <template #expand="{ row }">

          <div class="ps-4 py-4 bg-gray-50 dark:bg-gray-900 rounded-lg">

            <UTable
              :rows="row.brandCategories"
              :columns="brandCategoryColumns"
            >

              <!-- CATEGORY NAME -->
              <template #name-data="{ row }">

                <div class="flex items-center">

                  <UAvatar
                    :src="row.image
                      ? `https://images.markit.co.in/${row.image}`
                      : ''"
                    size="md"
                  />

                  <div class="ms-3">
                    {{ row.name }}
                  </div>

                </div>

              </template>

              <!-- PRODUCTS COUNT -->
              <template #products-data="{ row }">
                {{ row.productsCount }}
              </template>

              <!-- CATEGORY QTY -->
              <template #qty-data="{ row }">

                {{
                  row.products?.reduce((productTotal, product) => {

                    const variantQty = product.variants?.reduce((variantTotal, variant) => {

                      const itemQty = variant.items?.reduce((itemTotal, item) => {
                        return itemTotal + (item.qty || 0)
                      }, 0) || 0

                      return variantTotal + itemQty

                    }, 0) || 0

                    return productTotal + variantQty

                  }, 0) || 0
                }}

              </template>

            </UTable>

          </div>

        </template>

      </UTable>

      <!-- 📄 PAGINATION -->
      
            <!-- Number of rows & Pagination -->
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
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Switch } from '@headlessui/vue'

import {
  useFindManyBrand,
  useUpdateBrand,
  useUpdateManyBrand,
  useCountBrand
} from '~/lib/hooks'

import type { Prisma } from '@prisma/client'

/* -------------------------------------------------
   AUTH
------------------------------------------------- */

const useAuth = () => useNuxtApp().$auth
const companyId = useAuth().session.value?.companyId

const router = useRouter()

/* -------------------------------------------------
   TABLE COLUMNS
------------------------------------------------- */

const columns = [
  { key: 'name', label: 'Brand', sortable: true },
  { key: 'products', label: 'Products', sortable: true },
  { key: 'qty', label: 'Qty', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' }
]

const brandCategoryColumns = [
  { key: 'name', label: 'Category' },
  { key: 'products', label: 'Products' },
  { key: 'qty', label: 'Qty' }
]

const selectedColumns = ref(columns)

const columnsTable = computed(() =>
  columns.filter(c => selectedColumns.value.includes(c))
)

/* -------------------------------------------------
   FILTERS
------------------------------------------------- */

const search = ref('')
const selectedStatus = ref<any[]>([])

const todoStatus = [
  { label: 'Active', value: true },
  { label: 'Inactive', value: false }
]

const resetFilters = () => {
  search.value = ''
  selectedStatus.value = []
}

/* -------------------------------------------------
   PAGINATION / SORT
------------------------------------------------- */

const page = ref(1)
const pageCount = ref(10)

const sort = ref({
  column: 'createdAt',
  direction: 'desc' as const
})

const expand = ref({
  openedRows: [],
  row: null
})

/* -------------------------------------------------
   COMPUTED QUERY
------------------------------------------------- */

const queryArgs = computed<Prisma.BrandFindManyArgs>(() => {

  const filterConditions: any[] = [
    { companyId }
  ]

  /* Status filter */
  if (selectedStatus.value.length) {
    filterConditions.push({
      OR: selectedStatus.value.map(s => ({
        status: s.value
      }))
    })
  }

  return {

    where: {
      AND: [
        ...filterConditions,
        {
          name: {
            contains: search.value,
            mode: 'insensitive'
          }
        }
      ]
    },

    select: {
      id: true,
      name: true,
      image: true,
      status: true,

      /* BRAND PRODUCTS */
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
      },

      /* COMPANY → ALL CATEGORIES */
      company: {
        select: {
          categories: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      }
    },

    orderBy: {
      [sort.value.column]: sort.value.direction
    },

    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value)

  }

})

/* -------------------------------------------------
   FETCH
------------------------------------------------- */

const {
  data: brandsRaw,
  isLoading
} = useFindManyBrand(queryArgs)

/* -------------------------------------------------
   MAP → EXPAND DATA (CRITICAL FIX)
------------------------------------------------- */

const brands = computed(() => {

  if (!brandsRaw.value) return []

  return brandsRaw.value.map((brand) => {

    const categories = brand.company?.categories || []

    const brandCategories = categories.map((category) => {

      const products = brand.products?.filter(
        p => p.categoryId === category.id
      ) || []

      return {
        ...category,
        products,
        productsCount: products.length
      }

    })

    return {
      ...brand,
      brandCategories   // 🔥 REQUIRED FOR EXPAND
    }

  })

})

/* -------------------------------------------------
   TOTAL COUNT
------------------------------------------------- */


const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal }  = useCountBrand(countArgs)
const pageFrom = computed(() =>
  (page.value - 1) * pageCount.value + 1
)

const pageTo = computed(() =>
  Math.min(page.value * pageCount.value, pageTotal.value)
)
watch(brands, (newBrands) => {
   if(page.value > pageTotal.value) {
       page.value = 1;
   }
});


/* -------------------------------------------------
   STATUS TOGGLE
------------------------------------------------- */

const UpdateBrand = useUpdateBrand({
  optimisticUpdate: true
})

function toggleStatus(id: string) {

  const brand = brands.value.find(b => b.id === id)
  if (!brand) return

  UpdateBrand.mutate({
    where: { id },
    data: { status: !brand.status }
  })

}

/* -------------------------------------------------
   MULTI TOGGLE
------------------------------------------------- */

const UpdateManyBrand = useUpdateManyBrand({
  optimisticUpdate: true
})

function multiToggle(ids: string[], status: boolean) {

  UpdateManyBrand.mutate({
    where: { id: { in: ids } },
    data: { status }
  })

}

/* -------------------------------------------------
   ACTIONS
------------------------------------------------- */

const action = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => router.push(`/brands/edit/${row.id}`)
    }
  ]
]

/* -------------------------------------------------
   ROW SELECT
------------------------------------------------- */

const selectedRows = ref([])


</script>
