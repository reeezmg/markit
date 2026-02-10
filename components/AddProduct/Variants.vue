<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';

const props = defineProps<{
    id?: string | null;
    editName?: string | null;
    editCode?: string | null;
    editQty?: number | null;
    editsPrice?: number | null;
    editpPrice?: number | null;
    editDiscount?: number | null;
    editdPrice?: number | null;
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
const items = ref<{ id: string; size: string | null; qty: number | undefined }[]>([]);
const id = ref(props.id);
const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');
const [qty, qtyAttrs] = defineField('qty');
const [sprice, spriceAttrs] = defineField('sprice');
const [pprice, ppriceAttrs] = defineField('pprice');
const [dprice, dpriceAttrs] = defineField('dprice');
const [discount, discountAttrs] = defineField('discount');

const variantInputs = ref(useAuth().session.value?.variantInputs)



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
  [id, items, name, code, qty, sprice, pprice, dprice, discount],
  ([newId, newItems, newName, newCode, newQty, newSPrice, newPPrice, newDPrice, newDiscount]) => {
    console.log('watching items',newId);

    // If newItems is empty, populate it with default value
        const updatedItems =
        newItems.length === 0 ||
        (newItems.length === 1 && (!newItems[0].size || newItems[0].size === ''))
            ? [{id: newItems[0]?.id , size: null, qty: newQty }]
            : newItems;

    emit('update', {
      ...(newId && { id: newId }),
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
      <UInput v-model="sprice" v-bind="spriceAttrs" type="number" placeholder="Enter selling price" step="0.01" />
    </UFormGroup>

    <!-- Purchase Price -->
    <UFormGroup label="Purchase Price" v-if="variantInputs?.pprice">
      <UInput v-model="pprice" v-bind="ppriceAttrs" type="number" placeholder="Enter purchase price" step="0.01" />
    </UFormGroup>

    <!-- Discount Price -->
   <UFormGroup 
    label="Discount Price" 
    v-if="variantInputs?.dprice" 
    :error="errors.dprice && errors.dprice"
  >
    <UInput
      v-model="dprice"
      v-bind="dpriceAttrs"
      type="number"
      step="0.01"
      @focus="isEditingDPrice = true; isEditingDiscount = false"
      @blur="isEditingDPrice = false; isdPriceChanged=true"
    />
  </UFormGroup>


    <!-- Discount % -->
    <UFormGroup label="Discount %" v-if="variantInputs?.discount">
      <UInput
      v-model="discount"
      type="number"
      step="0.01"
      @focus="isEditingDiscount = true; isEditingDPrice = false"
      @blur="isEditingDiscount = false"
    />
    </UFormGroup>



    

    <!-- Quantity (Full Width) -->
    <UFormGroup label="Quantity" required :error="errors.qty && errors.qty" class="md:col-span-2" v-if="variantInputs?.qty">
      <UInput v-model="qty" v-bind="qtyAttrs" type="number" placeholder="Enter quantity" :disabled="items.length > 1" />
    </UFormGroup>
  </div>

  <!-- Sizes (Full Width) -->
  <div class="w-full" v-if="variantInputs?.sizes">
    <template v-if="items[0]?.size !== null">
      <label class="block text-sm font-medium leading-6 dark:text-white mt-4">Items & Quantities</label>
      <div v-for="(item, index) in items" :key="index" class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
        <UInput v-model="item.size" type="text" placeholder="Size" class="w-full" />
        <UInput v-model.number="item.qty" type="number" placeholder="Quantity" class="w-full" />
        <button type="button" @click="removeItem(index)" class="w-full text-red-500 border border-red-500 rounded-md">
          Remove
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
</template>
