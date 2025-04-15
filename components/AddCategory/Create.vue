<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';

const props = defineProps<{
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

const selectedFile = ref<ImageData | null>(null); // Single file instead of array
const imagePreviewUrl = ref<string | null>(null); // Single URL instead of array

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
        selectedFile.value = { uuid: props.editFile };
        imagePreviewUrl.value = `https://unifeed.s3.ap-south-1.amazonaws.com/${props.editFile}`;
    }
});

function handleAddImageChange(e: Event) {
    const files = (e.target as HTMLInputElement).files;

    if (files && files.length > 0) {
        const file = files[0]; // Take only the first file
        const uuid = uuidv4();
        selectedFile.value = { file, uuid };

        const reader = new FileReader();
        reader.onload = () => {
            imagePreviewUrl.value = reader.result as string;
        };
        reader.readAsDataURL(file);
    }
}

watchEffect(() => {
    emit('update', {
        name: name.value,
        hsn: hsn.value,
        description: description.value,
        file: selectedFile.value,
    });
});
</script>

<template id="create">
    <div class="text-xl mb-4">Category</div>
    <hr class="h-px my-8 bg-gray-200 border-0 dark:bg-gray-700" />
    <div class="flex space-x-2">
        <div class="mb-5">
            <div class="block text-sm font-medium leading-6 dark:text-white mb-1">Image</div>
            <label for="image">
                <div
                    v-if="imagePreviewUrl"
                    class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
                >
                    <img
                        :src="imagePreviewUrl"
                        alt="Selected Image"
                        style="max-width: 100%; max-height: 100%"
                    />
                </div>

                <div
                    v-else-if="!imagePreviewUrl && selectedFile"
                    class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
                >
                    <img
                        :src="`https://unifeed.s3.ap-south-1.amazonaws.com/${selectedFile.uuid}`"
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
                    id="image"
                    name="image"
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    @change="handleAddImageChange"
                />
            </label>
        </div>

        <div class="w-full mt-1">
            <UFormGroup label="Name" required :error="errors.name && errors.name" class="w-full mb-3">
                <UInput
                    id="name"
                    v-model="name"
                    v-bind="nameAttrs"
                    type="text"
                    class="w-full"
                />
            </UFormGroup>

            <UFormGroup label="Hsn" class="w-full">
                <UInput
                    id="hsn"
                    v-model="hsn"
                    v-bind="hsnAttrs"
                    type="text"
                    class="w-full"
                />
            </UFormGroup>
        </div>
    </div>

    <UFormGroup label="Description">
        <UTextarea
            id="description"
            v-model="description"
            v-bind="descriptionAttrs"
            :rows="4"
            name="description"
            class="w-full"
        />
    </UFormGroup>
</template>