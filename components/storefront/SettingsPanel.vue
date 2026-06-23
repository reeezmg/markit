<script setup lang="ts">
import { schemaMap, type SettingDef, type ElementNode, type SectionStyles } from '~/lib/ecom-engine-schemas'

const props = defineProps<{
  sectionId: string | null
  sections:  Record<string, any>
}>()

const emit = defineEmits<{
  update:         [sectionId: string, settings: Record<string, any>]
  'update-styles': [sectionId: string, styles: Record<string, any>]
}>()

// ── Schema & settings ─────────────────────────────────────────────────────────

const schema = computed(() => {
  if (!props.sectionId) return null
  const type = props.sections[props.sectionId]?.type
  return type ? schemaMap[type] : null
})

const settings = computed<Record<string, any>>(() =>
  props.sectionId ? (props.sections[props.sectionId]?.settings ?? {}) : {}
)

const st = computed<SectionStyles>(() =>
  props.sectionId ? (props.sections[props.sectionId]?.styles ?? {}) : {}
)

function update(key: string, value: any) {
  if (!props.sectionId) return
  emit('update', props.sectionId, { ...settings.value, [key]: value })
}

function setStyles(patch: Partial<SectionStyles>) {
  if (!props.sectionId) return
  const next: any = { ...st.value, ...patch }
  // Remove nulls/empty
  for (const k of Object.keys(next)) {
    if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k]
  }
  emit('update-styles', props.sectionId, next)
}

function clearStyle(key: keyof SectionStyles) {
  if (!props.sectionId) return
  const next: any = { ...st.value }
  delete next[key]
  emit('update-styles', props.sectionId, next)
}

// ── Background helpers ────────────────────────────────────────────────────────

const bgType = computed<'none' | 'color' | 'gradient' | 'image'>(() => {
  if (st.value.bgType) return st.value.bgType as any
  const bg = st.value.bg ?? ''
  if (!bg) return 'none'
  if (bg.startsWith('linear-gradient') || bg.startsWith('radial-gradient')) return 'gradient'
  if (bg.startsWith('url(')) return 'image'
  return 'color'
})

function setBgType(type: 'none' | 'color' | 'gradient' | 'image') {
  const patch: any = { bgType: type }
  if (type === 'none')     { patch.bg = ''; }
  if (type === 'color')    patch.bg = st.value.bg && !st.value.bg.startsWith('linear') ? st.value.bg : '#111827'
  if (type === 'gradient') patch.bg = buildGradient(st.value.bgFrom ?? '#111827', st.value.bgTo ?? '#374151', st.value.bgAngle ?? 135)
  if (type === 'image')    patch.bg = st.value.bgImage ? `url('${st.value.bgImage}')` : ''
  setStyles(patch)
}

function buildGradient(from: string, to: string, angle: number) {
  return `linear-gradient(${angle}deg, ${from}, ${to})`
}

function onGrad(field: 'bgFrom' | 'bgTo' | 'bgAngle', value: any) {
  const from  = field === 'bgFrom'  ? value : (st.value.bgFrom  ?? '#111827')
  const to    = field === 'bgTo'    ? value : (st.value.bgTo    ?? '#374151')
  const angle = field === 'bgAngle' ? value : (st.value.bgAngle ?? 135)
  setStyles({ [field]: value, bg: buildGradient(from, to, angle), bgType: 'gradient' })
}

function onBgImage(url: string) {
  setStyles({ bgImage: url, bg: url ? `url('${url}')` : '', bgType: 'image' })
}

// ── Array helpers ─────────────────────────────────────────────────────────────

function updateArrayItem(key: string, i: number, field: string, value: any) {
  const arr = [...(settings.value[key] ?? [])]
  arr[i] = { ...arr[i], [field]: value }
  update(key, arr)
}

function addArrayItem(setting: SettingDef) {
  const arr  = [...(settings.value[setting.id] ?? [])]
  const item: Record<string, any> = {}
  setting.itemSchema?.forEach(f => { item[f.id] = f.default ?? '' })
  arr.push(item)
  update(setting.id, arr)
}

function removeArrayItem(key: string, i: number) {
  const arr = [...(settings.value[key] ?? [])]
  arr.splice(i, 1)
  update(key, arr)
}

