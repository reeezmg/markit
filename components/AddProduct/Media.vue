<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import { ref, watch, computed, defineExpose } from 'vue';

const props = defineProps<{
    editFile?: string[];
    index?: number; 
}>();

interface ImageData {
    file?: File;
    uuid: string;
}

const fileInputId = computed(() => `add-item-${props.index}`);

// Local state for selected files
const selectedFiles = ref<ImageData[]>([]);
const imagePreviewUrls = ref<string[]>([]);

// Watch the `editFile` prop and initialize `selectedFiles`
watch(
    () => props.editFile,
    (newVal) => {
        if (!newVal || newVal.length === 0) {
            selectedFiles.value = [];
            imagePreviewUrls.value = [];
            return;
        }

        // Initialize `selectedFiles` with the `editFile` prop
        selectedFiles.value = newVal.map((file) => ({ uuid: file }));
        imagePreviewUrls.value = new Array(newVal.length).fill('');
    },
    { deep: true, immediate: true }
);

const emit = defineEmits(['update']);

// Emit the updated `selectedFiles` whenever it changes
watchEffect(() => {
    emit('update', {files:selectedFiles.value,index:props.index});
});

// Handle file input change
async function handleAddImageChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;

    if (files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const uuid = uuidv4();
            selectedFiles.value.push({ file, uuid });
            const reader = new FileReader();
            reader.onload = () => {
                imagePreviewUrls.value.push(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }
}

// Remove an image
function removeImage(index: number) {
    selectedFiles.value.splice(index, 1);
    imagePreviewUrls.value.splice(index, 1);
}

// Function to clear all inputs
function resetForm() {
    selectedFiles.value = [];
    imagePreviewUrls.value = [];
}

// Expose the resetForm function to the parent
defineExpose({ resetForm });
</script>
<template id="feature ">
    <div class="block text-sm font-medium leading-6 dark:text-white mt-4">Media</div>
    <div class="flex flex-row overflow-x-auto">
        <label :for="fileInputId">
            <div
                class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36 mt-1 me-3 flex-none"
            >
                <UIcon name="i-heroicons-camera" class="text-4xl" />
            </div>
        </label>
        <input
            :id="fileInputId"
            name="add-item"
            type="file"
            accept="image/*"
            class="sr-only"
            multiple
            @change="handleAddImageChange"
        />
        <div
            v-for="(file, index) in selectedFiles"
            :key="file.uuid"
            class="relative mt-1 me-3 flex-none"
        >
            <img
                v-if="file.file"
                :src="imagePreviewUrls[index]"
                alt="Selected Image"
                class="w-32 h-36 flex-none"
            />
            <img
                v-else
                :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${file.uuid}`"
                alt="Selected Image"
                class="w-32 h-36 flex-none"
            />
            <UButton
                icon="i-heroicons-x-mark"
                class="absolute mb-5 rounded-full"
                style="top: -5px; right: -5px"
                @click="removeImage(index)"
            />
        </div>
    </div>
</template>
