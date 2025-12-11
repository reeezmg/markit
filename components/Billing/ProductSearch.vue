<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  useFindManyCategory,
  useFindManySubcategory,
  useFindManyProduct,
  useFindManyVariant
} from '~/lib/hooks'

// Props
const props = defineProps({ open: Boolean })
const emit = defineEmits(['close', 'done'])

// Modal state
const isOpen = ref(props.open)
watch(() => props.open, v => (isOpen.value = v))

// Auth → companyId
const auth = useAuth()
const companyId = computed(() => auth.session.value?.companyId)

// Dropdowns
const selectedCategory = ref<string | null>(null)
const selectedSubcategory = ref<string | null>(null)
const selectedProduct = ref<string | null>(null)

// Selection
const selectedItems = ref<string[]>([])
const expandedRow = ref<string | null>(null)

const toggleExpand = (id: string) => {
  expandedRow.value = expandedRow.value === id ? null : id
}

// ------------------------------
// QUERIES
// ------------------------------

// Category
const { data: categories } = useFindManyCategory(() => ({
  where: { companyId: companyId.value, status: true },
  orderBy: { name: 'asc' }
}))

// Subcategory
const { data: subcategories, refetch: refreshSubcategories } =
  useFindManySubcategory(() => ({
    where: {
      companyId: companyId.value,
      status: true,
      categoryId: selectedCategory.value || undefined
    },
    orderBy: { name: 'asc' }
  }))

// Products
const { data: products, refetch: refreshProducts } = useFindManyProduct(() => ({
  where: {
    companyId: companyId.value,
    status: true,
    categoryId: selectedCategory.value || undefined,
    subcategoryId: selectedSubcategory.value || undefined
  },
  orderBy: { name: 'asc' }
}))

// ------------------------------
// FIXED VARIANT QUERY
// loads variants on selecting SUBCATEGORY or PRODUCT
// ------------------------------
const { data: variants, refetch: refreshVariants } = useFindManyVariant(() => ({
  where: {
    companyId: companyId.value,
    status: true,

    // If product is chosen → filter by product
    productId: selectedProduct.value || undefined,

    // If no product selected → filter variants by subcategory
    product: selectedProduct.value
      ? undefined
      : selectedSubcategory.value
      ? { subcategoryId: selectedSubcategory.value }
      : undefined
  },
  include: {
    product: true,
    items: true
  },
  orderBy: { name: 'asc' }
}))

// ------------------------------
// WATCHERS
// ------------------------------
watch(selectedCategory, () => {
  selectedSubcategory.value = null
  selectedProduct.value = null
  selectedItems.value = []

  refreshSubcategories()
  refreshProducts()
  refreshVariants()
})

watch(selectedSubcategory, () => {
  selectedProduct.value = null
  selectedItems.value = []

  refreshProducts()
  refreshVariants() // important: load variants on subcategory change
})

watch(selectedProduct, () => {
  selectedItems.value = []
  refreshVariants()
})

// ------------------------------
// FLATTEN ITEMS
// ------------------------------
const allItems = computed(() => {
  if (!variants.value) return []

  return variants.value.flatMap(v =>
    v.items.map(item => ({
      itemId: item.id,
      barcode: item.barcode,
      size: item.size,
      qty: item.qty,
      mrp: v.sprice,
      discount: v.discount ?? 0,
      productName: v.product?.name,
      brand: v.product?.brand ?? '',
      variantName: v.name,
      variantId: v.id,
      images: v.images
    }))
  )
})

// ------------------------------
// CHECKBOX
// ------------------------------
const toggleItem = (id: string) => {
  selectedItems.value = selectedItems.value.includes(id)
    ? selectedItems.value.filter(x => x !== id)
    : [...selectedItems.value, id]
}

// ------------------------------
// CLEAR
// ------------------------------
const clearAll = () => {
  selectedItems.value = []
  selectedCategory.value = null
  selectedSubcategory.value = null
  selectedProduct.value = null
  expandedRow.value = null
}

