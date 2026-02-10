<script setup lang="ts">
import * as z from 'zod'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'

import {
  useFindManyCategory,
  useFindManySubcategory,
  useFindManyBrand
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
    companyId: useAuth().session.value?.companyId,
    ...(selectedRow.value?.id && {
      categoryId: selectedRow.value.id,
    }),
  },
}))

const { data: brands } =
  useFindManyBrand(brandArgs)

/* -----------------------------
RESET FORM
------------------------------ */
const resetForm = () => {
  name.value = ''
  description.value = ''
  selectedRow.value = {}
  subselectedRow.value = {}
  brandSelectedRow.value = {}
  resetValidation()
}

defineExpose({ resetForm })

/* -----------------------------
WATCHERS
------------------------------ */

/* Reset sub + brand when category changes */
watch(subcategories, () => {
  subselectedRow.value = {}
})

watch(brands, () => {
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

/* Emit updates */
watch(
  [
    name,
    description,
    selectedRow,
    subselectedRow,
    brandSelectedRow,
  ],
  ([
    newName,
    newDesc,
    newCat,
    newSub,
    newBrand,
  ]) => {
    emit('update', {
      name: newName,
      description: newDesc,
      category: newCat,
      subcategory: newSub?.id,
      brand: newBrand?.id,
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
      </USelectMenu>
    </UFormGroup>

    <!-- CATEGORY -->
    <UFormGroup label="Category" v-if="productInputs?.category">
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
      </USelectMenu>
    </UFormGroup>

    <!-- SUBCATEGORY -->
    <UFormGroup label="Sub-Category" v-if="productInputs?.subcategory">
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
</template>
