<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid';
import { ref, watch, computed, defineExpose, nextTick } from 'vue';

onMounted(async () => {
  const { default: CropperCanvas } = await import('@cropper/element-canvas');
  const { default: CropperImage } = await import('@cropper/element-image');
  const { default: CropperHandle } = await import('@cropper/element-handle');
  const { default: CropperSelection } = await import('@cropper/element-selection');
  const { default: CropperGrid } = await import('@cropper/element-grid');
  const { default: CropperCrosshair } = await import('@cropper/element-crosshair');


  CropperCanvas.$define();
  CropperImage.$define();
  CropperHandle.$define();
  CropperSelection.$define();
    CropperGrid.$define();
    CropperCrosshair.$define();
});

const props = defineProps<{
  editFile?: string[];
  index?: number;
}>();

interface ImageData {
  file?: File;
  uuid: string;
}

const fileInputId = computed(() => `add-item-${props.index}`);
const selectedFiles = ref<ImageData[]>([]);
const imagePreviewUrls = ref<string[]>([]);

// Crop modal state
const isCropModalOpen = ref(false);
const cropImageUrl = ref<string>('');
const cropperCanvasRef = ref<HTMLElement>();
const cropperImageRef = ref<HTMLElement>();

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
    isCropModalOpen.value = true;

    await nextTick();
  }

  // Reset input value so selecting the same file again still triggers change
  input.value = '';
}


async function confirmCrop() {
  const cropperCanvas = cropperCanvasRef.value as any;
  if (!cropperCanvas) return;

  // Await the generated canvas
  const canvas: HTMLCanvasElement = await cropperCanvas.$toCanvas();

  // Convert to base64
  const dataURL = canvas.toDataURL('image/png');

  // Convert base64 to File
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  const file = new File([u8arr], `image-${Date.now()}.png`, { type: mime });

  // Push like handleAddImage()
  const uuid = uuidv4();
  selectedFiles.value.push({ file, uuid });
  imagePreviewUrls.value.push(dataURL);

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


function onCropperImageTransform(event: CustomEvent) {
  if (!cropperCanvasRef.value) return

  const cropperCanvasRect = cropperCanvasRef.value.getBoundingClientRect()

  const clone = cropperImageRef.value?.cloneNode()
  if (!clone) return

  clone.style.transform = `matrix(${event.detail.matrix.join(', ')})`
  clone.style.opacity = '0'
  cropperCanvasRef.value.appendChild(clone)

  const cropperImageRect = clone.getBoundingClientRect()
  cropperCanvasRef.value.removeChild(clone)

  // Cover fit logic only
  if (
    (cropperImageRect.top > cropperCanvasRect.top &&
      cropperImageRect.right < cropperCanvasRect.right) ||
    (cropperImageRect.right < cropperCanvasRect.right &&
      cropperImageRect.bottom < cropperCanvasRect.bottom) ||
    (cropperImageRect.bottom < cropperCanvasRect.bottom &&
      cropperImageRect.left > cropperCanvasRect.left) ||
    (cropperImageRect.left > cropperCanvasRect.left &&
      cropperImageRect.top > cropperCanvasRect.top)
  ) {
    event.preventDefault()
  }
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
      />
      <img
        v-else
        :src="`https://images.markit.co.in/${file.uuid}`"
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

  <!-- Crop Modal -->
  <div v-if="isCropModalOpen" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-white p-4 rounded shadow-lg max-w-lg w-full">
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
          @transform="onCropperImageTransform"
        ></cropper-image>
        <cropper-selection initial-coverage="1" dynamic movable resizable>
          <cropper-grid role="grid" covered></cropper-grid>
          <cropper-crosshair centered></cropper-crosshair>
          <cropper-handle action="move"></cropper-handle>
          <cropper-handle action="n-resize"></cropper-handle>
          <cropper-handle action="e-resize"></cropper-handle>
          <cropper-handle action="s-resize"></cropper-handle>
          <cropper-handle action="w-resize"></cropper-handle>
        </cropper-selection>
      </cropper-canvas>

      <div class="mt-4 flex justify-end gap-2">
        <UButton @click="closeCropModal" color="gray">Cancel</UButton>
        <UButton @click="confirmCrop" color="primary">Crop</UButton>
      </div>
    </div>
  </div>
</template>
