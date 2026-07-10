<script setup lang="ts">
type FaqRow = {
  id: string
  question: string
  answer: string
  sortOrder: number
  status: boolean
}

const toast = useToast()

const { data: faqs, pending, refresh } = await useFetch<FaqRow[]>('/api/ecommerce-cms/faq', {
  default: () => [],
})

const form = reactive({
  id: '',
  question: '',
  answer: '',
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const showForm = ref(false)
const editing = computed(() => !!form.id)

function resetForm() {
  form.id = ''
  form.question = ''
  form.answer = ''
  form.sortOrder = (faqs.value?.length || 0) + 1
  form.status = true
}

function openNew() {
  resetForm()
  showForm.value = true
}

function edit(row: FaqRow) {
  form.id = row.id
  form.question = row.question
  form.answer = row.answer
  form.sortOrder = row.sortOrder
  form.status = row.status
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

async function save() {
  if (!form.question.trim() || !form.answer.trim()) {
    toast.add({ title: 'Question and answer are required', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      question: form.question,
      answer: form.answer,
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/faq/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'FAQ updated' })
    } else {
      await $fetch('/api/ecommerce-cms/faq', { method: 'POST', body })
      toast.add({ title: 'FAQ added' })
    }

    showForm.value = false
    resetForm()
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save FAQ',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: FaqRow) {
  await $fetch(`/api/ecommerce-cms/faq/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: FaqRow) {
  await $fetch(`/api/ecommerce-cms/faq/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'FAQ deleted' })
  await refresh()
  if (form.id === row.id) resetForm()
}

onMounted(resetForm)
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-3">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">FAQ</h1>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Questions shown on custom ecommerce apps for this company.
              </p>
            </div>
            <UButton icon="i-heroicons-plus" label="New FAQ" @click="openNew" />
          </div>
        </template>

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="i in 4" :key="i" class="h-20 w-full" />
        </div>

        <div v-else-if="!faqs?.length" class="py-16 text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">No FAQs yet</div>
          <p class="mt-1 text-sm text-gray-500">Create the first FAQ from the form.</p>
        </div>

        <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
          <div v-for="row in faqs" :key="row.id" class="flex gap-4 py-4">
            <div class="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {{ row.sortOrder }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-medium text-gray-900 dark:text-white">{{ row.question }}</h2>
                  <p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{{ row.answer }}</p>
                </div>
                <UBadge :color="row.status ? 'green' : 'gray'" variant="subtle">
                  {{ row.status ? 'Live' : 'Hidden' }}
                </UBadge>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <UButton color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="edit(row)" />
              <UButton color="gray" variant="ghost" :icon="row.status ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" @click="toggle(row)" />
              <UButton color="red" variant="ghost" icon="i-heroicons-trash" @click="remove(row)" />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model="showForm">
      <UCard>
        <template #header>
          <div class="font-semibold text-gray-900 dark:text-white">
            {{ editing ? 'Edit FAQ' : 'Add FAQ' }}
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Question" required>
            <UInput v-model="form.question" placeholder="How long does delivery take?" />
          </UFormGroup>

          <UFormGroup label="Answer" required>
            <UTextarea v-model="form.answer" :rows="6" placeholder="Answer shown on the ecommerce storefront." />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-3">
            <UFormGroup label="Sort order">
              <UInput v-model.number="form.sortOrder" type="number" min="0" />
            </UFormGroup>
            <UFormGroup label="Live">
              <div class="flex h-10 items-center">
                <UToggle v-model="form.status" />
              </div>
            </UFormGroup>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="closeForm" />
            <UButton :loading="isSaving" icon="i-heroicons-check" :label="editing ? 'Save changes' : 'Create FAQ'" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
