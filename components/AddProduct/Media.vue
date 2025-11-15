<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import { ref, watch, computed, defineExpose } from 'vue'
import AwsService from '~/composables/aws'
import {useUpdateProduct} from '~/lib/hooks';

const UpdateProduct = useUpdateProduct();

const useAuth = () => useNuxtApp().$auth;
const awsService = new AwsService()

const props = defineProps<{
  editFile?: string[]
  index?: number
  categoryName?: string
  targetAudience?: string
  productId?: string
  updatedAt?: Date
}>()


interface ImageData {
  file?: File
  uuid: string
  view: string
  isLoading?: boolean
}

const isModalOpen = ref(false)
const activeImages = ref<string[]>([])

const fileInputId = computed(() => `add-item-${props.index}`)
const selectedFiles = ref<ImageData[]>([])
const imagePreviewUrls = ref<string[]>([])

const emit = defineEmits(['update', 'refetch'])

// 🧩 Watch for initial edit files
watch(
  () => props.editFile,
  (newVal) => {
    if (!newVal || newVal.length === 0) {
      selectedFiles.value = []
      imagePreviewUrls.value = []
      return
    }
    selectedFiles.value = newVal.map((file, i) => ({
      uuid: file,
      view: i === 0 ? 'front' : i === 1 ? 'back' : 'extra',
      isLoading: false,
    }))
    imagePreviewUrls.value = new Array(newVal.length).fill('')
  },
  { deep: true, immediate: true }
)

// Emit any updates to parent
watch(
  selectedFiles,
  () => {
    emit('update', { files: selectedFiles.value, index: props.index })
  },
  { deep: true, immediate: true }
)

// 🖼️ Image viewer
function openImageViewer(image: string) {
  activeImages.value = [image]
  isModalOpen.value = true
}

// 📤 Handle file add
async function handleAddImageChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  const file = files[0]
  const uuid = uuidv4()
  const previewUrl = URL.createObjectURL(file)

  const view =
    selectedFiles.value.length === 0
      ? 'front'
      : selectedFiles.value.length === 1
      ? 'back'
      : 'extra'

  selectedFiles.value.push({ file, uuid, view, isLoading: false })
  imagePreviewUrls.value.push(previewUrl)

  input.value = '' // reset input
}

// 🗑️ Remove image
function removeImage(index: number) {
  selectedFiles.value.splice(index, 1)
  imagePreviewUrls.value.splice(index, 1)
}

// 🔁 Reset all
function resetForm() {
  selectedFiles.value = []
  imagePreviewUrls.value = []
}

// ✨ Apply AI Enhancement
async function applyAi(uuid: string, view: string, index: number) {
console.log("dfdf", props.productId, props.categoryName, props.targetAudience)
  const file = selectedFiles.value[index]
  if (!file) return

  file.isLoading = true

  try {
    const result = await awsService.aify(
      uuid,
      view,
      props.categoryName,
      props.targetAudience
    )

    await UpdateProduct.mutateAsync({
  where: { id: props.productId },
  data: {
    updatedAt: new Date(),
  },
})
  emit('refetch')
    console.log('✅ AI processed result:', result)
  } catch (error) {
    console.error('❌ AI processing failed:', error)
  } finally {
    file.isLoading = false
  }
}

defineExpose({ resetForm })
</script>

<template>
  <div class="block text-sm font-medium leading-6 dark:text-white mt-4">
    Media
  </div>

  <div class="flex flex-row overflow-x-auto">
    <!-- 📷 Upload Button -->
    <label :for="fileInputId">
      <div
        class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-36 mt-1 me-3 flex-none cursor-pointer"
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
       capture="camera"
      @change="handleAddImageChange"
    />

    <!-- 🖼️ Image List -->
    <div
      v-for="(file, index) in selectedFiles"
      :key="file.uuid"
      class="relative mt-1 me-3 flex-none"
    >
      <!-- Preview -->
      <img
        v-if="file.file"
        :src="imagePreviewUrls[index]"
        alt="Selected Image"
        class="w-32 h-36 flex-none object-cover rounded"
        @click="openImageViewer(imagePreviewUrls[index])"
      />
      <img
        v-else
        :src="`https://images.markit.co.in/${file.uuid}?t=${props.updatedAt}`"
        alt="Selected Image"
        class="w-32 h-36 flex-none object-cover rounded"
        @click="openImageViewer(file.uuid)"
      />

      <!-- ❌ Delete -->
      <UButton
        icon="i-heroicons-x-mark"
        class="absolute rounded-full"
        style="top: -5px; right: -5px"
        @click="removeImage(index)"
      />

      <!-- ✨ AI Button (Only when isAiImage enabled & uuid exists) -->
      <UButton
        v-if="file.uuid && useAuth().session.value?.isAiImage && !file.file"
        :icon="file.isLoading ? 'i-heroicons-arrow-path' : 'i-heroicons-sparkles'"
        :loading="file.isLoading"
        color="primary"
        class="absolute rounded-full"
        style="top: -5px; left: -5px"
        :disabled="file.isLoading"
        @click="applyAi(file.uuid, file.view, index)"
      />

      <!-- 👁️ View Selector -->
      <div class="mt-2">
        <USelect
          v-model="file.view"
          :options="[
            { label: 'Front', value: 'front' },
            { label: 'Back', value: 'back' },
            { label: 'Side', value: 'side' },
            { label: 'Extra', value: 'extra' },
          ]"
          class="w-32 text-sm"
        />
      </div>
    </div>
  </div>

  <!-- 🖼️ Image Viewer Modal -->
  <UModal v-model="isModalOpen" size="xl">
    <div class="p-4 bg-black rounded-lg">
      <img
        :src="
          activeImages[0]?.startsWith('data:') ||
          activeImages[0]?.startsWith('blob:')
            ? activeImages[0]
            : `https://images.markit.co.in/${activeImages[0]}?t=${props.updatedAt}`
        "
        class="max-h-[80vh] mx-auto object-contain"
      />
    </div>
  </UModal>
</template>