// ── Element tree helpers ──────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 8) }
function cloneTree(nodes: ElementNode[]) { return JSON.parse(JSON.stringify(nodes)) }

function withIds(node: any): any {
  return { ...node, id: uid(), children: (node.children ?? []).map(withIds) }
}

function addRootElement(key: string) {
  const arr = cloneTree(settings.value[key] ?? [])
  arr.push({ id: uid(), tag: 'div', text: '', attrs: { style: '' }, children: [] })
  update(key, arr)
}

function addPaletteElement(key: string, template: any) {
  const arr = cloneTree(settings.value[key] ?? [])
  arr.push(withIds(template))
  update(key, arr)
}

const ELEMENT_PALETTE = [
  { label: 'Container', icon: 'i-heroicons-square-2-stack', node: { tag: 'div', text: '', attrs: { style: 'padding:24px;' }, children: [] } },
  { label: 'Heading',   icon: 'i-heroicons-h1',             node: { tag: 'h2', text: 'Section Heading', attrs: { style: 'font-size:2rem;font-weight:700;margin-bottom:16px;' }, children: [] } },
  { label: 'Subheading',icon: 'i-heroicons-bars-3-bottom-left', node: { tag: 'h3', text: 'Subheading', attrs: { style: 'font-size:1.25rem;font-weight:600;margin-bottom:12px;' }, children: [] } },
  { label: 'Text',      icon: 'i-heroicons-document-text',  node: { tag: 'p',  text: 'Your paragraph text goes here.', attrs: { style: 'font-size:1rem;line-height:1.7;' }, children: [] } },
  { label: 'Button',    icon: 'i-heroicons-cursor-arrow-rays', node: { tag: 'button', text: 'Click Me', attrs: { style: 'background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;font-size:1rem;font-weight:600;' }, children: [] } },
  { label: 'Link',      icon: 'i-heroicons-link',            node: { tag: 'a', text: 'Link text', attrs: { href: '#', style: 'color:#3b82f6;text-decoration:underline;' }, children: [] } },
  { label: 'Image',     icon: 'i-heroicons-photo',           node: { tag: 'img', text: '', attrs: { src: 'https://placehold.co/600x400', alt: 'Image', style: 'width:100%;border-radius:8px;' }, children: [] } },
  { label: 'Divider',   icon: 'i-heroicons-minus',           node: { tag: 'hr', text: '', attrs: { style: 'border:none;border-top:1px solid #e5e7eb;margin:24px 0;' }, children: [] } },
  { label: 'List',      icon: 'i-heroicons-list-bullet',     node: { tag: 'ul', text: '', attrs: { style: 'list-style:disc;padding-left:24px;line-height:1.8;' }, children: [
    { tag: 'li', text: 'Item one', attrs: { style: '' }, children: [] },
    { tag: 'li', text: 'Item two', attrs: { style: '' }, children: [] },
  ]} },
  { label: 'Badge',     icon: 'i-heroicons-tag',             node: { tag: 'span', text: 'New', attrs: { style: 'background:#dbeafe;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;letter-spacing:0.05em;' }, children: [] } },
  { label: 'Card',      icon: 'i-heroicons-rectangle-stack', node: { tag: 'div', text: '', attrs: { style: 'background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1);' }, children: [
    { tag: 'h3', text: 'Card Title',               attrs: { style: 'font-size:1.125rem;font-weight:700;margin-bottom:8px;' }, children: [] },
    { tag: 'p',  text: 'Card description goes here.', attrs: { style: 'color:#6b7280;font-size:0.875rem;' }, children: [] },
  ]} },
  { label: 'Icon',      icon: 'i-heroicons-star',            node: { tag: 'icon', text: '', attrs: { name: 'star', style: 'width:32px;height:32px;color:#f59e0b;' }, children: [] } },
]

function removeRootElement(key: string, idx: number) {
  const arr = cloneTree(settings.value[key] ?? [])
  arr.splice(idx, 1)
  update(key, arr)
}

