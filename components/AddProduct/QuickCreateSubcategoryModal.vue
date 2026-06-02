<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import AwsService from '~/composables/aws'
import { useCreateSubcategory, useFindManyCategory } from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth

const props = defineProps<{
  modelValue: boolean
  presetName: string
  presetCategoryId?: string
  presetCategoryName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [subcategory: any]
}>()

const toast = useToast()
const awsService = new AwsService()
const CreateSubcategory = useCreateSubcategory({ optimisticUpdate: true })
const isCreating = computed(() => CreateSubcategory.isPending.value)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const { data: categories } = useFindManyCategory({
  where: { companyId: useAuth().session.value?.companyId },
  select: {
    id: true,
    name: true,
    image: true
  }
})

const selectedCategory = ref<any>({})
const name = ref('')
const description = ref('')
const status = ref(true)
const selectedFile = ref<{ file?: File, uuid: string } | null>(null)
const imagePreviewUrl = ref<string | null>(null)

const canSave = computed(() => !!name.value.trim() && !!selectedCategory.value?.id)

const applyPresetCategory = () => {
  if (props.presetCategoryId && categories.value?.length) {
    selectedCategory.value = categories.value.find((category: any) => category.id === props.presetCategoryId) || {
      id: props.presetCategoryId,
      name: props.presetCategoryName
    }
  } else if (props.presetCategoryId) {
    selectedCategory.value = {
      id: props.presetCategoryId,
      name: props.presetCategoryName
    }
  } else {
    selectedCategory.value = {}
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return

    name.value = props.presetName || ''
    description.value = ''
    status.value = true
    selectedFile.value = null
    imagePreviewUrl.value = null
    applyPresetCategory()
  }
)

watch(categories, () => {
  if (props.modelValue && props.presetCategoryId) {
    applyPresetCategory()
  }
})

const handleImageChange = (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return

  const file = files[0]
  const uuid = uuidv4()
  selectedFile.value = { file, uuid }

  const reader = new FileReader()
  reader.onload = () => {
    imagePreviewUrl.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

const createSubcategory = async () => {
  if (!canSave.value) {
    toast.add({ title: 'Subcategory name and category are required', color: 'red' })
    return
  }

  try {
    const subcategory = await CreateSubcategory.mutateAsync({
      data: {
        name: name.value.trim(),
        description: description.value || '',
        image: selectedFile.value?.uuid,
        status: status.value,
        company: {
          connect: {
            id: useAuth().session.value?.companyId
          }
        },
        category: {
          connect: {
            id: selectedCategory.value.id
          }
        }
      }
    })

    if (selectedFile.value?.file) {
      const base64 = await prepareFileForApi(selectedFile.value.file)
      await awsService.uploadBase64File(base64, selectedFile.value.uuid)
    }

    if (subcategory) {
      emit('created', {
        ...subcategory,
        categoryId: selectedCategory.value.id
      })
    }

    toast.add({ title: 'Subcategory created' })
    emit('update:modelValue', false)
  } catch (err: any) {
    toast.add({
      title: 'Could not create subcategory',
      description: err?.info?.message ?? err?.message ?? String(err),
      color: 'red'
    })
  }
}
</script>

<template>
  <UDashboardModal
    v-model="isOpen"
    title="Add Subcategory"
     prevent-close
  >
    <div class="space-y-4">
      <UFormGroup label="Category" required>
        <USelectMenu
          v-model="selectedCategory"
          :options="categories"
          option-key="id"
          track-by="id"
          searchable
          option-attribute="name"
          searchable-placeholder="Search a Category..."
        >
          <template #label>
            <span v-if="selectedCategory?.name" class="truncate">
              {{ selectedCategory.name }}
            </span>
            <span v-else>Select category</span>
          </template>
        </USelectMenu>
      </UFormGroup>

      <div class="flex sm:flex-row flex-col sm:items-start items-center sm:space-x-4">
        <div class="mb-5">
          <div class="block text-sm font-medium leading-6 dark:text-white mb-1">Image</div>
          <label for="quick-subcategory-image">
            <div
              class="flex justify-center items-center border border-gray-200 dark:border-gray-700 w-32 h-32 rounded-lg overflow-hidden"
            >
              <img
                v-if="imagePreviewUrl"
                :src="imagePreviewUrl"
                alt="Selected Image"
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
              id="quick-subcategory-image"
              type="file"
              accept="image/*"
              class="sr-only"
              @change="handleImageChange"
            />
          </label>
        </div>

        <div class="w-full flex flex-col space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="name" type="text" autofocus />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea v-model="description" />
          </UFormGroup>

          <UFormGroup label="Status">
            <UToggle v-model="status" />
          </UFormGroup>
        </div>
      </div>
    </div>

    <template #footer>
      <UButton
        label="Save"
        :disabled="!canSave"
        :loading="isCreating"
        @click="createSubcategory"
      />
      <UButton
        color="white"
        label="Cancel"
        @click="emit('update:modelValue', false)"
      />
    </template>
  </UDashboardModal>
</template>
