import { computed, ref, watch, type Ref } from 'vue';

/** Local draft history. Synchronous edits are batched; pointer gestures are transactions. */
export function useDesignerHistory<T>(draft: Ref<T>) {
  const past = ref<string[]>([]);
  const future = ref<string[]>([]);
  let current = JSON.stringify(draft.value);
  let grouped = false;
  const serialize = () => JSON.stringify(draft.value);
  function commit() {
    if (grouped) return;
    const next = serialize();
    if (next === current) return;
    past.value = [...past.value.slice(-49), current];
    current = next;
    future.value = [];
  }
  watch(draft, commit, { deep: true });
  function reset() {
    grouped = false;
    current = serialize();
    past.value = []; future.value = [];
  }
  function undo() {
    commit();
    const previous = past.value.pop();
    if (previous === undefined) return;
    future.value.push(current); current = previous;
    draft.value = JSON.parse(current);
  }
  function redo() {
    commit();
    const next = future.value.pop();
    if (next === undefined) return;
    past.value.push(current); current = next;
    draft.value = JSON.parse(current);
  }
  return {
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
    commit, reset, undo, redo,
    begin() { commit(); grouped = true; },
    end() { grouped = false; commit(); },
  };
}
