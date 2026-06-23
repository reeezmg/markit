<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpdateCollection, useFindUniqueCollection } from '~/lib/hooks';

const route = useRoute();
const toast = useToast();
const awsService = new AwsService();
const UpdateCollection = useUpdateCollection();

interface ImageData {
  file?: File;
  uuid: string;
}

const name = ref('');
const description = ref('');
const targetAudience = ref<string | null>('all');
const live = ref(true);
const isLoading = ref(false);

const imageFile = ref<ImageData | null>(null);
const bannerFile = ref<ImageData | null>(null);

const audienceOptions = ['men', 'women', 'girls', 'boys', 'all'];

const { data: collection, refetch } = useFindUniqueCollection({
  where: { id: route.params.id as string },
});

watchEffect(() => {
  if (collection.value) {
    name.value = collection.value.name;
    description.value = collection.value.description || '';
    targetAudience.value = collection.value.targetAudience || 'all';
    live.value = collection.value.status;
  }
});

const uploadFile = async (f?: ImageData | null) => {
  if (!f?.file) return;
  const base64 = await prepareFileForApi(f.file);
  await awsService.uploadBase64File(base64, f.uuid);
};

const saveCollection = async () => {
  isLoading.value = true;
  try {
    await Promise.all([uploadFile(imageFile.value), uploadFile(bannerFile.value)]);
    await UpdateCollection.mutateAsync({
      where: { id: route.params.id as string },
      data: {
        name: name.value,
        description: description.value || '',
        status: live.value,
        image: imageFile.value?.uuid || collection.value?.image || undefined,
        banner: bannerFile.value?.uuid || collection.value?.banner || undefined,
        targetAudience: targetAudience.value || undefined,
      },
    });
    toast.add({ title: 'Collection updated successfully!', color: 'green' });
    await refetch();
  } catch (err: any) {
    toast.add({
      title: 'Error updating collection',
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
      <div class="text-xl mb-4">Edit Collection</div>
      <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />

      <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div class="flex flex-col gap-4 shrink-0">
          <BannerUpload label="Image" variant="square" :editUuid="collection?.image" @update="imageFile = $event" />
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

          <BannerUpload label="Banner (wide)" variant="wide" :editUuid="collection?.banner" @update="bannerFile = $event" />
        </div>
      </div>

      <div class="mt-6 text-end">
        <UButton icon="i-heroicons-check" :loading="isLoading" @click="saveCollection">Save Collection</UButton>
      </div>
    </UPageCard>
  </UDashboardPanelContent>
</template>
