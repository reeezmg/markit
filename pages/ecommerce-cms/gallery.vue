<script setup lang="ts">
type GalleryRow = {
  id: string
  name: string
  type: string
  url: string | null
  sortOrder: number
  status: boolean
}

const toast = useToast()

function youtubeId(url: string): string | null {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}
function thumb(url: string | null): string | null {
  const id = url ? youtubeId(url) : null
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

const { data: items, pending, refresh } = await useFetch<GalleryRow[]>(
  '/api/ecommerce-cms/gallery',
  { default: () => [] }
)

const form = reactive({
  id: '',
  name: '',
  url: '',
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const showForm = ref(false)
const editing = computed(() => !!form.id)

function resetForm() {
  form.id = ''
  form.name = ''
  form.url = ''
  form.sortOrder = (items.value?.length || 0) + 1
  form.status = true
}

function openNew() {
  resetForm()
  showForm.value = true
}

function edit(row: GalleryRow) {
  form.id = row.id
  form.name = row.name
  form.url = row.url || ''
  form.sortOrder = row.sortOrder
  form.status = row.status
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name is required', color: 'red' })
    return
  }
  if (!youtubeId(form.url)) {
    toast.add({ title: 'Enter a valid YouTube link (video or Short)', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      name: form.name.trim(),
      type: 'YOUTUBE',
      url: form.url.trim(),
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/gallery/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'Gallery item updated' })
    } else {
      await $fetch('/api/ecommerce-cms/gallery', { method: 'POST', body })
      toast.add({ title: 'Gallery item added' })
    }

    showForm.value = false
    resetForm()
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save gallery item',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: GalleryRow) {
  await $fetch(`/api/ecommerce-cms/gallery/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: GalleryRow) {
  await $fetch(`/api/ecommerce-cms/gallery/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'Gallery item deleted' })
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
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Gallery</h1>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                YouTube videos & Shorts shown on your storefront. The centered card autoplays.
              </p>
            </div>
            <UButton icon="i-heroicons-plus" label="New video" @click="openNew" />
          </div>
        </template>

        <div v-if="pending" class="grid gap-3 sm:grid-cols-2">
          <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
        </div>

        <div v-else-if="!items?.length" class="py-16 text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">No gallery items yet</div>
          <p class="mt-1 text-sm text-gray-500">Paste a YouTube link from the form.</p>
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="row in items"
            :key="row.id"
            class="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
          >
            <div class="relative flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <img v-if="thumb(row.url)" :src="thumb(row.url)!" :alt="row.name" class="h-full w-full object-cover">
              <UIcon v-else name="i-simple-icons-youtube" class="text-2xl text-gray-400" />
            </div>

            <div class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-start justify-between gap-2">
                <h2 class="truncate font-medium text-gray-900 dark:text-white">{{ row.name }}</h2>
                <UBadge :color="row.status ? 'green' : 'gray'" variant="subtle" size="xs">
                  {{ row.status ? 'Live' : 'Hidden' }}
                </UBadge>
              </div>
              <a
                v-if="row.url"
                :href="row.url"
                target="_blank"
                class="mt-1 flex items-center gap-1 truncate text-xs text-primary hover:underline"
              >
                <UIcon name="i-simple-icons-youtube" /> {{ row.url }}
              </a>

              <div class="mt-auto flex items-center gap-1 pt-2">
                <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-pencil-square" @click="edit(row)" />
                <UButton
                  size="xs"
                  color="gray"
                  variant="ghost"
                  :icon="row.status ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
                  @click="toggle(row)"
                />
                <UButton size="xs" color="red" variant="ghost" icon="i-heroicons-trash" @click="remove(row)" />
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model="showForm">
      <UCard>
        <template #header>
          <div class="font-semibold text-gray-900 dark:text-white">
            {{ editing ? 'Edit video' : 'New video' }}
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. Summer collection reel" />
          </UFormGroup>

          <UFormGroup label="YouTube link (video or Short)" required>
            <UInput
              v-model="form.url"
              placeholder="https://youtube.com/shorts/…"
              icon="i-simple-icons-youtube"
            />
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
            <UButton
              :loading="isSaving"
              icon="i-heroicons-check"
              :label="editing ? 'Save changes' : 'Add to gallery'"
              @click="save"
            />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
