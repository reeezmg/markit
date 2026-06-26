<script setup lang="ts">
/**
 * Inline quick-add bar rendered below the KPI cards, above the expense table.
 * Replaces the old "Add Expense" modal for creating expenses (the modal is now
 * edit-only). Emits `create` with the same payload shape ExpenseForm emits on
 * save. Add is optimistic (row appears instantly), but the form clears only once
 * the server confirms, so the Add button shows a `loading` spinner meanwhile.
 *
 * Keyboard: ← / → traverse the row of fields (date / category / user / amount /
 * payment / status / note / Add). Mirrors the USelectMenu interop in
 * pages/products/add.vue + pages/erp/billing.vue (movecatgeory): when a select
 * is open, ← / → close it and keep focus on the trigger. Enter advances through
 * inputs; only Enter/click on Add saves.
 *
 * The Category select mirrors pages/erp/billing.vue: `multiple` + searchable, so
 * clicking the selected option toggles it off (deselect). An expense has a single
 * category, so we keep only the most-recently-picked option. Payment/Status use
 * the same single-item multiple pattern so clicking the selected option can
 * deselect it; User remains a plain single select.
 */
const props = defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['create']);
const toast = useToast();

const {
  categories,
  companyUsers,
  categoriesLoading,
  loadCategories,
  loadCompanyUsers,
  createCategory,
  deleteCategory,
} = useExpenseFormOptions();

const paymentModeOptions = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Bank', value: 'BANK' },
  { label: 'UPI', value: 'UPI' },
  { label: 'Card', value: 'CARD' },
  { label: 'Cheque', value: 'CHEQUE' },
];

