<script setup lang="ts">
import * as z from 'zod'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

import {
  useFindManyCategory,
  useFindManySubcategory,
  useFindManyBrand,
  useFindManyCollection
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth

/* -----------------------------
PROPS
------------------------------ */
const props = defineProps<{
  editName?: string | null
  editBrand?: any
  editDescription?: string | null
  editCategory?: any
  editSubcategory?: any
  editCollection?: any
}>()

const emit = defineEmits(['update'])

/* -----------------------------
VALIDATION
------------------------------ */
const schemas = z.object({
  name: z.string().min(2),
  brand: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  description: z.string().optional(),
})

const { errors, defineField, resetForm: resetValidation } = useForm({
  validationSchema: toTypedSchema(schemas),
})

const [name, nameAttrs] = defineField('name')
const [description, descriptionAttrs] = defineField('description')

/* -----------------------------
STATE
------------------------------ */
const selectedRow = ref<any>({})
const subselectedRow = ref<any>({})
const brandSelectedRow = ref<any>({})
const collectionSelectedRow = ref<any>({})

const productInputs = ref(
  useAuth().session.value?.productInputs
)

/* -----------------------------
FETCH CATEGORIES
------------------------------ */
const { data: categories } = useFindManyCategory({
  where: { companyId: useAuth().session.value?.companyId },
})

/* -----------------------------
FETCH SUBCATEGORIES
------------------------------ */
const subArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId,
    ...(selectedRow.value?.id && {
      categoryId: selectedRow.value.id,
    }),
  },
}))

const { data: subcategories } =
  useFindManySubcategory(subArgs)

/* -----------------------------
FETCH BRANDS
(Filtered by category like subcategory)
------------------------------ */
const brandArgs = computed(() => ({
  where: {
    companyId: useAuth().session.value?.companyId
  },
}))

const { data: brands } =
  useFindManyBrand(brandArgs)

/* -----------------------------
FETCH COLLECTIONS
------------------------------ */
const { data: collections } = useFindManyCollection({
  where: { companyId: useAuth().session.value?.companyId },
})

/* -----------------------------
RESET FORM
------------------------------ */
const resetForm = () => {
  name.value = ''
  description.value = ''
  selectedRow.value = {}
  subselectedRow.value = {}
  brandSelectedRow.value = {}
  collectionSelectedRow.value = {}
  resetValidation()
}

/* -----------------------------
SELECT MENU REFS (for parent keyboard navigation)
------------------------------ */
const brandSelectRef = ref<any>(null)
const categorySelectRef = ref<any>(null)
const subcategorySelectRef = ref<any>(null)

const showBrandModal = ref(false)
const showCategoryModal = ref(false)
const showSubcategoryModal = ref(false)
const pendingBrandName = ref('')
const pendingCategoryName = ref('')
const pendingSubcategoryName = ref('')
const activeQuickCreateSelect = ref<'brand' | 'category' | 'subcategory' | null>(null)

// Each select is wrapped in <div ref="..."> so the parent can close an open
// menu via wrapper.querySelector('button').focus()/click() — see
// pages/erp/billing.vue:movecatgeory.
const getAllSelectWrappers = (): HTMLElement[] =>
  [brandSelectRef.value, categorySelectRef.value, subcategorySelectRef.value]
    .filter((w): w is HTMLElement => !!w)

// After a user picks an option from any select, return focus to the trigger
// button so they can keep tabbing/arrowing. Guarded by an
// activeElement-inside-listbox check so prop-driven hydration (e.g. clicking
// an existing product to edit) doesn't steal focus.
const focusBackOnSelect = (wrapper: any, val: any) => {
  const isEmpty = !val || (typeof val === 'object' && Object.keys(val).length === 0)
  if (isEmpty) return
  if (!(document.activeElement as HTMLElement | null)?.closest('[role="listbox"]')) return
  nextTick(() => {
    (wrapper.value?.querySelector('button') as HTMLElement | null)?.focus()
  })
}

watch(brandSelectedRow, (val) => focusBackOnSelect(brandSelectRef, val))
watch(selectedRow, (val) => focusBackOnSelect(categorySelectRef, val))
watch(subselectedRow, (val) => focusBackOnSelect(subcategorySelectRef, val))

defineExpose({ resetForm, getAllSelectWrappers })

const focusSelectTrigger = (wrapper: any) => {
  nextTick(() => {
    (wrapper.value?.querySelector('button') as HTMLElement | null)?.focus()
  })
}

const openCreateBrandModal = (query: string) => {
  pendingBrandName.value = query.trim()
  activeQuickCreateSelect.value = 'brand'
  showBrandModal.value = true
}

const openCreateCategoryModal = (query: string) => {
  pendingCategoryName.value = query.trim()
  activeQuickCreateSelect.value = 'category'
  showCategoryModal.value = true
}

