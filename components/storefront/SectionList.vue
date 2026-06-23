<script setup lang="ts">
import { schemas } from '~/lib/ecom-engine-schemas'

const props = defineProps<{
  order: string[]
  sections: Record<string, any>
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  remove: [id: string]
  reorder: [order: string[]]
  add: [type: string]
}>()

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

const dragSrc  = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent) {
  dragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
  ;(e.currentTarget as HTMLElement).classList.add('dragging')
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOver.value = i
}
function onDrop(i: number) {
  if (dragSrc.value === null || dragSrc.value === i) { reset(); return }
  const next = [...props.order]
  const [item] = next.splice(dragSrc.value, 1)
  next.splice(i, 0, item)
  emit('reorder', next)
  reset()
}
function reset() { dragSrc.value = null; dragOver.value = null }

// ── Section metadata ──────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  'marquee-banner':  'i-heroicons-megaphone',
  'hero-banner':     'i-heroicons-photo',
  'category-grid':   'i-heroicons-rectangle-group',
  'product-grid':    'i-heroicons-shopping-bag',
  'promo-card':      'i-heroicons-sparkles',
  'feature-columns': 'i-heroicons-list-bullet',
  'review-carousel': 'i-heroicons-star',
  'blog-grid':       'i-heroicons-newspaper',
  'faq-accordion':   'i-heroicons-question-mark-circle',
  'newsletter-form': 'i-heroicons-envelope',
  'page-hero':       'i-heroicons-home',
  'stats-grid':      'i-heroicons-chart-bar',
  'value-columns':   'i-heroicons-heart',
  'contact-layout':  'i-heroicons-chat-bubble-left-right',
  'steps-list':      'i-heroicons-numbered-list',
  'track-form':      'i-heroicons-map-pin',
  'custom-block':    'i-heroicons-code-bracket',
  'custom-html':     'i-heroicons-code-bracket-square',
}

function sectionType(id: string) { return props.sections[id]?.type ?? '' }
function sectionIcon(id: string) { return ICONS[sectionType(id)] ?? 'i-heroicons-squares-2x2' }
function sectionName(id: string) {
  const type = sectionType(id)
  return schemas.find(s => s.type === type)?.name ?? type ?? id
}

// ── Add section modal ─────────────────────────────────────────────────────────

const addOpen = ref(false)

const GROUPS = [
  {
    label: 'Hero & Promo',
    types: ['marquee-banner', 'hero-banner', 'promo-card', 'page-hero'],
  },
  {
    label: 'Products & Shop',
    types: ['category-grid', 'product-grid', 'stats-grid'],
  },
  {
    label: 'Content',
    types: ['feature-columns', 'value-columns', 'steps-list', 'faq-accordion', 'blog-grid'],
  },
  {
    label: 'Contact & Track',
    types: ['contact-layout', 'track-form', 'newsletter-form', 'review-carousel'],
  },
  {
    label: 'Custom',
    types: ['custom-block', 'custom-html'],
  },
]

const addGroups = computed(() =>
  GROUPS.map(g => ({
    ...g,
    schemas: schemas.filter(s => g.types.includes(s.type)),
  })).filter(g => g.schemas.length > 0)
)

function addSection(type: string) {
  addOpen.value = false
  emit('add', type)
}
</script>

