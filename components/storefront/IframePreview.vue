<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

interface PickedElement {
  label: string
  tag: string
  id: string
  classes: string[]
  text: string
  selector: string
  componentName: string
  sourceFile: string
  componentHierarchy: { name: string; sourceFile: string }[]
  attrs: Record<string, string>
  rect: { top: number; left: number; width: number; height: number }
  ancestors: { label: string; selector: string }[]
  route: string
}

const props = defineProps<{
  config: any
  storefrontUrl: string
  previewSrc?: string
  selectedSectionId?: string | null
}>()

const emit = defineEmits<{
  select: [element: PickedElement | null]
  editWithAi: []
}>()

const iframeRef  = ref<HTMLIFrameElement | null>(null)
const frameKey   = ref(0)
const viewMode   = ref<'mobile' | 'desktop'>('desktop')
const pickMode   = ref(false)
const selected   = ref<PickedElement | null>(null)

const resolvedSrc = computed(() => props.previewSrc ?? `${props.storefrontUrl}/#/`)

// Only trust postMessages coming from the frame we actually loaded.
const previewOrigin = computed(() => {
  try { return new URL(resolvedSrc.value, window.location.href).origin }
  catch { return '' }
})

watch(resolvedSrc, () => {
  frameKey.value++
  selected.value = null
  emit('select', null)
})

function postToFrame(message: Record<string, any>) {
  iframeRef.value?.contentWindow?.postMessage(message, previewOrigin.value || '*')
}

function send() {
  const win = iframeRef.value?.contentWindow
  if (!win) return
  win.postMessage(
    { type: 'RV_PREVIEW', config: props.config, selectedSectionId: props.selectedSectionId ?? null },
    '*',
  )
}

watchDebounced(
  () => [props.config, props.selectedSectionId],
  send,
  { debounce: 200, deep: true }
)

function onLoad() {
  send()
  // Re-send after the iframe's async loadPage() finishes — otherwise it overwrites our config
  setTimeout(send, 800)
  syncPickMode()
}

// ─── Element picking ─────────────────────────────────────────────────────────

function syncPickMode() {
  postToFrame({ type: 'RV_EDITOR_MODE', enabled: pickMode.value })
}

watch(pickMode, (on) => {
  syncPickMode()
  if (!on) {
    selected.value = null
    emit('select', null)
  }
})

function onMessage(e: MessageEvent) {
  if (previewOrigin.value && e.origin !== previewOrigin.value) return
  const data = e.data
  if (!data || typeof data !== 'object') return

  if (data.type === 'RV_EDITOR_READY') {
    syncPickMode()
  } else if (data.type === 'RV_SELECT') {
    selected.value = (data.element as PickedElement) ?? null
    emit('select', selected.value)
  }
}

onMounted(() => window.addEventListener('message', onMessage))
onBeforeUnmount(() => window.removeEventListener('message', onMessage))

// Climb to an ancestor — clicking a card usually lands on the image inside it.
function selectAncestor(selector: string) {
  postToFrame({ type: 'RV_SELECT_PATH', selector })
}

function clearSelection() {
  selected.value = null
  emit('select', null)
  postToFrame({ type: 'RV_CLEAR_SELECTION' })
}

// Breadcrumb: the few nearest ancestors, then the element itself.
const crumbs = computed(() => (selected.value?.ancestors ?? []).slice(-3))
</script>