function addChild(key: string, path: number[]) {
  const arr = cloneTree(settings.value[key] ?? [])
  let node: any = { children: arr }
  for (const idx of path) node = node.children[idx]
  if (!node.children) node.children = []
  node.children.push({ id: uid(), tag: 'span', text: 'Text', attrs: { style: '' }, children: [] })
  update(key, arr)
}

function updateNode(key: string, path: number[], field: string, value: any) {
  const arr = cloneTree(settings.value[key] ?? [])
  let node: any = { children: arr }
  for (const idx of path) node = node.children[idx]
  if      (field === '_children')        node.children = value
  else if (field === 'tag' || field === 'text') node[field] = value
  else if (field.startsWith('attrs.'))   { if (!node.attrs) node.attrs = {}; node.attrs[field.slice(6)] = value }
  update(key, arr)
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const tab = ref<'content' | 'design'>('content')
watch(() => props.sectionId, () => { tab.value = 'content' })
</script>

<template>
  <div class="sp-root">
    <!-- Empty state -->
    <div v-if="!sectionId || !schema" class="sp-empty">
      <UIcon name="i-heroicons-cursor-arrow-rays" class="w-8 h-8 mb-2 text-gray-300" />
      <p>Click a section to edit</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="sp-header">
        <span class="sp-title">{{ schema.name }}</span>
        <div class="sp-tabs">
          <button :class="['sp-tab', { active: tab === 'content' }]" @click="tab = 'content'">Content</button>
          <button :class="['sp-tab', { active: tab === 'design' }]"  @click="tab = 'design'">Design</button>
        </div>
      </div>

      <!-- ── CONTENT TAB ─────────────────────────────────────────────────── -->
      <div v-if="tab === 'content'" class="sp-body">
        <div v-for="s in schema.settings" :key="s.id" class="cf-group">
          <label class="cf-label">{{ s.label }}</label>
          <p v-if="s.help" class="cf-help">{{ s.help }}</p>

          <!-- text / url -->
          <UInput
            v-if="s.type === 'text' || s.type === 'url'"
            :model-value="settings[s.id] ?? s.default ?? ''"
            size="sm"
            @update:model-value="update(s.id, $event)"
          />

          <!-- number -->
          <UInput
            v-else-if="s.type === 'number'"
            type="number"
            :model-value="settings[s.id] ?? s.default ?? 0"
            size="sm"
            @update:model-value="update(s.id, Number($event))"
          />

          <!-- color -->
          <div v-else-if="s.type === 'color'" class="cp-row">
            <label class="cp-swatch" :style="{ background: settings[s.id] ?? s.default ?? '#000000' }">
              <input type="color" :value="settings[s.id] ?? s.default ?? '#000000'" @input="update(s.id, ($event.target as HTMLInputElement).value)" />
            </label>
            <input class="cp-hex" type="text" :value="settings[s.id] ?? s.default ?? ''" placeholder="#000000" @change="update(s.id, ($event.target as HTMLInputElement).value)" />
          </div>

          <!-- boolean -->
          <UToggle
            v-else-if="s.type === 'boolean'"
            :model-value="settings[s.id] ?? s.default ?? false"
            @update:model-value="update(s.id, $event)"
          />

          <!-- select -->
          <USelectMenu
            v-else-if="s.type === 'select'"
            :items="(s.options ?? []).map(o => ({ label: String(o), value: o }))"
            :model-value="{ label: String(settings[s.id] ?? s.default), value: settings[s.id] ?? s.default }"
            size="sm"
            @update:model-value="update(s.id, $event?.value)"
          />

          <!-- image_picker -->
          <div v-else-if="s.type === 'image_picker'" class="img-field">
            <UInput placeholder="/images/photo.jpg or https://…" :model-value="settings[s.id] ?? ''" size="sm" @update:model-value="update(s.id, $event)" />
            <img v-if="settings[s.id]" :src="settings[s.id]" class="img-preview" alt="preview" />
          </div>

          <!-- richtext -->
          <textarea v-else-if="s.type === 'richtext'" class="rt-field" rows="8" :value="settings[s.id] ?? s.default ?? ''" @input="update(s.id, ($event.target as HTMLTextAreaElement).value)" />

          <!-- element_tree -->
          <div v-else-if="s.type === 'element_tree'" class="et-field">
            <!-- Element palette -->
            <div class="el-palette-wrap">
              <p class="el-palette-label">Add element</p>
              <div class="el-palette">
                <button
                  v-for="el in ELEMENT_PALETTE"
                  :key="el.label"
                  class="el-tile"
                  :title="el.label"
                  @click="addPaletteElement(s.id, el.node)"
                >
                  <UIcon :name="el.icon" class="el-tile-icon" />
                  <span class="el-tile-label">{{ el.label }}</span>
                </button>
              </div>
            </div>
            <!-- Node tree -->
            <StorefrontElementNodeEditor
              v-for="(node, i) in (settings[s.id] ?? s.default ?? [])"
              :key="node.id ?? i" :node="node" :path="[i]" :depth="0"
              @update="(path, field, val) => updateNode(s.id, path, field, val)"
              @add-child="(path) => addChild(s.id, path)"
              @remove="(idx) => removeRootElement(s.id, idx)"
            />
            <UButton v-if="(settings[s.id] ?? s.default ?? []).length === 0" size="xs" variant="soft" icon="i-heroicons-plus" class="mt-1" @click="addRootElement(s.id)">Add blank element</UButton>
          </div>

          <!-- array -->
          <div v-else-if="s.type === 'array'" class="arr-field">
            <!-- simple string array -->
            <div v-if="!s.itemSchema">
              <div v-for="(item, i) in (settings[s.id] ?? [])" :key="i" class="arr-item">
                <UInput :model-value="item" size="sm" class="flex-1"
                  @update:model-value="val => { const a=[...(settings[s.id]??[])]; a[i]=val; update(s.id,a) }" />
                <button class="rm-btn" @click="removeArrayItem(s.id, i)"><UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" /></button>
              </div>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="update(s.id, [...(settings[s.id]??[]),''])">Add item</UButton>
            </div>
            <!-- object array -->
            <div v-else>
              <div v-for="(item, i) in (settings[s.id] ?? [])" :key="i" class="arr-obj">
                <div class="arr-obj-hd">
                  <span class="arr-obj-num">{{ i + 1 }}</span>
                  <button class="rm-btn" @click="removeArrayItem(s.id, i)"><UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" /></button>
                </div>
                <div v-for="f in s.itemSchema" :key="f.id" class="arr-obj-field">
                  <label class="arr-obj-label">{{ f.label }}</label>
                  <UInput :model-value="item[f.id] ?? f.default ?? ''" size="xs"
                    @update:model-value="updateArrayItem(s.id, i, f.id, $event)" />
                </div>
              </div>
              <UButton size="xs" variant="soft" icon="i-heroicons-plus" @click="addArrayItem(s)">Add {{ s.label }}</UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ── DESIGN TAB ──────────────────────────────────────────────────── -->
      <div v-else class="sp-body sp-design">

        <!-- BACKGROUND -->
        <div class="dg-section">
          <div class="dg-heading">Background</div>

          <!-- Type toggle -->
          <div class="bg-types">
            <button v-for="t in ['none','color','gradient','image']" :key="t"
              :class="['bg-type-btn', { active: bgType === t }]"
              @click="setBgType(t as any)">
              {{ t[0].toUpperCase() + t.slice(1) }}
            </button>
          </div>

          <!-- Solid color -->
          <template v-if="bgType === 'color'">
            <div class="cp-row">
              <label class="cp-swatch" :style="{ background: st.bg || '#111827' }">
                <input type="color" :value="st.bg || '#111827'" @input="setStyles({ bg: ($event.target as HTMLInputElement).value, bgType: 'color' })" />
              </label>
              <input class="cp-hex" type="text" :value="st.bg || ''" placeholder="#111827"
                @change="setStyles({ bg: ($event.target as HTMLInputElement).value, bgType: 'color' })" />
              <button v-if="st.bg" class="cp-clear" @click="clearStyle('bg')">×</button>
            </div>
          </template>

          <!-- Gradient -->
          <template v-else-if="bgType === 'gradient'">
            <div class="grad-row">
              <div class="grad-col">
                <span class="grad-label">From</span>
                <label class="cp-swatch sm" :style="{ background: st.bgFrom || '#111827' }">
                  <input type="color" :value="st.bgFrom || '#111827'" @input="onGrad('bgFrom', ($event.target as HTMLInputElement).value)" />
                </label>
                <input class="cp-hex sm" type="text" :value="st.bgFrom || ''" placeholder="#111827"
                  @change="onGrad('bgFrom', ($event.target as HTMLInputElement).value)" />
              </div>
              <div class="grad-col">
                <span class="grad-label">To</span>
                <label class="cp-swatch sm" :style="{ background: st.bgTo || '#374151' }">
                  <input type="color" :value="st.bgTo || '#374151'" @input="onGrad('bgTo', ($event.target as HTMLInputElement).value)" />
                </label>
                <input class="cp-hex sm" type="text" :value="st.bgTo || ''" placeholder="#374151"
                  @change="onGrad('bgTo', ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <div class="slider-row">
              <span class="slider-label">Angle</span>
              <input class="slider" type="range" min="0" max="360" :value="st.bgAngle ?? 135"
                @input="onGrad('bgAngle', Number(($event.target as HTMLInputElement).value))" />
              <span class="slider-val">{{ st.bgAngle ?? 135 }}°</span>
            </div>
            <div class="grad-preview" :style="{ background: st.bg }" />
          </template>

          <!-- Image -->
          <template v-else-if="bgType === 'image'">
            <input class="url-input" type="text" :value="st.bgImage ?? ''" placeholder="https://…  or  /images/photo.jpg"
              @input="onBgImage(($event.target as HTMLInputElement).value)" />
            <div v-if="st.bgImage" class="img-bg-preview" :style="{ backgroundImage: `url('${st.bgImage}')` }" />
          </template>
        </div>

        <!-- TEXT -->
        <div class="dg-section">
          <div class="dg-heading">Text</div>

          <div class="dg-row">
            <span class="dg-label">Color</span>
            <div class="cp-row">
              <label class="cp-swatch sm" :style="{ background: st.color || '#111827' }">
                <input type="color" :value="st.color || '#111827'" @input="setStyles({ color: ($event.target as HTMLInputElement).value })" />
              </label>
              <input class="cp-hex" type="text" :value="st.color ?? ''" placeholder="inherit"
                @change="setStyles({ color: ($event.target as HTMLInputElement).value })" />
              <button v-if="st.color" class="cp-clear" @click="clearStyle('color')">×</button>
            </div>
          </div>

          <div class="dg-row">
            <span class="dg-label">Align</span>
            <div class="align-group">
              <button v-for="a in ['left', 'center', 'right']" :key="a"
                :class="['align-btn', { active: st.align === a }]"
                @click="setStyles({ align: st.align === a ? undefined : a as any })">
                <svg v-if="a === 'left'"   viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3"  width="14" height="1.5" rx=".75"/><rect x="1" y="7"  width="9"  height="1.5" rx=".75"/><rect x="1" y="11" width="12" height="1.5" rx=".75"/></svg>
                <svg v-if="a === 'center'" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3"  width="14" height="1.5" rx=".75"/><rect x="3.5" y="7" width="9" height="1.5" rx=".75"/><rect x="2" y="11" width="12" height="1.5" rx=".75"/></svg>
                <svg v-if="a === 'right'"  viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3"  width="14" height="1.5" rx=".75"/><rect x="6" y="7"  width="9"  height="1.5" rx=".75"/><rect x="3" y="11" width="12" height="1.5" rx=".75"/></svg>
              </button>
            </div>
          </div>

          <div class="dg-row">
            <span class="dg-label">Weight</span>
            <select class="select-ctrl" :value="st.fontWeight ?? ''" @change="setStyles({ fontWeight: ($event.target as HTMLSelectElement).value || undefined })">
              <option value="">Default</option>
              <option value="300">Light 300</option>
              <option value="400">Regular 400</option>
              <option value="500">Medium 500</option>
              <option value="600">Semibold 600</option>
              <option value="700">Bold 700</option>
              <option value="800">Extrabold 800</option>
              <option value="900">Black 900</option>
            </select>
          </div>
        </div>

        <!-- SPACING -->
        <div class="dg-section">
          <div class="dg-heading">Spacing</div>

          <div class="slider-row">
            <span class="slider-label">Vertical</span>
            <input class="slider" type="range" min="0" max="200"
              :value="st.py ?? 0"
              @input="setStyles({ py: Number(($event.target as HTMLInputElement).value) })" />
            <span class="slider-val">{{ st.py ?? 0 }}px</span>
            <button v-if="st.py != null" class="cp-clear" @click="clearStyle('py')">×</button>
          </div>

          <div class="slider-row">
            <span class="slider-label">Horizontal</span>
            <input class="slider" type="range" min="0" max="200"
              :value="st.px ?? 0"
              @input="setStyles({ px: Number(($event.target as HTMLInputElement).value) })" />
            <span class="slider-val">{{ st.px ?? 0 }}px</span>
            <button v-if="st.px != null" class="cp-clear" @click="clearStyle('px')">×</button>
          </div>
        </div>

        <!-- BORDER -->
        <div class="dg-section">
          <div class="dg-heading">Border</div>

          <div class="slider-row">
            <span class="slider-label">Radius</span>
            <input class="slider" type="range" min="0" max="64"
              :value="st.borderRadius ?? 0"
              @input="setStyles({ borderRadius: Number(($event.target as HTMLInputElement).value) })" />
            <span class="slider-val">{{ st.borderRadius ?? 0 }}px</span>
            <button v-if="st.borderRadius" class="cp-clear" @click="clearStyle('borderRadius')">×</button>
          </div>

          <div class="dg-row">
            <span class="dg-label">Width</span>
            <div class="num-row">
              <input class="num-input" type="number" min="0" max="20"
                :value="st.borderWidth ?? 0"
                @input="setStyles({ borderWidth: Number(($event.target as HTMLInputElement).value) })" />
              <span class="unit-label">px</span>
            </div>
          </div>

          <template v-if="st.borderWidth && st.borderWidth > 0">
            <div class="dg-row">
              <span class="dg-label">Style</span>
              <select class="select-ctrl" :value="st.borderStyle ?? 'solid'" @change="setStyles({ borderStyle: ($event.target as HTMLSelectElement).value as any })">
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
            <div class="dg-row">
              <span class="dg-label">Color</span>
              <div class="cp-row">
                <label class="cp-swatch sm" :style="{ background: st.borderColor || '#e2e8f0' }">
                  <input type="color" :value="st.borderColor || '#e2e8f0'" @input="setStyles({ borderColor: ($event.target as HTMLInputElement).value })" />
                </label>
                <input class="cp-hex sm" type="text" :value="st.borderColor ?? ''" placeholder="#e2e8f0"
                  @change="setStyles({ borderColor: ($event.target as HTMLInputElement).value })" />
              </div>
            </div>
          </template>
        </div>

        <!-- EFFECTS -->
        <div class="dg-section">
          <div class="dg-heading">Effects</div>

          <div class="slider-row">
            <span class="slider-label">Opacity</span>
            <input class="slider" type="range" min="0" max="100"
              :value="st.opacity ?? 100"
              @input="setStyles({ opacity: Number(($event.target as HTMLInputElement).value) })" />
            <span class="slider-val">{{ st.opacity ?? 100 }}%</span>
            <button v-if="st.opacity != null && st.opacity < 100" class="cp-clear" @click="clearStyle('opacity')">×</button>
          </div>

          <div class="dg-row">
            <span class="dg-label">Shadow</span>
            <input class="text-input" type="text" :value="st.shadow ?? ''" placeholder="0 4px 24px rgba(0,0,0,.12)"
              @input="setStyles({ shadow: ($event.target as HTMLInputElement).value })" />
          </div>
        </div>

        <!-- CUSTOM CSS -->
        <div class="dg-section">
          <div class="dg-heading">Custom CSS</div>
          <p class="dg-hint">One property per line. Applied to the section wrapper.</p>
          <textarea class="css-ta" rows="5" :value="st.customCss ?? ''" placeholder="overflow: hidden&#10;max-width: 1200px&#10;margin: 0 auto"
            @input="setStyles({ customCss: ($event.target as HTMLTextAreaElement).value })" />
        </div>

      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Shell ───────────────────────────────────────────────────────────────────── */
.sp-root  { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.sp-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--ui-text-muted); font-size: 13px; text-align: center; padding: 24px; }

