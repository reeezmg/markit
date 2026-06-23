<script setup lang="ts">
type BlogRow = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  image?: string | null
  tag?: string | null
  readMinutes: number
  sortOrder: number
  status: boolean
}

const toast = useToast()

const { data: blogs, pending, refresh } = await useFetch<BlogRow[]>('/api/ecommerce-cms/blogs', {
  default: () => [],
})

const form = reactive({
  id: '',
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  image: '',
  tag: '',
  readMinutes: 4,
  sortOrder: 0,
  status: true,
})

const editorRef = ref<HTMLElement | null>(null)
const imagePreview = ref('')
const isSaving = ref(false)
const isUploading = ref(false)
const isFormOpen = ref(false)
const editing = computed(() => !!form.id)

function cdnUrl(key?: string | null) {
  return key ? `https://images.markit.co.in/${key}` : ''
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resetForm() {
  form.id = ''
  form.title = ''
  form.slug = ''
  form.excerpt = ''
  form.content = ''
  form.image = ''
  form.tag = ''
  form.readMinutes = 4
  form.sortOrder = (blogs.value?.length || 0) + 1
  form.status = true
  imagePreview.value = ''
  if (editorRef.value) editorRef.value.innerHTML = ''
}

function openCreate() {
  resetForm()
  isFormOpen.value = true
  nextTick(() => {
    if (editorRef.value) editorRef.value.innerHTML = ''
  })
}

function closeForm() {
  isFormOpen.value = false
  resetForm()
}

function edit(row: BlogRow) {
  form.id = row.id
  form.title = row.title
  form.slug = row.slug
  form.excerpt = row.excerpt
  form.content = row.content
  form.image = row.image || ''
  form.tag = row.tag || ''
  form.readMinutes = row.readMinutes
  form.sortOrder = row.sortOrder
  form.status = row.status
  imagePreview.value = cdnUrl(row.image)
  isFormOpen.value = true
  nextTick(() => {
    if (editorRef.value) editorRef.value.innerHTML = form.content
  })
}

function syncEditor(event: Event) {
  form.content = (event.currentTarget as HTMLElement).innerHTML
}

function format(command: string) {
  document.execCommand(command)
  if (editorRef.value) form.content = editorRef.value.innerHTML
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  isUploading.value = true
  try {
    const base64 = await fileToDataUrl(file)
    const extension = file.name.split('.').pop() || 'jpg'
    const key = `ecommerce/blogs/${crypto.randomUUID()}.${extension}`
    await $fetch('/api/upload', {
      method: 'POST',
      body: { base64, key, isAiImage: false },
    })
    form.image = key
    imagePreview.value = URL.createObjectURL(file)
    toast.add({ title: 'Image uploaded' })
  } catch (error: any) {
    toast.add({
      title: 'Unable to upload image',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isUploading.value = false
  }
}

async function save() {
  if (!form.title.trim()) {
    toast.add({ title: 'Title is required', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      title: form.title,
      slug: form.slug || slugify(form.title),
      excerpt: form.excerpt,
      content: form.content,
      image: form.image,
      tag: form.tag,
      readMinutes: Number(form.readMinutes || 4),
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/blogs/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'Blog updated' })
    } else {
      await $fetch('/api/ecommerce-cms/blogs', { method: 'POST', body })
      toast.add({ title: 'Blog added' })
    }

    resetForm()
    isFormOpen.value = false
    await refresh()
  } catch (error: any) {
    toast.add({
      title: 'Unable to save blog',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

async function toggle(row: BlogRow) {
  await $fetch(`/api/ecommerce-cms/blogs/${row.id}`, {
    method: 'PUT',
    body: { status: !row.status },
  })
  await refresh()
}

async function remove(row: BlogRow) {
  await $fetch(`/api/ecommerce-cms/blogs/${row.id}`, { method: 'DELETE' })
  toast.add({ title: 'Blog deleted' })
  await refresh()
  if (form.id === row.id) resetForm()
}

watch(() => form.title, (title) => {
  if (!editing.value && !form.slug) form.slug = slugify(title)
})

onMounted(resetForm)
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <div class="p-3">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Blogs</h1>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Articles shown on the custom ecommerce blog page and homepage.
              </p>
            </div>
            <UButton icon="i-heroicons-plus" label="New blog" @click="openCreate" />
          </div>
        </template>

        <div v-if="pending" class="space-y-3">
          <USkeleton v-for="i in 4" :key="i" class="h-28 w-full" />
        </div>

        <div v-else-if="!blogs?.length" class="py-16 text-center">
          <div class="text-sm font-medium text-gray-900 dark:text-white">No blogs yet</div>
          <p class="mt-1 text-sm text-gray-500">Create the first blog from the form.</p>
        </div>

        <div v-else class="divide-y divide-gray-200 dark:divide-gray-800">
          <div v-for="row in blogs" :key="row.id" class="flex gap-4 py-4">
            <img
              v-if="row.image"
              :src="cdnUrl(row.image)"
              alt=""
              class="h-20 w-28 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-800"
            >
            <div v-else class="flex h-20 w-28 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
              <UIcon name="i-heroicons-newspaper" class="h-7 w-7 text-gray-400" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge v-if="row.tag" color="gray" variant="subtle">{{ row.tag }}</UBadge>
                    <span class="text-xs text-gray-400">{{ row.readMinutes }} min read</span>
                  </div>
                  <h2 class="mt-1 font-medium text-gray-900 dark:text-white">{{ row.title }}</h2>
                  <p class="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">{{ row.excerpt }}</p>
                  <p class="mt-2 text-xs text-gray-400">/{{ row.slug }}</p>
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

    <UModal
      v-model="isFormOpen"
      fullscreen
      :ui="{ width: 'sm:max-w-none', height: 'h-screen', container: 'items-stretch sm:items-stretch' }"
    >
      <UCard
        class="flex h-screen flex-col"
        :ui="{ body: { base: 'flex-1 overflow-y-auto' }, header: { base: 'shrink-0' }, footer: { base: 'shrink-0' } }"
      >
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                {{ editing ? 'Edit blog' : 'Add blog' }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Write and publish storefront blog content.
              </p>
            </div>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="closeForm" />
          </div>
        </template>

        <div class="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div class="space-y-4">
            <UFormGroup label="Title" required>
              <UInput v-model="form.title" placeholder="Monsoon layering guide" />
            </UFormGroup>

            <UFormGroup label="Excerpt">
              <UTextarea v-model="form.excerpt" :rows="4" placeholder="Short summary shown in blog cards." />
            </UFormGroup>

            <UFormGroup label="Blog content">
              <div class="rounded-md border border-gray-200 dark:border-gray-800">
                <div class="flex gap-1 border-b border-gray-200 p-2 dark:border-gray-800">
                  <UButton color="gray" variant="ghost" size="xs" label="B" @click="format('bold')" />
                  <UButton color="gray" variant="ghost" size="xs" label="I" @click="format('italic')" />
                  <UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-list-bullet" @click="format('insertUnorderedList')" />
                </div>
                <div
                  ref="editorRef"
                  contenteditable="true"
                  class="min-h-[420px] px-4 py-3 text-sm outline-none prose prose-sm max-w-none dark:prose-invert"
                  @input="syncEditor"
                />
              </div>
            </UFormGroup>
          </div>

          <div class="space-y-4">
            <UFormGroup label="Slug">
              <UInput v-model="form.slug" placeholder="monsoon-layering-guide" />
            </UFormGroup>

            <div class="grid grid-cols-2 gap-3">
              <UFormGroup label="Tag">
                <UInput v-model="form.tag" placeholder="Guide" />
              </UFormGroup>
              <UFormGroup label="Read minutes">
                <UInput v-model.number="form.readMinutes" type="number" min="1" />
              </UFormGroup>
            </div>

            <UFormGroup label="Image">
              <div class="space-y-3">
                <input type="file" accept="image/*" @change="uploadImage">
                <img
                  v-if="imagePreview || form.image"
                  :src="imagePreview || cdnUrl(form.image)"
                  alt=""
                  class="h-48 w-full rounded-md border border-gray-200 object-cover dark:border-gray-800"
                >
                <UInput v-model="form.image" placeholder="Image key or uploaded path" />
                <div v-if="isUploading" class="text-xs text-gray-500">Uploading image...</div>
              </div>
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
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="closeForm" />
            <UButton :loading="isSaving" icon="i-heroicons-check" :label="editing ? 'Save changes' : 'Create blog'" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
