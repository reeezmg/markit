<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpdateBrand, useFindUniqueBrand } from '~/lib/hooks';

const route = useRoute();
const toast = useToast();
const awsService = new AwsService();
const UpdateBrand = useUpdateBrand();

interface ImageData {
  file?: File;
  uuid: string;
}

const name = ref('');
const description = ref('');
const targetAudience = ref<string | null>('all');
const live = ref(true);
const isLoading = ref(false);

const audienceOptions = ['men', 'women', 'girls', 'boys', 'all'];

const imageFile = ref<ImageData | null>(null);
const bannerFile = ref<ImageData | null>(null);

const { data: brand, refetch } = useFindUniqueBrand({
  where: { id: route.params.id as string },
});

watchEffect(() => {
  if (brand.value) {
    name.value = brand.value.name;
    description.value = brand.value.description || '';
    targetAudience.value = brand.value.targetAudience || 'all';
    live.value = brand.value.status;
  }
});

const uploadFile = async (f?: ImageData | null) => {
  if (!f?.file) return;
  const base64 = await prepareFileForApi(f.file);
  await awsService.uploadBase64File(base64, f.uuid);
};

const saveBrand = async () => {
  isLoading.value = true;
  try {
    await Promise.all([uploadFile(imageFile.value), uploadFile(bannerFile.value)]);
    await UpdateBrand.mutateAsync({
      where: { id: route.params.id as string },
      data: {
        name: name.value,
        description: description.value || '',
        status: live.value,
        image: imageFile.value?.uuid || brand.value?.image || undefined,
        banner: bannerFile.value?.uuid || brand.value?.banner || undefined,
        targetAudience: targetAudience.value || undefined,
      },
    });
    toast.add({ title: 'Brand updated successfully!', color: 'green' });
    await refetch();
  } catch (err: any) {
    toast.add({
      title: 'Error updating brand',
      description: err?.info?.message ?? err?.message ?? String(err),
      color: 'red',
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UPageCard class="m-3">
      <div class="text-xl mb-4">Edit Brand</div>
      <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />

      <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div class="flex flex-col gap-4 shrink-0">
          <BannerUpload label="Logo / Image" variant="square" :editUuid="brand?.image" @update="imageFile = $event" />
          <div class="mt-2 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-200">Get it live</span>
            <UToggle v-model="live" />
          </div>
        </div>

        <div class="w-full space-y-4">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <UFormGroup label="Name" required class="w-full">
              <UInput v-model="name" type="text" class="w-full" />
            </UFormGroup>

            <UFormGroup label="Target Audience" class="w-full">
              <USelect v-model="targetAudience" :options="audienceOptions" class="w-full" />
            </UFormGroup>
          </div>

          <UFormGroup label="Description" class="w-full">
            <UTextarea v-model="description" class="w-full" />
          </UFormGroup>

          <BannerUpload label="Banner (shown on dark-store Brands tab)" variant="wide" :editUuid="brand?.banner" @update="bannerFile = $event" />
        </div>
      </div>

      <div class="mt-6 text-end">
        <UButton icon="i-heroicons-check" :loading="isLoading" @click="saveBrand">Save Brand</UButton>
      </div>
    </UPageCard>
  </UDashboardPanelContent>
</template>