<template>
  <div class="preview-wrap">
    <div class="preview-bar">
      <!-- Left: label -->
      <span class="preview-label">Live Preview</span>

      <!-- Center: pick toggle + viewport toggle -->
      <div class="bar-center">
        <button
          class="vt-btn pick-btn"
          :class="{ active: pickMode }"
          title="Select an element on the page"
          @click="pickMode = !pickMode"
        >
          <UIcon name="i-heroicons-cursor-arrow-rays" class="w-4 h-4" />
          <span class="pick-label">Select</span>
        </button>

        <div class="view-toggle">
          <button
            class="vt-btn"
            :class="{ active: viewMode === 'mobile' }"
            title="Mobile view"
            @click="viewMode = 'mobile'"
          >
            <UIcon name="i-heroicons-device-phone-mobile" class="w-4 h-4" />
          </button>
          <button
            class="vt-btn"
            :class="{ active: viewMode === 'desktop' }"
            title="Desktop view"
            @click="viewMode = 'desktop'"
          >
            <UIcon name="i-heroicons-computer-desktop" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Right: open link -->
      <a :href="storefrontUrl" target="_blank" class="preview-open">
        <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" /> Open store
      </a>
    </div>

    <!-- Selection strip -->
    <div v-if="pickMode" class="select-bar">
      <template v-if="selected">
        <div class="crumbs">
          <template v-for="c in crumbs" :key="c.selector">
            <button class="crumb" :title="c.selector" @click="selectAncestor(c.selector)">{{ c.label }}</button>
            <UIcon name="i-heroicons-chevron-right" class="crumb-sep" />
          </template>
          <span class="crumb crumb-current">{{ selected.label }}</span>
        </div>
        <div class="select-actions">
          <UButton size="2xs" color="primary" icon="i-heroicons-sparkles" @click="emit('editWithAi')">
            Edit with AI
          </UButton>
          <UButton size="2xs" color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="clearSelection" />
        </div>
      </template>
      <span v-else class="select-hint">Click any element in the preview to select it.</span>
    </div>

    <!-- Desktop: full width -->
    <div v-if="viewMode === 'desktop'" class="frame-area">
      <iframe
        :key="frameKey"
        ref="iframeRef"
        :src="resolvedSrc"
        class="preview-frame"
        title="Storefront preview"
        @load="onLoad"
      />
    </div>

    <!-- Mobile: centered phone shell -->
    <div v-else class="frame-area mobile-area">
      <div class="phone-shell">
        <iframe
          :key="frameKey + '-m'"
          ref="iframeRef"
          :src="resolvedSrc"
          class="preview-frame"
          title="Storefront preview"
          @load="onLoad"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-wrap  { display: flex; flex-direction: column; height: 100%; background: #f3f4f6; }

/* Bar */
.preview-bar   {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; background: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border); flex-shrink: 0;
}
.preview-label { font-size: 12px; font-weight: 600; color: var(--ui-text-muted); }
.preview-open  { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ui-primary); text-decoration: none; }
.bar-center    { display: flex; align-items: center; gap: 10px; }

/* Toggle buttons */
.view-toggle {
  display: flex; align-items: center; gap: 2px;
  background: var(--ui-bg-muted, #f1f5f9); border-radius: 8px; padding: 3px;
}
.vt-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 26px; border: none; border-radius: 6px;
  cursor: pointer; background: transparent; color: var(--ui-text-muted);
  transition: background 0.15s, color 0.15s;
}
.vt-btn:hover  { background: var(--ui-bg-elevated, #e2e8f0); color: var(--ui-text); }
.vt-btn.active { background: var(--ui-bg, #fff); color: var(--ui-primary); box-shadow: 0 1px 3px rgba(0,0,0,.12); }

.pick-btn {
  width: auto; gap: 5px; padding: 0 10px; height: 28px;
  background: var(--ui-bg-muted, #f1f5f9);
  font-size: 12px; font-weight: 600;
}
.pick-label { line-height: 1; }
.pick-btn.active {
  background: #f97316; color: #fff;
  box-shadow: 0 1px 3px rgba(249,115,22,.4);
}
.pick-btn.active:hover { background: #ea580c; color: #fff; }

/* Selection strip */
.select-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 6px 14px; flex-shrink: 0; min-height: 38px;
  background: rgba(249,115,22,.08);
  border-bottom: 1px solid rgba(249,115,22,.28);
}
.select-hint { font-size: 12px; color: var(--ui-text-muted); }
.crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; overflow-x: auto; }
.crumb {
  flex-shrink: 0; border: none; background: transparent; cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--ui-text-muted);
  padding: 2px 5px; border-radius: 4px; white-space: nowrap;
}
.crumb:hover { background: rgba(249,115,22,.16); color: #c2410c; }
.crumb-current {
  cursor: default; font-weight: 700; color: #c2410c;
  background: rgba(249,115,22,.18);
}
.crumb-sep { width: 11px; height: 11px; flex-shrink: 0; color: var(--ui-text-muted); opacity: .5; }
.select-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

/* Frame areas */
.frame-area         { flex: 1; overflow: hidden; display: flex; }
.preview-frame      { flex: 1; border: none; width: 100%; height: 100%; }

/* Mobile shell */
.mobile-area        { align-items: center; justify-content: center; padding: 20px 0; overflow-y: auto; }
.phone-shell        {
  width: 360px; height: 100%; max-height: calc(100vh - 120px);
  border-radius: 40px; overflow: hidden;
  box-shadow: 0 0 0 10px #1a1a1a, 0 20px 60px rgba(0,0,0,.35);
  display: flex; flex-direction: column; flex-shrink: 0;
}
.phone-shell .preview-frame { border-radius: 30px; }
</style>
