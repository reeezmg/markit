<script setup lang="ts">
const props = defineProps<{ initialStatus: string }>()
const emit = defineEmits<{ ready: []; skip: [] }>()
const toast = useToast()

const publicAgentText = (value: unknown) => String(value ?? '').replace(/\bpi\b/gi, 'AI agent')
const status = ref(props.initialStatus)
const submitting = ref(false)
const skipping = ref(false)
const references = ref<{ name: string; mimeType: string; data: string; url: string }[]>([])
const assets = ref<{ name: string; mimeType: string; data: string }[]>([])
const form = reactive({
  companyDescription: '', designDirection: '', figmaUrl: '', assetNotes: '', notes: '', model: 'gemini-3.1-pro',
})
const { data: modelData } = await useFetch<{
  default: string
  models: { key: string; label: string; note: string; supportsImages?: boolean }[]
}>('/api/ecommerce-cms/storefront-agent/models')
const visionModels = computed(() => (modelData.value?.models || []).filter(model => model.supportsImages))
let pollTimer: ReturnType<typeof setTimeout> | null = null

async function poll() {
  try {
    const profile = await $fetch<any>('/api/ecommerce-cms/storefront-design')
    status.value = profile.status
    if (profile.status === 'READY') emit('ready')
    else if (profile.status === 'GENERATING') pollTimer = setTimeout(poll, 3000)
  } catch { pollTimer = setTimeout(poll, 5000) }
}
if (status.value === 'GENERATING') onMounted(poll)
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer) })

async function addReferences(event: Event) {
  const files = [...((event.target as HTMLInputElement).files || [])].slice(0, 4 - references.value.length)
  for (const file of files) {
    if (!file.type.startsWith('image/') || file.size > 4_000_000) {
      toast.add({ title: `${file.name} was skipped`, description: 'Use an image smaller than 4 MB.', color: 'amber' })
      continue
    }
    const url = URL.createObjectURL(file)
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    references.value.push({ name: file.name, mimeType: file.type, data, url })
  }
  ;(event.target as HTMLInputElement).value = ''
}

async function addAssets(event: Event) {
  const files = [...((event.target as HTMLInputElement).files || [])].slice(0, 6 - assets.value.length)
  for (const file of files) {
    if (file.size > 1_500_000) {
      toast.add({ title: `${file.name} was skipped`, description: 'Use an asset smaller than 1.5 MB.', color: 'amber' })
      continue
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    assets.value.push({ name: file.name, mimeType: file.type || 'application/octet-stream', data })
  }
  ;(event.target as HTMLInputElement).value = ''
}

function removeReference(index: number) {
  URL.revokeObjectURL(references.value[index].url)
  references.value.splice(index, 1)
}

async function submit() {
  if (!form.companyDescription.trim() || !form.designDirection.trim()) {
    toast.add({ title: 'Tell us about the company and the design you want', color: 'amber' })
    return
  }
  if (references.value.length && !visionModels.value.some(model => model.key === form.model)) {
    toast.add({ title: 'Choose a model that can read images', color: 'amber' })
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/ecommerce-cms/storefront-design', {
      method: 'POST',
      body: {
        ...form,
        images: references.value.map(({ mimeType, data }) => ({ mimeType, data })),
        assets: assets.value,
      },
    })
    status.value = 'GENERATING'
    poll()
  } catch (cause: any) {
    status.value = 'FAILED'
    toast.add({ title: 'Could not start the design setup', description: publicAgentText(cause?.data?.message || cause?.message), color: 'red' })
  } finally { submitting.value = false }
}

async function skip() {
  skipping.value = true
  try {
    await $fetch('/api/ecommerce-cms/storefront-design/skip', { method: 'POST' })
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    emit('skip')
  } catch (cause: any) {
    toast.add({ title: 'Could not skip the design setup', description: publicAgentText(cause?.data?.message || cause?.message), color: 'red' })
  } finally { skipping.value = false }
}
</script>