// ------------------------------
// DONE
// ------------------------------
const done = () => {
  const selected = allItems.value
    .filter(i => selectedItems.value.includes(i.itemId))
    .map(i => ({ barcode: i.barcode }))

  emit('done', selected)
  emit('close')
  clearAll()
}
</script>

<template>
  <UModal
    v-model="isOpen"
    :ui="{ width: 'max-w-full sm:max-w-screen-sm' }"
    @close="emit('close')"
  >
    <UCard class="p-4 space-y-4">

      <h2 class="text-lg font-semibold mb-4">Select Items</h2>

      <!-- CATEGORY + SUBCATEGORY + PRODUCT -->
      <div class="grid grid-cols-3 gap-4">

        <!-- Category -->
        <UFormGroup label="Category">
          <USelectMenu
            v-model="selectedCategory"
            searchable
            clearable
            placeholder="Select Category"
            value-attribute="value"
            option-attribute="label"
            :options="categories?.map(c => ({
              label: c.name,
              value: c.id
            }))"
          />
        </UFormGroup>

        <!-- Subcategory -->
        <UFormGroup label="Subcategory">
          <USelectMenu
            v-model="selectedSubcategory"
            searchable
            clearable
            :disabled="!selectedCategory"
            placeholder="Select Subcategory"
            value-attribute="value"
            option-attribute="label"
            :options="subcategories?.map(s => ({
              label: s.name,
              value: s.id
            }))"
          />
        </UFormGroup>

        <!-- Product -->
        <UFormGroup label="Product">
          <USelectMenu
            v-model="selectedProduct"
            searchable
            clearable
            :disabled="!selectedSubcategory"
            placeholder="Select Product"
            value-attribute="value"
            option-attribute="label"
            :options="products?.map(p => ({
              label: p.name,
              value: p.id
            }))"
          />
        </UFormGroup>

      </div>

      <!-- ITEMS TABLE -->
      <div
        v-if="selectedSubcategory || selectedProduct"
        class="mt-4 w-full border rounded overflow-x-auto"
      >
        <table class="text-sm w-full min-w-max">

          <thead class="bg-gray-100 text-left">
            <tr>
              <th class="p-2"></th>
              <th class="p-2">Image</th>
              <th class="p-2">Barcode</th>
              <th class="p-2">Product</th>
              <th class="p-2">Variant</th>
              <th class="p-2">Size</th>
              <th class="p-2">MRP</th>
              <th class="p-2">Brand</th>
              <th class="p-2">Stock</th>
            </tr>
          </thead>

          <tbody>
            <template v-for="row in allItems" :key="row.itemId">
              <tr class="border-t hover:bg-gray-50">
                <td class="p-2">
                  <UCheckbox
                    :model-value="selectedItems.includes(row.itemId)"
                    @change="toggleItem(row.itemId)"
                  />
                </td>

                <td class="p-2">
                  <UAvatar
                    size="sm"
                    class="cursor-pointer"
                    @click="toggleExpand(row.itemId)"
                    :src="row.images?.length
                      ? `https://images.markit.co.in/${row.images[0]}`
                      : ''"
                  />
                </td>

                <td class="p-2 whitespace-nowrap">{{ row.barcode }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.productName }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.variantName }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.size }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.mrp }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.brand }}</td>
                <td class="p-2 whitespace-nowrap">{{ row.qty }}</td>
              </tr>

              <tr v-if="expandedRow === row.itemId">
                <td colspan="9" class="bg-gray-50 p-4">
                  <div class="flex justify-center">
                    <img
                      :src="`https://images.markit.co.in/${row.images[0]}`"
                      class="rounded-lg shadow-md max-h-80 object-contain"
                    />
                  </div>
                </td>
              </tr>
            </template>
          </tbody>

        </table>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="flex justify-end gap-3 pt-4">

        <UButton variant="soft" @click="emit('close')">Cancel</UButton>

        <UButton color="yellow" variant="soft" @click="clearAll">
          Clear
        </UButton>

        <UButton :disabled="selectedItems.length === 0" @click="done">
          Done
        </UButton>

      </div>

    </UCard>
  </UModal>
</template>