const statusOptions = [
  { label: 'Paid', value: 'Paid' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' },
];

const makeDefaultForm = () => ({
  date: new Date().toLocaleDateString('en-CA'),
  category: [] as any[],
  user: [] as any[],
  amount: '' as string | number,
  paymentMode: [paymentModeOptions[0]] as any[],
  status: [statusOptions[0]] as any[],
  note: '',
});

const form = ref(makeDefaultForm());

onMounted(() => {
  loadCategories();
  loadCompanyUsers();
  focusCategory();
});

// `multiple` mode (billing-style) emits the full selection array; keep only the
// most-recently-toggled-on option so the expense has a single category, and
// create it if it's a new (id-less) name.
const handleCategoryChange = async (selected: any) => {
  const arr = Array.isArray(selected) ? selected : selected ? [selected] : [];
  if (!arr.length) {
    // Deselected — stay on the open menu so another can be picked.
    form.value.category = [];
    return;
  }
  const last = arr[arr.length - 1];
  if (last?.id) {
    form.value.category = [last];
    advanceFromSelect(categoryFieldRef);
    return;
  }
  // Creatable: a typed-in name with no id yet.
  try {
    form.value.category = [await createCategory(last.name)];
    advanceFromSelect(categoryFieldRef);
  } catch (error: any) {
    toast.add({ title: 'Failed to create category', description: error.message, color: 'red' });
  }
};

// User/Payment/Status mirror category's billing-style multiple select but are
// capped to one item, so the selected option can be toggled off (deselect).
const coerceSingleSelection = (selected: any) => {
  const arr = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return arr.length ? [arr[arr.length - 1]] : [];
};

const handlePaymentChange = (selected: any) => {
  form.value.paymentMode = coerceSingleSelection(selected);
  if (form.value.paymentMode.length) advanceFromSelect(paymentSelectRef);
};

const handleStatusChange = (selected: any) => {
  form.value.status = coerceSingleSelection(selected);
  if (form.value.status.length) advanceFromSelect(statusSelectRef);
};

const handleUserChange = (selected: any) => {
  form.value.user = coerceSingleSelection(selected);
  if (form.value.user.length) advanceFromSelect(userSelectRef);
};

const removeCategory = async (category: any) => {
  const ok = await deleteCategory(category.id);
  if (ok && form.value.category?.[0]?.id === category.id) {
    form.value.category = [];
  }
};

const submit = () => {
  if (props.loading) return; // a create is already in flight
  const category = form.value.category?.[0];
  if (!category?.id) {
    toast.add({ title: 'Please select a category!', color: 'red' });
    focusCategory();
    return;
  }
  const paymentMode = form.value.paymentMode?.[0];
  if (!paymentMode?.value) {
    toast.add({ title: 'Please select a payment mode!', color: 'red' });
    nextTick(() => (paymentSelectRef.value?.querySelector('button') as HTMLElement | null)?.focus());
    return;
  }
  const status = form.value.status?.[0];
  if (!status?.value) {
    toast.add({ title: 'Please select a status!', color: 'red' });
    nextTick(() => (statusSelectRef.value?.querySelector('button') as HTMLElement | null)?.focus());
    return;
  }
  emit('create', {
    ...form.value,
    category, // single object for optimistic display
    user: form.value.user?.[0] || null,
    userId: form.value.user?.[0]?.userId || null,
    categoryId: category.id,
    paymentMode: paymentMode.value,
    status: status.value,
  });
};

/* ── Keyboard navigation ─────────────────────────────────────────────────── */
const barRef = ref<HTMLElement | null>(null);

// Each USelectMenu is wrapped in <div ref="..."> so we can grab its trigger
// button to close an open menu / return focus to it — mirrors
// AddProduct/Create.vue (getAllSelectWrappers / focusBackOnSelect) and
// pages/erp/billing.vue:movecatgeory.
const categoryFieldRef = ref<HTMLElement | null>(null);
const userSelectRef = ref<HTMLElement | null>(null);
const paymentSelectRef = ref<HTMLElement | null>(null);
const statusSelectRef = ref<HTMLElement | null>(null);

const getSelectWrappers = (): HTMLElement[] =>
  [categoryFieldRef.value, userSelectRef.value, paymentSelectRef.value, statusSelectRef.value].filter(
    (w): w is HTMLElement => !!w,
  );

const resolveSelectWrapper = (el: HTMLElement | null): HTMLElement | null => {
  if (!el) return null;
  return getSelectWrappers().find((w) => w === el || w.contains(el)) ?? null;
};

// Input types where the caret position is meaningful — only these block
// arrow-key field traversal until the caret is at the matching edge. number /
// date are treated as always-at-edge so ← / → always move between fields.
const CARET_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password']);
const isAtLeftEdge = (el: HTMLInputElement) => {
  if (!CARET_TYPES.has(el.type)) return true;
  return el.selectionStart === 0 && el.selectionEnd === 0;
};
const isAtRightEdge = (el: HTMLInputElement) => {
  if (!CARET_TYPES.has(el.type)) return true;
  const len = (el.value ?? '').length;
  return el.selectionStart === len && el.selectionEnd === len;
};

const getFocusable = (): HTMLElement[] => {
  if (!barRef.value) return [];
  return (Array.from(barRef.value.querySelectorAll('input, button')) as HTMLElement[]).filter(
    (el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null,
  );
};

const focusEl = (el: HTMLElement | null) => {
  if (!el) return;
  el.focus();
  if (el.tagName === 'INPUT' && CARET_TYPES.has((el as HTMLInputElement).type)) {
    (el as HTMLInputElement).select?.();
  }
};

const focusCategory = () => {
  nextTick(() => {
    const btn = categoryFieldRef.value?.querySelector('button') as HTMLElement | null;
    btn?.focus();
  });
};

// The bar's ordered "fields" — each select counts only by its trigger button,
// so an open panel's search input / options aren't treated as a field.
const getFields = (): HTMLElement[] => {
  const wrappers = getSelectWrappers();
  return getFocusable().filter((el) => {
    const w = wrappers.find((ww) => ww.contains(el));
    return !w || el === (w.querySelector('button') as HTMLElement | null);
  });
};

// Move focus to the field after `current` (Enter in an input, or after a pick).
// Stops at the last field (the Add button) — it does not wrap or submit.
const focusNextField = (current: HTMLElement | null) => {
  if (!current) return;
  const fields = getFields();
  const idx = fields.indexOf(current);
  focusEl(idx >= 0 ? (fields[idx + 1] ?? current) : current);
};

// Enter in an input advances to the next field instead of saving — only Enter
// on the Add button (native button activation → @click) saves.
const onInputEnter = (e: KeyboardEvent) => focusNextField(e.target as HTMLElement | null);

// After an option is picked, advance to the next field (also closes the menu
// via focus-out), like pages/erp/billing.vue.
const advanceFromSelect = (wrapper: Ref<HTMLElement | null>) => {
  nextTick(() => focusNextField(wrapper.value?.querySelector('button') as HTMLElement | null));
};

// Geometric neighbor search within the bar — handles the responsive 2-col /
// 4-col grid + row wrapping. Adapted from pages/products/add.vue.
const findFocusableNeighbor = (
  current: HTMLElement,
  direction: 'up' | 'down' | 'left' | 'right',
): HTMLElement | null => {
  const cr = current.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  let best: { el: HTMLElement; score: number } | null = null;
  for (const el of getFocusable()) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    let primary = 0;
    let cross = 0;
    if (direction === 'up') {
      if (ey >= cy - 4) continue;
      primary = cy - ey;
      cross = Math.abs(ex - cx);
    } else if (direction === 'down') {
      if (ey <= cy + 4) continue;
      primary = ey - cy;
      cross = Math.abs(ex - cx);
    } else if (direction === 'left') {
      if (ex >= cx - 4) continue;
      if (Math.abs(ey - cy) > Math.max(cr.height, r.height)) continue;
      primary = cx - ex;
      cross = Math.abs(ey - cy);
    } else {
      if (ex <= cx + 4) continue;
      if (Math.abs(ey - cy) > Math.max(cr.height, r.height)) continue;
      primary = ex - cx;
      cross = Math.abs(ey - cy);
    }
    const score = primary + cross * 3;
    if (!best || score < best.score) best = { el, score };
  }
  return best?.el ?? null;
};

// Document-order fallback for ← / → so a row's edge field wraps to the previous
// row's last / next row's first field (like Shift+Tab / Tab).
const findDocOrderNeighbor = (
  current: HTMLElement,
  direction: 'prev' | 'next',
): HTMLElement | null => {
  const visible = getFocusable();
  const idx = visible.indexOf(current);
  if (idx === -1) return null;
  return visible[direction === 'prev' ? idx - 1 : idx + 1] ?? null;
};

const onBarKeydown = (e: KeyboardEvent) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

  const target = e.target as HTMLElement | null;
  if (!target) return;

  const isSelectTrigger =
    target.tagName === 'BUTTON' &&
    (target.getAttribute('aria-haspopup') === 'listbox' ||
      target.getAttribute('role') === 'combobox');
  const isSelectOpen = isSelectTrigger && target.getAttribute('aria-expanded') === 'true';
  const isInsideListbox = !!target.closest('[role="listbox"]');

  // ── Up / Down: move between rows ─────────────────────────────────────────
  // Only an OPEN menu (or focus inside its panel) keeps native ↑/↓ for option
  // navigation. On a CLOSED select trigger we navigate rows and block the
  // native arrow-to-open (capture phase + stopPropagation) — menus open only
  // via Enter / Space / click.
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (isSelectOpen || isInsideListbox) return;
    const next = findFocusableNeighbor(target, e.key === 'ArrowUp' ? 'up' : 'down');
    if (next || isSelectTrigger) {
      e.preventDefault();
      e.stopPropagation();
      if (next) focusEl(next);
    }
    return;
  }

  // ── Left / Right ─────────────────────────────────────────────────────────
  const dir = e.key === 'ArrowLeft' ? 'left' : 'right';

  // Open USelectMenu (or focus inside its panel): close it via the wrapper's
  // trigger button and keep focus there — don't navigate. Arrow again from the
  // closed trigger moves on. Mirrors AddProduct/Create.vue + billing.vue.
  if (isSelectOpen || isInsideListbox) {
    e.preventDefault();
    e.stopPropagation();
    const button = resolveSelectWrapper(target)?.querySelector('button') as HTMLElement | null;
    if (button) {
      button.focus();
      button.click();
      nextTick(() => button.focus());
    } else {
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    }
    return;
  }

  // Plain inputs: only leave the field once the caret is at the matching edge.
  if (target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    const atEdge = dir === 'left' ? isAtLeftEdge(input) : isAtRightEdge(input);
    if (!atEdge) return;
  }

  const next =
    findFocusableNeighbor(target, dir) ??
    findDocOrderNeighbor(target, dir === 'left' ? 'prev' : 'next');
  if (next) {
    e.preventDefault();
    e.stopPropagation();
    focusEl(next);
  }
};

