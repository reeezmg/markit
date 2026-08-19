<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import { useUpdateCompany } from '~/lib/hooks/company';

import { billingUnitOptions, billingUnitSelectOptions, normalizeBillingUnits } from '~/utils/billing-units'
import { normalizeSizeLabels, sizeLabelSuggestions } from '~/utils/size-labels'
import type { ProductCustomFieldDef, ProductCustomFieldScope } from '~/composables/useProductCustomFields'

definePageMeta({ auth: true })

const toast = useToast()
const useAuth = () => useNuxtApp().$auth
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })
const { refresh: refreshCustomFields } = useProductCustomFields()

/* ============================================================
   PRODUCT & VARIANT INPUTS — which built-in fields are visible,
   the billing units, and the size labels. Moved here from
   Settings → Store so everything product-form related is in one place.
   ============================================================ */

const isInputsChanged = ref(false)
const isUpdatingInputs = ref(false)

const productInputs = reactive([
  { key: 'name', label: 'Name', value: useAuth().session.value?.productInputs?.name },
  { key: 'brand', label: 'Brand', value: useAuth().session.value?.productInputs?.brand },
  { key: 'category', label: 'Category', value: useAuth().session.value?.productInputs?.category },
  { key: 'subcategory', label: 'Subcategory', value: useAuth().session.value?.productInputs?.subcategory },
  { key: 'description', label: 'Description', value: useAuth().session.value?.productInputs?.description },
])

const variantInputs = reactive([
  { key: 'name', label: 'Variant Name', value: useAuth().session.value?.variantInputs?.name },
  { key: 'code', label: 'Code', value: useAuth().session.value?.variantInputs?.code },
  { key: 'sprice', label: 'Selling Price', value: useAuth().session.value?.variantInputs?.sprice },
  { key: 'pprice', label: 'Purchase Price', value: useAuth().session.value?.variantInputs?.pprice },
  { key: 'dprice', label: 'Discount Price', value: useAuth().session.value?.variantInputs?.dprice },
  { key: 'discount', label: 'Discount', value: useAuth().session.value?.variantInputs?.discount },
  { key: 'qty', label: 'Quantity', value: useAuth().session.value?.variantInputs?.qty },
  { key: 'sizes', label: 'Sizes', value: useAuth().session.value?.variantInputs?.sizes },
  { key: 'images', label: 'Images', value: useAuth().session.value?.variantInputs?.images },
  { key: 'button', label: 'Button', value: useAuth().session.value?.variantInputs?.button },
])

// Dimension input toggles (product-level + size-level). Persisted via the raw
// /api/product-inputs endpoint (product_inputs.dimension / variant_inputs.sizeDimension),
// independent of the ZenStack company update below.
const productDimensionFlag = ref(false)
const sizeDimensionFlag = ref(false)
const savedProductDimensionFlag = ref(false)
const savedSizeDimensionFlag = ref(false)
async function loadDimensionFlags() {
  try {
    const res: any = await $fetch('/api/product-inputs')
    productDimensionFlag.value = savedProductDimensionFlag.value = !!res.productDimension
    sizeDimensionFlag.value = savedSizeDimensionFlag.value = !!res.sizeDimension
  } catch { /* ignore */ }
}
onMounted(loadDimensionFlags)
watch([productDimensionFlag, sizeDimensionFlag], () => {
  if (productDimensionFlag.value !== savedProductDimensionFlag.value ||
      sizeDimensionFlag.value !== savedSizeDimensionFlag.value) {
    isInputsChanged.value = true
  }
})

const selectedBillingUnits = ref<string[]>(
  normalizeBillingUnits(useAuth().session.value?.variantInputs?.unit)
)

const savedBillingUnits = computed(() =>
  billingUnitOptions.filter((unit) => selectedBillingUnits.value.includes(unit))
)

const onBillingUnitsChange = (units: string[] | string | null | undefined) => {
  if (!units) {
    selectedBillingUnits.value = ['Nos']
    return
  }

  const next = Array.isArray(units) ? units : [units]
  if (next.includes('All')) {
    selectedBillingUnits.value = [...billingUnitOptions]
    return
  }

  const normalized = billingUnitOptions.filter((unit) => next.includes(unit))
  selectedBillingUnits.value = normalized.length ? normalized : ['Nos']
}

