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
const sourceStatus = ref<'LOADING' | 'NOT_CREATED' | 'CREATING' | 'READY' | 'FAILED'>('LOADING')
const designStatus = ref<'LOADING' | 'NOT_CONFIGURED' | 'GENERATING' | 'READY' | 'FAILED' | 'SKIPPED'>('LOADING')
// A seller who skipped the design setup can re-open it from the toolbar.
const showDesignSetup = ref(false)
const isDesignDone = computed(() => designStatus.value === 'READY' || designStatus.value === 'SKIPPED')
const isCreatingStorefront = ref(false)
const deployedPreviewUrl = ref<string | null>(null)
const previewRevision = ref(0)
// Which build the iframe is currently showing, so we can tell a NEW deployment
// from the old one still sitting at READY.
const previewDeploymentId = ref<string | null>(null)
// Shown while a new build is on its way. Without it the seller waits ~40s
// looking at their unchanged storefront with no idea anything is happening.
const previewBuilding = ref(false)
const previewBuildFailed = ref(false)
let sourcePollTimer: ReturnType<typeof setTimeout> | null = null
let previewWatchTimer: ReturnType<typeof setTimeout> | null = null

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

function scheduleSourcePoll() {
  if (sourcePollTimer) clearTimeout(sourcePollTimer)
  sourcePollTimer = setTimeout(loadSourceStatus, 3000)
}

async function loadSourceStatus() {
  try {
    const previousStatus = sourceStatus.value
    const result = await $fetch<{
      status: typeof sourceStatus.value
      ready: boolean
      previewUrl: string | null
      previewStatus: string | null
      productionStatus: string | null
      previewDeploymentId: string | null
    }>(
      '/api/ecommerce-cms/storefront-source',
    )
    sourceStatus.value = result.status
    deployedPreviewUrl.value = result.previewUrl
    // Baseline for handlePreviewUpdated - without this the first edit has
    // nothing to compare against and reloads before the build is live.
    previewDeploymentId.value = result.previewDeploymentId
    if (result.ready) {
      if (previousStatus === 'CREATING') toast.add({ title: 'Storefront created', color: 'green' })
      const profile = await $fetch<{ status: typeof designStatus.value }>('/api/ecommerce-cms/storefront-design')
      designStatus.value = profile.status
      if (isDesignDone.value) {
        await seedDefaults()
        await loadPage()
      } else {
        isLoading.value = false
      }
    } else if (result.status === 'CREATING') {
      isLoading.value = false
      scheduleSourcePoll()
    } else {
      isLoading.value = false
    }
  } catch {
    sourceStatus.value = 'FAILED'
    isLoading.value = false
  }
}

async function handleDesignReady() {
  designStatus.value = 'READY'
  showDesignSetup.value = false
  await seedDefaults()
  await loadPage()
  toast.add({ title: 'Your storefront design system is ready', color: 'green' })
}

async function handleDesignSkip() {
  const wasShowingEditor = designStatus.value === 'SKIPPED'
  designStatus.value = 'SKIPPED'
  showDesignSetup.value = false
  if (!wasShowingEditor) {
    isLoading.value = true
    await seedDefaults()
    await loadPage()
  }
}

async function createStorefront() {
  isCreatingStorefront.value = true
  sourceStatus.value = 'CREATING'
  try {
    const result = await $fetch<{
      status: typeof sourceStatus.value
      ready: boolean
      previewUrl: string | null
    }>(
      '/api/ecommerce-cms/storefront-source',
      { method: 'POST' },
    )
    sourceStatus.value = result.status
    deployedPreviewUrl.value = result.previewUrl
    if (result.ready) {
      toast.add({ title: 'Storefront created', color: 'green' })
      await seedDefaults()
      await loadPage()
    } else if (result.status === 'CREATING') {
      scheduleSourcePoll()
    }
  } catch {
    sourceStatus.value = 'FAILED'
    toast.add({ title: 'Storefront setup failed', description: 'Please try again.', color: 'red' })
  } finally {
    isCreatingStorefront.value = false
  }
}

