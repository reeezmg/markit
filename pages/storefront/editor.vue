<script setup lang="ts">
import { schemaMap } from '~/lib/ecom-engine-schemas'

definePageMeta({ auth: true })

const toast         = useToast()
const runtimeConfig = useRuntimeConfig()
const storefrontUrl = runtimeConfig.public.storefrontUrl as string || 'http://localhost:5173'

// ─── State ───────────────────────────────────────────────────────────────────

const isAiOpen    = ref(false)
function openAi() { isAiOpen.value = true }
const slug        = ref('home')
const config      = ref<{ sections: Record<string, any>; order: string[] } | null>(null)
const selectedId  = ref<string | null>(null)
const isPublished = ref(false)
const isDirty     = ref(false)
const isSaving    = ref(false)
const isLoading   = ref(true)

// ─── Load page ───────────────────────────────────────────────────────────────

const BUNDLED_SLUGS = new Set(['home', 'about', 'contact', 'blog', 'how-to-use', 'track'])

async function loadPage() {
  isLoading.value  = true
  config.value     = null
  selectedId.value = null
  isDirty.value    = false
  try {
    const res = await $fetch<{ slug: string; config: any; published: boolean } | null>(
      `/api/ecommerce-cms/storefront-pages/${slug.value}`
    )
    if (res?.config) {
      config.value      = res.config
      isPublished.value = res.published
    } else if (BUNDLED_SLUGS.has(slug.value)) {
      const { default: fallback } = await import(`~/lib/ecom-engine-default-pages/${slug.value}.json`)
      config.value      = fallback
      isPublished.value = false
    } else {
      config.value      = { sections: {}, order: [] }
      isPublished.value = false
    }
  } catch {
    if (BUNDLED_SLUGS.has(slug.value)) {
      try {
        const { default: fallback } = await import(`~/lib/ecom-engine-default-pages/${slug.value}.json`)
        config.value = fallback
      } catch { config.value = { sections: {}, order: [] } }
    } else {
      config.value = { sections: {}, order: [] }
    }
    isPublished.value = false
  } finally {
    isLoading.value = false
  }
}

async function seedDefaults() {
  try {
    await $fetch('/api/ecommerce-cms/storefront-pages/seed-defaults', { method: 'POST' })
  } catch { /* non-fatal */ }
}

watch(config, (val) => {
  console.log('[editor] config ref changed, sections:', Object.keys(val?.sections ?? {}))
}, { deep: false })

onMounted(async () => {
  await seedDefaults()
  loadPage()
})

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  if (!config.value) return
  isSaving.value = true
  try {
    await $fetch(`/api/ecommerce-cms/storefront-pages/${slug.value}`, {
      method: 'PUT',
      body: { config: config.value, published: isPublished.value },
    })
    toast.add({ title: 'Saved', color: 'green' })
    isDirty.value = false
  } catch {
    toast.add({ title: 'Save failed', color: 'red' })
  } finally {
    isSaving.value = false
  }
}

// ─── Section mutations (used by AI panel patches) ─────────────────────────────

function handleReorder(order: string[]) {
  if (!config.value) return
  config.value = { ...config.value, order }
  isDirty.value = true
}

function handleRemove(id: string) {
  if (!config.value) return
  const sections = { ...config.value.sections }
  delete sections[id]
  config.value = { sections, order: config.value.order.filter(o => o !== id) }
  if (selectedId.value === id) selectedId.value = null
  isDirty.value = true
}

function handleAdd(type: string, initialSettings?: Record<string, any>) {
  if (!config.value) return
  const schema = schemaMap[type]
  if (!schema) return
  const existing = Object.keys(config.value?.sections ?? {})
  let n = 1
  let id = `${type}-${n}`
  while (existing.includes(id)) id = `${type}-${++n}`
  const settings: Record<string, any> = {}
  schema.settings.forEach(s => { settings[s.id] = s.default ?? null })
  if (initialSettings) Object.assign(settings, initialSettings)
  config.value = {
    sections: { ...config.value.sections, [id]: { type, settings } },
    order: [...config.value.order, id],
  }
  selectedId.value = id
  isDirty.value = true
}

function handleSettingsUpdate(sectionId: string, settings: Record<string, any>) {
  if (!config.value) return
  config.value = {
    ...config.value,
    sections: {
      ...config.value.sections,
      [sectionId]: { ...config.value.sections[sectionId], settings },
    },
  }
  isDirty.value = true
}

function handleStylesUpdate(sectionId: string, styles: Record<string, any>) {
  if (!config.value) return
  config.value = {
    ...config.value,
    sections: {
      ...config.value.sections,
      [sectionId]: { ...config.value.sections[sectionId], styles },
    },
  }
  isDirty.value = true
}

// ─── AI config update (from chat panel) ──────────────────────────────────────

function handleUpdateConfig(newConfig: any) {
  console.log('[editor] handleUpdateConfig fired, sections:', Object.keys(newConfig?.sections ?? {}))
  config.value = newConfig
  isDirty.value = true
}

// ─── AI patch handler (legacy, unused by chat panel) ─────────────────────────

function handleAiPatch(patch: any) {
  if (!config.value) return
  const { op, sectionId } = patch
  if (op === 'update_settings' && sectionId)        handleSettingsUpdate(sectionId, patch.settings ?? {})
  else if (op === 'update_styles' && sectionId)     handleStylesUpdate(sectionId, patch.styles ?? {})
  else if (op === 'add_section' && patch.type)      handleAdd(patch.type, patch.settings)
  else if (op === 'remove_section' && sectionId)    handleRemove(sectionId)
  else if (op === 'reorder' && Array.isArray(patch.order)) handleReorder(patch.order)
}

// Listen for click-to-select events from the revomotive iframe
onMounted(() => {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'RV_SELECT' && e.data.sectionId) {
      selectedId.value = e.data.sectionId
    }
  })
})

// preview URL
const previewUrl = computed(() => {
  const base = storefrontUrl.replace(/\/$/, '')
  if (slug.value === 'home') return `${base}/`
  const routeMap: Record<string, string> = {
    about: '/about', contact: '/contact', blog: '/blogs',
    'how-to-use': '/how-to-use', track: '/track',
  }
  const path = routeMap[slug.value] ?? `/p/${slug.value}`
  return `${base}/#${path}`
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Storefront Editor">
        <template #right>
          <div class="flex items-center gap-3">
            <UToggle v-model="isPublished" @update:model-value="isDirty = true" />
            <span class="text-xs text-gray-500">{{ isPublished ? 'Published' : 'Draft' }}</span>
            <UButton
              size="sm"
              icon="i-heroicons-sparkles"
              variant="soft"
              color="primary"
              @click="openAi"
            >
              AI
            </UButton>
            <UButton
              size="sm"
              :loading="isSaving"
              :disabled="!isDirty"
              icon="i-heroicons-cloud-arrow-up"
              @click="save"
            >
              Save
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <div v-if="isLoading" class="flex items-center justify-center h-64">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div v-else-if="config" class="editor-layout">
        <StorefrontIframePreview
          :config="config"
          :storefront-url="storefrontUrl"
          :preview-src="previewUrl"
          :selected-section-id="selectedId"
          class="flex-1 min-w-0"
        />
        <StorefrontChatSlideover
          v-model="isAiOpen"
          :page-slug="slug"
          :page-config="config"
          @update-config="handleUpdateConfig"
        />
      </div>
    </UDashboardPanel>
  </UDashboardPage>
</template>

<style scoped>
.editor-layout {
  display: flex; height: calc(100vh - 60px); overflow: hidden;
}
</style>
