<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';
import { billingUnitOptions, normalizeBillingUnits } from '~/utils/billing-units';

const props = defineProps<{
    id?: string | null;
    editName?: string | null;
    editCode?: string | null;
    editQty?: number | null;
    editUnit?: string | null;
    editsPrice?: number | null;
    editpPrice?: number | null;
    editDiscount?: number | null;
    editdPrice?: number | null;
    editWeight?: number | null;
    editItems?: {id:string; size: string; qty: number }[] | null;

}>();


const emit = defineEmits(['update']);

const isEditingDPrice = ref(false);
const isEditingDiscount = ref(false);
const isdPriceChanged = ref(false);


const schema = z.object({
  name: z.string(),
  code: z.string().optional(),
  qty: z.number(),
  sprice: z.number().min(0, 'Price must be at least 0'),
  pprice: z.number().optional(),
  dprice: z.number().optional(),
  discount: z.number().optional(),
  weight: z.number().optional(),
  items: z.array(
    z.object({
      size: z.string().min(1, 'Size is required'),
      qty: z.number().min(1, 'Quantity must be at least 1'),
    })
  ).optional(),
}).refine((data) => {
  // if dprice is defined, ensure it is not greater than sprice
  if (data.dprice !== undefined && data.sprice !== undefined) {
    return data.dprice <= data.sprice;
  }
  return true;
}, {
  path: ['dprice'], // attach error to dprice field
  message: 'Discount price cannot be greater than selling price',
});


const { errors, defineField,resetForm: resetValidation } = useForm({
    validationSchema: toTypedSchema(schema),
});
const items = ref<{ id: string; size: string | null; qty: number | undefined; dimensionId?: string | null }[]>([]);
const id = ref(props.id);

// Product dimension presets (ShippingBox, type='product') for per-size linking.
const productDimensions = ref<any[]>([]);
const showSizeDimension = ref(false);   // gated by the store-settings toggle
onMounted(async () => {
    try {
        const res: any = await $fetch('/api/dimensions', { query: { type: 'product' } });
        productDimensions.value = res.dimensions || [];
    } catch { /* presets are optional */ }
    try {
        const flags: any = await $fetch('/api/product-inputs');
        showSizeDimension.value = !!flags.sizeDimension;
    } catch { /* default hidden */ }
});
const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');
const [qty, qtyAttrs] = defineField('qty');
const [sprice, spriceAttrs] = defineField('sprice');
const [pprice, ppriceAttrs] = defineField('pprice');
const [dprice, dpriceAttrs] = defineField('dprice');
const [discount, discountAttrs] = defineField('discount');
const [weight, weightAttrs] = defineField('weight');
const unit = ref('Nos');

const variantInputs = ref(useAuth().session.value?.variantInputs)
const availableUnits = computed(() => {
  const units = useAuth().session.value?.variantInputs?.unit
  return normalizeBillingUnits(units)
})

const showUnitSelect = computed(() => availableUnits.value.length > 1)
const defaultUnit = computed(() => availableUnits.value[0] || 'Nos')

const unitOptions = billingUnitOptions.map((unit) => ({ label: unit, value: unit }))

const unitMenuOptions = computed(() => {
  const units = normalizeBillingUnits(availableUnits.value)
  const filteredOptions = unitOptions.filter((option) => units.includes(option.value))
  const missingOptions = units
    .filter((unit) => !filteredOptions.some((option) => option.value === unit))
    .map((unit) => ({ label: unit, value: unit }))
  const currentUnit =
    unit.value && !filteredOptions.some((option) => option.value === unit.value)
      ? [{ label: unit.value, value: unit.value }]
      : []
  const options = [...filteredOptions, ...missingOptions, ...currentUnit]

  return options.length ? options : unitOptions
})

const lastEmittedPayload = ref('')


const addItem = () => {
    // If we're adding the first size item and there's a null size item, remove it first
    if (items.value.length === 1 && items.value[0].size === null) {
        items.value = [];
    }
    items.value.push({ id: uuidv4(), size: '', qty: undefined });
};

const removeItem = (index: number) => {
    if (items.value.length === 1) {
        // Instead of removing, reset the single item's size
        items.value[0].size = null;
    } else {
        items.value.splice(index, 1);
    }
};

const rootEl = ref<HTMLElement | null>(null);

const focusFirst = () => {
    const input = rootEl.value?.querySelector('input') as HTMLInputElement | null;
    input?.focus();
    input?.select?.();
};
const focusSizeAt = (index: number, field: 'size' | 'qty' = 'size') => {
    const row = rootEl.value?.querySelector(`[data-size-index="${index}"]`) as HTMLElement | null;
    if (!row) return;
    const inputs = row.querySelectorAll('input');
    const input = (field === 'size' ? inputs[0] : inputs[1]) as HTMLInputElement | undefined;
    input?.focus();
    input?.select?.();
};
const focusLastSize = () => focusSizeAt(items.value.length - 1, 'size');


const resetForm = () => {
    name.value = '';
    code.value = '';
    qty.value = 0;
    unit.value = defaultUnit.value;
    sprice.value = 0;
    pprice.value = 0;
    dprice.value = 0;
    discount.value = 0;
    weight.value = 0;
    items.value = [];
    resetValidation();
};


