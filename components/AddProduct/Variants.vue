<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';

const props = defineProps<{
    editName?: string | null;
    editCode?: string | null;
    editQty?: number | null;
    editsPrice?: number | null;
    editpPrice?: number | null;
    editSizes?: { size: string; qty: number }[] | null;
   
}>();

const emit = defineEmits(['update']);

const schema = z.object({
    name: z.string().min(2, 'Variant name is required'),
    code: z.string().optional(),
    qty: z.number().min(1, 'Quantity must be at least 1'),
    sprice: z.number().min(0, 'Price must be at least 0'),
    pprice: z.number().optional(),
    sizes: z.array(
        z.object({
            size: z.string().min(1, 'Size is required'),
            qty: z.number().min(1, 'Quantity must be at least 1'),
        })
    ).optional(),
});

const { errors, defineField,resetForm: resetValidation } = useForm({
    validationSchema: toTypedSchema(schema),
});

const [name, nameAttrs] = defineField('name');
const [code, codeAttrs] = defineField('code');
const [qty, qtyAttrs] = defineField('qty');
const [sprice, spriceAttrs] = defineField('sprice');
const [pprice, ppriceAttrs] = defineField('pprice');

// Initialize sizes with a deep copy of props.editSizes
const sizes = ref<{ size: string; qty: number | undefined }[]>(
    props.editSizes ? JSON.parse(JSON.stringify(props.editSizes)) : []
);

const addSize = () => {
    sizes.value.push({ size: '', qty: undefined });
};

const removeSize = (index: number) => {
    sizes.value.splice(index, 1);
};

const resetForm = () => {
    name.value = '';
    code.value = '';
    qty.value = 0;
    sprice.value = 0;
    pprice.value = 0;
    sizes.value = [];
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

watch(() => props.editSizes, (newSizes) => {
    sizes.value = newSizes ? JSON.parse(JSON.stringify(newSizes)) : [];
}, { immediate: true });

watchEffect(() => {
    if (sizes.value.length > 0) {
        qty.value = sizes.value.reduce((total, size) => total + (size.qty || 0), 0);
    }
    
    emit('update', {
        name: name.value,
        code: code.value,
        qty: qty.value,
        sprice: sprice.value,
        pprice: pprice.value,
        sizes: sizes.value,
       
    });
});
defineExpose({ resetForm });
</script>

<template>
    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Variant Name" required :error="errors.name && errors.name" class="w-full">
            <UInput v-model="name" v-bind="nameAttrs" type="text" placeholder="Color/Design" />
        </UFormGroup>

        <UFormGroup label="Code" class="w-full">
            <UInput v-model="code" v-bind="codeAttrs" type="text" placeholder="Enter price" step="0.01" />
        </UFormGroup>
    </div>

    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Selling Price" required :error="errors.sprice && errors.sprice"  class="w-full">
            <UInput v-model="sprice" v-bind="spriceAttrs" type="number" placeholder="Enter selling price" step="0.01" />
        </UFormGroup>

        <UFormGroup label="Purchase Price" class="w-full">
            <UInput v-model="pprice" v-bind="ppriceAttrs" type="number" placeholder="Enter purchase price" step="0.01" />
        </UFormGroup>
    </div> 

    <div class="w-full">
        <label class="block text-sm font-medium leading-6 dark:text-white mt-4">Sizes & Quantities</label>
        <div v-for="(size, index) in sizes" :key="index" class="grid grid-cols-3 gap-2 mt-2">
            <UInput v-model="size.size" type="text" placeholder="Size" class="w-full" />
            <UInput v-model.number="size.qty" type="number" placeholder="Quantity" class="w-full" />
            <button type="button" @click="removeSize(index)" class="w-full text-red-500 border border-red-500 rounded-md">
                Remove
            </button>
        </div>
        <button type="button" @click="addSize" class="mt-2 w-full text-blue-500 py-2 border border-blue-500 rounded-md">
            Add Size
        </button>
    </div>

    <UFormGroup label="Quantity" required :error="errors.qty && errors.qty" class="w-full mt-3">
            <UInput v-model="qty" v-bind="qtyAttrs" type="number" placeholder="Enter quantity" :disabled="sizes.length > 0" />
    </UFormGroup>

</template>