const openCreateSubcategoryModal = (query: string) => {
  pendingSubcategoryName.value = query.trim()
  activeQuickCreateSelect.value = 'subcategory'
  showSubcategoryModal.value = true
}

const onBrandCreated = (brand: any) => {
  brandSelectedRow.value = brand
}

const onCategoryCreated = (category: any) => {
  selectedRow.value = category
}

const onSubcategoryCreated = (subcategory: any) => {
  subselectedRow.value = subcategory
}

watch(showBrandModal, (open) => {
  if (!open && activeQuickCreateSelect.value === 'brand') {
    focusSelectTrigger(brandSelectRef)
    activeQuickCreateSelect.value = null
  }
})

watch(showCategoryModal, (open) => {
  if (!open && activeQuickCreateSelect.value === 'category') {
    focusSelectTrigger(categorySelectRef)
    activeQuickCreateSelect.value = null
  }
})

watch(showSubcategoryModal, (open) => {
  if (!open && activeQuickCreateSelect.value === 'subcategory') {
    focusSelectTrigger(subcategorySelectRef)
    activeQuickCreateSelect.value = null
  }
})

/* -----------------------------
WATCHERS
------------------------------ */

/* Reset sub + brand when category changes */
watch(subcategories, (newSubcategories) => {
  if (
    subselectedRow.value?.id &&
    newSubcategories?.some((subcategory: any) => subcategory.id === subselectedRow.value.id)
  ) {
    return
  }

  subselectedRow.value = {}
})

watch(brands, (newBrands) => {
  if (
    brandSelectedRow.value?.id &&
    newBrands?.some((brand: any) => brand.id === brandSelectedRow.value.id)
  ) {
    return
  }

  brandSelectedRow.value = {}
})

/* Edit → Name */
watch(
  () => props.editName,
  (val) => {
    name.value = val ?? ''
  },
  { immediate: true }
)

/* Edit → Description */
watch(
  () => props.editDescription,
  (val) => {
    description.value = val ?? ''
  },
  { immediate: true }
)

/* Edit → Category */
watch(
  [() => props.editCategory, categories],
  ([newCategory, newCategories]) => {
    if (newCategory && newCategories?.length) {
      selectedRow.value =
        newCategories.find(
          (c) => c.id === newCategory
        ) || {}
    } else {
      selectedRow.value = {}
    }
  },
  { immediate: true }
)

/* Edit → Subcategory */
watch(
  [() => props.editSubcategory, subcategories],
  ([newSub, newSubs]) => {
    if (newSub && newSubs?.length) {
      subselectedRow.value =
        newSubs.find(
          (s) => s.id === newSub
        ) || {}
    } else {
      subselectedRow.value = {}
    }
  },
  { immediate: true }
)

/* Edit → Brand */
watch(
  [() => props.editBrand, brands],
  ([newBrand, newBrands]) => {
    if (newBrand && newBrands?.length) {
      brandSelectedRow.value =
        newBrands.find(
          (b) => b.id === newBrand
        ) || {}
    } else {
      brandSelectedRow.value = {}
    }
  },
  { immediate: true }
)

/* Edit → Collection */
watch(
  [() => props.editCollection, collections],
  ([newCollection, newCollections]) => {
    if (newCollection && newCollections?.length) {
      collectionSelectedRow.value =
        newCollections.find(
          (c) => c.id === newCollection
        ) || {}
    } else {
      collectionSelectedRow.value = {}
    }
  },
  { immediate: true }
)

/* Emit updates */
watch(
  [
    name,
    description,
    selectedRow,
    subselectedRow,
    brandSelectedRow,
    collectionSelectedRow,
  ],
  ([
    newName,
    newDesc,
    newCat,
    newSub,
    newBrand,
    newCollection,
  ]) => {
    emit('update', {
      name: newName,
      description: newDesc,
      category: newCat,
      subcategory: newSub?.id,
      brand: newBrand?.id,
      collection: newCollection?.id,
    })
  },
  { immediate: true }
)
</script>

<!-- ================= TEMPLATE ================= -->

