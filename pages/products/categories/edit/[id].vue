<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpdateCategory, useFindUniqueCategory, useUpdateSubcategory, useCreateSubcategory, useDeleteSubcategory } from '~/lib/hooks';
import type { Category, Subcategory } from '~/prisma/generated/client';

definePageMeta({
  auth: true,
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const UpdateCategory = useUpdateCategory();
const UpdateSubcategory = useUpdateSubcategory();
const CreateSubcategory = useCreateSubcategory();
const DeleteSubcategory = useDeleteSubcategory();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;

interface ImageData {
  file: File;
  uuid: string;
}

const linkList = ['Create', 'Subcategories', 'Live'];

// Form data
const name = ref('');
const hsn = ref('');
const description = ref('');
const taxType = ref<'FIXED' | 'VARIABLE' | undefined>(undefined);
const fixedTax = ref(0);
const thresholdAmount = ref(0);
const taxBelowThreshold = ref(0);
const taxAboveThreshold = ref(0);
const live = ref(true);
const files = reactive<ImageData[]>([]);
const subcategories = ref<Array<Partial<Subcategory & { isNew?: boolean }>>>([]);

// Initialize form with category data
const { data: category } = useFindUniqueCategory({
  where: { id: route.params.id as string },
  include: { subcategories: true }
});

watchEffect(() => {
  if (category.value) {
    name.value = category.value.name;
    hsn.value = category.value.hsn || '';
    description.value = category.value.description || '';
    taxType.value = category.value.taxType;
    fixedTax.value = category.value.fixedTax || 0;
    thresholdAmount.value = category.value.thresholdAmount || 0;
    taxBelowThreshold.value = category.value.taxBelowThreshold || 0;
    taxAboveThreshold.value = category.value.taxAboveThreshold || 0;
    live.value = category.value.status;
    
    if (category.value.image) {
      files.push({ uuid: category.value.image } as ImageData);
    }

    // Initialize subcategories
    subcategories.value = category.value.subcategories.map(sc => ({
      ...sc,
      isNew: false
    }));
  }
});

// Form handlers
const createValue = (data: any) => {
  name.value = data.name;
  hsn.value = data.hsn;
  description.value = data.description;
  taxType.value = data.taxType;
  fixedTax.value = data.fixedTax;
  thresholdAmount.value = data.thresholdAmount;
  taxBelowThreshold.value = data.taxBelowThreshold;
  taxAboveThreshold.value = data.taxAboveThreshold;
  if (data.file) {
    files.push(data.file);
  }
};

const updateSubcategory = (index: number, data: Partial<Subcategory>) => {
  subcategories.value[index] = { ...subcategories.value[index], ...data };
};

const liveValue = (data: boolean) => {
  live.value = data;
};

const handleAddSubCategory = () => {
  subcategories.value.push({
    id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: '',
    description: '',
    status: true,
    isNew: true
  });
};

const handleDeleteSubCategory = async (index: number) => {
  const subcat = subcategories.value[index];
  
  if (!subcat.isNew && subcat.id) {
    try {
      await DeleteSubcategory.mutateAsync({ where: { id: subcat.id } });
      toast.add({ title: 'Subcategory deleted', color: 'green' });
    } catch (error) {
      toast.add({ title: 'Error deleting subcategory', color: 'red' });
      return;
    }
  }
  
  subcategories.value.splice(index, 1);
};

const handleSubmit = async (e: Event) => {
  e.preventDefault();
  try {
    // 1. Upload images
    const base64files = await Promise.all(
      files
        .filter(file => file.file)
        .map(async (file) => {
          const base64 = await prepareFileForApi(file.file);
          return { base64, uuid: file.uuid };
        })
    );

    const uploads = base64files.map(file => 
      awsService.uploadBase64File(file.base64, file.uuid)
    );

    console.log(live.value)

    // 2. Update category
    const categoryUpdate = UpdateCategory.mutateAsync({
      where: { id: route.params.id as string },
      data: {
        name: name.value,
        description: description.value,
        status: live.value.live,
        image: files[0]?.uuid || category.value?.image,
        hsn: hsn.value,
        taxType: taxType.value,
        fixedTax: fixedTax.value,
        thresholdAmount: thresholdAmount.value,
        taxBelowThreshold: taxBelowThreshold.value,
        taxAboveThreshold: taxAboveThreshold.value,
      }
    });

    // 3. Handle subcategories
    const subcategoryUpdates = subcategories.value.map(async (subcat) => {
      const data = {
        name: subcat.name,
        description: subcat.description,
        status: subcat.status,
        image: subcat.image,
        company: {
          connect: { id: useAuth().session.value?.companyId }
        },
        category: {
          connect: { id: route.params.id as string }
        }
      };

      if (subcat.isNew) {
        return CreateSubcategory.mutateAsync({ data });
      } else if (subcat.id) {
        return UpdateSubcategory.mutateAsync({
          where: { id: subcat.id },
          data
        });
      }
    });

    // Execute all operations
    await Promise.all([categoryUpdate, ...subcategoryUpdates, ...uploads]);

    toast.add({
      title: 'Category updated successfully!',
      color: 'green'
    });
    router.push('/products/categories');
  } catch (error) {
    toast.add({
      title: 'Error updating category',
      description: error.message,
      color: 'red'
    });
  }
};

const scrollToSection = (sectionId: string) => {
  const section = document.getElementById(sectionId);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
};
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="flex flex-row">
      <!-- Quick Links Sidebar -->
      <div class="w-1/4">
        <UPageCard class="m-3">
          <div class="text-lg"> Quick Links</div>
          <div v-for="item in linkList" :key="item">
            <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />
            <ULink
              :to="'#' + item"
              @click="scrollToSection(item)"
              active-class="text-primary"
              inactive-class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {{ item }}
            </ULink>
          </div>
        </UPageCard>
      </div>

      <!-- Main Form Content -->
      <div class="flex flex-col w-3/4">
        <!-- Category Form -->
        <UPageCard class="m-3" id="Create">
          <AddCategoryCreate
            :editName="category?.name"
            :editHsn="category?.hsn"
            :editDescription="category?.description"
            :taxType="category?.taxType"
            :thresholdAmount="category?.thresholdAmount"
            :taxBelowThreshold="category?.taxBelowThreshold"
            :taxAboveThreshold="category?.taxAboveThreshold"
            :fixedTax="category?.fixedTax"
            :editFile="category?.image"
            @update="createValue"
          />
        </UPageCard>

        <!-- Subcategories Section -->
        <UPageCard class="m-3" id="Subcategories">
          <div class="text-xl mb-4">Subcategories</div>
          
          <div v-for="(subcat, index) in subcategories" :key="subcat.id">
            <AddCategorySubcategory 
              :index="index"
              :id="subcat.id"
              :editName="subcat.name"
              :editDescription="subcat.description"
              :editFile="subcat.image"
              :editStatus="subcat.status"
              @update="(data) => updateSubcategory(index, data)"
            />
            <div class="mt-4 w-full text-end">
              <UButton
                label="Delete"
                trailing-icon="i-heroicons-x-mark"
                size="sm"
                color="red"
                @click="handleDeleteSubCategory(index)"
              />
            </div>
            <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />
          </div>

          <UButton
            label="Add Subcategory"
            trailing-icon="i-heroicons-plus"
            size="sm"
            color="primary"
            block
            @click="handleAddSubCategory"
          />
        </UPageCard>

        <!-- Status Toggle -->
        <UPageCard class="m-3" id="Live">
          <AddCategoryLive :editLive="live" @update="liveValue" />
        </UPageCard>

        <!-- Submit Button -->
        <div class="mt-5">
          <UButton
            label="Save Changes"
            color="primary"
            :loading="UpdateCategory.isPending.value || UpdateSubcategory.isPending.value"
            @click="handleSubmit"
          />
        </div>
      </div>
    </div>
  </UDashboardPanelContent>
</template>