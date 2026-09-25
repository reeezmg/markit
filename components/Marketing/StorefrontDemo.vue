<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  ArrowUpRight,
  Check,
  Code2,
  Globe,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
} from 'lucide-vue-next'
import '~/assets/css/storefront-demo.css'

const designs = [
  {
    id: 'accessories',
    prompt: 'Build a playful orange accessories store.',
    brand: 'Peach Club',
    domain: 'peach-club.demo',
    image: '/images/marketing/demo-accessories.webp',
    alt: 'Peach Club accessories storefront with an orange bag, cream layout and editorial serif typography',
    response: 'Meet Peach Club. Bold orange, statement accessories and a playful editorial layout.',
    accent: '#ed642f',
    file: 'accessories-store.vue',
    theme: 'orange / cream / editorial',
  },
  {
    id: 'skincare',
    prompt: 'Create a calm, botanical skincare shop.',
    brand: 'Dew Theory',
    domain: 'dew-theory.demo',
    image: '/images/marketing/demo-skincare.webp',
    alt: 'Dew Theory skincare storefront with sage-green serum bottles, botanical imagery and an airy ivory layout',
    response:
      'Meet Dew Theory. Botanical greens, a gentle visual rhythm and a fresh skincare collection.',
    accent: '#58735a',
    file: 'skincare-store.vue',
    theme: 'sage / ivory / botanical',
  },
  {
    id: 'streetwear',
    prompt: 'Design a bold streetwear drop in cobalt.',
    brand: 'Off Hours',
    domain: 'off-hours.demo',
    image: '/images/marketing/demo-streetwear.webp',
    alt: 'Off Hours streetwear storefront with cobalt fashion photography, bold typography and a clothing collection',
    response: 'Meet Off Hours. Cobalt blue, oversized type and a collection made to stand out.',
    accent: '#365ee9',
    file: 'streetwear-store.vue',
    theme: 'cobalt / ink / bold type',
  },
  {
    id: 'coffee',
    prompt: 'Make a warm, artisan coffee storefront.',
    brand: 'Slow Morning',
    domain: 'slow-morning.demo',
    image: '/images/marketing/demo-coffee.webp',
    alt: 'Slow Morning coffee storefront with terracotta coffee bags, ceramic cups and warm espresso typography',
    response:
      'Meet Slow Morning. Warm neutrals, tactile product photography and a slower kind of shopping.',
    accent: '#97613c',
    file: 'coffee-store.vue',
    theme: 'oat / espresso / artisan',
  },
]
const selectedIndex = ref(0)
const resultIndex = ref(0)
const phase = ref<'ready' | 'building' | 'error'>('ready')
const stage = ref(0)
const runNumber = ref(0)
const selected = computed(() => designs[selectedIndex.value]!)
const result = computed(() => designs[resultIndex.value]!)
const steps = [
  'Planning your visual direction',
  'Building the storefront',
  'Preparing your preview',
]
const status = computed(() =>
  phase.value === 'building'
    ? steps[stage.value]
    : phase.value === 'error'
    ? 'Preview image could not load. Please try again.'
    : result.value.response
)
const code = computed(
  () =>
    [
      `// ${selected.value.brand}\nconst theme = "${selected.value.theme}"\nlayout: header → hero → collection`,
      `> create ${selected.value.file}\n+ compose hero + product cards\n+ apply brand colours + typography`,
      `> prepare ${selected.value.domain}\n✓ storefront composition ready\n→ loading design preview…`,
    ][stage.value]
)

const timers = new Set<ReturnType<typeof setTimeout>>()
let pendingImage: HTMLImageElement | undefined
function clearPending() {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  if (pendingImage) {
    pendingImage.onload = null
    pendingImage.onerror = null
    pendingImage = undefined
  }
}
function later(callback: () => void, delay: number) {
  const timer = setTimeout(() => {
    timers.delete(timer)
    callback()
  }, delay)
  timers.add(timer)
}
function runDemo(index: number) {
  clearPending()
  const currentRun = ++runNumber.value
  selectedIndex.value = index
  phase.value = 'building'
  stage.value = 0
  let imageReady = false
  let sequenceReady = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finish = () => {
    if (currentRun !== runNumber.value || !imageReady || !sequenceReady) return
    resultIndex.value = index
    phase.value = 'ready'
    clearPending()
  }
  const fail = () => {
    if (currentRun !== runNumber.value) return
    phase.value = 'error'
    clearPending()
  }
  pendingImage = new window.Image()
  pendingImage.onload = () => {
    imageReady = true
    finish()
  }
  pendingImage.onerror = fail
  // Register timers before assigning src so cached loads use the same lifecycle.
  if (reducedMotion) {
    stage.value = 2
    sequenceReady = true
  } else {
    later(() => {
      stage.value = 1
    }, 650)
    later(() => {
      stage.value = 2
    }, 1350)
    later(() => {
      sequenceReady = true
      finish()
    }, 2100)
  }
  later(fail, 10000)
  pendingImage.src = selected.value.image
}
function imageFailed() {
  if (phase.value === 'ready') phase.value = 'error'
}
onBeforeUnmount(() => {
  runNumber.value++
  clearPending()
})
</script>

