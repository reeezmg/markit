<script setup lang="ts">
import AwsService from '~/composables/aws';
import {
  useUpdateCategory,
  useFindUniqueCategory,
  useUpdateSubcategory,
  useCreateSubcategory,
  useDeleteSubcategory,
} from '~/lib/hooks';
import type { Subcategory } from '@prisma/client';

const route = useRoute();
const toast = useToast();
const categoryStore = useCategoryStore();
const UpdateCategory = useUpdateCategory();
const UpdateSubcategory = useUpdateSubcategory();
const CreateSubcategory = useCreateSubcategory();
const DeleteSubcategory = useDeleteSubcategory();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;

interface ImageData {
  file?: File;
  uuid: string;
}

type SubcategoryForm = Partial<Subcategory & {
  isNew?: boolean;
  imageFile?: ImageData;
}>;

const subcategoryColumns = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: 'Actions' },
];

const isCategorySaving = ref(false);
const isSubcategorySaving = ref(false);
const name = ref('');
const hsn = ref('');
const shortCut = ref('');
const description = ref('');
const taxType = ref<'FIXED' | 'VARIABLE' | undefined>(undefined);
const fixedTax = ref(0);
const thresholdAmount = ref(0);
const taxBelowThreshold = ref(0);
const taxAboveThreshold = ref(0);
const margin = ref(0);
const live = ref(true);
const targetAudience = ref<string | null>(null);
const files = reactive<ImageData[]>([]);
const bannerFile = ref<ImageData | null>(null);
const subcategories = ref<SubcategoryForm[]>([]);

const isSubcategoryModalOpen = ref(false);
const subcategoryModalMode = ref<'add' | 'edit'>('add');
const selectedSubcategoryIndex = ref<number | null>(null);
const subcategoryDraft = ref<SubcategoryForm | null>(null);
const subcategoryModalKey = ref(0);
const isDeleteModalOpen = ref(false);
const deletingSubcategoryIndex = ref<number | null>(null);

const { data: category, refetch: refetchCategory } = useFindUniqueCategory({
  where: { id: route.params.id as string },
  include: { subcategories: true },
});

watchEffect(() => {
  if (category.value) {
    name.value = category.value.name;
    hsn.value = category.value.hsn || '';
    shortCut.value = category.value.shortCut || '';
    description.value = category.value.description || '';
    taxType.value = category.value.taxType;
    fixedTax.value = category.value.fixedTax || 0;
    thresholdAmount.value = category.value.thresholdAmount || 0;
    taxBelowThreshold.value = category.value.taxBelowThreshold || 0;
    taxAboveThreshold.value = category.value.taxAboveThreshold || 0;
    margin.value = category.value.margin || 0;
    live.value = category.value.status;
    targetAudience.value = category.value.targetAudience || null;

    files.splice(0, files.length);
    if (category.value.image) {
      files.push({ uuid: category.value.image });
    }

    subcategories.value = category.value.subcategories.map((sc) => ({
      ...sc,
      isNew: false,
    }));
  }
});

const createValue = (data: any) => {
  name.value = data.name;
  hsn.value = data.hsn;
  shortCut.value = data.shortCut;
  description.value = data.description;
  taxType.value = data.taxType;
  fixedTax.value = data.fixedTax;
  thresholdAmount.value = data.thresholdAmount;
  taxBelowThreshold.value = data.taxBelowThreshold;
  taxAboveThreshold.value = data.taxAboveThreshold;
  margin.value = data.margin;
  targetAudience.value = data.targetAudience || null;
  if (data.live !== undefined) {
    live.value = data.live;
  }

  if (data.file) {
    files.splice(0, files.length, data.file);
  }
};

const openAddSubcategory = () => {
  subcategoryModalMode.value = 'add';
  selectedSubcategoryIndex.value = null;
  subcategoryDraft.value = {
    id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: '',
    description: '',
    status: true,
    isNew: true,
  };
  subcategoryModalKey.value += 1;
  isSubcategoryModalOpen.value = true;
};

const openEditSubcategory = (row: SubcategoryForm) => {
  const index = subcategories.value.findIndex((subcat) => subcat.id === row.id);
  selectedSubcategoryIndex.value = index;
  subcategoryModalMode.value = 'edit';
  subcategoryDraft.value = { ...row };
  subcategoryModalKey.value += 1;
  isSubcategoryModalOpen.value = true;
};

