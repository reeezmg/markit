<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

const props = defineProps<{
  config: any
  storefrontUrl: string
  previewSrc?: string
  selectedSectionId?: string | null
}>()

const iframeRef  = ref<HTMLIFrameElement | null>(null)
const frameKey   = ref(0)
const viewMode   = ref<'mobile' | 'desktop'>('desktop')

const resolvedSrc = computed(() => props.previewSrc ?? `${props.storefrontUrl}/#/`)

watch(resolvedSrc, () => { frameKey.value++ })

function send() {
  const win = iframeRef.value?.contentWindow
  console.log('[iframe] send() called, iframeRef:', !!iframeRef.value, 'contentWindow:', !!win)
  if (!win) return
  const msg = { type: 'RV_PREVIEW', config: props.config, selectedSectionId: props.selectedSectionId ?? null }
  console.log('[iframe] postMessage sections:', Object.keys(props.config?.sections ?? {}))
  win.postMessage(msg, '*')
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
}
</script>

<template>
  <div class="preview-wrap">
    <div class="preview-bar">
      <!-- Left: label -->
      <span class="preview-label">Live Preview</span>

      <!-- Center: viewport toggle -->
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

      <!-- Right: open link -->
      <a :href="storefrontUrl" target="_blank" class="preview-open">
        <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" /> Open store
      </a>
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
