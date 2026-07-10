<script setup lang="ts">
type ClientOption = {
  id: string
  name?: string
  email?: string
  phone?: string
}

type FeedbackRow = {
  id: string
  clientId?: string | null
  customerName: string
  clientEmail?: string | null
  clientPhone?: string | null
  title: string
  message: string
  rating: number
  sortOrder: number
  status: boolean
}

const toast = useToast()

const { data: feedback, pending, refresh } = await useFetch<FeedbackRow[]>('/api/ecommerce-cms/feedback', {
  default: () => [],
})

const { data: clients } = await useFetch<ClientOption[]>('/api/ecommerce-cms/feedback/clients', {
  default: () => [],
})

const form = reactive({
  id: '',
  clientId: '',
  customerName: '',
  title: '',
  message: '',
  rating: 5,
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const showForm = ref(false)
const editing = computed(() => !!form.id)

function resetForm() {
  form.id = ''
  form.clientId = ''
  form.customerName = ''
  form.title = ''
  form.message = ''
  form.rating = 5
  form.sortOrder = (feedback.value?.length || 0) + 1
  form.status = true
}

function openNew() {
  resetForm()
  showForm.value = true
}

function edit(row: FeedbackRow) {
  form.id = row.id
  form.clientId = row.clientId || ''
  form.customerName = row.customerName
  form.title = row.title
  form.message = row.message
  form.rating = row.rating
  form.sortOrder = row.sortOrder
  form.status = row.status
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

function clientLabel(client: ClientOption) {
  return [client.name, client.email, client.phone].filter(Boolean).join(' · ')
}

async function save() {
  if (!form.title.trim() || !form.message.trim()) {
    toast.add({ title: 'Title and message are required', color: 'red' })
    return
  }
  if (!form.clientId && !form.customerName.trim()) {
    toast.add({ title: 'Select a client or enter a customer name', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      clientId: form.clientId || null,
      customerName: form.customerName,
      title: form.title,
      message: form.message,
      rating: Number(form.rating || 5),
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/feedback/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'Feedback updated' })
    } else {
      await $fetch('/api/ecommerce-cms/feedback', { method: 'POST', body })
      toast.add({ title: 'Feedback added' })
    }

    showForm.value = false
    resetForm()
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save feedback',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: FeedbackRow) {
  await $fetch(`/api/ecommerce-cms/feedback/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: FeedbackRow) {
  await $fetch(`/api/ecommerce-cms/feedback/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'Feedback deleted' })
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
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Feedback</h1>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Customer testimonials shown on the custom ecommerce homepage.
              </p>
            </div>
            <UButton icon="i-heroicons-plus" label="New feedback" @click="openNew" />
          </div>
        </template>

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
        </div>

        <div v-else-if="!feedback?.length" class="py-16 text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">No feedback yet</div>
          <p class="mt-1 text-sm text-gray-500">Add a review from the form.</p>
        </div>

        <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
          <div v-for="row in feedback" :key="row.id" class="flex gap-4 py-4">
            <div class="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {{ row.rating }}★
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-medium text-gray-900 dark:text-white">{{ row.title }}</h2>
                  <p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{{ row.message }}</p>
                  <p class="mt-2 text-xs text-gray-400">
                    {{ row.customerName }}
                    <span v-if="row.clientEmail"> · {{ row.clientEmail }}</span>
                    <span v-if="row.clientPhone"> · {{ row.clientPhone }}</span>
                  </p>
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
            {{ editing ? 'Edit feedback' : 'Add feedback' }}
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Linked client">
            <select v-model="form.clientId" class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Manual name</option>
              <option v-for="client in clients" :key="client.id" :value="client.id">
                {{ clientLabel(client) }}
              </option>
            </select>
          </UFormGroup>

          <UFormGroup label="Customer name" :required="!form.clientId">
            <UInput v-model="form.customerName" :disabled="!!form.clientId" placeholder="Customer name" />
          </UFormGroup>

          <UFormGroup label="Title" required>
            <UInput v-model="form.title" placeholder="Loved the finish" />
          </UFormGroup>

          <UFormGroup label="Message" required>
            <UTextarea v-model="form.message" :rows="5" placeholder="Feedback shown on the ecommerce storefront." />
          </UFormGroup>

          <div class="grid grid-cols-3 gap-3">
            <UFormGroup label="Rating">
              <UInput v-model.number="form.rating" type="number" min="1" max="5" />
            </UFormGroup>
            <UFormGroup label="Sort">
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
            <UButton :loading="isSaving" icon="i-heroicons-check" :label="editing ? 'Save changes' : 'Create feedback'" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