watch(() => props.id, (newId) => {
    id.value = newId ?? '';
}, { immediate: true });

watch(() => props.editName, (newName) => {
    name.value = newName ?? '';
}, { immediate: true });

watch(() => props.editCode, (newCode) => {
    code.value = newCode ?? '';
}, { immediate: true });

watch(() => props.editQty, (newQty) => {
    qty.value = newQty ?? 0;
}, { immediate: true });

watch(() => props.editUnit, (newUnit) => {
    unit.value = normalizeBillingUnits(newUnit ? [newUnit] : [])[0] || defaultUnit.value;
}, { immediate: true });

watch(defaultUnit, (newDefaultUnit) => {
  if (!props.editUnit) {
    unit.value = newDefaultUnit || 'Nos';
  }
}, { immediate: true });



watch(() => props.editsPrice, (newsPrice) => {
    sprice.value = newsPrice ?? 0;
}, { immediate: true });

watch(() => props.editpPrice, (newpPrice) => {
    pprice.value = newpPrice ?? 0;
}, { immediate: true });

watch(() => props.editdPrice, (newdPrice) => {
  dprice.value = newdPrice ?? 0;

  // If it has a value *different from sprice*, consider it user-changed
  if (newdPrice !== null && newdPrice !== undefined && newdPrice !== props.editsPrice) {
    isdPriceChanged.value = true;
  }
}, { immediate: true });

watch(() => props.editItems, (newItems) => {
  console.log('watching items', newItems);
    items.value = newItems ? JSON.parse(JSON.stringify(newItems)) : [];
}, { immediate: true });

watch(() => props.editdPrice, (newdPrice) => {
    dprice.value = newdPrice ?? 0;
}, { immediate: true });

watch(() => props.editDiscount, (newDiscount) => {
    discount.value = newDiscount ?? 0;
}, { immediate: true });

watch(() => props.editWeight, (newWeight) => {
    weight.value = newWeight ?? 0;
}, { immediate: true });



watch(sprice, (newSPrice)=> {
  if(newSPrice && !isdPriceChanged.value) {
    dprice.value = newSPrice;
  }
}, { immediate: true });

watch([sprice, dprice], ([newSPrice, newDPrice], [oldSPrice, oldDPrice]) => {
  if (isEditingDPrice.value && newSPrice > 0) {
    const calculatedDiscount = ((newSPrice - newDPrice) / newSPrice) * 100;
    discount.value = parseFloat(calculatedDiscount.toFixed(2));
  }
});

watch([sprice, discount], ([newSPrice, newDiscount], [oldSPrice, oldDiscount]) => {
  if (isEditingDiscount.value && newSPrice > 0) {
    const calculatedDPrice = newSPrice * (1 - (newDiscount / 100));
    dprice.value = parseFloat(calculatedDPrice.toFixed(2));
  }
});


watch(items, (newItems) => {
  if (
    newItems.length === 1 &&
    (newItems[0].size === null || newItems[0].size === undefined)
  ) {
    qty.value = newItems[0].qty || 0;
  }else{
    qty.value = newItems.reduce((total, item) => total + (item.qty || 0), 0);
  }
}, { deep: true, immediate: true });


watch(
  [id, items, name, code, qty, sprice, pprice, dprice, discount, weight],
  ([newId, newItems, newName, newCode, newQty, newSPrice, newPPrice, newDPrice, newDiscount, newWeight]) => {
    console.log('watching items',newId);

    // If newItems is empty, populate it with default value.
    // NOTE: only treat an explicit `null` size as "no-sizes mode". An empty
    // string means the user just clicked "Add Sizes" and hasn't typed the
    // size value yet — we must preserve it so the row stays rendered.
        const updatedItems =
        newItems.length === 0 ||
        (newItems.length === 1 && newItems[0].size === null)
            ? [{id: newItems[0]?.id , size: null, qty: newQty }]
            : newItems;

    const payload = {
      ...(newId && { id: newId }),
      name: newName,
      code: newCode,
      qty: qty.value,
      unit: unit.value,
      sprice: newSPrice,
      pprice: newPPrice,
      dprice: newDPrice,
      discount: newDiscount,
      weight: newWeight,
      items: updatedItems,
    };

    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastEmittedPayload.value) return;
    lastEmittedPayload.value = payloadKey;
    emit('update', payload);
  },
  { deep: true, immediate: true }
);



// Unit select is wrapped in <div ref="unitSelectRef"> so the parent can do
// `wrapper.querySelector('button').focus()/click()` to close the menu —
// mirrors the pattern in pages/erp/billing.vue (movecatgeory).
const unitSelectRef = ref<HTMLElement | null>(null);
const getSelectWrapper = (): HTMLElement | null => unitSelectRef.value ?? null;