<template>
  <div class="sl-root">
    <div class="sl-header">
      <span class="sl-title">Sections</span>
      <button class="sl-add-btn" @click="addOpen = true">
        <UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
        Add
      </button>
    </div>

    <div class="sl-body">
      <div
        v-for="(id, i) in order"
        :key="id"
        draggable="true"
        class="sl-row"
        :class="{
          'sl-row--active':     selectedId === id,
          'sl-row--drag-over':  dragOver === i && dragSrc !== i,
          'sl-row--dragging':   dragSrc === i,
        }"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="reset"
        @click="$emit('select', id)"
      >
        <span class="sl-handle" title="Drag to reorder">
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3"  r="1.5"/><circle cx="7" cy="3"  r="1.5"/>
            <circle cx="3" cy="8"  r="1.5"/><circle cx="7" cy="8"  r="1.5"/>
            <circle cx="3" cy="13" r="1.5"/><circle cx="7" cy="13" r="1.5"/>
          </svg>
        </span>
        <UIcon :name="sectionIcon(id)" class="sl-type-icon w-3.5 h-3.5" />
        <span class="sl-name">{{ sectionName(id) }}</span>
        <button class="sl-del" title="Remove section" @click.stop="$emit('remove', id)">
          <UIcon name="i-heroicons-trash" class="w-3 h-3" />
        </button>
      </div>

      <div v-if="order.length === 0" class="sl-empty">
        <UIcon name="i-heroicons-squares-2x2" class="w-6 h-6 mb-2 text-gray-300" />
        <p>No sections yet.<br>Click <strong>Add</strong> to start building.</p>
      </div>
    </div>

    <!-- Add section modal -->
    <UModal v-model="addOpen" title="Add section">
      <template #body>
        <div class="add-modal">
          <div v-for="group in addGroups" :key="group.label" class="add-group">
            <p class="add-group-label">{{ group.label }}</p>
            <div class="add-grid">
              <button
                v-for="s in group.schemas"
                :key="s.type"
                class="add-card"
                @click="addSection(s.type)"
              >
                <UIcon :name="ICONS[s.type] ?? 'i-heroicons-squares-2x2'" class="w-5 h-5 mb-1.5 text-gray-400" />
                <span>{{ s.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.sl-root  { display: flex; flex-direction: column; height: 100%; }
.sl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 12px 10px; border-bottom: 1px solid var(--ui-border); flex-shrink: 0;
}
.sl-title { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ui-text-muted); }
.sl-add-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; color: var(--ui-primary);
  background: none; border: 1px solid var(--ui-primary); border-radius: 6px;
  padding: 3px 8px; cursor: pointer; transition: background .12s;
}
.sl-add-btn:hover { background: color-mix(in srgb, var(--ui-primary) 10%, transparent); }

.sl-body  { flex: 1; overflow-y: auto; padding: 6px; }

.sl-row {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 8px 8px 4px; border-radius: 8px; cursor: pointer;
  border: 1.5px solid transparent; transition: background .12s, border-color .12s;
  user-select: none;
}
.sl-row:hover   { background: var(--ui-bg-elevated); }
.sl-row--active { background: var(--ui-bg-elevated); border-color: var(--ui-border-accented); }
.sl-row--drag-over { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 6%, transparent); }
.sl-row--dragging  { opacity: .4; }

.sl-handle {
  flex-shrink: 0; cursor: grab; color: var(--ui-text-muted); padding: 2px 4px;
  display: flex; align-items: center;
}
.sl-handle:active { cursor: grabbing; }
.sl-type-icon { flex-shrink: 0; color: var(--ui-text-muted); }
.sl-name { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--ui-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-del {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--ui-text-muted); padding: 4px; border-radius: 4px;
  transition: color .12s, background .12s; opacity: 0;
}
.sl-row:hover .sl-del { opacity: 1; }
.sl-del:hover { color: #ef4444; background: #fef2f2; }

.sl-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: 32px 16px; color: var(--ui-text-muted); font-size: 12.5px; line-height: 1.6;
}

/* Add modal */
.add-modal { display: flex; flex-direction: column; gap: 20px; }
.add-group-label { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ui-text-muted); margin-bottom: 8px; }
.add-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.add-card {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 14px 8px; border-radius: 8px; border: 1.5px solid var(--ui-border);
  background: var(--ui-bg); cursor: pointer; font-size: 11px; font-weight: 600;
  color: var(--ui-text); text-align: center; transition: all .13s;
}
.add-card:hover { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 5%, transparent); color: var(--ui-primary); }
</style>
