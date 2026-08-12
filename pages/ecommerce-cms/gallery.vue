<script setup lang="ts">
import AwsService from '~/composables/aws'

type GalleryType = 'PHOTO' | 'VIDEO'

type GalleryRow = {
  id: string
  name: string
  type: GalleryType
  mediaKey: string | null
  mediaUrl: string | null
  url: string | null
  sortOrder: number
  status: boolean
}

const toast = useToast()
const awsService = new AwsService()

const MAX_PHOTO_MB = 15
const MAX_VIDEO_MB = 200

function youtubeId(url: string | null): string | null {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

function youtubeThumb(url: string | null): string | null {
  const id = youtubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

/** What the storefront will show first: the uploaded file, else the external link. */
function primarySrc(row: GalleryRow): string | null {
  return row.mediaUrl || row.url || null
}

const { data: items, pending, refresh } = await useFetch<GalleryRow[]>(
  '/api/ecommerce-cms/gallery',
  { default: () => [] }
)

const tabs: { key: GalleryType; label: string; icon: string }[] = [
  { key: 'PHOTO', label: 'Photos', icon: 'i-heroicons-photo' },
  { key: 'VIDEO', label: 'Videos', icon: 'i-heroicons-video-camera' },
]

const tabIndex = ref(1) // videos first — the pre-existing gallery content
const activeType = computed<GalleryType>(() => tabs[tabIndex.value]?.key ?? 'PHOTO')

const photos = computed(() => (items.value || []).filter(r => r.type === 'PHOTO'))
const videos = computed(() => (items.value || []).filter(r => r.type === 'VIDEO'))
const rowsFor = (type: GalleryType) => (type === 'PHOTO' ? photos.value : videos.value)

const form = reactive({
  id: '',
  type: 'VIDEO' as GalleryType,
  name: '',
  mediaKey: '' as string,
  mediaUrl: '' as string,
  url: '',
  sortOrder: 0,
  status: true,
})

const isSaving = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const showForm = ref(false)
const editing = computed(() => !!form.id)
const isVideo = computed(() => form.type === 'VIDEO')

const linkLabel = computed(() => (isVideo.value ? 'YouTube link' : 'Image link'))
const linkPlaceholder = computed(() =>
  isVideo.value ? 'https://youtube.com/shorts/…' : 'https://cdn.example.com/banner.jpg'
)

function resetForm(type: GalleryType = activeType.value) {
  form.id = ''
  form.type = type
  form.name = ''
  form.mediaKey = ''
  form.mediaUrl = ''
  form.url = ''
  form.sortOrder = rowsFor(type).length + 1
  form.status = true
  uploadProgress.value = 0
}

function openNew() {
  resetForm(activeType.value)
  showForm.value = true
}

function edit(row: GalleryRow) {
  form.id = row.id
  form.type = row.type
  form.name = row.name
  form.mediaKey = row.mediaKey || ''
  form.mediaUrl = row.mediaUrl || ''
  form.url = row.url || ''
  form.sortOrder = row.sortOrder
  form.status = row.status
  uploadProgress.value = 0
  showForm.value = true
}

/**
 * Files uploaded in this form session that no row points at yet. If the seller
 * replaces one, cancels, or closes the modal, they would sit in Cloudflare
 * forever — so they get deleted. (The server ignores any key a row still
 * references, so a persisted key passed through here is never touched.)
 */
const pendingUploads = new Set<string>()

async function discardPendingUploads(keep?: string) {
  const orphans = [...pendingUploads].filter(key => key !== keep)
  pendingUploads.clear()
  if (keep) pendingUploads.add(keep)
  await awsService.deleteObjects(orphans)
}

function closeForm() {
  showForm.value = false
  discardPendingUploads()
  resetForm()
}

function clearUpload() {
  if (form.mediaKey) discardPendingUploads()
  form.mediaKey = ''
  form.mediaUrl = ''
  uploadProgress.value = 0
}

// Switching type mid-form would leave an image attached to a video row (or the
// reverse), and a YouTube link on a photo — drop both rather than save nonsense.
watch(() => form.type, () => {
  if (editing.value) return
  clearUpload()
  form.url = ''
})

/**
 * Direct browser → R2 upload via a presigned PUT. Videos are far too large to
 * base64 through a serverless route, and this keeps photos off that limit too.
 */
function putToR2(uploadUrl: string, file: File, contentType: string) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    // Must match the type the URL was signed with, or R2 rejects the PUT.
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`Upload failed (${xhr.status})`)))
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'))
    xhr.send(file)
  })
}

// Some mobile file pickers hand over a File with an empty `type`; the presigned
// URL has to be signed with a real content type, so fall back to the extension.
const EXTENSION_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

function fileExtension(file: File) {
  return (file.name.split('.').pop() || '').toLowerCase()
}