// Size labels — the same idea as billing units, but for what `Item.size` is
// CALLED ("Size" / "Shade" / "Thickness"). Free text: the select is creatable,
// so the suggestion list is only a starting point, never a whitelist.
const selectedSizeLabels = ref<string[]>(
  normalizeSizeLabels(useAuth().session.value?.variantInputs?.sizeLabels)
)

const savedSizeLabels = computed(() => normalizeSizeLabels(selectedSizeLabels.value))

const onSizeLabelsChange = (labels: string[] | string | null | undefined) => {
  selectedSizeLabels.value = normalizeSizeLabels(labels)
}

watch(productInputs, (newInputs) => {
  isInputsChanged.value = newInputs.some(input => input.value !== useAuth().session.value?.productInputs?.[input.key])
}, { deep: true, immediate: true })
watch(variantInputs, (newInputs) => {
  isInputsChanged.value = isInputsChanged.value || newInputs.some(input => input.value !== useAuth().session.value?.variantInputs?.[input.key])
}, { deep: true, immediate: true })

watch(selectedBillingUnits, (newUnits) => {
  const currentUnits = normalizeBillingUnits(useAuth().session.value?.variantInputs?.unit)
  isInputsChanged.value =
    isInputsChanged.value ||
    newUnits.length !== currentUnits.length ||
    newUnits.some((unit) => !currentUnits.includes(unit))
}, { deep: true, immediate: true })

watch(selectedSizeLabels, (newLabels) => {
  const currentLabels = normalizeSizeLabels(useAuth().session.value?.variantInputs?.sizeLabels)
  isInputsChanged.value =
    isInputsChanged.value ||
    newLabels.length !== currentLabels.length ||
    newLabels.some((label) => !currentLabels.includes(label))
}, { deep: true, immediate: true })

const onInputChange = async () => {
  isUpdatingInputs.value = true
  try {
    if (!navigator.onLine) {
      throw createError({ statusCode: 0, statusMessage: 'No internet connection' })
    }
    const productinputData = Object.fromEntries(productInputs.map(input => [input.key, input.value]))
    const variantinputData = {
      ...Object.fromEntries(variantInputs.map(input => [input.key, input.value])),
      unit: savedBillingUnits.value,
      sizeLabels: savedSizeLabels.value,
    }

    await UpdateCompany.mutateAsync({
      where: { id: useAuth().session.value?.companyId },
      data: {
        productinput: { update: productinputData },
        variantinput: { update: variantinputData },
      },
    })
    await updateSession(productinputData, variantinputData)
    // Dimension toggles are stored separately (raw endpoint) to avoid a ZenStack regen.
    await $fetch('/api/product-inputs', {
      method: 'POST',
      body: { productDimension: productDimensionFlag.value, sizeDimension: sizeDimensionFlag.value },
    })
    savedProductDimensionFlag.value = productDimensionFlag.value
    savedSizeDimensionFlag.value = sizeDimensionFlag.value
    isInputsChanged.value = false
    toast.add({ title: 'Product and Variant inputs updated', icon: 'i-heroicons-check-circle' })
  } catch (error: any) {
    toast.add({ title: 'Error updating Product and Variant inputs', description: error?.statusMessage, color: 'red', icon: 'i-heroicons-x-circle' })
  } finally {
    isUpdatingInputs.value = false
  }
}

type DraftField = ProductCustomFieldDef & { newOption: string }

const typeOptions = [
  { label: 'Text input', value: 'TEXT' },
  { label: 'Select (dropdown)', value: 'SELECT' },
]

const sections: { scope: ProductCustomFieldScope; title: string; description: string }[] = [
  {
    scope: 'PRODUCT',
    title: 'Create fields',
    description: 'Extra inputs shown in the Create section of Add / Edit product — saved once per product.',
  },
  {
    scope: 'VARIANT',
    title: 'Variant fields',
    description: 'Extra inputs shown on every variant block — saved separately for each variant.',
  },
]

