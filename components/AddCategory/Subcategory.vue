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
  editShortCut?: string;
  editHsn?: string;
  editTaxType?: 'FIXED' | 'VARIABLE';
  editFixedTax?: number;
  editThresholdAmount?: number;
  editTaxBelowThreshold?: number;
  editTaxAboveThreshold?: number;
  editMargin?: number;
}>();

const emit = defineEmits(['update']);

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  shortCut: z.string().optional(),
  hsn: z.string().optional(),
});

const { errors, defineField, values, handleSubmit } = useForm({
  validationSchema: toTypedSchema(schema),
  initialValues: {
    name: props.editName || '',
    description: props.editDescription || '',
    shortCut: props.editShortCut || '',
    hsn: props.editHsn || '',
  }
});

const [name] = defineField('name');
const [description] = defineField('description');
const [shortCut] = defineField('shortCut');
const [hsn] = defineField('hsn');

const status = ref(props.editStatus !== undefined ? props.editStatus : true);
const taxType = ref<'FIXED' | 'VARIABLE'>(props.editTaxType || 'FIXED');
const fixedTax = ref(props.editFixedTax ?? 0);
const thresholdAmount = ref(props.editThresholdAmount ?? 0);
const taxBelowThreshold = ref(props.editTaxBelowThreshold ?? 0);
const taxAboveThreshold = ref(props.editTaxAboveThreshold ?? 0);
const margin = ref(props.editMargin ?? 0);

const taxTypeOptions = [
  { label: 'Fixed', value: 'FIXED' },
  { label: 'Variable', value: 'VARIABLE' },
];

// Image handling
const selectedFiles = ref<Array<{ file?: File; uuid: string }>>([]);
const imagePreviewUrls = ref<string[]>([]);

if (props.editFile) {
  selectedFiles.value.push({ uuid: props.editFile });
}

const handleAddImageChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    selectedFiles.value = [];
    const file = files[0];
    const uuid = uuidv4();
    selectedFiles.value.push({ file, uuid });
    const reader = new FileReader();
    reader.onload = () => { imagePreviewUrls.value = [reader.result as string]; };
    reader.readAsDataURL(file);
  }
};

watchEffect(() => {
  emit('update', {
    id: props.id,
    name: name.value,
    description: description.value,
    shortCut: shortCut.value || undefined,
    hsn: hsn.value || undefined,
    taxType: taxType.value,
    fixedTax: Number(fixedTax.value) || 0,
    thresholdAmount: Number(thresholdAmount.value) || 0,
    taxBelowThreshold: Number(taxBelowThreshold.value) || 0,
    taxAboveThreshold: Number(taxAboveThreshold.value) || 0,
    margin: Number(margin.value) || 0,
    image: selectedFiles.value[0]?.uuid || props.editFile,
    imageFile: selectedFiles.value[0]?.file ? selectedFiles.value[0] : undefined,
    status: status.value,
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
        <div class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-32 rounded-lg overflow-hidden">
          <img v-if="imagePreviewUrls.length > 0" :src="imagePreviewUrls[0]" alt="Selected Image" class="object-cover w-full h-full" />
          <img v-else-if="selectedFiles.length > 0" :src="`https://images.markit.co.in/${selectedFiles[0].uuid}`" alt="Current Image" class="object-cover w-full h-full" />
          <div v-else class="flex flex-col items-center justify-center text-gray-400">
            <UIcon name="i-heroicons-camera" class="text-3xl mb-1" />
            <span class="text-xs">Upload Image</span>
          </div>
        </div>
        <input :id="fileInputId" type="file" accept="image/*" class="sr-only" @change="handleAddImageChange" />
      </label>
    </div>

    <!-- Form Fields -->
    <div class="w-full flex flex-col space-y-4">
      <UFormGroup label="Name" required :error="errors.name">
        <UInput v-model="name" type="text" />
      </UFormGroup>

      <UFormGroup label="Short Cut" :error="errors.shortCut">
        <UInput v-model="shortCut" type="text" placeholder="e.g. 2" />
      </UFormGroup>

      <UFormGroup label="HSN" :error="errors.hsn">
        <UInput v-model="hsn" type="text" />
      </UFormGroup>

      <UFormGroup label="Tax Type">
        <USelect v-model="taxType" :options="taxTypeOptions" option-attribute="label" value-attribute="value" />
      </UFormGroup>

      <template v-if="taxType === 'FIXED'">
        <UFormGroup label="Tax (%)">
          <UInput v-model="fixedTax" type="number" min="0" />
        </UFormGroup>
      </template>

      <template v-else>
        <UFormGroup label="Threshold Amount">
          <UInput v-model="thresholdAmount" type="number" min="0" />
        </UFormGroup>
        <UFormGroup label="Tax Below Threshold (%)">
          <UInput v-model="taxBelowThreshold" type="number" min="0" />
        </UFormGroup>
        <UFormGroup label="Tax Above Threshold (%)">
          <UInput v-model="taxAboveThreshold" type="number" min="0" />
        </UFormGroup>
      </template>

      <UFormGroup label="Profit Margin (%)">
        <UInput v-model="margin" type="number" min="0" />
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