// After a user picks a unit, return focus to the trigger button. Guarded by
// an activeElement-inside-listbox check so programmatic unit changes (e.g.
// prop hydration / resetForm) don't steal focus.
watch(unit, (val) => {
  if (!val) return;
  if (!(document.activeElement as HTMLElement | null)?.closest('[role="listbox"]')) return;
  nextTick(() => {
    (unitSelectRef.value?.querySelector('button') as HTMLElement | null)?.focus();
  });
});

defineExpose({ resetForm, addItem, removeItem, focusFirst, focusSizeAt, focusLastSize, items, getSelectWrapper });
</script>
<template>
  <div ref="rootEl" data-variant-root>
  <div class="grid grid-cols-2 gap-4 mb-3">
    <!-- Variant Name -->
    <UFormGroup label="Variant Name" v-if="variantInputs?.name">
      <UInput v-model="name" v-bind="nameAttrs" type="text" placeholder="Color/Design" />
    </UFormGroup>

    <!-- Code -->
    <UFormGroup label="Code" v-if="variantInputs?.code">
      <UInput v-model="code" v-bind="codeAttrs" type="text" placeholder="Enter code" />
    </UFormGroup>

    <!-- Selling Price -->
    <UFormGroup label="Selling Price" required :error="errors.sprice && errors.sprice" v-if="variantInputs?.sprice">
      <UInput v-model.number="sprice" v-bind="spriceAttrs" type="text" inputmode="decimal" placeholder="Enter selling price" />
    </UFormGroup>

    <!-- Purchase Price -->
    <UFormGroup label="Purchase Price" v-if="variantInputs?.pprice">
      <UInput v-model.number="pprice" v-bind="ppriceAttrs" type="text" inputmode="decimal" placeholder="Enter purchase price" />
    </UFormGroup>

    <!-- Discount Price -->
   <UFormGroup
    label="Discount Price"
    v-if="variantInputs?.dprice"
    :error="errors.dprice && errors.dprice"
  >
    <UInput
      v-model.number="dprice"
      v-bind="dpriceAttrs"
      type="text"
      inputmode="decimal"
      @focus="isEditingDPrice = true; isEditingDiscount = false"
      @blur="isEditingDPrice = false; isdPriceChanged=true"
    />
  </UFormGroup>


    <!-- Discount % -->
    <UFormGroup label="Discount %" v-if="variantInputs?.discount">
      <UInput
      v-model.number="discount"
      type="text"
      inputmode="decimal"
      @focus="isEditingDiscount = true; isEditingDPrice = false"
      @blur="isEditingDiscount = false"
    />
    </UFormGroup>



    

    <!-- Weight (for shipping) -->
    <UFormGroup label="Weight (kg)" hint="Used for shipping rates">
      <UInput v-model.number="weight" v-bind="weightAttrs" type="text" inputmode="decimal" placeholder="e.g. 0.5" />
    </UFormGroup>

    <!-- Quantity (Full Width) -->
    <UFormGroup label="Quantity" required :error="errors.qty && errors.qty" class="md:col-span-2" v-if="variantInputs?.qty">
      <div class="flex gap-2">
        <div ref="unitSelectRef" v-if="showUnitSelect" class="w-36 shrink-0">
        <USelectMenu
          v-model="unit"
          :options="unitMenuOptions"
          value-attribute="value"
          option-attribute="label"
          searchable
          creatable
          placeholder="Unit"
          class="w-full"
        />
        </div>
        <UInput
          v-model.number="qty"
          v-bind="qtyAttrs"
          type="text"
          inputmode="numeric"
          placeholder="Enter quantity"
          :disabled="items.length > 1"
          :class="showUnitSelect ? 'flex-1' : 'w-full'"
        />
      </div>
    </UFormGroup>
  </div>

  <!-- Units / Sizes (Full Width) -->
  <div class="w-full" v-if="variantInputs?.sizes">
    <template v-if="items[0]?.size !== null">
      <label class="block text-sm font-medium leading-6 dark:text-white mt-4">Items & Quantities</label>
      <div v-for="(item, index) in items" :key="index" :data-size-index="index" class="grid grid-cols-1 gap-2 mt-2" :class="showSizeDimension ? 'md:grid-cols-4' : 'md:grid-cols-3'">
        <UInput v-model="item.size" :data-size-field="'size'" type="text" placeholder="Size" class="w-full" />
        <UInput v-model.number="item.qty" :data-size-field="'qty'" type="text" inputmode="numeric" placeholder="Quantity" class="w-full" />
        <USelectMenu
          v-if="showSizeDimension"
          v-model="item.dimensionId"
          :options="productDimensions"
          value-attribute="id"
          option-attribute="name"
          searchable
          placeholder="Dimension"
          class="w-full"
        >
          <template #option-empty>
            <span class="text-xs text-gray-400">No product dimensions yet</span>
          </template>
        </USelectMenu>
        <button type="button" @click="removeItem(index)" class="w-full text-red-500 border border-red-500 rounded-md">
          Delete
        </button>
      </div>
    </template>

    <!-- Add Sizes Button (Full Width) -->
    <button
      type="button"
      @click="addItem"
      class="mt-2 w-full text-blue-500 py-2 border border-blue-500 rounded-md"
    >
      Add Sizes
    </button>
  </div>
  </div>
</template>