<template>
  <div class="flex min-h-[calc(100vh-60px)] items-start justify-center overflow-y-auto bg-gray-50 p-5 dark:bg-gray-950 md:p-10">
    <UCard class="w-full max-w-3xl">
      <template #header>
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-primary-50 p-2 text-primary-600 dark:bg-primary-950"><UIcon name="i-heroicons-swatch" class="h-6 w-6" /></div>
          <div><h2 class="text-lg font-semibold">Set your storefront design system</h2><p class="mt-1 text-sm text-gray-500">The AI agent will turn these decisions into a reusable design skill, then apply it across your whole storefront.</p></div>
        </div>
      </template>

      <div v-if="status === 'GENERATING'" class="py-14 text-center">
        <UIcon name="i-heroicons-arrow-path" class="mx-auto h-9 w-9 animate-spin text-primary-500" />
        <h3 class="mt-4 font-semibold">Designing your storefront</h3>
        <p class="mx-auto mt-2 max-w-md text-sm text-gray-500">The AI agent is creating the design system and applying it across every customer-facing page. This is the initial full-site run and can take a while.</p>
      </div>

      <form v-else class="space-y-5" @submit.prevent="submit">
        <UAlert v-if="status === 'FAILED'" color="red" variant="subtle" title="The previous design run did not finish" description="Review the details and retry. Previously committed changes are preserved." />
        <UFormGroup label="What does your company do and sell?" required>
          <UTextarea v-model="form.companyDescription" :rows="4" placeholder="Describe the company, customers, products, price position and what makes the brand different." />
        </UFormGroup>
        <UFormGroup label="What should the design feel like?" required>
          <UTextarea v-model="form.designDirection" :rows="4" placeholder="Describe the style in one direction: mood, colours, references, density, personality and anything to avoid." />
        </UFormGroup>
        <UFormGroup label="Figma file (optional)" help="Paste a share link. Add exported frames below so the vision model can inspect the design visually.">
          <UInput v-model="form.figmaUrl" icon="i-simple-icons-figma" placeholder="https://www.figma.com/design/…" />
        </UFormGroup>
        <UFormGroup label="Fonts, logos and assets (optional)" help="Paste public or repository asset links and explain where each one should be used.">
          <UTextarea v-model="form.assetNotes" :rows="3" placeholder="Logo: https://…&#10;Heading font: https://…&#10;Use product photography from…" />
          <input class="mt-3 block w-full text-sm" type="file" multiple
            accept="image/*,.svg,.woff,.woff2,.ttf,.otf,.ico" @change="addAssets">
          <div v-if="assets.length" class="mt-2 flex flex-wrap gap-2">
            <UBadge v-for="(asset, index) in assets" :key="`${asset.name}-${index}`" color="gray" variant="soft">
              {{ asset.name }}
              <button class="ml-1" type="button" title="Remove asset" @click="assets.splice(index, 1)">×</button>
            </UBadge>
          </div>
        </UFormGroup>
        <UFormGroup label="Reference images (optional)" help="Upload up to four screenshots, exported Figma frames, logos or mood-board images.">
          <input type="file" accept="image/*" multiple class="block w-full text-sm" @change="addReferences">
          <div v-if="references.length" class="mt-3 flex flex-wrap gap-3">
            <div v-for="(image, index) in references" :key="image.url" class="relative">
              <img :src="image.url" :alt="image.name" class="h-24 w-28 rounded-lg border object-cover">
              <UButton class="absolute -right-2 -top-2" size="2xs" color="red" icon="i-heroicons-x-mark" @click.prevent="removeReference(index)" />
            </div>
          </div>
        </UFormGroup>
        <UFormGroup label="AI model" required help="Only image-capable models are listed because this setup may use visual references.">
          <USelectMenu v-model="form.model" :options="visionModels" value-attribute="key" option-attribute="label" />
          <p v-if="!visionModels.length" class="mt-2 text-xs text-amber-600">No vision model is available. Add one under AI → Models.</p>
        </UFormGroup>
        <UFormGroup label="Anything else? (optional)"><UTextarea v-model="form.notes" :rows="3" placeholder="Accessibility needs, competitor references, special pages, constraints or other notes." /></UFormGroup>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <UButton type="button" size="lg" color="gray" variant="ghost" icon="i-heroicons-arrow-right-circle" :loading="skipping" :disabled="submitting" @click="skip">
            Skip for now
          </UButton>
          <UButton type="submit" size="lg" icon="i-heroicons-sparkles" :loading="submitting" :disabled="skipping || !visionModels.length">Create and apply design system</UButton>
        </div>
        <p class="text-right text-xs text-gray-500">Skipping opens the editor with the default design. You can run this setup later from the editor toolbar.</p>
      </form>
    </UCard>
  </div>
</template>
