<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import { ref, watch, computed, defineExpose, nextTick } from 'vue';


onMounted(async () => {
  const { default: CropperCanvas } = await import('@cropper/element-canvas');
  const { default: CropperImage } = await import('@cropper/element-image');
  const { default: CropperHandle } = await import('@cropper/element-handle');
  const { default: CropperSelection } = await import('@cropper/element-selection');
  const { default: CropperViewer } = await import('@cropper/element-viewer');


  CropperCanvas.$define();
  CropperImage.$define();
  CropperHandle.$define();
  CropperSelection.$define();
  CropperViewer.$define();
});

const props = defineProps<{
  editFile?: string[];
  index?: number;
}>();

interface ImageData {
  file?: File;
  uuid: string;
}

const croppingIndex = ref<number | null>(null);
const isModalOpen = ref(false)
const activeImages = ref<string>([])


const fileInputId = computed(() => `add-item-${props.index}`);
const selectedFiles = ref<ImageData[]>([]);
const imagePreviewUrls = ref<string[]>([]);

// Crop modal state
const isCropModalOpen = ref(false);
const cropImageUrl = ref<string>('');
const cropperCanvasRef = ref<HTMLElement>();
const cropperImageRef = ref<HTMLElement>();
const cropperSelectionRef = ref<HTMLElement>();


function openImageViewer(images: string) {
  activeImages.value = images
  isModalOpen.value = true
}

// Watch incoming prop
watch(
  () => props.editFile,
  (newVal) => {
    if (!newVal || newVal.length === 0) {
      selectedFiles.value = [];
      imagePreviewUrls.value = [];
      return;
    }
    selectedFiles.value = newVal.map((file) => ({ uuid: file }));
    imagePreviewUrls.value = new Array(newVal.length).fill('');
  },
  { deep: true, immediate: true }
);

const emit = defineEmits(['update']);
watchEffect(() => {
  emit('update', { files: selectedFiles.value, index: props.index });
});

async function handleAddImageChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files;

  if (files && files[0]) {
    const file = files[0];
    cropImageUrl.value = URL.createObjectURL(file);
    croppingIndex.value = null; // New image
    isCropModalOpen.value = true;
    await nextTick();
  }
  input.value = '';
}

async function confirmCrop() {
  const cropperSelection = cropperSelectionRef.value as any;
  if (!cropperSelection) return;

  // Directly export cropped area
  const canvas: HTMLCanvasElement = await cropperSelection.$toCanvas();

  const dataURL = canvas.toDataURL('image/png');
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);

  const uuid = uuidv4();
  const file = new File([u8arr], `${uuid}.png`, { type: mime });

  if (croppingIndex.value !== null) {
    selectedFiles.value[croppingIndex.value] = { file, uuid };
    imagePreviewUrls.value[croppingIndex.value] = dataURL;
  } else {
    selectedFiles.value.push({ file, uuid });
    imagePreviewUrls.value.push(dataURL);
  }

  closeCropModal();
}


function closeCropModal() {
  cropImageUrl.value = '';
  isCropModalOpen.value = false;
}

function removeImage(index: number) {
  selectedFiles.value.splice(index, 1);
  imagePreviewUrls.value.splice(index, 1);
}

function resetForm() {
  selectedFiles.value = [];
  imagePreviewUrls.value = [];
}



defineExpose({ resetForm });
</script>

<template>
  <div class="block text-sm font-medium leading-6 dark:text-white mt-4">Media</div>
  <div class="flex flex-row overflow-x-auto">
    <label :for="fileInputId">
      <div class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36 mt-1 me-3 flex-none">
        <UIcon name="i-heroicons-camera" class="text-4xl" />
      </div>
    </label>
    <input
      :id="fileInputId"
      name="add-item"
      type="file"
      accept="image/*"
      class="sr-only"
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
        @click="openImageViewer(imagePreviewUrls[index])"
      />
      <img
        v-else
        :src="`https://images.markit.co.in/${file.uuid}`"
        alt="Selected Image"
        class="w-32 h-36 flex-none"
        @click="openImageViewer(file.uuid)"
      />
      <UButton
        icon="i-heroicons-x-mark"
        class="absolute mb-5 rounded-full"
        style="top: -5px; right: -5px"
        @click="removeImage(index)"
      />
    </div>
  </div>

  <!-- Crop Modal -->
<UModal v-model="isCropModalOpen" :overlay="true">
  <div class="p-4">
    <h2 class="text-lg font-semibold mb-4">Crop Image</h2>

    <cropper-canvas style="height: 360px" ref="cropperCanvasRef" background>
      <cropper-image
        ref="cropperImageRef"
        :src="cropImageUrl"
        alt="Crop Image"
        rotatable
        scalable
        skewable
        translatable
      ></cropper-image>
      <cropper-selection
        id="cropperSelection"
        ref="cropperSelectionRef"
        initial-coverage="0.99"
        bounded
        movable
        resizable
      >
        <cropper-handle action="move"></cropper-handle>
        <cropper-handle action="n-resize"></cropper-handle>
        <cropper-handle action="e-resize"></cropper-handle>
        <cropper-handle action="s-resize"></cropper-handle>
        <cropper-handle action="w-resize"></cropper-handle>
        <cropper-handle action="ne-resize"></cropper-handle>
        <cropper-handle action="nw-resize"></cropper-handle>
        <cropper-handle action="se-resize"></cropper-handle>
        <cropper-handle action="sw-resize"></cropper-handle>
      </cropper-selection>
    </cropper-canvas>

    <div class="mt-4 flex justify-end gap-2">
      <UButton @click="closeCropModal" color="gray">Cancel</UButton>
      <UButton @click="confirmCrop" color="primary">Save</UButton>
    </div>
  </div>
</UModal>


  <UModal v-model="isModalOpen" size="xl">
  <div class="p-4 bg-black rounded-lg">
    <img
      :src="activeImages.startsWith('data:') || activeImages.startsWith('blob:')
        ? activeImages
        : `https://images.markit.co.in/${activeImages}`"
      class="max-h-[80vh] mx-auto object-contain"
    />
  </div>
</UModal>

</template>