// Parent calls this after a successful create so the bar is ready for the next
// entry, with focus returned to Category.
const reset = async () => {
  Object.assign(form.value, makeDefaultForm());
  await nextTick();
  focusCategory();
};

defineExpose({ reset });
</script>

<template>
  <UCard class="mb-4" :ui="{ body: { padding: 'px-4 py-3' } }">
    <div ref="barRef" class="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end" @keydown.capture="onBarKeydown">
      <UFormGroup label="Date">
        <UInput v-model="form.date" type="date" size="sm" @keydown.enter.prevent="onInputEnter" />
      </UFormGroup>

      <UFormGroup label="Category" required>
        <div ref="categoryFieldRef">
          <USelectMenu
            v-model="form.category"
            size="sm"
            :loading="categoriesLoading"
            :options="categories"
            option-attribute="name"
            option-key="id"
            track-by="id"
            multiple
            searchable
            creatable
            show-create-option-when="always"
            searchable-placeholder="Search a Category..."
            placeholder="Select / create"
            @update:modelValue="handleCategoryChange"
          >
            <template #label>
              <span v-if="form.category.length" class="truncate">{{ form.category[0].name }}</span>
              <span v-else class="text-gray-400">Select / create</span>
            </template>
            <template #option="{ option }">
              <div class="flex items-center justify-between w-full">
                <span class="truncate">{{ option.name }}</span>
                <UIcon
                  v-if="option.name !== 'Purchase'"
                  name="i-heroicons-x-circle"
                  class="w-4 h-4 text-red-500 cursor-pointer"
                  @mousedown.prevent.stop="removeCategory(option)"
                />
              </div>
            </template>
          </USelectMenu>
        </div>
      </UFormGroup>

      <UFormGroup label="User">
        <div ref="userSelectRef">
          <USelectMenu
            v-model="form.user"
            size="sm"
            :options="companyUsers"
            option-attribute="name"
            option-key="userId"
            track-by="userId"
            multiple
            searchable
            placeholder="Employee"
            @update:modelValue="handleUserChange"
          >
            <template #label>
              <span v-if="form.user.length">{{ form.user[0].name }}</span>
              <span v-else class="text-gray-400">Employee</span>
            </template>
            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-medium">{{ option.name }}</span>
                <span class="text-xs opacity-70">{{ option.phone }}</span>
              </div>
            </template>
          </USelectMenu>
        </div>
      </UFormGroup>

      <UFormGroup label="Amount" required>
        <UInput
          v-model="form.amount"
          type="number"
          size="sm"
          placeholder="0.00"
          @keydown.enter.prevent="onInputEnter"
        />
      </UFormGroup>

      <UFormGroup label="Payment">
        <div ref="paymentSelectRef">
          <USelectMenu
            v-model="form.paymentMode"
            size="sm"
            :options="paymentModeOptions"
            option-attribute="label"
            option-key="value"
            track-by="value"
            multiple
            searchable
            @update:modelValue="handlePaymentChange"
          >
            <template #label>
              <span v-if="form.paymentMode.length" class="truncate">{{ form.paymentMode[0].label }}</span>
              <span v-else class="text-gray-400">Payment</span>
            </template>
          </USelectMenu>
        </div>
      </UFormGroup>

      <UFormGroup label="Status">
        <div ref="statusSelectRef">
          <USelectMenu
            v-model="form.status"
            size="sm"
            :options="statusOptions"
            option-attribute="label"
            option-key="value"
            track-by="value"
            multiple
            searchable
            @update:modelValue="handleStatusChange"
          >
            <template #label>
              <span v-if="form.status.length" class="truncate">{{ form.status[0].label }}</span>
              <span v-else class="text-gray-400">Status</span>
            </template>
          </USelectMenu>
        </div>
      </UFormGroup>

      <UFormGroup label="Note">
        <UInput v-model="form.note" size="sm" placeholder="Note..." @keydown.enter.prevent="onInputEnter" />
      </UFormGroup>

      <UButton
        type="button"
        color="primary"
        icon="i-heroicons-plus"
        block
        :loading="loading"
        @click="submit"
      >
        Add
      </UButton>
    </div>
  </UCard>
</template>
