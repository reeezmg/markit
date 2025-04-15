<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { useFindManyCategory,useFindManySubcategory } from '~/lib/hooks';
const useAuth = () => useNuxtApp().$auth;
const props = defineProps<{
    editName?: string | null;
    editBrand?: string | null;
    editDescription?: string | null;
    editCategory?: any;
    editSubcategory?: any;
   
}>();

const emit = defineEmits(['update']);


const schemas = z.object({
    name: z.string().min(2),
    brand: z.string().optional(),
    category: z.string().optional(),
    subcategory: z.string().optional(),
    description: z.string().optional(),
});

const { errors, defineField,resetForm: resetValidation } = useForm({
    validationSchema: toTypedSchema(schemas),
});
const [name, nameAttrs] = defineField('name');
const [brand, brandAttrs] = defineField('brand');
const [description, descriptionAttrs] = defineField('description');
const selectedRow = ref<any>({});
const subselectedRow = ref<any>({});


const {
    data: categories,
} = useFindManyCategory({where:{companyId:useAuth().session.value?.companyId}});

const subArgs = computed(() => ({
    where: {
        companyId: useAuth().session.value?.companyId,
        ...(selectedRow.value?.id && { categoryId: selectedRow.value.id })
    }
}));

const { data: subcategories } = useFindManySubcategory(subArgs);

const resetForm = () => {
    name.value = '';
    brand.value = '';
    description.value = '';
    selectedRow.value = {};
    resetValidation()
};

defineExpose({ resetForm });

watch(subcategories, (newsubcategories) => {
    subselectedRow.value = {};
});

watch(() => props.editName, (newName) => {
    name.value = newName ?? '';
}, { immediate: true });

watch(() => props.editBrand, (newBrand) => {
    brand.value = newBrand ?? '';
}, { immediate: true });

watch(() => props.editDescription, (newDescription) => {
    description.value = newDescription ?? '';
}, { immediate: true });

watch(() => props.editCategory, (newCategory) => {
    if (newCategory && categories.value?.length) {
         selectedRow.value = categories.value.find(cat => cat.id === newCategory);
     
    } else {
        selectedRow.value = {};
    }
}, { immediate: true });

watch(
    [() => props.editSubcategory, subcategories], 
    ([newCategory, newSubcategories]) => {
        if (newCategory && newSubcategories?.length) {
            subselectedRow.value = newSubcategories.find(subcat => subcat.id === newCategory) || {};
            console.log(subselectedRow.value);
        } else {
            subselectedRow.value = {};
        }
    },
    { immediate: true }
);




watchEffect(() => {
    emit('update', {
        name: name.value,
        brand: brand.value,
        description: description.value,
        category: selectedRow.value.id,
        subcategory: subselectedRow.value.id,
        
    });
});


</script>

<template id="create">
    <div class="text-xl mb-4">Create</div>
    <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
   
    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Name" required :error="errors.name && errors.name" class="w-full">
            <UInput
                id="name"
                v-model="name"
                v-bind="nameAttrs"
                type="text"
                class="w-full"
            />
        </UFormGroup>

        <UFormGroup label="Brand" class="w-full">
            <UInput
                id="brand"
                v-model="brand"
                type="text"
                name="brand"
                class="w-full"
            />
        </UFormGroup>
    </div>


    <div class="flex flex-row w-full space-x-4 mb-3">
        <UFormGroup label="Category" class="w-full">
            <USelectMenu  
                v-model="selectedRow" 
                :options="categories"  
                option-key="id" 
                track-by="id"
                searchable
                searchable-placeholder="Search a Category..."
            >
                <template #label>
                    <span v-if="Object.keys(selectedRow).length !== 0" class="truncate">
                        {{ selectedRow.name }}
                    </span>
                    <span v-else>Select</span>
                </template>
                <template #leading>
                    <UIcon v-if="!selectedRow.image" name="i-heroicons-user-circle" class="w-5 h-5" />
                    <UAvatar v-else :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${selectedRow.image}`" size="2xs" />
                </template>
                <template #option="{ option: category }">
                    <UIcon v-if="!category.image" name="i-heroicons-user-circle" class="w-5 h-5" />
                    <UAvatar v-else :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${category.image}`" size="2xs" />
                    <span class="truncate">{{ category.name }}</span>
                </template>
            </USelectMenu>
        </UFormGroup>

        <UFormGroup label="Sub-Category" class="w-full">
                <USelectMenu  
                    v-model="subselectedRow" 
                    :options="subcategories"  
                    option-key="id" 
                    track-by="id"
                    searchable
                    searchable-placeholder="Search a Category..."
                >
                <template #label>
                    <span v-if="Object.keys(subselectedRow).length !== 0" class="truncate">
                        {{ subselectedRow.name }}
                    </span>
                    <span v-else>Select</span>
                </template>
                <template #leading>
                    <UIcon v-if="!subselectedRow.image" name="i-heroicons-user-circle" class="w-5 h-5" />
                    <UAvatar v-else :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${subselectedRow.image}`" size="2xs" />
                </template>
                <template #option="{ option: subcategory }">
                    <UIcon v-if="!subcategory.image" name="i-heroicons-user-circle" class="w-5 h-5" />
                    <UAvatar v-else :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${subcategory.image}`" size="2xs" />
                    <span class="truncate">{{ subcategory.name }}</span>
                </template>
            </USelectMenu>
        </UFormGroup>
        </div>

        <UFormGroup label="Description">
                <UTextarea
                    id="description"
                    v-model="description"
                    v-bind="descriptionAttrs"
                    :rows="4"
                    name="description"
                />
        </UFormGroup>


 
    
</template>
