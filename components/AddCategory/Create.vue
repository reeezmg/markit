<script setup lang="ts">
import * as z from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { v4 as uuidv4 } from 'uuid';

const useAuth = () => useNuxtApp().$auth;

const availableAudiences = computed(() => {
  const cat = useAuth().session.value?.category;
  if (!cat) return [];
  return Array.isArray(cat) ? cat : [cat];
});


console.log('Available Audiences:', availableAudiences.value);

const hsnData = ref<{ hsn: string; thresholdAmount?: number; taxBelowThreshold?: number; taxAboveThreshold?: number; fixedTax?: number }[]>([]);

onMounted(async () => {
  const res = await fetch('/hsncode.json');
  hsnData.value = await res.json();
});

const props = defineProps<{
  editName?: string | null;
  editHsn?: string | null;
  editShortCut?: string | null;
  editDescription?: string | null;
  editFile?: string | null;
  taxType?: 'FIXED' | 'VARIABLE' | undefined;
  thresholdAmount?: number | null;
  taxBelowThreshold?: number | null;
  taxAboveThreshold?: number | null;
  fixedTax?: number | null;
  margin?: number | null;
  targetAudience?: string | null;
}>();

const emit = defineEmits(['update']);

const schemas = z.object({
  name: z.string().min(2),
  hsn: z.string().optional(),
  shortCut: z.string().optional(),
  description: z.string(),
  taxType: z.enum(['FIXED', 'VARIABLE']),
  fixedTax: z.number().optional(),
  thresholdAmount: z.number().optional(),
  taxBelowThreshold: z.number().optional(),
  taxAboveThreshold: z.number().optional(),
  margin: z.number().optional(),
  targetAudience: z.string().optional(), // ✅ make flexible for dynamic options
});

const { errors, defineField, values } = useForm({
  validationSchema: toTypedSchema(schemas),
});

interface ImageData {
  file?: File;
  uuid: string;
}

const selectedFile = ref<ImageData | null>(null);
const imagePreviewUrl = ref<string | null>(null);

const [name, nameAttrs] = defineField('name');
const [hsn, hsnAttrs] = defineField('hsn');
const [shortCut, shortCutAttrs] = defineField('shortCut');
const [description, descriptionAttrs] = defineField('description');
const [taxType, taxTypeAttrs] = defineField('taxType');
const [fixedTax, fixedTaxAttrs] = defineField('fixedTax');
const [thresholdAmount, thresholdAmountAttrs] = defineField('thresholdAmount');
const [taxBelowThreshold, taxBelowThresholdAttrs] = defineField('taxBelowThreshold');
const [taxAboveThreshold, taxAboveThresholdAttrs] = defineField('taxAboveThreshold');
const [margin, marginAttrs] = defineField('margin');
const [targetAudience, targetAudienceAttrs] = defineField('targetAudience');

watchEffect(() => {
  if (props.editName) name.value = props.editName;
  if (props.editHsn) hsn.value = props.editHsn;
  if (props.editShortCut) shortCut.value = props.editShortCut;
  if (props.editDescription) description.value = props.editDescription;
  if (props.editFile) {
    selectedFile.value = { uuid: props.editFile };
    imagePreviewUrl.value = `https://images.markit.co.in/${props.editFile}`;
  }
  if (props.taxType) taxType.value = props.taxType;
  if (props.fixedTax) fixedTax.value = props.fixedTax;
  if (props.thresholdAmount) thresholdAmount.value = props.thresholdAmount;
  if (props.taxBelowThreshold) taxBelowThreshold.value = props.taxBelowThreshold;
  if (props.taxAboveThreshold) taxAboveThreshold.value = props.taxAboveThreshold;
  if (props.margin) margin.value = props.margin;
  if (props.targetAudience) targetAudience.value = props.targetAudience;
});

function handleAddImageChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    const file = files[0];
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
    shortCut: shortCut.value,
    description: description.value,
    file: selectedFile.value,
    taxType: taxType.value,
    fixedTax: fixedTax.value,
    thresholdAmount: thresholdAmount.value,
    taxBelowThreshold: taxBelowThreshold.value,
    taxAboveThreshold: taxAboveThreshold.value,
    margin: margin.value,
    targetAudience: targetAudience.value,
  });
});