onMounted(loadSourceStatus)
onBeforeUnmount(() => {
  if (sourcePollTimer) clearTimeout(sourcePollTimer)
})

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save() {
  isSaving.value = true
  try {
    if (config.value && isDirty.value) {
      await $fetch(`/api/ecommerce-cms/storefront-pages/${slug.value}`, {
        method: 'PUT',
        body: { config: config.value, published: isPublished.value },
      })
      isDirty.value = false
    }
    const result = await $fetch<{ published: boolean; message: string }>(
      '/api/ecommerce-cms/storefront-source/publish',
      { method: 'POST' },
    )
    toast.add({
      title: result.published ? 'Storefront published' : 'Nothing to publish',
      description: result.message,
      color: result.published ? 'green' : 'gray',
    })
  } catch (error: any) {
    toast.add({
      title: 'Publish failed',
      description: error?.data?.statusMessage || error?.data?.message || error?.message || 'Please try again.',
      color: 'red',
    })
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

// ─── Click-to-select in the preview ──────────────────────────────────────────
// The picker lives inside the storefront (the preview is cross-origin, so we
// can't reach into it); IframePreview owns the postMessage channel and hands
// us the picked element.

const selectedElement = ref<any>(null)

function handleElementSelect(element: any) {
  selectedElement.value = element
}

function handleEditWithAi() {
  isAiOpen.value = true
}

// preview URL
const previewUrl = computed(() => {
  const base = (deployedPreviewUrl.value || storefrontUrl).replace(/\/$/, '')
  if (slug.value === 'home') {
    return deployedPreviewUrl.value ? `${base}/?editorRefresh=${previewRevision.value}` : `${base}/`
  }
  const routeMap: Record<string, string> = {
    about: '/about', contact: '/contact', blog: '/blogs',
    'how-to-use': '/how-to-use', track: '/track',
  }
  const path = routeMap[slug.value] ?? `/p/${slug.value}`
  return deployedPreviewUrl.value
    ? `${base}${path}?editorRefresh=${previewRevision.value}`
    : `${base}/#${path}`
})

/**
 * Refresh the preview once the new build is actually live.
 *
 * This used to reload blindly at 0s, 15s and 45s and hope one landed after the
 * build - which showed the seller their OLD storefront at least once every
 * time, and still missed builds slower than 45s.
 *
 * Now it waits for the real signal: a preview deployment whose id differs from
 * the one we're showing, in state READY. The Vercel webhook writes that state,
 * so this usually settles within a second of the build finishing.
 *
 * Comparing the ID matters - waiting for "READY" alone returns immediately,
 * because the PREVIOUS deployment is already READY.
 */
async function handlePreviewUpdated() {
  const showing = previewDeploymentId.value
  const deadline = Date.now() + 180_000

  if (previewWatchTimer) clearTimeout(previewWatchTimer)
  previewBuilding.value = true
  previewBuildFailed.value = false

  const check = async () => {
    try {
      const r = await $fetch<{
        previewUrl: string | null
        previewStatus: string | null
        previewDeploymentId: string | null
      }>('/api/ecommerce-cms/storefront-source', {
        query: { refreshLatest: '1' },
      })

      if (r.previewUrl) deployedPreviewUrl.value = r.previewUrl

      const isNew = r.previewDeploymentId && r.previewDeploymentId !== showing
      if (isNew && r.previewStatus === 'READY') {
        previewDeploymentId.value = r.previewDeploymentId
        previewBuilding.value = false
        previewRevision.value++              // one reload, once it's really there
        return
      }
      if (isNew && (r.previewStatus === 'ERROR' || r.previewStatus === 'CANCELED')) {
        previewDeploymentId.value = r.previewDeploymentId
        previewBuilding.value = false
        previewBuildFailed.value = true
        toast.add({ title: 'Preview build failed', color: 'red' })
        return
      }
    } catch { /* transient - keep waiting */ }

    if (Date.now() < deadline) previewWatchTimer = setTimeout(check, 3000)
    else {
      // Gave up waiting. Reload anyway rather than leaving a stale preview with
      // no explanation - a wasted refresh beats silently wrong content.
      previewBuilding.value = false
      previewRevision.value++
    }
  }

  previewWatchTimer = setTimeout(check, 2000)
}

onBeforeUnmount(() => {
  if (previewWatchTimer) clearTimeout(previewWatchTimer)
  if (sourcePollTimer) clearTimeout(sourcePollTimer)
})
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Storefront Editor">
        <template #right>
          <div v-if="sourceStatus === 'READY'" class="flex items-center gap-3">
            <!-- Build status. The agent's edit is pushed and live in seconds,
                 but Vercel takes ~30-60s to rebuild - without this the seller
                 stares at an unchanged storefront and assumes it failed. -->
            <div
              v-if="previewBuilding"
              class="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 dark:bg-amber-500/10"
              title="Your change is saved. The preview is rebuilding and will refresh by itself."
            >
              <UIcon name="i-heroicons-arrow-path" class="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
              <span class="text-xs font-medium text-amber-700 dark:text-amber-300">Updating store…</span>
            </div>
            <div
              v-else-if="previewBuildFailed"
              class="flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 dark:bg-red-500/10"
              title="The change is saved but the site failed to build. Ask the AI to fix it."
            >
              <UIcon name="i-heroicons-exclamation-triangle" class="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span class="text-xs font-medium text-red-700 dark:text-red-300">Build failed</span>
            </div>

            <UButton
              v-if="designStatus === 'SKIPPED' && !showDesignSetup"
              size="sm"
              icon="i-heroicons-swatch"
              variant="ghost"
              color="gray"
              title="You skipped this earlier. Run it whenever you are ready."
              @click="showDesignSetup = true"
            >
              Design system
            </UButton>

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
              icon="i-heroicons-cloud-arrow-up"
              @click="save"
            >
              Save
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <div v-if="sourceStatus === 'LOADING'" class="flex items-center justify-center h-64">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <div
        v-else-if="sourceStatus !== 'READY'"
        class="flex min-h-[calc(100vh-60px)] items-center justify-center p-6"
      >
        <div class="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
          <UIcon
            :name="sourceStatus === 'FAILED' ? 'i-heroicons-exclamation-circle' : 'i-heroicons-building-storefront'"
            class="mx-auto mb-4 h-10 w-10 text-gray-400"
          />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ sourceStatus === 'CREATING' ? 'Creating your storefront' : 'Create your storefront' }}
          </h2>
          <p class="mt-2 text-sm text-gray-500">
            {{ sourceStatus === 'CREATING'
              ? 'This usually takes a few moments.'
              : sourceStatus === 'FAILED'
                ? 'We could not finish the setup. You can safely try again.'
                : 'Set up the workspace for your online store.' }}
          </p>
          <UButton
            v-if="sourceStatus !== 'CREATING'"
            class="mt-6"
            icon="i-heroicons-plus"
            :loading="isCreatingStorefront"
            @click="createStorefront"
          >
            {{ sourceStatus === 'FAILED' ? 'Try again' : 'Create storefront' }}
          </UButton>
          <UIcon
            v-else
            name="i-heroicons-arrow-path"
            class="mx-auto mt-6 h-5 w-5 animate-spin text-gray-400"
          />
        </div>
      </div>

      <div v-else-if="isLoading" class="flex items-center justify-center h-64">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
      </div>

      <StorefrontDesignOnboarding
        v-else-if="showDesignSetup || !isDesignDone"
        :initial-status="designStatus"
        @ready="handleDesignReady"
        @skip="handleDesignSkip"
      />

      <div v-else-if="config" class="editor-layout">
        <StorefrontIframePreview
          :config="config"
          :storefront-url="deployedPreviewUrl || storefrontUrl"
          :preview-src="previewUrl"
          :selected-section-id="selectedId"
          class="flex-1 min-w-0"
          @select="handleElementSelect"
          @edit-with-ai="handleEditWithAi"
        />
        <StorefrontChatSlideover
          v-model="isAiOpen"
          :page-slug="slug"
          :page-config="config"
          :selected-element="selectedElement"
          @update-config="handleUpdateConfig"
          @preview-updated="handlePreviewUpdated"
          @clear-selection="selectedElement = null"
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