.sp-header { padding: 12px 14px 8px; border-bottom: 1px solid var(--ui-border); flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; }
.sp-title  { font-size: 13px; font-weight: 700; color: var(--ui-text); }
.sp-tabs   { display: flex; gap: 3px; }
.sp-tab    { flex: 1; padding: 5px 0; font-size: 11px; font-weight: 700; border: 1.5px solid var(--ui-border); border-radius: 6px; background: none; cursor: pointer; color: var(--ui-text-muted); transition: all .13s; }
.sp-tab.active { background: var(--ui-primary); color: #fff; border-color: var(--ui-primary); }

.sp-body   { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; }

/* ── Content tab shared ──────────────────────────────────────────────────────── */
.cf-group  { display: flex; flex-direction: column; gap: 5px; }
.cf-label  { font-size: 12px; font-weight: 600; color: var(--ui-text); }
.cf-help   { font-size: 11px; color: var(--ui-text-muted); }
.img-field { display: flex; flex-direction: column; gap: 6px; }
.img-preview { max-height: 80px; border-radius: 6px; border: 1px solid var(--ui-border); object-fit: cover; }
.rt-field  { width: 100%; box-sizing: border-box; resize: vertical; font-family: monospace; font-size: 12px; background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px; padding: 8px 10px; color: var(--ui-text); outline: none; }
.rt-field:focus { border-color: var(--ui-primary); }
.et-field  { display: flex; flex-direction: column; gap: 6px; }
.arr-field { display: flex; flex-direction: column; gap: 8px; }
.arr-item  { display: flex; gap: 6px; align-items: center; }
.arr-obj   { border: 1px solid var(--ui-border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 7px; }
.arr-obj-hd { display: flex; justify-content: space-between; align-items: center; }
.arr-obj-num { font-size: 11px; font-weight: 700; color: var(--ui-text-muted); }
.arr-obj-field { display: flex; flex-direction: column; gap: 3px; }
.arr-obj-label { font-size: 10px; font-weight: 600; color: var(--ui-text-muted); text-transform: uppercase; letter-spacing: .04em; }
.rm-btn { background: none; border: none; cursor: pointer; color: var(--ui-text-muted); padding: 4px; border-radius: 4px; }
.rm-btn:hover { color: #ef4444; background: #fef2f2; }

/* ── Design tab ──────────────────────────────────────────────────────────────── */
.sp-design { gap: 0; padding: 0; }

.dg-section { padding: 14px 14px 10px; border-bottom: 1px solid var(--ui-border); display: flex; flex-direction: column; gap: 10px; }
.dg-heading { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-text-muted); }
.dg-hint    { font-size: 11px; color: var(--ui-text-muted); line-height: 1.5; margin-top: -4px; }
.dg-row     { display: flex; align-items: center; gap: 8px; }
.dg-label   { font-size: 11px; font-weight: 600; color: var(--ui-text-muted); width: 58px; flex-shrink: 0; }

/* Color picker */
.cp-row  { display: flex; align-items: center; gap: 6px; flex: 1; }
.cp-swatch {
  width: 30px; height: 30px; border-radius: 6px; cursor: pointer; flex-shrink: 0;
  border: 1.5px solid rgba(0,0,0,.12); display: block; position: relative; overflow: hidden;
}
.cp-swatch input[type="color"] {
  position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; padding: 0; border: none;
}
.cp-swatch.sm { width: 24px; height: 24px; border-radius: 4px; }
.cp-hex {
  flex: 1; height: 30px; padding: 0 8px; font-size: 12px; font-family: monospace;
  background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px;
  color: var(--ui-text); outline: none; min-width: 0;
}
.cp-hex:focus { border-color: var(--ui-primary); }
.cp-hex.sm    { height: 24px; font-size: 11px; }
.cp-clear { background: none; border: none; cursor: pointer; color: var(--ui-text-muted); font-size: 14px; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; }
.cp-clear:hover { color: #ef4444; }

/* Background type toggle */
.bg-types { display: flex; gap: 4px; }
.bg-type-btn {
  flex: 1; padding: 5px 0; font-size: 11px; font-weight: 600;
  border: 1.5px solid var(--ui-border); border-radius: 6px;
  background: none; cursor: pointer; color: var(--ui-text-muted); transition: all .12s;
}
.bg-type-btn.active { border-color: var(--ui-primary); color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 8%, transparent); }

/* Gradient builder */
.grad-row    { display: flex; gap: 8px; }
.grad-col    { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.grad-label  { font-size: 10px; font-weight: 600; color: var(--ui-text-muted); text-transform: uppercase; letter-spacing: .04em; }
.grad-preview { height: 24px; border-radius: 6px; border: 1px solid var(--ui-border); margin-top: 4px; }

/* URL input */
.url-input {
  width: 100%; box-sizing: border-box; height: 30px; padding: 0 8px; font-size: 12px;
  background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px;
  color: var(--ui-text); outline: none;
}
.url-input:focus { border-color: var(--ui-primary); }
.img-bg-preview { height: 60px; border-radius: 6px; border: 1px solid var(--ui-border); background-size: cover; background-position: center; }

/* Slider */
.slider-row  { display: flex; align-items: center; gap: 8px; }
.slider-label { font-size: 11px; font-weight: 600; color: var(--ui-text-muted); width: 62px; flex-shrink: 0; }
.slider {
  flex: 1; accent-color: var(--ui-primary); height: 4px; cursor: pointer;
  -webkit-appearance: none; appearance: none; border-radius: 2px;
  background: var(--ui-border); outline: none;
}
.slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--ui-primary); cursor: pointer; }
.slider-val  { font-size: 11px; font-family: monospace; color: var(--ui-text); width: 36px; text-align: right; flex-shrink: 0; }

/* Align buttons */
.align-group { display: flex; gap: 3px; }
.align-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: 1.5px solid var(--ui-border); border-radius: 6px; background: none; cursor: pointer;
  color: var(--ui-text-muted); transition: all .12s;
}
.align-btn svg { width: 16px; height: 16px; }
.align-btn.active { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 10%, transparent); color: var(--ui-primary); }
.align-btn:hover:not(.active) { border-color: var(--ui-border-accented); color: var(--ui-text); }