const updateSubcategoryDraft = (data: SubcategoryForm) => {
  subcategoryDraft.value = {
    ...subcategoryDraft.value,
    ...data,
  };
};

const closeSubcategoryModal = () => {
  isSubcategoryModalOpen.value = false;
  selectedSubcategoryIndex.value = null;
  subcategoryDraft.value = null;
};

const getCompanyId = () => {
  const companyId = useAuth().session.value?.companyId;
  if (!companyId) {
    throw new Error('Company session not found');
  }

  return companyId;
};

const getSubcategoryPayload = (subcat: SubcategoryForm, companyId: string) => ({
  name: subcat.name || '',
  description: subcat.description || '',
  status: subcat.status,
  image: subcat.image || undefined,
  company: {
    connect: { id: companyId },
  },
  category: {
    connect: { id: route.params.id as string },
  },
});

const saveSubcategoryDraft = async () => {
  if (!subcategoryDraft.value?.name?.trim()) {
    toast.add({ title: 'Subcategory name is required', color: 'red' });
    return;
  }

  isSubcategorySaving.value = true;

  try {
    const companyId = getCompanyId();
    await uploadImage(subcategoryDraft.value.imageFile);

    if (subcategoryModalMode.value === 'add') {
      await CreateSubcategory.mutateAsync({
        data: getSubcategoryPayload(subcategoryDraft.value, companyId),
      });
      toast.add({ title: 'Subcategory added', color: 'green' });
    } else if (subcategoryDraft.value.id) {
      await UpdateSubcategory.mutateAsync({
        where: { id: subcategoryDraft.value.id },
        data: getSubcategoryPayload(subcategoryDraft.value, companyId),
      });
      toast.add({ title: 'Subcategory updated', color: 'green' });
    }

    await refetchCategory();
    closeSubcategoryModal();
  } catch (error: any) {
    toast.add({
      title: subcategoryModalMode.value === 'add'
        ? 'Error adding subcategory'
        : 'Error updating subcategory',
      description: error.message,
      color: 'red',
    });
  } finally {
    isSubcategorySaving.value = false;
  }
};

const openDeleteSubcategory = (row: SubcategoryForm) => {
  deletingSubcategoryIndex.value = subcategories.value.findIndex((subcat) => subcat.id === row.id);
  isDeleteModalOpen.value = true;
};

const confirmDeleteSubcategory = async () => {
  const index = deletingSubcategoryIndex.value;
  if (index === null || index < 0) return;

  const subcat = subcategories.value[index];

  if (!subcat.isNew && subcat.id) {
    try {
      await DeleteSubcategory.mutateAsync({ where: { id: subcat.id } });
      toast.add({ title: 'Subcategory deleted', color: 'green' });
      await refetchCategory();
    } catch (error) {
      toast.add({ title: 'Error deleting subcategory', color: 'red' });
      return;
    }
  }

  subcategories.value.splice(index, 1);
  isDeleteModalOpen.value = false;
  deletingSubcategoryIndex.value = null;
};

const subcategoryActions = (row: SubcategoryForm) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => openEditSubcategory(row),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => openDeleteSubcategory(row),
    },
  ],
];

const uploadImage = async (image?: ImageData) => {
  if (!image?.file) return;
  const base64 = await prepareFileForApi(image.file);
  await awsService.uploadBase64File(base64, image.uuid);
};

