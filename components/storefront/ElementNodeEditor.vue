<script setup lang="ts">
import type { ElementNode } from '~/lib/ecom-engine-schemas'

// Recursive element tree editor — used in SettingsPanel for custom-block sections.
// path = array of indices from the root to this node, e.g. [0, 1] means
// root[0].children[1]. Events bubble upward so the root handler can apply diffs.

const props = defineProps<{
  node: ElementNode
  path: number[]
  depth: number
}>()

const emit = defineEmits<{
  update: [path: number[], field: string, value: any]
  addChild: [path: number[]]
  remove: [index: number]
}>()

const open = ref(true)

const TAGS = ['div','section','h1','h2','h3','h4','p','span','strong','em','small',
              'a','button','img','ul','ol','li','figure','figcaption','blockquote','pre','code','hr','icon']

const myIndex = computed(() => props.path[props.path.length - 1])

function upd(field: string, value: any) {
  emit('update', props.path, field, value)
}

function handleChildUpdate(path: number[], field: string, value: any) {
  emit('update', path, field, value)
}

function handleChildAddChild(path: number[]) {
  emit('addChild', path)
}

function handleChildRemove(childIdx: number) {
  // Remove from this node's children by emitting a special field update
  const newChildren = [...(props.node.children ?? [])]
  newChildren.splice(childIdx, 1)
  emit('update', props.path, '_children', newChildren)
}
</script>

<template>
  <div class="enode" :style="depth > 0 ? { marginLeft: '12px' } : {}">
    <div class="enode-header">
      <button class="enode-toggle" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <select
        class="enode-tag"
        :value="node.tag"
        @change="upd('tag', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="t in TAGS" :key="t" :value="t">{{ t }}</option>
      </select>
      <button class="enode-add" title="Add child element" @click="emit('addChild', path)">+</button>
      <button class="enode-del" title="Remove element" @click="emit('remove', myIndex)">×</button>
    </div>

    <template v-if="open">
      <div class="enode-fields">
        <label class="obj-label">Text content</label>
        <input
          class="enode-input"
          :value="node.text ?? ''"
          placeholder="(leave blank if element has children)"
          @input="upd('text', ($event.target as HTMLInputElement).value)"
        />
        <label class="obj-label" style="margin-top:6px">Inline CSS style</label>
        <input
          class="enode-input enode-mono"
          :value="node.attrs?.style ?? ''"
          placeholder="padding:24px;color:#333;font-size:16px"
          @input="upd('attrs.style', ($event.target as HTMLInputElement).value)"
        />
        <template v-if="node.tag === 'a' || node.tag === 'button'">
          <label class="obj-label" style="margin-top:6px">href</label>
          <input
            class="enode-input"
            :value="node.attrs?.href ?? ''"
            placeholder="/shop or https://…"
            @input="upd('attrs.href', ($event.target as HTMLInputElement).value)"
          />
        </template>
        <template v-if="node.tag === 'img'">
          <label class="obj-label" style="margin-top:6px">src</label>
          <input
            class="enode-input"
            :value="node.attrs?.src ?? ''"
            placeholder="/images/photo.jpg"
            @input="upd('attrs.src', ($event.target as HTMLInputElement).value)"
          />
          <label class="obj-label" style="margin-top:6px">alt</label>
          <input
            class="enode-input"
            :value="node.attrs?.alt ?? ''"
            @input="upd('attrs.alt', ($event.target as HTMLInputElement).value)"
          />
        </template>
        <template v-if="node.tag === 'icon'">
          <label class="obj-label" style="margin-top:6px">Icon name (Lucide)</label>
          <input
            class="enode-input"
            :value="node.attrs?.name ?? ''"
            placeholder="star, heart, arrow-right, shield-check …"
            @input="upd('attrs.name', ($event.target as HTMLInputElement).value)"
          />
          <p class="obj-help">Browse icons at <a href="https://lucide.dev/icons" target="_blank" class="obj-link">lucide.dev/icons</a></p>
        </template>
        <label class="obj-label" style="margin-top:6px">CSS class</label>
        <input
          class="enode-input"
          :value="node.attrs?.class ?? ''"
          placeholder="my-class other-class"
          @input="upd('attrs.class', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <div v-if="(node.children ?? []).length" class="enode-children">
        <StorefrontElementNodeEditor
          v-for="(child, i) in (node.children ?? [])"
          :key="child.id ?? i"
          :node="child"
          :path="[...path, i]"
          :depth="depth + 1"
          @update="handleChildUpdate"
          @add-child="handleChildAddChild"
          @remove="handleChildRemove"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.enode { border: 1px solid var(--ui-border); border-radius: 8px; overflow: visible; margin-bottom: 6px; }
.enode-header { display: flex; align-items: center; gap: 6px; padding: 5px 8px; background: var(--ui-bg-muted); border-bottom: 1px solid var(--ui-border); }
.enode-toggle { background: none; border: none; cursor: pointer; color: var(--ui-text-muted); font-size: 11px; width: 14px; flex-shrink: 0; }
.enode-tag {
  font-size: 11px; font-family: monospace; font-weight: 700;
  background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 4px;
  padding: 2px 6px; color: var(--ui-primary); flex: 1; max-width: 100px;
}
.enode-add {
  background: none; border: 1px solid var(--ui-border); border-radius: 4px;
  cursor: pointer; font-size: 14px; line-height: 1; color: var(--ui-text-muted); padding: 1px 6px;
}
.enode-add:hover { color: var(--ui-primary); border-color: var(--ui-primary); }
.enode-del {
  background: none; border: none; cursor: pointer; color: var(--ui-text-muted);
  font-size: 15px; line-height: 1; padding: 1px 4px; border-radius: 4px;
}
.enode-del:hover { color: #ef4444; }
.enode-fields { padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.obj-label { font-size: 10px; font-weight: 600; color: var(--ui-text-muted); letter-spacing: .04em; text-transform: uppercase; }
.enode-input {
  width: 100%; box-sizing: border-box; font-size: 12px;
  background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 4px;
  padding: 5px 8px; color: var(--ui-text); outline: none;
}
.enode-input:focus { border-color: var(--ui-primary); }
.enode-mono { font-family: monospace; font-size: 11px; }
.enode-children { padding: 8px 8px 4px; display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--ui-border); background: var(--ui-bg); }
.obj-help  { font-size: 10px; color: var(--ui-text-muted); margin: 2px 0 0; }
.obj-link  { color: var(--ui-primary); text-decoration: underline; }
</style>