/* Number input */
.num-row  { display: flex; align-items: center; gap: 4px; }
.num-input { width: 56px; height: 30px; padding: 0 8px; font-size: 12px; font-family: monospace; background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px; color: var(--ui-text); outline: none; }
.num-input:focus { border-color: var(--ui-primary); }
.unit-label { font-size: 11px; color: var(--ui-text-muted); }

/* Select */
.select-ctrl { height: 30px; padding: 0 8px; font-size: 12px; background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px; color: var(--ui-text); outline: none; cursor: pointer; }
.select-ctrl:focus { border-color: var(--ui-primary); }

/* Text input */
.text-input { flex: 1; height: 30px; padding: 0 8px; font-size: 12px; font-family: monospace; background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px; color: var(--ui-text); outline: none; }
.text-input:focus { border-color: var(--ui-primary); }

/* Custom CSS textarea */
.css-ta { width: 100%; box-sizing: border-box; resize: vertical; font-family: monospace; font-size: 12px; line-height: 1.6; background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 6px; padding: 8px 10px; color: var(--ui-text); outline: none; }
.css-ta:focus { border-color: var(--ui-primary); }

/* ── Element palette ─────────────────────────────────────────────────────────── */
.el-palette-wrap  { background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 8px; padding: 8px; margin-bottom: 4px; }
.el-palette-label { font-size: 10px; font-weight: 700; color: var(--ui-text-muted); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 6px; }
.el-palette       { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.el-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 8px 4px 6px;
  background: var(--ui-bg); border: 1.5px solid var(--ui-border); border-radius: 7px;
  cursor: pointer; transition: all .13s;
}
.el-tile:hover { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 6%, transparent); }
.el-tile-icon  { width: 18px; height: 18px; color: var(--ui-text-muted); flex-shrink: 0; }
.el-tile:hover .el-tile-icon { color: var(--ui-primary); }
.el-tile-label { font-size: 9px; font-weight: 600; color: var(--ui-text-muted); text-align: center; line-height: 1.2; }
.el-tile:hover .el-tile-label { color: var(--ui-primary); }
</style>