<template id="create">
  <div class="text-xl mb-4">Create</div>
  <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />

  <div class="grid grid-cols-2 gap-4 mb-3">

    <!-- NAME -->
    <UFormGroup label="Name" v-if="productInputs?.name">
      <UInput
        v-model="name"
        v-bind="nameAttrs"
        class="w-full"
      />
    </UFormGroup>

    <!-- BRAND (SELECT MENU now) -->
    <UFormGroup label="Brand" v-if="productInputs?.brand">
      <div ref="brandSelectRef">
      <USelectMenu
        v-model="brandSelectedRow"
        :options="brands"
        option-key="id"
        track-by="id"
        searchable
        option-attribute="name"
        searchable-placeholder="Search a Brand..."
      >
        <template #label>
          <span
            v-if="Object.keys(brandSelectedRow).length"
            class="truncate"
          >
            {{ brandSelectedRow.name }}
          </span>
          <span v-else>Select</span>
        </template>

        <template #leading>
          <UIcon
            v-if="!brandSelectedRow.image"
            name="i-heroicons-user-circle"
            class="w-5 h-5"
          />
          <UAvatar
            v-else
            :src="`https://images.markit.co.in/${brandSelectedRow.image}`"
            size="2xs"
          />
        </template>

        <template #option="{ option: brand }">
          <UIcon
            v-if="!brand.image"
            name="i-heroicons-user-circle"
            class="w-5 h-5"
          />
          <UAvatar
            v-else
            :src="`https://images.markit.co.in/${brand.image}`"
            size="2xs"
          />
          <span class="truncate">
            {{ brand.name }}
          </span>
        </template>

        <template #option-empty="{ query }">
          <UButton
            size="xs"
            variant="ghost"
            block
            icon="i-heroicons-plus"
            :label="`Create '${query}'`"
            :disabled="!query?.trim()"
            @pointerdown.prevent.stop
            @mousedown.prevent.stop
            @click.prevent.stop="openCreateBrandModal(query)"
          />
        </template>
      </USelectMenu>
      </div>
    </UFormGroup>

    <!-- CATEGORY -->
    <UFormGroup label="Category" v-if="productInputs?.category">
      <div ref="categorySelectRef">
      <USelectMenu
        v-model="selectedRow"
        :options="categories"
        option-key="id"
        track-by="id"
        searchable
        option-attribute="name"
      >
        <template #label>
          <span v-if="selectedRow?.name">
            {{ selectedRow.name }}
          </span>
          <span v-else>Select</span>
        </template>

        <template #option-empty="{ query }">
          <UButton
            size="xs"
            variant="ghost"
            block
            icon="i-heroicons-plus"
            :label="`Create '${query}'`"
            :disabled="!query?.trim()"
            @pointerdown.prevent.stop
            @mousedown.prevent.stop
            @click.prevent.stop="openCreateCategoryModal(query)"
          />
        </template>
      </USelectMenu>
      </div>
    </UFormGroup>

    <!-- SUBCATEGORY -->
    <UFormGroup label="Sub-Category" v-if="productInputs?.subcategory">
      <div ref="subcategorySelectRef">
      <USelectMenu
        v-model="subselectedRow"
        :options="subcategories"
        option-key="id"
        track-by="id"
        searchable
        option-attribute="name"
      >
        <template #label>
          <span v-if="subselectedRow?.name">
            {{ subselectedRow.name }}
          </span>
          <span v-else>Select</span>
        </template>

        <template #option-empty="{ query }">
          <UButton
            size="xs"
            variant="ghost"
            block
            icon="i-heroicons-plus"
            :label="`Create '${query}'`"
            :disabled="!query?.trim()"
            @pointerdown.prevent.stop
            @mousedown.prevent.stop
            @click.prevent.stop="openCreateSubcategoryModal(query)"
          />
        </template>
      </USelectMenu>
      </div>
    </UFormGroup>

    <!-- COLLECTION -->
    <UFormGroup label="Collection">
      <USelectMenu
        v-model="collectionSelectedRow"
        :options="collections"
        option-key="id"
        track-by="id"
        searchable
        option-attribute="name"
      >
        <template #label>
          <span v-if="collectionSelectedRow?.name">
            {{ collectionSelectedRow.name }}
          </span>
          <span v-else>Select</span>
        </template>

        <template #option="{ option: collection }">
          <UIcon
            v-if="!collection.image"
            name="i-heroicons-squares-2x2"
            class="w-5 h-5"
          />
          <UAvatar
            v-else
            :src="`https://images.markit.co.in/${collection.image}`"
            size="2xs"
          />
          <span class="truncate">{{ collection.name }}</span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- DESCRIPTION -->
    <UFormGroup
      label="Description"
      class="md:col-span-2"
      v-if="productInputs?.description"
    >
      <UTextarea
        v-model="description"
        v-bind="descriptionAttrs"
        :rows="4"
        class="w-full"
      />
    </UFormGroup>
  </div>

  <AddProductQuickCreateBrandModal
    v-model="showBrandModal"
    :preset-name="pendingBrandName"
    @created="onBrandCreated"
  />

  <AddProductQuickCreateCategoryModal
    v-model="showCategoryModal"
    :preset-name="pendingCategoryName"
    @created="onCategoryCreated"
  />

  <AddProductQuickCreateSubcategoryModal
    v-model="showSubcategoryModal"
    :preset-name="pendingSubcategoryName"
    :preset-category-id="selectedRow?.id"
    :preset-category-name="selectedRow?.name"
    @created="onSubcategoryCreated"
  />
</template>
