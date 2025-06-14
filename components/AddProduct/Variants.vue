<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';

const props = defineProps<{
    id?: string | null;
    editName?: string | null;
    editCode?: string | null;
    editQty?: number | null;
    editsPrice?: number | null;
    editpPrice?: number | null;
    editDiscount?: number | null;
    editdPrice?: number | null;
    editItems?: { size: string; qty: number }[] | null;
   
}>();

const emit = defineEmits(['update']);

const schema = z.object({
    name: z.string(),
    code: z.string().optional(),
    qty: z.number(),
    sprice: z.number().min(0, 'Price must be at least 0'),
    pprice: z.number().optional(),
    dprice: z.number().optional(),
    discount: z.number().optional(),
    items: z.array(
        z.object({
            size: z.string().min(1, 'Size is required'),
            qty: z.number().min(1, 'Quantity must be at least 1'),
        })
    ).optional(),
});

const { errors, defineField,resetForm: resetValidation } = useForm({
    validationSchema: toTypedSchema(schema),
});
const id = ref(props.id);
const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');
const [qty, qtyAttrs] = defineField('qty');
const [sprice, spriceAttrs] = defineField('sprice');
const [pprice, ppriceAttrs] = defineField('pprice');
const [dprice, dpriceAttrs] = defineField('dprice');
const [discount, discountAttrs] = defineField('discount');

// Initialize items with a deep copy of props.editItems
const items = ref<{ size: string; qty: number | undefined }[]>(
    props.editItems ? JSON.parse(JSON.stringify(props.editItems)) : []
);

const hasSizes = computed(() => {
    return items.value.length > 0 && items.value.some(item => item.size !== null);
});


const addItem = () => {
    // If we're adding the first size item and there's a null size item, remove it first
    if (!hasSizes.value && items.value.length > 0) {
        items.value = [];
    }
    items.value.push({ size: '', qty: undefined });
};

const removeItem = (index: number) => {
    items.value.splice(index, 1);
};

const resetForm = () => {
    name.value = '';
    code.value = '';
    qty.value = 0;
    sprice.value = 0;
    pprice.value = 0;
    dprice.value = 0;
    discount.value = 0;
    items.value = [];
    resetValidation(); 
};


watch(() => props.editName, (newName) => {
    name.value = newName ?? '';
}, { immediate: true });

watch(() => props.editCode, (newCode) => {
    code.value = newCode ?? '';
}, { immediate: true });

watch(() => props.editQty, (newQty) => {
    qty.value = newQty ?? 0;
}, { immediate: true });



watch(() => props.editsPrice, (newsPrice) => {
    sprice.value = newsPrice ?? 0;
}, { immediate: true });

watch(() => props.editpPrice, (newpPrice) => {
    pprice.value = newpPrice ?? 0;
}, { immediate: true });

watch(() => props.editItems, (newItems) => {
    items.value = newItems ? JSON.parse(JSON.stringify(newItems)) : [];
}, { immediate: true });

watch(() => props.editdPrice, (newdPrice) => {
    dprice.value = newdPrice ?? 0;
}, { immediate: true });

watch(() => props.editDiscount, (newDiscount) => {
    discount.value = newDiscount ?? 0;
}, { immediate: true });

watch([sprice, dprice], ([newSPrice, newDPrice], [oldSPrice, oldDPrice]) => {
    // Only calculate discount if dprice was actually changed by user input
    if (newDPrice !== oldDPrice && newDPrice !== undefined && newSPrice > 0) {
        const calculatedDiscount = ((newSPrice - newDPrice) / newSPrice) * 100;
        discount.value = parseFloat(calculatedDiscount.toFixed(2));
    }
});

watch([sprice, discount], ([newSPrice, newDiscount]) => {
    if (newDiscount !== undefined && newSPrice > 0) {
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
  }
}, { deep: true, immediate: true });



watch(
  [items, name, code, qty, sprice, pprice, dprice, discount],
  ([newItems, newName, newCode, newQty, newSPrice, newPPrice, newDPrice, newDiscount]) => {
    console.log('watching items', newItems);

    // If newItems is empty, populate it with default value
        const updatedItems =
        newItems.length === 0 ||
        (newItems.length === 1 && (!newItems[0].size || newItems[0].size === ''))
            ? [{ size: null, qty: newQty }]
            : newItems;

    emit('update', {
      ...(id.value && { id: id.value }),
      name: newName,
      code: newCode,
      qty: qty.value,
      sprice: newSPrice,
      pprice: newPPrice,
      dprice: newDPrice,
      discount: newDiscount,
      items: updatedItems,
    });
  },
  { deep: true, immediate: true }
);



defineExpose({ resetForm });
</script>

<template>
    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Variant Name" class="w-full">
            <UInput v-model="name" v-bind="nameAttrs" type="text" placeholder="Color/Design" />
        </UFormGroup>

        <UFormGroup label="Code" class="w-full">
            <UInput v-model="code" v-bind="codeAttrs" type="text" placeholder="Enter price" step="0.01" />
        </UFormGroup>
    </div>

    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Selling Price" required :error="errors.sprice && errors.sprice" class="w-full">
            <UInput v-model="sprice" v-bind="spriceAttrs" type="number" placeholder="Enter selling price" step="0.01" />
        </UFormGroup>

        <UFormGroup label="Purchase Price" class="w-full">
            <UInput v-model="pprice" v-bind="ppriceAttrs" type="number" placeholder="Enter purchase price" step="0.01" />
        </UFormGroup>
    </div>

    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Discount Price" class="w-full">
            <UInput v-model="dprice" v-bind="dpriceAttrs" type="number" placeholder="Enter discounted price" step="0.01" />
        </UFormGroup>

        <UFormGroup label="Discount %" class="w-full">
            <UInput v-model="discount" v-bind="discountAttrs" type="number" placeholder="Enter discount percentage" step="0.01" />
        </UFormGroup>
    </div>
    
    <UFormGroup label="Quantity" required :error="errors.qty && errors.qty" class="w-full mt-3">
        <UInput v-model="qty" v-bind="qtyAttrs" type="number" placeholder="Enter quantity" :disabled="hasSizes" />
    </UFormGroup>

    <div class="w-full">
        <template v-if="hasSizes">
            <label class="block text-sm font-medium leading-6 dark:text-white mt-4">Items & Quantities</label>
            <div v-for="(item, index) in items" :key="index" class="grid grid-cols-3 gap-2 mt-2">
                <UInput v-model="item.size" type="text" placeholder="Size" class="w-full" />
                <UInput v-model.number="item.qty" type="number" placeholder="Quantity" class="w-full" />
                <button type="button" @click="removeItem(index)" class="w-full text-red-500 border border-red-500 rounded-md">
                    Remove
                </button>
            </div>
        </template>
            <button type="button" @click="addItem" class="mt-2 w-full text-blue-500 py-2 border border-blue-500 rounded-md">
                Add Sizes
            </button>
 
    </div>
</template>