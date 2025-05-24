<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { Company } from '@zenstackhq/runtime/models';
import { v4 as uuidv4 } from 'uuid';
import AwsService from '~/composables/aws';
import { useUpdateCompany } from '~/lib/hooks';
import type { Prisma } from '@prisma/client';


const props = defineProps<{
    index: number;
    info: Prisma.CompanyGetPayload<{
        select: {
            id: true;
            name: true;
            logo: true;
            users: {
                select:{
                    userId:true;
                }
            };
        };
    }>;
}>();


interface ImageData {
    file?: File;
    uuid: string;
    previewUrl?: string;
}

const router = useRouter();
const awsService = new AwsService();
const isOpen = ref(false);
const imagePreview = ref<string | null>(null);
const UpdateCompany = useUpdateCompany();
const selectedFile = ref<ImageData | null>(null);

async function handleAddImageChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        const file = input.files[0]; // Get the first file
        const uuid = uuidv4();
        const reader = new FileReader();

        reader.onload = () => {
            imagePreview.value = reader.result as string;
            selectedFile.value = { file, uuid, previewUrl: reader.result as string };
        };

        reader.readAsDataURL(file);
    }
}

const base64files = async () => {
    if (!selectedFile.value?.file) return null;

    const base64 = await prepareFileForApi(selectedFile.value.file);
    return { base64, uuid: selectedFile.value.uuid };
};

const handleSave = async () => {
    if (!selectedFile.value) return;

    // Convert file to base64 and get UUID
    const b64files = await base64files();
    if (!b64files) return;

    try {
        // Upload base64 file to AWS
        await awsService.uploadBase64File(b64files.base64, b64files.uuid);

        // Update the company's logo field in the database
        await UpdateCompany.mutateAsync({
            where: { id: props.info.id },
            data: { logo: b64files.uuid }
        });

    
        
        // Close modal
        isOpen.value = false;
    } catch (error) {
        console.error("Error updating company logo:", error);
    }
};

</script>

<template>
    <li
        class="col-span-1 flex flex-col divide-y divide-gray-200 rounded-lg bg-white text-center shadow overflow-hidden"
        @click="() => router.push(`/landing/${info?.id}`)"
    >
        <div class="aspect-w-16 aspect-h-15 flex items-center justify-center">
            <img
                v-if="info?.logo"
                class="aspect-content object-cover w-full h-full"
                :src="`https://images.markit.co.in/${info?.logo}`"
                alt="Company Image"
            />
           <div 
            v-if="!info?.logo && info?.users.some(user => user.userId === useAuth().session.value?.id)" 
            class="flex flex-col items-center justify-center h-full w-full"
            >
            <UButton variant="solid" size="lg" icon="i-heroicons-plus" @click.stop.prevent="isOpen = true">
            Add Logo
            </UButton>
            </div>
        </div>
        <div class="flex flex-1 flex-row justify-between p-3">
            <h3 class="text-lg font-medium text-gray-900">
                {{ info?.name }}
            </h3>
        </div>
    </li>

    <UModal v-model="isOpen">
        <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-100 dark:divide-gray-800' }">
            <template #header>Upload Company Logo</template>
            <div class="p-4 flex flex-col items-center gap-4">
                <label for="add-item" class="cursor-pointer">
                    <div
                        v-if="imagePreview"
                        class="w-32 h-36 mt-3 me-3 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-md"
                    >
                        <img :src="imagePreview" alt="Preview" class="w-full h-full object-cover" />
                    </div>
                    <div
                        v-else
                        class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36 mt-3 me-3 cursor-pointer rounded-md"
                    >
                        <UIcon name="i-heroicons-camera" class="text-4xl" />
                    </div>
                </label>
                <input
                    id="add-item"
                    name="add-item"
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    @change="handleAddImageChange"
                />
            </div>

            <template #footer>
                <div class="flex justify-end w-full">
                    <UButton class="px-5" @click = "handleSave"> Save </UButton>
                </div>
            </template>
        </UCard>
    </UModal>
</template>
