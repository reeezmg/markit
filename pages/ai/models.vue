<script setup lang="ts">
definePageMeta({ auth: true })

type ProviderType = 'openai' | 'openrouter' | 'gemini' | 'custom'
type Provider = {
  id: string
  name: string
  provider: ProviderType
  baseUrl: string
  modelId: string
  supportsImages: boolean
  enabled: boolean
  hasApiKey: boolean
}

const presets = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'Custom (OpenAI-compatible)', value: 'custom' },
]
const presetUrls: Record<Exclude<ProviderType, 'custom'>, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
}

const { data, pending, error, refresh } = await useFetch<{ providers: Provider[] }>('/api/ai/providers')
const providers = computed(() => data.value?.providers || [])
const modalOpen = ref(false)
const saving = ref(false)
const deleting = ref<string | null>(null)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '', provider: 'openrouter' as ProviderType, modelId: '', baseUrl: '', apiKey: '',
  supportsImages: true, enabled: true,
})

watch(() => form.provider, (provider) => {
  if (provider !== 'custom') form.baseUrl = presetUrls[provider]
})

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', provider: 'openrouter', modelId: '', baseUrl: presetUrls.openrouter, apiKey: '', supportsImages: true, enabled: true })
  modalOpen.value = true
}

function openEdit(provider: Provider) {
  editingId.value = provider.id
  Object.assign(form, { ...provider, apiKey: '' })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const path = editingId.value ? `/api/ai/providers/${editingId.value}` : '/api/ai/providers'
    await $fetch(path, { method: editingId.value ? 'PUT' : 'POST', body: form })
    modalOpen.value = false
    await refresh()
  } catch (cause: any) {
    useToast().add({ title: 'Could not save AI model', description: cause?.data?.message || cause?.message, color: 'red' })
  } finally { saving.value = false }
}

async function remove(provider: Provider) {
  if (!confirm(`Remove “${provider.name}”? Existing chats that selected it will need another model.`)) return
  deleting.value = provider.id
  try {
    await $fetch(`/api/ai/providers/${provider.id}`, { method: 'DELETE' })
    await refresh()
  } catch (cause: any) {
    useToast().add({ title: 'Could not remove AI model', description: cause?.data?.message || cause?.message, color: 'red' })
  } finally { deleting.value = null }
}
</script>

<template>
  <UDashboardPanelContent>
    <div class="space-y-6 p-4 md:p-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-xl font-semibold">AI Models</h1>
          <p class="mt-1 text-sm text-gray-500">Connect multiple AI providers and use their models in the storefront editor.</p>
        </div>
        <UButton icon="i-heroicons-plus" label="Add AI model" @click="openCreate" />
      </div>

      <UAlert icon="i-heroicons-lock-closed" color="blue" variant="subtle" title="Your API keys stay private"
        description="Keys are encrypted on the server. They are never shown again, committed to a storefront, or saved in readable chat history." />
      <UAlert v-if="error" color="red" variant="subtle" title="Could not load AI models" :description="String(error)" />

      <div v-if="pending && !data" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <USkeleton v-for="i in 3" :key="i" class="h-44 rounded-xl" />
      </div>
      <div v-else-if="!providers.length" class="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
        <UIcon name="i-heroicons-cpu-chip" class="mx-auto h-10 w-10 text-gray-400" />
        <p class="mt-3 font-medium">No custom AI models yet</p>
        <p class="mt-1 text-sm text-gray-500">Add an OpenAI, OpenRouter, Gemini, or compatible API key.</p>
        <UButton class="mt-4" label="Add your first model" @click="openCreate" />
      </div>
      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="item in providers" :key="item.id" class="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="truncate font-semibold">{{ item.name }}</h2>
                <UBadge :color="item.enabled ? 'green' : 'gray'" variant="subtle">{{ item.enabled ? 'Active' : 'Disabled' }}</UBadge>
              </div>
              <p class="mt-1 truncate text-sm text-gray-500">{{ item.modelId }}</p>
            </div>
            <UDropdown :items="[[
              { label: 'Edit', icon: 'i-heroicons-pencil-square', click: () => openEdit(item) },
              { label: 'Remove', icon: 'i-heroicons-trash', click: () => remove(item) },
            ]]">
              <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
            </UDropdown>
          </div>
          <div class="mt-5 flex flex-wrap gap-2 text-xs">
            <UBadge color="gray" variant="soft">{{ presets.find(p => p.value === item.provider)?.label }}</UBadge>
            <UBadge v-if="item.supportsImages" color="purple" variant="soft"><UIcon name="i-heroicons-photo" class="mr-1" />Vision</UBadge>
            <UBadge color="green" variant="soft"><UIcon name="i-heroicons-key" class="mr-1" />Key saved</UBadge>
          </div>
        </div>
      </div>
    </div>

    <UModal v-model="modalOpen">
      <UCard>
        <template #header>
          <div>
            <h2 class="font-semibold">{{ editingId ? 'Edit AI model' : 'Add AI model' }}</h2>
            <p class="mt-1 text-sm text-gray-500">The storefront AI will use this model only when it is selected in the editor.</p>
          </div>
        </template>
        <form class="space-y-4" @submit.prevent="save">
          <UFormGroup label="Name" required help="A friendly name shown in the editor.">
            <UInput v-model="form.name" placeholder="My vision model" maxlength="80" />
          </UFormGroup>
          <UFormGroup label="Provider" required><USelectMenu v-model="form.provider" :options="presets" value-attribute="value" option-attribute="label" /></UFormGroup>
          <UFormGroup label="Model ID" required help="Use the exact model identifier from your provider.">
            <UInput v-model="form.modelId" placeholder="e.g. gpt-4.1 or google/gemini-2.5-pro" />
          </UFormGroup>
          <UFormGroup label="Base URL" required>
            <UInput v-model="form.baseUrl" :disabled="form.provider !== 'custom'" placeholder="https://api.example.com/v1" />
          </UFormGroup>
          <UFormGroup :label="editingId ? 'New API key (optional)' : 'API key'" :required="!editingId"
            :help="editingId ? 'Leave blank to keep the saved key.' : 'The key is encrypted before it is stored.'">
            <UInput v-model="form.apiKey" type="password" autocomplete="new-password" placeholder="sk-…" />
          </UFormGroup>
          <UCheckbox v-model="form.supportsImages" label="This model can read images" />
          <UCheckbox v-model="form.enabled" label="Available in the storefront editor" />
        </form>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="ghost" label="Cancel" @click="modalOpen = false" />
            <UButton :loading="saving" label="Save model" @click="save" />
          </div>
        </template>
      </UCard>
    </UModal>
  </UDashboardPanelContent>
</template>
