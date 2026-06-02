<script setup lang="ts">
import AwsService from '~/composables/aws'
import { useCreateCategory } from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth

const props = defineProps<{
  modelValue: boolean
  presetName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [category: any]
}>()

interface ImageData {
  file?: File
  uuid: string
}

const toast = useToast()
const categoryStore = useCategoryStore()
const awsService = new AwsService()
const CreateCategory = useCreateCategory({ optimisticUpdate: true })
const isCreating = computed(() => CreateCategory.isPending.value)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const form = reactive<{
  name: string
  hsn: string
  shortCut: string
  description: string
  file: ImageData | null
  taxType?: 'FIXED' | 'VARIABLE'
  fixedTax: number
  thresholdAmount: number
  taxBelowThreshold: number
  taxAboveThreshold: number
  margin: number
  targetAudience: string | null
}>({
  name: '',
  hsn: '',
  shortCut: '',
  description: '',
  file: null,
  taxType: undefined,
  fixedTax: 0,
  thresholdAmount: 0,
  taxBelowThreshold: 0,
  taxAboveThreshold: 0,
  margin: 0,
  targetAudience: null
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    form.name = props.presetName || ''
    form.hsn = ''
    form.shortCut = ''
    form.description = ''
    form.file = null
    form.taxType = undefined
    form.fixedTax = 0
    form.thresholdAmount = 0
    form.taxBelowThreshold = 0
    form.taxAboveThreshold = 0
    form.margin = 0
    form.targetAudience = null
  }
)

const updateForm = (data: any) => {
  form.name = data.name
  form.hsn = data.hsn
  form.shortCut = data.shortCut
  form.file = data.file
  form.description = data.description
  form.taxType = data.taxType
  form.fixedTax = data.fixedTax
  form.thresholdAmount = data.thresholdAmount
  form.taxBelowThreshold = data.taxBelowThreshold
  form.taxAboveThreshold = data.taxAboveThreshold
  form.margin = data.margin
  form.targetAudience = data.targetAudience || null
}

const createCategory = async () => {
  if (!form.name?.trim()) {
    toast.add({ title: 'Category name required', color: 'red' })
    return
  }

  try {
    const category = await CreateCategory.mutateAsync({
      data: {
        name: form.name.trim(),
        hsn: form.hsn || '',
        description: form.description || '',
        ...(form.shortCut && { shortCut: form.shortCut }),
        image: form.file?.uuid,
        taxType: form.taxType || undefined,
        fixedTax: form.fixedTax || undefined,
        thresholdAmount: form.thresholdAmount || undefined,
        taxBelowThreshold: form.taxBelowThreshold || undefined,
        taxAboveThreshold: form.taxAboveThreshold || undefined,
        margin: form.margin || undefined,
        targetAudience: form.targetAudience || undefined,
        company: {
          connect: {
            id: useAuth().session.value?.companyId
          }
        }
      }
    })

    if (form.file?.file) {
      const base64 = await prepareFileForApi(form.file.file)
      await awsService.uploadBase64File(base64, form.file.uuid)
    }

    await categoryStore.refreshCategories()

    if (category) {
      emit('created', category)
    }

    toast.add({ title: 'Category created' })
    emit('update:modelValue', false)
  } catch (err: any) {
    toast.add({
      title: 'Could not create category',
      description: err?.info?.message ?? err?.message ?? String(err),
      color: 'red'
    })
  }
}
</script>

<template>
  <UDashboardModal
    v-model="isOpen"
    title="Add Category"
      prevent-close
  >
    <AddCategoryCreate
      :edit-name="presetName"
      @update="updateForm"
    />

    <template #footer>
      <UButton
        label="Save"
        :loading="isCreating"
        @click="createCategory"
      />
      <UButton
        color="white"
        label="Cancel"
        @click="emit('update:modelValue', false)"
      />
    </template>
  </UDashboardModal>
</template>