const saveCategory = async () => {
  isCategorySaving.value = true;

  try {
    await uploadImage(files[0]);
    await uploadImage(bannerFile.value || undefined);
    await UpdateCategory.mutateAsync({
      where: { id: route.params.id as string },
      data: {
        name: name.value,
        description: description.value,
        status: live.value,
        image: files[0]?.uuid || category.value?.image,
        banner: bannerFile.value?.uuid || category.value?.banner || undefined,
        hsn: hsn.value,
        ...(shortCut.value && { shortCut: shortCut.value }),
        taxType: taxType.value,
        fixedTax: fixedTax.value,
        thresholdAmount: thresholdAmount.value,
        taxBelowThreshold: taxBelowThreshold.value,
        taxAboveThreshold: taxAboveThreshold.value,
        margin: margin.value,
        targetAudience: targetAudience.value || undefined,
      },
    });

    toast.add({
      title: 'Category updated successfully!',
      color: 'green',
    });
    await categoryStore.refreshCategories();
    await refetchCategory();
  } catch (error: any) {
    toast.add({
      title: 'Error updating category',
      description: error.message,
      color: 'red',
    });
  } finally {
    isCategorySaving.value = false;
  }
};
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="space-y-4">
      <UPageCard>
        <AddCategoryCreate
          :editName="category?.name"
          :editHsn="category?.hsn"
          :editShortCut="category?.shortCut"
          :editDescription="category?.description"
          :taxType="category?.taxType"
          :thresholdAmount="category?.thresholdAmount"
          :taxBelowThreshold="category?.taxBelowThreshold"
          :taxAboveThreshold="category?.taxAboveThreshold"
          :margin="category?.margin"
          :fixedTax="category?.fixedTax"
          :editFile="category?.image"
          :targetAudience="category?.targetAudience"
          :editLive="live"
          @update="createValue"
        />

        <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />
        <BannerUpload label="Banner (shown on store/dark-store)" variant="wide" :editUuid="category?.banner" @update="bannerFile = $event" />

        <div class="mt-6 flex justify-end">
          <UButton
            type="button"
            icon="i-heroicons-check"
            :loading="isCategorySaving"
            @click="saveCategory"
          >
            Save Category
          </UButton>
        </div>
      </UPageCard>

      <UPageCard>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-xl">Subcategories</div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Manage subcategories from the table actions.
            </p>
          </div>

          <UButton
            type="button"
            label="Add New Subcategory"
            icon="i-heroicons-plus"
            color="primary"
            @click="openAddSubcategory"
          />
        </div>

        <UTable
          class="mt-4"
          :rows="subcategories"
          :columns="subcategoryColumns"
        >
          <template #name-data="{ row }">
            <div class="flex items-center gap-3">
              <UAvatar
                :src="row.image ? `https://images.markit.co.in/${row.image}` : undefined"
                :alt="row.name || 'Subcategory'"
                size="sm"
              />
              <span class="font-medium">{{ row.name || '-' }}</span>
            </div>
          </template>

          <template #description-data="{ row }">
            <span class="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
              {{ row.description || '-' }}
            </span>
          </template>

          <template #status-data="{ row }">
            <UBadge :color="row.status ? 'green' : 'gray'" variant="subtle">
              {{ row.status ? 'Active' : 'Inactive' }}
            </UBadge>
          </template>

          <template #actions-data="{ row }">
            <UDropdown :items="subcategoryActions(row)">
              <UButton
                type="button"
                color="gray"
                variant="ghost"
                icon="i-heroicons-ellipsis-horizontal-20-solid"
              />
            </UDropdown>
          </template>

          <template #empty-state>
            <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <UIcon name="i-heroicons-table-cells" class="text-3xl text-gray-400" />
              <p class="text-sm text-gray-500">No subcategories added yet.</p>
            </div>
          </template>
        </UTable>
      </UPageCard>
    </div>

    <UModal v-model="isSubcategoryModalOpen">
      <UCard
        :ui="{
          ring: '',
          divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        }"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold">
              {{ subcategoryModalMode === 'add' ? 'Add Subcategory' : 'Edit Subcategory' }}
            </h3>
            <UButton
              type="button"
              color="gray"
              variant="ghost"
              icon="i-heroicons-x-mark-20-solid"
              @click="closeSubcategoryModal"
            />
          </div>
        </template>

        <AddCategorySubcategory
          v-if="subcategoryDraft"
          :key="subcategoryModalKey"
          :index="selectedSubcategoryIndex ?? subcategories.length"
          :id="subcategoryDraft.id as string"
          :editName="subcategoryDraft.name ?? undefined"
          :editDescription="subcategoryDraft.description ?? undefined"
          :editFile="subcategoryDraft.image ?? undefined"
          :editStatus="subcategoryDraft.status"
          @update="updateSubcategoryDraft"
        />

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton type="button" color="gray" variant="soft" @click="closeSubcategoryModal">
              Cancel
            </UButton>
            <UButton
              type="button"
              color="primary"
              :loading="isSubcategorySaving"
              @click="saveSubcategoryDraft"
            >
              {{ subcategoryModalMode === 'add' ? 'Add' : 'Update' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <UDashboardModal
      v-model="isDeleteModalOpen"
      title="Delete Subcategory"
      description="Are you sure you want to delete this subcategory?"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
    >
      <template #footer>
        <UButton type="button" color="red" label="Delete" @click="confirmDeleteSubcategory" />
        <UButton type="button" color="gray" label="Cancel" @click="isDeleteModalOpen = false" />
      </template>
    </UDashboardModal>
  </UDashboardPanelContent>
</template>
