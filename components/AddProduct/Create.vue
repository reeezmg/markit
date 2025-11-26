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

const productInputs = ref(useAuth().session.value?.productInputs)

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

watch([() => props.editCategory,categories], ([newCategory,newCategories]) => {
    if (newCategory && newCategories?.length) {
         selectedRow.value = newCategories.find(cat => cat.id === newCategory);
        console.log(newCategory)
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



watch(
  [name, brand, description, selectedRow, subselectedRow],
  ([newName, newBrand, newDescription, newCategoryRow, newSubcategoryRow]) => {
    emit('update', {
      name: newName,
      brand: newBrand,
      description: newDescription,
      category: newCategoryRow,
      subcategory: newSubcategoryRow?.id,
    });
  },
  { immediate: true }
);


</script>

<template id="create">
  <div class="text-xl mb-4">Create</div>
  <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
    <!-- Name -->
    <UFormGroup label="Name" v-if="productInputs?.name">
      <UInput
        id="name"
        v-model="name"
        v-bind="nameAttrs"
        type="text"
        class="w-full"
      />
    </UFormGroup>

    <!-- Brand -->
    <UFormGroup label="Brand" v-if="productInputs?.brand">
      <UInput
        id="brand"
        v-model="brand"
        type="text"
        name="brand"
        class="w-full"
      />
    </UFormGroup>

    <!-- Category -->
    <UFormGroup label="Category" v-if="productInputs?.category">
  <USelectMenu
    v-model="selectedRow"
    :options="categories"
    option-key="id"
    track-by="id"
    searchable
    option-attribute="name"
    searchable-placeholder="Search a Category..."
  >
    <template #label>
      <span v-if="Object.keys(selectedRow).length !== 0" class="truncate">
        {{ selectedRow.name }}
      </span>
      <span v-else>Select</span>
    </template>

    <template #leading>
      <UIcon
        v-if="!selectedRow.image"
        name="i-heroicons-user-circle"
        class="w-5 h-5"
      />
      <UAvatar
        v-else
        :src="`https://images.markit.co.in/${selectedRow.image}`"
        size="2xs"
      />
    </template>

    <template #option="{ option: category }">
      <UIcon
        v-if="!category.image"
        name="i-heroicons-user-circle"
        class="w-5 h-5"
      />
      <UAvatar
        v-else
        :src="`https://images.markit.co.in/${category.image}`"
        size="2xs"
      />
      <span class="truncate">{{ category.name }}</span>
    </template>
  </USelectMenu>
</UFormGroup>


    <!-- Sub-category -->
    <UFormGroup label="Sub-Category" v-if="productInputs?.subcategory">
  <USelectMenu
    v-model="subselectedRow"
    :options="subcategories"
    option-key="id"
    track-by="id"
    searchable
    option-attribute="name"
    searchable-placeholder="Search a Subcategory..."
  >
    <template #label>
      <span v-if="Object.keys(subselectedRow).length !== 0" class="truncate">
        {{ subselectedRow.name }}
      </span>
      <span v-else>Select</span>
    </template>

    <template #leading>
      <UIcon
        v-if="!subselectedRow.image"
        name="i-heroicons-user-circle"
        class="w-5 h-5"
      />
      <UAvatar
        v-else
        :src="`https://images.markit.co.in/${subselectedRow.image}`"
        size="2xs"
      />
    </template>

    <template #option="{ option: subcategory }">
      <UIcon
        v-if="!subcategory.image"
        name="i-heroicons-user-circle"
        class="w-5 h-5"
      />
      <UAvatar
        v-else
        :src="`https://images.markit.co.in/${subcategory.image}`"
        size="2xs"
      />
      <span class="truncate">{{ subcategory.name }}</span>
    </template>
  </USelectMenu>
</UFormGroup>

    <!-- Description: spans full row -->
    <UFormGroup label="Description" class="md:col-span-2" v-if="productInputs?.description">
      <UTextarea
        id="description"
        v-model="description"
        v-bind="descriptionAttrs"
        :rows="4"
        name="description"
        class="w-full"
      />
    </UFormGroup>
  </div>
</template>