function fileContentType(file: File) {
  return file.type ? file.type.toLowerCase() : (EXTENSION_MIME[fileExtension(file)] || '')
}

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const wantVideo = isVideo.value
  const maxMb = wantVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB
  const contentType = fileContentType(file)
  const expectedPrefix = wantVideo ? 'video/' : 'image/'

  if (!contentType.startsWith(expectedPrefix)) {
    toast.add({
      title: wantVideo ? 'Choose a video file' : 'Choose an image file',
      color: 'red',
    })
    input.value = ''
    return
  }
  if (file.size > maxMb * 1024 * 1024) {
    toast.add({ title: `File is too large (max ${maxMb}MB)`, color: 'red' })
    input.value = ''
    return
  }

  isUploading.value = true
  uploadProgress.value = 0
  try {
    const extension = fileExtension(file) || (wantVideo ? 'mp4' : 'jpg')
    const key = `ecommerce/gallery/${crypto.randomUUID()}.${extension}`

    const { uploadUrl, publicUrl } = await $fetch<{ uploadUrl: string; publicUrl: string }>(
      '/api/r2/upload-url',
      { method: 'POST', body: { key, contentType } }
    )

    await putToR2(uploadUrl, file, contentType)

    // Anything previously uploaded in this session is now superseded.
    await discardPendingUploads()
    pendingUploads.add(key)

    form.mediaKey = key
    form.mediaUrl = publicUrl
    toast.add({ title: wantVideo ? 'Video uploaded' : 'Photo uploaded' })
  } catch (error: any) {
    toast.add({
      title: 'Upload failed',
      description: error?.data?.statusMessage || error?.message,
      color: 'red',
    })
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name is required', color: 'red' })
    return
  }

  const url = form.url.trim()
  if (!form.mediaKey && !url) {
    toast.add({
      title: isVideo.value
        ? 'Upload a video or add a YouTube link'
        : 'Upload a photo or add an image link',
      color: 'red',
    })
    return
  }
  if (isVideo.value && url && !youtubeId(url)) {
    toast.add({ title: 'Enter a valid YouTube link (video or Short)', color: 'red' })
    return
  }
  if (!isVideo.value && url && !/^https?:\/\/\S+$/i.test(url)) {
    toast.add({ title: 'Enter a valid image link starting with http(s)', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    const body = {
      name: form.name.trim(),
      type: form.type,
      mediaKey: form.mediaKey || null,
      url: url || null,
      sortOrder: Number(form.sortOrder || 0),
      status: form.status,
    }

    if (form.id) {
      await $fetch(`/api/ecommerce-cms/gallery/${form.id}`, { method: 'PUT', body })
      toast.add({ title: 'Gallery item updated' })
    } else {
      await $fetch('/api/ecommerce-cms/gallery', { method: 'POST', body })
      toast.add({ title: isVideo.value ? 'Video added' : 'Photo added' })
    }

    // Saved, so this upload is referenced now — stop tracking it as pending.
    pendingUploads.delete(form.mediaKey)
    await discardPendingUploads()

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

onMounted(() => resetForm())
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
                Photos and videos shown on your storefront. Upload a file, paste a link, or do both.
              </p>
            </div>
            <UButton
              icon="i-heroicons-plus"
              :label="activeType === 'PHOTO' ? 'New photo' : 'New video'"
              @click="openNew"
            />
          </div>
        </template>

        <UTabs v-model="tabIndex" :items="tabs" class="w-full">
          <template #item="{ item }">
            <div class="pt-4">
              <div v-if="pending" class="grid gap-3 sm:grid-cols-2">
                <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
              </div>

              <div v-else-if="!rowsFor(item.key).length" class="py-16 text-center">
                <div class="text-sm font-medium text-gray-900 dark:text-white">
                  No {{ item.key === 'PHOTO' ? 'photos' : 'videos' }} yet
                </div>
                <p class="mt-1 text-sm text-gray-500">
                  {{
                    item.key === 'PHOTO'
                      ? 'Upload an image or paste an image link.'
                      : 'Upload a video or paste a YouTube link.'
                  }}
                </p>
              </div>

              <div v-else class="grid gap-3 sm:grid-cols-2">
                <div
                  v-for="row in rowsFor(item.key)"
                  :key="row.id"
                  class="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div class="relative flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                    <img
                      v-if="row.type === 'PHOTO' && primarySrc(row)"
                      :src="primarySrc(row)!"
                      :alt="row.name"
                      class="h-full w-full object-cover"
                    >
                    <img
                      v-else-if="youtubeThumb(row.url)"
                      :src="youtubeThumb(row.url)!"
                      :alt="row.name"
                      class="h-full w-full object-cover"
                    >
                    <video
                      v-else-if="row.mediaUrl"
                      :src="row.mediaUrl"
                      class="h-full w-full object-cover"
                      muted
                      playsinline
                      preload="metadata"
                    />
                    <UIcon
                      v-else
                      :name="row.type === 'PHOTO' ? 'i-heroicons-photo' : 'i-heroicons-video-camera'"
                      class="text-2xl text-gray-400"
                    />
                  </div>

                  <div class="flex min-w-0 flex-1 flex-col">
                    <div class="flex items-start justify-between gap-2">
                      <h2 class="truncate font-medium text-gray-900 dark:text-white">{{ row.name }}</h2>
                      <UBadge :color="row.status ? 'green' : 'gray'" variant="subtle" size="xs">
                        {{ row.status ? 'Live' : 'Hidden' }}
                      </UBadge>
                    </div>

                    <div class="mt-1 flex flex-wrap items-center gap-1">
                      <UBadge v-if="row.mediaKey" color="blue" variant="subtle" size="xs">
                        Uploaded
                      </UBadge>
                      <UBadge v-if="row.url" color="gray" variant="subtle" size="xs">
                        {{ row.type === 'VIDEO' ? 'YouTube' : 'Link' }}
                      </UBadge>
                    </div>

                    <a
                      v-if="row.url"
                      :href="row.url"
                      target="_blank"
                      class="mt-1 truncate text-xs text-primary hover:underline"
                    >
                      {{ row.url }}
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
            </div>
          </template>
        </UTabs>
      </UCard>
    </div>

    <UModal v-model="showForm">
      <UCard>
        <template #header>
          <div class="font-semibold text-gray-900 dark:text-white">
            {{ editing ? 'Edit' : 'New' }} {{ isVideo ? 'video' : 'photo' }}
          </div>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Type" required>
            <USelectMenu
              v-model="form.type"
              :options="[
                { value: 'PHOTO', label: 'Photo' },
                { value: 'VIDEO', label: 'Video' },
              ]"
              value-attribute="value"
              option-attribute="label"
              :disabled="editing"
            />
            <template #hint>
              <span v-if="editing" class="text-xs text-gray-500">Type can't be changed after creation</span>
            </template>
          </UFormGroup>

          <UFormGroup label="Name" required>
            <UInput
              v-model="form.name"
              :placeholder="isVideo ? 'e.g. Summer collection reel' : 'e.g. Store front'"
            />
          </UFormGroup>

          <UFormGroup :label="isVideo ? 'Upload video' : 'Upload photo'">
            <div class="space-y-2">
              <input
                :accept="isVideo ? 'video/*' : 'image/*'"
                type="file"
                :disabled="isUploading"
                class="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm dark:text-gray-300 dark:file:bg-gray-800"
                @change="onFileSelected"
              >

              <div v-if="isUploading" class="space-y-1">
                <UProgress :value="uploadProgress" />
                <div class="text-xs text-gray-500">Uploading… {{ uploadProgress }}%</div>
              </div>

              <div
                v-else-if="form.mediaUrl"
                class="flex items-center gap-3 rounded-md border border-gray-200 p-2 dark:border-gray-800"
              >
                <img
                  v-if="!isVideo"
                  :src="form.mediaUrl"
                  alt=""
                  class="h-16 w-16 rounded object-cover"
                >
                <video
                  v-else
                  :src="form.mediaUrl"
                  class="h-16 w-28 rounded object-cover"
                  controls
                  muted
                  preload="metadata"
                />
                <div class="min-w-0 flex-1 text-xs text-gray-500">
                  <div class="truncate">{{ form.mediaKey }}</div>
                </div>
                <UButton
                  size="xs"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-x-mark"
                  @click="clearUpload"
                />
              </div>

              <p class="text-xs text-gray-500">
                Max {{ isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB }}MB.
                {{ isVideo ? 'Uploaded to Cloudflare.' : '' }}
              </p>
            </div>
          </UFormGroup>

          <UFormGroup :label="linkLabel">
            <UInput
              v-model="form.url"
              :placeholder="linkPlaceholder"
              :icon="isVideo ? 'i-simple-icons-youtube' : 'i-heroicons-link'"
            />
            <template #help>
              <span class="text-xs text-gray-500">
                {{
                  isVideo
                    ? 'Optional if a video is uploaded — you can keep both.'
                    : 'Optional if a photo is uploaded — you can keep both.'
                }}
              </span>
            </template>
          </UFormGroup>

          <UAlert
            v-if="!form.mediaKey && !form.url.trim()"
            color="orange"
            variant="subtle"
            icon="i-heroicons-exclamation-triangle"
            :description="isVideo
              ? 'Add an uploaded video, a YouTube link, or both before saving.'
              : 'Add an uploaded photo, an image link, or both before saving.'"
          />

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
              :disabled="isUploading"
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