const fields = ref<DraftField[]>([])
const isLoading = ref(true)
const isSaving = ref(false)
const migrationPending = ref(false)

const fieldsFor = (scope: ProductCustomFieldScope) =>
  computed(() => fields.value.filter((field) => field.scope === scope))

const productDrafts = fieldsFor('PRODUCT')
const variantDrafts = fieldsFor('VARIANT')

const toDraft = (field: ProductCustomFieldDef): DraftField => ({ ...field, newOption: '' })

const loadFields = async () => {
  isLoading.value = true
  try {
    const res: any = await $fetch('/api/product-custom-fields')
    migrationPending.value = !!res?.migrationPending
    fields.value = (res?.fields || []).map(toDraft)
  } catch (error: any) {
    toast.add({
      title: 'Could not load custom fields',
      description: error?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isLoading.value = false
  }
}

onMounted(loadFields)

const addField = (scope: ProductCustomFieldScope) => {
  fields.value.push({
    id: uuidv4(),
    scope,
    key: '',
    label: '',
    type: 'TEXT',
    options: [],
    required: false,
    active: true,
    sortOrder: fields.value.filter((field) => field.scope === scope).length,
    newOption: '',
  })
}

const removeField = (id: string) => {
  fields.value = fields.value.filter((field) => field.id !== id)
}

// Move within the field's own scope — the two sections are edited independently
// but live in one flat array.
const moveField = (field: DraftField, direction: -1 | 1) => {
  const siblings = fields.value.filter((f) => f.scope === field.scope)
  const position = siblings.indexOf(field)
  const target = position + direction
  if (target < 0 || target >= siblings.length) return

  const fromIndex = fields.value.indexOf(siblings[position])
  const toIndex = fields.value.indexOf(siblings[target])
  const next = [...fields.value]
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, field)
  fields.value = next
}

const addOption = (field: DraftField) => {
  const value = (field.newOption || '').trim()
  if (!value) return
  if (!field.options.includes(value)) field.options.push(value)
  field.newOption = ''
}

const removeOption = (field: DraftField, index: number) => {
  field.options.splice(index, 1)
}

const validationError = computed(() => {
  for (const field of fields.value) {
    if (!field.label.trim()) return 'Every custom field needs a label.'
    if (field.type === 'SELECT' && !field.options.filter(Boolean).length) {
      return `"${field.label.trim() || 'Untitled field'}" is a select input — add at least one option.`
    }
  }
  return ''
})

const saveFields = async () => {
  if (validationError.value) {
    toast.add({ title: validationError.value, color: 'red' })
    return
  }
  isSaving.value = true
  try {
    const res: any = await $fetch('/api/product-custom-fields', {
      method: 'POST',
      body: {
        fields: fields.value.map((field) => ({
          id: field.id,
          scope: field.scope,
          key: field.key || undefined,
          label: field.label.trim(),
          type: field.type,
          options: field.type === 'SELECT' ? field.options : [],
          required: field.required,
          active: field.active,
        })),
      },
    })
    migrationPending.value = false
    fields.value = (res?.fields || []).map(toDraft)
    // Product forms read from the shared cache — pull the new definitions in.
    await refreshCustomFields()
    toast.add({ title: 'Product inputs saved', icon: 'i-heroicons-check-circle' })
  } catch (error: any) {
    toast.add({
      title: 'Could not save product inputs',
      description: error?.statusMessage || error?.data?.statusMessage || error?.message,
      color: 'red',
      icon: 'i-heroicons-x-circle',
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Product inputs</h1>
      <p class="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
        Everything that shapes the Add / Edit product form — which built-in fields show,
        the units and size labels available, and your own custom inputs.
        Each section below saves on its own.
      </p>
    </div>

    <!-- ========== PRODUCT & VARIANT INPUTS ========== -->
    <div class="mb-8 pb-8 border-b-2 border-gray-300 dark:border-gray-600">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Product &amp; Variant Inputs</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose which fields are visible when adding products and variants</p>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Product Inputs</h3>
        <div class="grid grid-cols-2 gap-4">
          <div
            v-for="input in productInputs"
            :key="input.key"
            class="flex items-center justify-between border px-3 py-2 rounded-md"
          >
            <label class="text-sm font-medium">{{ input.label }}</label>
            <UCheckbox v-model="input.value" />
          </div>
          <div class="flex items-center justify-between border px-3 py-2 rounded-md">
            <label class="text-sm font-medium">Product Dimension</label>
            <UCheckbox v-model="productDimensionFlag" />
          </div>
        </div>
      </div>

      <div class="mb-6">
        <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Variant Inputs</h3>
        <div class="grid grid-cols-2 gap-4">
          <div
            v-for="input in variantInputs"
            :key="input.key"
            class="flex items-center justify-between border px-3 py-2 rounded-md"
          >
            <label class="text-sm font-medium">{{ input.label }}</label>
            <UCheckbox v-model="input.value" />
          </div>
          <div class="flex items-center justify-between border px-3 py-2 rounded-md">
            <label class="text-sm font-medium">Size Dimension</label>
            <UCheckbox v-model="sizeDimensionFlag" />
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="mb-3">
            <div class="text-sm font-semibold text-gray-900 dark:text-white">Units used in software</div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              Select the units that should be available while billing and editing products. `Nos` stays as the default when only one unit is chosen.
            </div>
          </div>

          <div class="space-y-3">
            <USelectMenu
              class="w-full min-w-0"
              :model-value="selectedBillingUnits"
              @update:modelValue="onBillingUnitsChange"
              :options="billingUnitSelectOptions"
              multiple
              searchable
              placeholder="Select units"
            >
              <template #label>
                <span v-if="selectedBillingUnits.length">{{ selectedBillingUnits.join(', ') }}</span>
                <span v-else class="text-gray-400">Select units</span>
              </template>
            </USelectMenu>

            <div class="text-xs text-gray-500 dark:text-gray-400">
              Use <span class="font-medium text-gray-700 dark:text-gray-200">All</span> to enable every unit, or select just <span class="font-medium text-gray-700 dark:text-gray-200">Nos</span> if you want a single unit everywhere.
            </div>
          </div>
        </div>

        <!-- Size labels — what the per-size field is CALLED on the variant form -->
        <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="mb-3">
            <div class="text-sm font-semibold text-gray-900 dark:text-white">Size labels</div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              What the per-size field is called on the product form, barcode labels and receipts — <span class="font-medium text-gray-700 dark:text-gray-200">Size</span>, <span class="font-medium text-gray-700 dark:text-gray-200">Shade</span>, <span class="font-medium text-gray-700 dark:text-gray-200">Thickness</span>, anything. Type your own and press enter to add it.
            </div>
          </div>

          <div class="space-y-3">
            <USelectMenu
              class="w-full min-w-0"
              :model-value="selectedSizeLabels"
              @update:modelValue="onSizeLabelsChange"
              :options="sizeLabelSuggestions"
              multiple
              searchable
              creatable
              placeholder="Select size labels"
            >
              <template #label>
                <span v-if="selectedSizeLabels.length">{{ selectedSizeLabels.join(', ') }}</span>
                <span v-else class="text-gray-400">Select size labels</span>
              </template>
            </USelectMenu>

            <div class="text-xs text-gray-500 dark:text-gray-400">
              Pick <span class="font-medium text-gray-700 dark:text-gray-200">one</span> label and the product form hides the selector and applies it everywhere automatically. Pick <span class="font-medium text-gray-700 dark:text-gray-200">two or more</span> and each variant gets a dropdown to choose from.
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 flex w-full justify-end">
        <UButton
          @click="onInputChange"
          label="Save Inputs"
          :loading="isUpdatingInputs"
          :disabled="!isInputsChanged"
        />
      </div>
    </div>

    <!-- ========== CUSTOM FIELDS ========== -->
    <div class="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Custom fields</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Your own extra inputs, on top of the built-in ones above. Create fields are saved once per
          product; variant fields are filled in separately for every variant.
        </p>
      </div>
      <UButton
        icon="i-heroicons-check"
        class="self-start whitespace-nowrap"
        :loading="isSaving"
        :disabled="isLoading"
        @click="saveFields"
      >
        Save custom fields
      </UButton>
    </div>

    <UAlert
      v-if="migrationPending"
      class="mb-6"
      color="orange"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Database migration not applied"
      description="Run prisma/migrations/20260810120000_add_product_custom_fields/migration.sql before saving — the product_custom_fields table does not exist yet."
    />

    <div v-if="isLoading" class="flex items-center justify-center py-10">
      <UIcon name="i-heroicons-arrow-path-20-solid" class="h-5 w-5 animate-spin text-gray-500" />
    </div>

    <div v-else class="space-y-5">
      <UCard v-for="section in sections" :key="section.scope">
        <div class="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ section.title }}</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ section.description }}</p>
          </div>
          <UButton icon="i-heroicons-plus" variant="soft" @click="addField(section.scope)">
            Add field
          </UButton>
        </div>

        <p
          v-if="!(section.scope === 'PRODUCT' ? productDrafts : variantDrafts).length"
          class="text-sm text-gray-500 dark:text-gray-400"
        >
          No custom fields yet.
        </p>

        <div class="space-y-4">
          <div
            v-for="(field, index) in (section.scope === 'PRODUCT' ? productDrafts : variantDrafts)"
            :key="field.id"
            class="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
          >
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <UFormGroup label="Label" :ui="{ container: 'mt-1' }">
                <UInput v-model="field.label" placeholder="e.g. Fabric" />
              </UFormGroup>

              <UFormGroup label="Input type" :ui="{ container: 'mt-1' }">
                <USelectMenu
                  v-model="field.type"
                  :options="typeOptions"
                  option-attribute="label"
                  value-attribute="value"
                />
              </UFormGroup>

              <div class="flex items-end gap-3">
                <label class="flex flex-1 items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                  Required
                  <UToggle v-model="field.required" />
                </label>
                <label class="flex flex-1 items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
                  Active
                  <UToggle v-model="field.active" />
                </label>
              </div>

              <div class="flex items-end justify-end gap-1">
                <UButton
                  icon="i-heroicons-arrow-up"
                  color="gray"
                  variant="ghost"
                  square
                  :disabled="index === 0"
                  @click="moveField(field, -1)"
                />
                <UButton
                  icon="i-heroicons-arrow-down"
                  color="gray"
                  variant="ghost"
                  square
                  :disabled="index === (section.scope === 'PRODUCT' ? productDrafts : variantDrafts).length - 1"
                  @click="moveField(field, 1)"
                />
                <UButton
                  icon="i-heroicons-trash"
                  color="red"
                  variant="ghost"
                  square
                  @click="removeField(field.id)"
                />
              </div>
            </div>

            <!-- Options editor — only meaningful for a select input -->
            <div v-if="field.type === 'SELECT'" class="mt-4 rounded-md border border-gray-200 p-4 dark:border-gray-800">
              <p class="text-sm font-medium text-gray-900 dark:text-white">Options</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                These are the choices shown in the dropdown on the product form.
              </p>
              <div class="mt-3 flex flex-col gap-2">
                <div v-for="(option, optionIndex) in field.options" :key="optionIndex" class="flex items-center gap-2">
                  <UInput v-model="field.options[optionIndex]" class="flex-1" />
                  <UButton
                    icon="i-heroicons-trash"
                    color="red"
                    variant="ghost"
                    square
                    @click="removeOption(field, optionIndex)"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="field.newOption"
                    placeholder="Add an option"
                    class="flex-1"
                    @keyup.enter="addOption(field)"
                  />
                  <UButton icon="i-heroicons-plus" @click="addOption(field)">Add</UButton>
                </div>
              </div>
            </div>

            <p v-if="field.key" class="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Stored as <code>{{ field.key }}</code> — renaming the label keeps values already saved on products.
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </UDashboardPanelContent>
</template>
