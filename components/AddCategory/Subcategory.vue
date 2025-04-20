<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';

const props = defineProps<{
    index:number;
    id:number;
    editName?: string | null;
    editHsn?: string | null;
    editDescription?: string | null;
    editFile?: string | null;
}>();
const emit = defineEmits(['update']);

const schemas = z.object({
    name: z.string().min(2),
    hsn: z.string().optional(),
    description: z.string(),
});

const { errors, defineField, values } = useForm({
    validationSchema: toTypedSchema(schemas),
});

interface ImageData {
    file?: File;
    uuid: string;
}

const selectedFiles = ref<ImageData[]>([]);
const imagePreviewUrls = ref<string[]>([]);

const [name, nameAttrs] = defineField('name');
const [hsn, hsnAttrs] = defineField('hsn');
const [description, descriptionAttrs] = defineField('description');

watchEffect(() => {
    if (props.editName) {
        name.value = props.editName;
    }
    if (props.editHsn) {
        hsn.value = props.editHsn;
    }
    if (props.editDescription) {
        description.value = props.editDescription;
        console.log(props.editDescription);
    }
    if (props.editFile) {
        selectedFiles.value = [];
        selectedFiles.value.push({ uuid: props.editFile });
        console.log(props.editFile, selectedFiles.value);
    }
});

async function handleAddImageChange(e: Event) {
    selectedFiles.value = [];
    const files = (e.target as HTMLInputElement).files;

    if (files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const uuid = uuidv4();
            selectedFiles.value.push({ file, uuid });
            console.log(selectedFiles);
            const reader = new FileReader();
            reader.onload = () => {
                imagePreviewUrls.value.push(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }
}

watchEffect(() => {
    emit('update', {
        id:props.id,
        name: name.value,
        hsn: hsn.value,
        description: description.value,
        file: selectedFiles.value,
    });
});

const fileInputId = computed(() => `image-${props.index}`);

</script>

<template id="create">
    <div class="text-xl mb-4">Sub Category {{index + 1}}</div>
    <hr class="h-px my-8 bg-gray-200 border-0 dark:bg-gray-700" />
<div class="flex space-x-2">
    <div class="mb-5">
        <div class="block text-sm font-medium leading-6 dark:text-white mb-1"
            >Image</div
        >
        <label :for=fileInputId>
            <div
                v-if="imagePreviewUrls.length > 0"
                class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
            >
                <img
                    :src="imagePreviewUrls[0]"
                    alt="Selected Image"
                    style="max-width: 100%; max-height: 100%"
                />
            </div>

            <div
                v-else-if="
                    imagePreviewUrls.length == 0 && selectedFiles.length > 0
                "
                class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
            >
                <img
                    :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${selectedFiles[0].uuid}`"
                    alt="Selected Image"
                    style="max-width: 100%; max-height: 100%"
                />
            </div>

            <div
                v-else
                class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
            >
                <UIcon name="i-heroicons-camera" class="text-4xl" />
            </div>
            <input
                :id=fileInputId
                name="image"
                type="file"
                accept="image/*"
                class="sr-only"
                multiple
                @change="handleAddImageChange"
            />
        </label>
    </div>

    <div class="w-full mt-1">
        <UFormGroup label="Name" required :error="errors.name && errors.name" class="w-full  mb-3">
            <UInput
                id="name"
                v-model="name"
                v-bind="nameAttrs"
                type="text"
                class="w-full"
            />
        </UFormGroup>
    </div>
    </div>

</template>
