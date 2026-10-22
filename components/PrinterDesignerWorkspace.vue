<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ fullscreen: boolean; open: boolean; title: string; busy: boolean; dirty: boolean; kind?: 'label' | 'receipt' }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
let previousOverflow = '';
let locked = false;
function unlock() {
  if (locked) { document.body.style.overflow = previousOverflow; locked = false; }
}
watch(() => [props.fullscreen, props.open], async () => {
  await nextTick();
  if (props.fullscreen && props.open && dialog.value) {
    if (!dialog.value.open) dialog.value.showModal();
    if (!locked) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; locked = true; }
  } else { dialog.value?.close(); unlock(); }
}, { immediate: true });
function cancel(event: Event) { event.preventDefault(); if (!props.busy) emit('close'); }
onBeforeUnmount(() => { dialog.value?.close(); unlock(); });
</script>

<template>
  <div v-if="!fullscreen">
    <div class="workspace-actions mb-4"><slot name="actions" /></div>
    <slot />
  </div>
  <dialog v-else ref="dialog" class="printer-workspace" aria-labelledby="printer-workspace-title" @cancel="cancel">
    <header class="workspace-header">
      <div class="workspace-heading">
        <span class="workspace-eyebrow">Printer settings / {{ kind === 'receipt' ? 'Receipt' : 'Label' }} designer</span>
        <h2 id="printer-workspace-title">{{ title }}</h2>
        <span class="workspace-state">{{ dirty ? 'Unsaved draft' : 'All changes saved' }}</span>
      </div>
      <div class="workspace-actions"><slot name="actions" /><button type="button" class="workspace-close" :disabled="busy" :aria-label="`Close ${kind || 'label'} designer`" @click="emit('close')">Done <span aria-hidden="true">×</span></button></div>
    </header>
    <main class="workspace-content"><slot /></main>
  </dialog>
</template>

<style scoped>
.printer-workspace { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #f8fafc; color: #0f172a; }
.printer-workspace[open] { display: flex; flex-direction: column; }
.printer-workspace::backdrop { background: #0f172a99; }
.workspace-header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 20px; background: white; border-bottom: 1px solid #e2e8f0; }
.workspace-heading h2 { font-size: 20px; font-weight: 650; margin: 3px 0; }
.workspace-eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
.workspace-state { font-size: 12px; color: #64748b; }
.workspace-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.workspace-close { display: flex; align-items: center; gap: 16px; padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; background: white; }
.workspace-close:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
.workspace-close:disabled { opacity: .5; }
.workspace-content { flex: 1; min-height: 0; overflow: hidden; padding: 16px 20px; }
.workspace-footer { flex: none; display: flex; justify-content: space-between; gap: 20px; padding: 8px 20px; border-top: 1px solid #e2e8f0; background: white; color: #64748b; font-size: 12px; }
:global(.dark) .printer-workspace { background: #0f172a; color: #f1f5f9; }
:global(.dark) .workspace-header, :global(.dark) .workspace-footer, :global(.dark) .workspace-close { background: #111827; border-color: #334155; color: #cbd5e1; }
@media (max-width: 760px) { .workspace-header { align-items: flex-start; flex-direction: column; gap: 10px; padding: 14px 16px; } .workspace-content { padding: 12px; overflow: auto; } .workspace-footer { padding: 10px 16px; } .workspace-footer span:first-child { display: none; } }
</style>
