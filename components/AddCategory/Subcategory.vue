<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';

const props = defineProps<{
  index: number;
  id: string;
  editName?: string;
  editDescription?: string;
  editFile?: string;
  editStatus?: boolean;
}>();

const emit = defineEmits(['update']);

// Form validation schema
const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

const { errors, defineField, values, handleSubmit } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    name: props.editName || '',
    description: props.editDescription || '',
  }
});

const [name] = defineField('name');
const [description] = defineField('description');
const status = ref(props.editStatus !== undefined ? props.editStatus : true);

// Image handling
const selectedFiles = ref<Array<{ file?: File; uuid: string }>>([]);
const imagePreviewUrls = ref<string[]>([]);

// Initialize with existing image if available
if (props.editFile) {
  selectedFiles.value.push({ uuid: props.editFile });
}

// Handle image changes
const handleAddImageChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    selectedFiles.value = [];
    const file = files[0];
    const uuid = uuidv4();
    selectedFiles.value.push({ file, uuid });
    
    const reader = new FileReader();
    reader.onload = () => {
      imagePreviewUrls.value = [reader.result as string];
    };
    reader.readAsDataURL(file);
  }
};

// Emit updates when values change
watchEffect(() => {
  emit('update', {
    id: props.id,
    name: name.value,
    description: description.value,
    image: selectedFiles.value[0]?.uuid || props.editFile,
    status: status.value
  });
});

const fileInputId = computed(() => `subcategory-image-${props.index}`);
</script>

<template>
  <div class="flex sm:flex-row flex-col sm:justify-start justify-center sm:items-start items-center sm:space-x-4">
    <!-- Image Upload -->
    <div class="mb-5">
      <div class="block text-sm font-medium leading-6 dark:text-white mb-1">Image</div>
      <label :for="fileInputId">
        <div
          class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-32 rounded-lg overflow-hidden"
        >
          <img
            v-if="imagePreviewUrls.length > 0"
            :src="imagePreviewUrls[0]"
            alt="Selected Image"
            class="object-cover w-full h-full"
          />
          <img
            v-else-if="selectedFiles.length > 0"
            :src="`https://images.markit.co.in/${selectedFiles[0].uuid}`"
            alt="Current Image"
            class="object-cover w-full h-full"
          />
          <div
            v-else
            class="flex flex-col items-center justify-center text-gray-400"
          >
            <UIcon name="i-heroicons-camera" class="text-3xl mb-1" />
            <span class="text-xs">Upload Image</span>
          </div>
        </div>
        <input
          :id="fileInputId"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="handleAddImageChange"
        />
      </label>
    </div>

    <!-- Form Fields -->
    <div class="w-full flex flex-col space-y-4">
      <UFormGroup label="Name" required :error="errors.name">
        <UInput v-model="name" type="text" />
      </UFormGroup>

      <UFormGroup label="Description" :error="errors.description">
        <UTextarea v-model="description" />
      </UFormGroup>

      <UFormGroup label="Status">
        <UToggle v-model="status" />
      </UFormGroup>
    </div>
  </div>
</template>