watch(hsn, (newVal) => {
  const matched = hsnData.value.find((item) => item.hsn == newVal);
  if (matched) {
    if (matched.thresholdAmount) {
      taxType.value = 'VARIABLE';
      thresholdAmount.value = matched.thresholdAmount;
      taxBelowThreshold.value = matched.taxBelowThreshold;
      taxAboveThreshold.value = matched.taxAboveThreshold;
    } else {
      taxType.value = 'FIXED';
      fixedTax.value = matched.fixedTax;
    }
  }
});
</script>

<template>
  <div>
    <div class="text-xl mb-4">Category</div>
    <hr class="h-px my-8 bg-gray-200 border-0 dark:bg-gray-700" />
    <div
      class="flex sm:flex-row flex-col sm:justify-start justify-center sm:items-start items-center space-x-2"
    >
      <div class="mb-5">
        <div class="block text-sm font-medium leading-6 dark:text-white mb-1">
          Image
        </div>
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
            v-else-if="!imagePreviewUrl && selectedFile?.uuid"
            class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36"
          >
            <img
              :src="`https://images.markit.co.in/${selectedFile.uuid}`"
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
          <UInput id="name" v-model="name" v-bind="nameAttrs" type="text" class="w-full" />
        </UFormGroup>

        <UFormGroup label="Hsn" class="w-full">
          <UInput id="hsn" v-model="hsn" v-bind="hsnAttrs" type="text" class="w-full" />
        </UFormGroup>

        <UFormGroup label="Tax Type" required class="w-full mt-4 mb-3">
          <USelect
            v-model="taxType"
            v-bind="taxTypeAttrs"
            :options="['FIXED', 'VARIABLE']"
            class="w-full"
          />
        </UFormGroup>

        <UFormGroup v-if="taxType === 'FIXED'" label="Fixed Tax (%)" class="w-full mb-3">
          <UInput
            v-model="fixedTax"
            v-bind="fixedTaxAttrs"
            type="number"
            step="0.01"
            class="w-full"
          />
        </UFormGroup>

        <div v-if="taxType === 'VARIABLE'" class="space-y-3">
          <UFormGroup label="Threshold Amount (₹)" class="w-full">
            <UInput
              v-model="thresholdAmount"
              v-bind="thresholdAmountAttrs"
              type="number"
              class="w-full"
            />
          </UFormGroup>
          <UFormGroup label="Tax Below Threshold (%)" class="w-full">
            <UInput
              v-model="taxBelowThreshold"
              v-bind="taxBelowThresholdAttrs"
              type="number"
              step="0.01"
              class="w-full"
            />
          </UFormGroup>
          <UFormGroup label="Tax Above Threshold (%)" class="w-full">
            <UInput
              v-model="taxAboveThreshold"
              v-bind="taxAboveThresholdAttrs"
              type="number"
              step="0.01"
              class="w-full"
            />
          </UFormGroup>
        </div>

        <UFormGroup label="Short Cut" class="w-full my-3">
          <UInput
            id="shortCut"
            v-model="shortCut"
            v-bind="shortCutAttrs"
            type="text"
            class="w-full"
          />
        </UFormGroup>

        <UFormGroup label="Profit Margin" class="w-full my-3">
          <UInput
            id="margin"
            v-model="margin"
            v-bind="marginAttrs"
            type="number"
            class="w-full"
          />
        </UFormGroup>

        <!-- ✅ New Select Field -->
       <UFormGroup label="Target Audience" class="w-full my-3">
  <USelect
    id="targetAudience"
    v-model="targetAudience"
    v-bind="targetAudienceAttrs"
    :options="availableAudiences.length ? availableAudiences : ['Men', 'Women', 'Girl', 'Boy']"
    class="w-full"
  />
</UFormGroup>


      </div>
    </div>
  </div>
</template>
