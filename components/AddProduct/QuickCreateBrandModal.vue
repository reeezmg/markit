<script setup lang="ts">
import { useCreateBrand } from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth

const props = defineProps<{
  modelValue: boolean
  presetName: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [brand: { id: string, name: string, image?: string | null, description?: string | null }]
}>()

const toast = useToast()
const companyId = computed(() => useAuth().session.value?.companyId)
const CreateBrand = useCreateBrand({ optimisticUpdate: true })
const isCreating = computed(() => CreateBrand.isPending.value)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const brandForm = reactive({
  name: '',
  description: '',
  image: ''
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    brandForm.name = props.presetName || ''
    brandForm.description = ''
    brandForm.image = ''
  }
)

const createBrand = async () => {
  if (!brandForm.name.trim()) {
    toast.add({ title: 'Brand name required', color: 'red' })
    return
  }

  try {
    const brand = await CreateBrand.mutateAsync({
      data: {
        name: brandForm.name.trim(),
        description: brandForm.description || '',
        image: brandForm.image || '',
        companyId: companyId.value
      }
    })

    if (brand) {
      emit('created', brand)
    }

    toast.add({ title: 'Brand created' })
    emit('update:modelValue', false)
  } catch (err: any) {
    toast.add({
      title: 'Could not create brand',
      description: err?.info?.message ?? err?.message ?? String(err),
      color: 'red'
    })
  }
}
</script>

<template>
  <UDashboardModal
    v-model="isOpen"
    title="Add Brand"
    prevent-close
  >
    <div class="space-y-4">
      <UInput v-model="brandForm.name" placeholder="Brand Name" autofocus />

      <UTextarea
        v-model="brandForm.description"
        placeholder="Description"
      />

      <UInput
        v-model="brandForm.image"
        placeholder="Image URL"
      />
    </div>

    <template #footer>
      <UButton
        label="Save"
        :loading="isCreating"
        @click="createBrand"
      />
      <UButton
        color="white"
        label="Cancel"
        @click="emit('update:modelValue', false)"
      />
    </template>
  </UDashboardModal>
</template>
