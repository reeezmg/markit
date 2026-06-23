<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useCreateCollection } from '~/lib/hooks';

const router = useRouter();
const toast = useToast();
const awsService = new AwsService();
const useAuth = () => useNuxtApp().$auth;
const CreateCollection = useCreateCollection();

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

const uploadFile = async (f?: ImageData | null) => {
  if (!f?.file) return;
  const base64 = await prepareFileForApi(f.file);
  await awsService.uploadBase64File(base64, f.uuid);
};

const handleSubmit = async () => {
  if (!name.value) {
    toast.add({ title: 'Collection name is required', color: 'red' });
    return;
  }
  isLoading.value = true;
  try {
    await Promise.all([uploadFile(imageFile.value), uploadFile(bannerFile.value)]);
    await CreateCollection.mutateAsync({
      data: {
        name: name.value,
        description: description.value || '',
        status: live.value,
        image: imageFile.value?.uuid || undefined,
        banner: bannerFile.value?.uuid || undefined,
        targetAudience: targetAudience.value || undefined,
        company: {
          connect: { id: useAuth().session.value?.companyId },
        },
      },
    });
    toast.add({ title: 'Collection added!' });
    router.push('/products/collections');
  } catch (err: any) {
    toast.add({
      title: 'Error creating collection',
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
      <div class="text-xl mb-4">Collection</div>
      <hr class="h-px my-6 bg-gray-200 border-0 dark:bg-gray-700" />

      <div class="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div class="flex flex-col gap-4 shrink-0">
          <BannerUpload label="Image" variant="square" @update="imageFile = $event" />
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

          <BannerUpload label="Banner (wide)" variant="wide" @update="bannerFile = $event" />
        </div>
      </div>

      <div class="mt-6 text-end">
        <UButton icon="i-heroicons-check" :loading="isLoading" @click="handleSubmit">Save</UButton>
      </div>
    </UPageCard>
  </UDashboardPanelContent>
</template>