<template>
  <div class="builder-demo storefront-demo">
    <div class="demo-chat">
      <div class="demo-chat-title">
        <span class="ai-icon"><Sparkles :size="18" /></span><strong>Your creative co-founder</strong
        ><span class="demo-label">INTERACTIVE DEMO</span>
      </div>
      <p class="demo-intro">What are we making today?</p>
      <div class="demo-options" aria-label="Choose a storefront design">
        <button
          v-for="(design, index) in designs"
          :key="design.id"
          :class="{ selected: selectedIndex === index }"
          :aria-pressed="selectedIndex === index"
          aria-controls="storefront-demo-output"
          @click="runDemo(index)"
        >
          <span
            class="demo-swatch"
            :style="{ backgroundColor: design.accent }"
            aria-hidden="true"
          />
          <span>{{ design.prompt }}</span>
          <LoaderCircle
            v-if="phase === 'building' && selectedIndex === index"
            :size="16"
            class="demo-spinner"
          /><ArrowUpRight v-else :size="16" />
        </button>
      </div>
      <div class="demo-response" role="status" aria-live="polite" aria-atomic="true">
        <Code2 v-if="phase === 'building'" :size="18" /><Sparkles v-else :size="18" />
        <p>{{ status }}</p>
      </div>
      <NuxtLink to="/register" class="demo-compose"
        >Your turn. What’s your big idea?<span><Send :size="16" /></span
      ></NuxtLink>
    </div>
    <div
      id="storefront-demo-output"
      class="demo-preview"
      :aria-busy="phase === 'building'"
      aria-label="Example storefront output"
    >
      <div class="browser-bar">
        <span class="browser-dots" aria-hidden="true">● ● ●</span
        ><span><Globe :size="11" /> {{ phase === 'ready' ? result.domain : selected.domain }}</span
        ><span aria-hidden="true">↗</span>
      </div>
      <div class="demo-stage">
        <Transition name="storefront-reveal" mode="out-in">
          <div
            v-if="phase === 'ready'"
            :key="`result-${resultIndex}-${runNumber}`"
            class="demo-result"
          >
            <img
              :src="result.image"
              :alt="result.alt"
              width="1536"
              height="1024"
              loading="lazy"
              decoding="async"
              @error="imageFailed"
            />
          </div>
          <div v-else-if="phase === 'building'" key="agent" class="demo-agent" aria-hidden="true">
            <div class="agent-terminal-head">
              <span><Terminal :size="16" /> markit / storefront agent</span
              ><span class="agent-demo-pill">SIMULATION</span>
            </div>
            <div class="agent-task">
              <Sparkles :size="19" /><strong>Making it {{ selected.brand }}.</strong>
            </div>
            <ol class="agent-steps">
              <li
                v-for="(label, index) in steps"
                :key="label"
                :class="{ complete: index < stage, current: index === stage }"
              >
                <Check v-if="index < stage" :size="14" /><LoaderCircle
                  v-else-if="index === stage"
                  :size="14"
                  class="demo-spinner"
                /><span v-else class="step-placeholder" />{{ label }}
              </li>
            </ol>
            <pre class="agent-code"><code>{{ code }}</code></pre>
            <div class="agent-progress"><span :style="{ width: `${(stage + 1) * 30}%` }" /></div>
          </div>
          <div v-else key="error" class="demo-error">
            <ImageOff :size="26" />
            <p>Let’s give that preview another try.</p>
            <button @click="runDemo(selectedIndex)"><RefreshCw :size="15" /> Reload preview</button>
          </div>
        </Transition>
      </div>
      <div class="demo-output-footer">
        <span
          ><Check v-if="phase === 'ready'" :size="13" /><Code2 v-else :size="13" />{{
            phase === 'ready'
              ? `${result.brand} · preview ready`
              : phase === 'building'
              ? 'Demo agent at work'
              : 'Preview unavailable'
          }}</span
        ><small>Simulated build · example design</small>
      </div>
    </div>
  </div>
</template>
