<script setup lang="ts">
import AwsService from '~/composables/aws';
import { v4 as uuidv4 } from 'uuid';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
const { printLabel } = usePrint();
const router = useRouter();
const route = useRoute();
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;
const draft = useProductDraft();
const draftProductIds = computed({
  get: () => draft.productIds.value,
  set: (value: string[]) => {
    draft.productIds.value = value
  }
})
const draftPurchaseInfo = computed(() => draft.purchaseInfo.value)
const draftProducts = computed(() => draft.draftProducts.value)
const selectedDraft = computed({
  get: () => draft.selectedDraft.value,
  set: (value: any) => {
    draft.selectedDraft.value = value
  }
})
const currentDraftNo = computed(() => draft.draftNo.value)
const isDistributorPurchaseOrderFlow = computed(
  () => route.query.from === 'distributor-purchase-order'
)
const returnTo = computed(() => {
  const value = Array.isArray(route.query.returnTo)
    ? route.query.returnTo[0]
    : route.query.returnTo

  return typeof value === 'string' && value.startsWith('/')
    ? value
    : '/products'
})
const editPurchaseOrderId = computed(() => String(route.query.poId || ''))
const isEditingPurchaseOrder = computed(
  () => route.query.isEdit === 'true' && !!editPurchaseOrderId.value
)
const activePurchaseOrderId = computed(() =>
  isEditingPurchaseOrder.value ? editPurchaseOrderId.value : draft.poId.value
)
const tableProductIds = computed(() =>
  isEditingPurchaseOrder.value ? undefined : draftProductIds.value
)
const effectiveDeliveryType = computed(() =>
  isDistributorPurchaseOrderFlow.value ? 'order' : deliveryType.value || 'trynbuy'
)

const onDraftProductDeleted = (id: string) => {
  draft.productIds.value = draft.productIds.value.filter(productId => productId !== id)
  draft.stagedProducts.value = draft.stagedProducts.value.filter((p: any) => p.id !== id)
}

const sameJson = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b)

const isAdd = ref(false);
const settledMap = ref(new Map());
const pendingDraftProducts = ref<any[]>([]);
const variantInputs = ref(useAuth().session.value?.variantInputs)
const deliveryType = ref<string>('')
const billDate = ref<string>('');
const isSaveDisable = computed(() => {
  // If any value is false → disable
  for (const val of settledMap.value.values()) {
    if (!val) return true;
  }
  return false; // all are true → enable
});


interface ImageData {
    file: File;
    uuid: string;
    view?: string;
}
interface Item {
    name: string;
}
interface BarcodeItem {
  barcode: string;
  code: string;
  productName: string;
  name?: string;
  variantName: string;
  sprice: number;
  size?: string | null;
}



interface Variant {
  id:string;
  name: string;
  key:string;
  code: string;
  unit?: string;
  qty: number;
  sprice: number;
  pprice: number;
  dprice: number;
  discount: number;
  items: {id: string; size: string | null; qty: number | undefined}[]; // Assuming items are strings, adjust if needed
  images: string[];
}

interface Product {
  id: string ;
  name: string;
  brandId: string;
  brand: Record<string, any>;
  description: string;
  files: any[]; // Adjust type based on file structure (e.g., File[])
  category:  Record<string, any>;
  subcategory:  Record<string, any>;
  categoryId:  string;
  subcategoryId:  string;
  variants: Variant[];
}



const oldPaymentType = ref<string>('');


// Product create/update now go through raw-SQL endpoints (/api/products/create,
// /api/products/update). settledMap is toggled manually at the call sites
// (handleAdd / handleEdit) — no optimistic query-cache machinery needed.


// Raw-SQL: purchase order (edit flow) read — replaces useFindUniquePurchaseOrder
const editPurchaseOrder = ref<any>(null)
const refetchEditPurchaseOrder = async () => {
  if (!isEditingPurchaseOrder.value || !editPurchaseOrderId.value) {
    editPurchaseOrder.value = null
    return { data: null }
  }
  try {
    editPurchaseOrder.value = await $fetch(`/api/purchaseorder/${editPurchaseOrderId.value}`)
  } catch (e) {
    console.error('Failed to load purchase order', e)
    editPurchaseOrder.value = null
  }
  return { data: editPurchaseOrder.value }
}
watch(isEditingPurchaseOrder, (v) => { if (v) refetchEditPurchaseOrder() }, { immediate: true })
const awsService = new AwsService();
const selectedProduct: Ref<Product> = ref({
  id: uuidv4(), 
  name: '',
  brandId: '',
  brand:{},
  description: '',
  files: [], 
  category: {}, 
  subcategory: {}, 
  categoryId: '', 
  subcategoryId: '', 
  variants: [{
    id:'',
    key:'',
    name: '',
    code: '',
    unit: 'Nos',
    qty: 0,
    sprice: 0,
    pprice: 0,
    dprice: 0,
    discount: 0,
    items: [{ id: uuidv4(), size: null, qty: undefined }],
    images: []
  }]
});


const clearInputs = ref(true)
const createRef = ref<any>(null);
const variantRef = ref<any>([]);
const mediaRefs = ref<any>([]);
const idCounter = ref(1);
const isLoad = ref(false)
const isSave = ref(false)
const isPrint = ref(false)


const isOpen = ref(false)
const isOpenAdd = ref(false)

const linkList = ['Create', 'Media', 'Live'];

const name = ref('');
const brand = ref('');
const description = ref('');
// Linked product-dimension ShippingBox (products.dimension_id).
const productDimensionId = ref<string | null>(null);
const live = ref<boolean>();
let files = reactive<ImageData[]>([]);
const category = ref<any>({});
const subcategory = ref('');
const collection = ref('');

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');
const totalAmount = ref(0);
const subTotalAmount = ref(0);
const discount = ref(0);
const tax = ref(0);
const adjustment = ref(0);
const billNo = ref('');

const variants = ref<{ 
    id:string;
    key:String;
    name: string; 
    code: string; 
    unit?: string;
    qty: number; 
    sprice: number; 
    pprice: number; 
    dprice: number; 
    discount: number; 
    items: { id: string; size: string | null; qty: number | undefined }[];
    images: ImageData[];
}[]>([{ 
    id: uuidv4(),
    key:String(idCounter.value++),
    name: '', 
    code: '', 
    unit: 'Nos',
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    dprice: 0, 
    discount: 0, 
    items: [{ id: uuidv4(), size: null, qty: undefined }], 
    images: [] 
}]);

const isApplyingDraft = ref(false);

const stripDraftImages = (variantList: any[]) =>
  (variantList || []).map((variant) => ({
    ...variant,
    images: [],
    items: Array.isArray(variant.items) && variant.items.length
      ? variant.items
      : [{ id: uuidv4(), size: null, qty: undefined }],
  }));

const applyDraftToForm = () => {
  isApplyingDraft.value = true;
  const savedForm = draft.form.value || {};

  name.value = savedForm.name || '';
  brand.value = savedForm.brandId || '';
  description.value = savedForm.description || '';
  category.value = savedForm.category || {};
  subcategory.value = savedForm.subcategoryId || '';
  collection.value = savedForm.collectionId || '';
  live.value = savedForm.live ?? true;
  deliveryType.value = isDistributorPurchaseOrderFlow.value
    ? 'order'
    : savedForm.deliveryType || deliveryType.value;
  variants.value = stripDraftImages(savedForm.variants || []);

  selectedProduct.value = {
    id: savedForm.editingProductId || uuidv4(),
    name: name.value,
    brandId: brand.value,
    brand: {},
    description: description.value,
    files: [],
    category: category.value,
    subcategory: {},
    categoryId: category.value?.id || '',
    subcategoryId: subcategory.value,
    collectionId: collection.value,
    variants: variants.value,
  };

  const info = draft.purchaseInfo.value || {};
  distributorId.value = info.distributorId || '';
  paymentType.value = info.paymentType || '';
  oldPaymentType.value = info.oldPaymentType || '';
  billNo.value = info.billNo || '';
  deliveryType.value = isDistributorPurchaseOrderFlow.value
    ? 'order'
    : savedForm.deliveryType || deliveryType.value;
  totalAmount.value = info.total || 0;
  discount.value = info.discount || 0;
  tax.value = info.taxPercent || 0;
  adjustment.value = info.adjustment || 0;
  billDate.value = info.billDate || new Date().toISOString().split('T')[0];

  nextTick(() => {
    isApplyingDraft.value = false;
  });
};

watch(() => draft.draftNo.value, applyDraftToForm);

// Block Chrome's defaults for the Ctrl+ shortcuts used on this page so they
// reliably trigger our app actions instead (V=paste, R=reload, S=save-page,
// D=bookmark, Enter=submit-form). Capture phase + window-level so it fires
// before Chrome routes the keydown to its built-in handlers, regardless of
// which element has focus on the page.
const blockChromeShortcutsOnPage = (e: KeyboardEvent) => {
  if (!e.ctrlKey || e.altKey || e.metaKey) return;
  const key = e.key.toLowerCase();
  const isEnter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
  if (key === 'v' || key === 'r' || key === 's' || key === 'd' || isEnter) {
    e.preventDefault();
  }
};

onMounted(() => {
  applyDraftToForm();
  window.addEventListener('keydown', blockChromeShortcutsOnPage, { capture: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', blockChromeShortcutsOnPage, { capture: true });
});

const persistDraftForm = () => {
  // Skip until hydration completes — child components emit empty `update`
  // events during their setup-time `immediate: true` watchers, which would
  // otherwise wipe the saved draft before useProductDraft hydrates from
  // localStorage on mount.
  if (!draft.isReady.value || isApplyingDraft.value) return;
  const nextForm = {
    ...draft.form.value,
    editingProductId: clearInputs.value ? '' : selectedProduct.value?.id,
    name: name.value,
    brandId: brand.value,
    description: description.value,
    category: category.value,
    subcategoryId: subcategory.value,
    collectionId: collection.value,
    live: live.value,
    deliveryType: effectiveDeliveryType.value,
    variants: stripDraftImages(variants.value),
  };
  if (!sameJson(draft.form.value, nextForm)) {
    draft.form.value = nextForm;
  }
};

const categoryTax = ref<any>(null)
watch(() => category.value?.id, async (id) => {
  if (!id) { categoryTax.value = null; return }
  try {
    categoryTax.value = await $fetch('/api/products/category-tax', { query: { id } })
  } catch {
    categoryTax.value = null
  }
}, { immediate: true });


const createValue = (data: any) => {
    name.value = data.name;
    brand.value = data.brand;
    description.value = data.description;
    category.value = data.category;
    subcategory.value = data.subcategory;
    collection.value = data.collection || '';
    productDimensionId.value = data.dimensionId ?? null;
    persistDraftForm();
};

watch(category, (newProduct) => {
  console.log('Selected product updated:', newProduct);
}, { deep: true });

const updateVariant = (index,data: any) => {
  const current = variants.value[index] || {};
  const nextVariant = { ...current, ...data };
  if (sameJson(current, nextVariant)) return;
  variants.value[index] = nextVariant;
  selectedProduct.value = {
    ...selectedProduct.value,
    variants: variants.value,
  };
  console.log('Updated variant:', variants.value[index]);
  persistDraftForm();
};


const liveValue = (data: any) => {
    live.value = data.live;
    persistDraftForm();
};

const fileValue = (data: any) => {
    const current = variants.value[data.index] || {};
    const nextVariant = { ...current, images: [...data.files] };
    if (sameJson(current, nextVariant)) return;
    variants.value[data.index] = nextVariant;
    selectedProduct.value = {
      ...selectedProduct.value,
      variants: variants.value,
    };
    persistDraftForm();
  
};

watch(isOpenAdd, (newVal) => {
  if (!newVal) {
    handleReset()
  }
});

const handleProductSelected = (product:any) => {
  selectedProduct.value = product;
  console.log('Selected product:', selectedProduct.value);
  name.value = product.name || '';
  brand.value = product.brandId || '';
  description.value = product.description || '';
  category.value = product.category || {};
  subcategory.value = product.subcategoryId || '';
  variants.value = stripDraftImages(product.variants || []);
  selectedProduct.value = {
    ...selectedProduct.value,
    variants: variants.value,
  };
  draft.form.value.editingProductId = product.id;
  clearInputs.value = false;
  persistDraftForm();
};

const handleDistributorValue = (data:any) => {
  console.log('Distributor data received:', data);
  distributorId.value = data.distributorId;
  paymentType.value = data.paymentType;
  oldPaymentType.value = data.oldPaymentType;
  billNo.value = data.billNo
  deliveryType.value = isDistributorPurchaseOrderFlow.value
    ? 'order'
    : data.deliveryType
  totalAmount.value = data.total
  discount.value = data.discount
  tax.value = data.taxPercent
  adjustment.value = data.adjustment
  billDate.value = data.billDate
  const nextPurchaseInfo = {
    distributorId: data.distributorId || '',
    billNo: data.billNo || '',
    billDate: data.billDate || new Date().toISOString().split('T')[0],
    paymentType: data.paymentType || '',
    oldPaymentType: data.oldPaymentType || '',
    discount: data.discount || 0,
    taxPercent: data.taxPercent || 0,
    adjustment: data.adjustment || 0,
    subtotal: data.subtotal || 0,
    total: data.total || 0,
  }
  if (!sameJson(draft.purchaseInfo.value, nextPurchaseInfo)) {
    draft.purchaseInfo.value = nextPurchaseInfo
  }

};

const snapshotProductForm = () => ({
  name: name.value || '',
  brand: brand.value,
  description: description.value || '',
  category: category.value ? { ...category.value } : {},
  subcategory: subcategory.value,
  collection: collection.value,
  live: live.value,
    deliveryType: effectiveDeliveryType.value,
  dimensionId: productDimensionId.value ?? null,
  variants: variants.value.map((variant) => ({
    ...variant,
    items: (variant.items || []).map((item) => ({ ...item })),
    images: [...(variant.images || [])],
  })),
});

const makePendingDraftProduct = (productId: string, productSnapshot: any) => ({
  id: productId,
  name: productSnapshot.name || 'Untitled product',
  category: productSnapshot.category || {},
  categoryId: productSnapshot.category?.id || '',
  subcategoryId: productSnapshot.subcategory || '',
  isPending: true,
  variants: productSnapshot.variants.map((variant: any) => ({
    ...variant,
    items: (variant.items || []).map((item: any) => ({
      ...item,
      initialQty: item.initialQty ?? item.qty ?? 0,
    })),
  })),
});

// Build a fully self-contained, localStorage-serializable product object from
// the current form snapshot. Images are stored as { uuid, view } (the files are
// already uploaded to S3) so the staged product survives a refresh. This same
// shape is what /api/products/save-batch consumes on Save.
const buildStagedProduct = (productId: string, snap: any, catTax: any) => ({
  id: productId,
  name: snap.name || '',
  brandId: snap.brand || null,
  description: snap.description || '',
  status: snap.live ?? true,
  categoryId: snap.category?.id || null,
  subcategoryId: snap.subcategory || null,
  collectionId: snap.collection || null,
  deliveryType: isDistributorPurchaseOrderFlow.value
    ? 'order'
    : snap.deliveryType || 'trynbuy',
  categoryTax: catTax,
  dimensionId: snap.dimensionId ?? null,
  // display metadata for the left table + barcode labels
  category: snap.category ? { id: snap.category.id, name: snap.category.name, targetAudience: snap.category.targetAudience } : null,
  variants: (snap.variants || []).map((variant: any) => ({
    id: variant.id || uuidv4(),
    name: variant.name || '',
    code: variant.code || null,
    unit: variant.unit || 'Nos',
    sprice: variant.sprice || 0,
    pprice: variant.pprice || 0,
    dprice: variant.dprice || 0,
    discount: variant.discount || 0,
    images: variantInputs?.value?.images ? (variant.images || []).map((f: any) => ({ uuid: f.uuid, view: f.view })) : [],
    items: (variant.items || []).map((size: any) => ({
      id: size.id || uuidv4(), size: size.size || null, qty: size.qty || 0, dimensionId: size.dimensionId ?? null,
    })),
  })),
})

const handleAdd = async (e: Event) => {
  isLoad.value = true
  e.preventDefault();
  try {
    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.add({ title: 'No internet connection', color: 'red' });
      throw new Error('No internet connection')
    }
    if (!category.value || !category.value.id?.trim()) {
      toast.add({ title: 'Please fill product category', color: 'red' });
      return;
    }
    for (const v of variants.value) {
      if (v.dprice > v.sprice) {
        toast.add({ title: `In variant : Discount price cannot be greater than selling price`, color: 'red' });
        return;
      }
    }

    const productId = uuidv4();
    const productSnapshot = snapshotProductForm();
    const snapshotCategoryTax = categoryTax.value ? { ...categoryTax.value } : null;

    // Upload images to S3 now — File objects can't live in localStorage, but the
    // resulting uuids can. The DB write itself is deferred to Save.
    const base64files = await Promise.all(
      productSnapshot.variants.flatMap((variant) =>
        (variant.images || [])
          .filter((file) => file.file instanceof File)
          .map(async (file) => {
            const base64 = await prepareFileForApi(file.file);
            return { base64, uuid: file.uuid, view: file.view };
          })
      )
    );
    if (base64files.length > 0) {
      await Promise.all(
        base64files.map((file) =>
          awsService.uploadBase64File(file.base64, file.uuid, file.view, productSnapshot.category?.name, productSnapshot.category?.targetAudience, useAuth().session.value?.isAiImage)
        )
      );
    }

    // Stage locally (no DB write). Persisted to localStorage via the draft watcher.
    draft.stagedProducts.value = [
      ...draft.stagedProducts.value,
      buildStagedProduct(productId, productSnapshot, snapshotCategoryTax),
    ];

    handleReset();
    isOpenAdd.value = false;
    toast.add({ title: 'Product Added!', id: 'modal-success' });
  } catch (err: any) {
    console.log(err?.info?.message ?? err);
    toast.add({ title: 'Failed to add product', color: 'red' });
  } finally {
    isLoad.value = false
  }
};



const handleEdit = async (e: Event) => {
  e.preventDefault();
  isLoad.value = true
  try {
    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.add({ title: 'No internet connection', color: 'red' });
      throw new Error('No internet connection')
    }
    if (!category.value || category.value.id.trim() === '') {
      toast.add({ title: 'Please fill product category', color: 'red' });
      return;
    }
    for (const v of variants.value) {
      if (v.dprice > v.sprice) {
        toast.add({ title: `In variant : Discount price cannot be greater than selling price`, color: 'red' });
        return;
      }
    }

    const productId = selectedProduct.value.id;
    const snap = snapshotProductForm();
    const snapshotCategoryTax = categoryTax.value ? { ...categoryTax.value } : null;

    // Upload any newly attached images to S3 (uuids persist in the staged product).
    const base64files = await Promise.all(
      snap.variants.flatMap((variant) =>
        (variant.images || [])
          .filter((file) => file.file instanceof File)
          .map(async (file) => {
            const base64 = await prepareFileForApi(file.file);
            return { base64, uuid: file.uuid, view: file.view };
          })
      )
    );
    if (base64files.length > 0) {
      await Promise.all(
        base64files.map((file) =>
          awsService.uploadBase64File(file.base64, file.uuid, file.view, snap.category?.name, snap.category?.targetAudience, useAuth().session.value?.isAiImage)
        )
      );
    }

    // Replace the staged product in place — still no DB write.
    const updated = buildStagedProduct(productId, snap, snapshotCategoryTax);
    draft.stagedProducts.value = draft.stagedProducts.value.map((p: any) => (p.id === productId ? updated : p));

    handleReset();
    toast.add({ title: 'Product Edited!', id: 'modal-success' });
  } catch (err: any) {
    console.log(err)
    toast.add({ title: `Something went wrong!`, color: 'red' });
  }
  finally{
    isLoad.value = false
    isOpenAdd.value = false
  }
};


const addVariant = () => {
  const newVariants = [...selectedProduct.value.variants];
  // Copy every field (qty/prices/unit/code/items/images) from the most recent
  // variant so the user doesn't have to re-type the same values. Only the
  // name is left blank — that's the one field that must be unique per variant.
  // Variant id and per-item ids are regenerated to avoid DB collisions.
  const last = newVariants[newVariants.length - 1];
  const copiedItems = (last?.items?.length)
    ? last.items.map((item: any) => ({ ...item, id: uuidv4() }))
    : [{ id: uuidv4(), size: null, qty: undefined }];

  newVariants.push({
    id: uuidv4(),
    key: String(idCounter.value++),
    name: '',
    code: last?.code ?? '',
    unit: last?.unit ?? 'Nos',
    qty: last?.qty ?? 0,
    sprice: last?.sprice ?? 0,
    pprice: last?.pprice ?? 0,
    dprice: last?.dprice ?? 0,
    discount: last?.discount ?? 0,
    items: copiedItems,
    images: [...(last?.images ?? [])],
  });

  selectedProduct.value = {
    ...selectedProduct.value,
    variants: newVariants,
  };
  variants.value = newVariants;
  persistDraftForm();
};


const removeVariant = (index: number) => {

    // If a product is selected, modify its variants array
    const newVariants = [...selectedProduct.value.variants]; // Create a shallow copy
    newVariants.splice(index, 1); // Remove the variant at the specified index

    // Update the selectedProduct with the new variants array
    selectedProduct.value = {
      ...selectedProduct.value,
      variants: newVariants,
    };

    variants.value.splice(index, 1);
    persistDraftForm();


};

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard shortcuts + arrow navigation for the right-side form pane.
// All Ctrl+ shortcuts call preventDefault + stopPropagation to override
// Chrome's defaults (V=paste, R=reload, S=save-page, D=bookmark).
// Bindings:
//   Ctrl+V      — add a new variant, focus its Name input
//   Ctrl+R      — remove the variant containing the currently focused input
//                 (blocked when only one variant remains), focus the next variant
//   Ctrl+S      — add a size row to the focused variant, focus the new row's size input
//   Ctrl+D      — delete the focused size row, focus the previous size (or variant name)
//   Ctrl+Enter  — trigger Add Product / Edit Product save
//   ↑ / ↓       — move focus to the closest input above / below (always)
//   ← / →       — move focus when caret is at the left / right edge of the input
// ─────────────────────────────────────────────────────────────────────────────
const formPaneRef = ref<HTMLElement | null>(null);
// Wrapper div around the currently-open USelectMenu — used by ArrowLeft/Right
// to close it (mirrors pages/erp/billing.vue:movecatgeory).
const presentSelectRef = ref<HTMLElement | null>(null);

const resolveSelectWrapper = (el: HTMLElement | null): HTMLElement | null => {
  if (!el) return null;
  const candidates: HTMLElement[] = [
    ...(createRef.value?.getAllSelectWrappers?.() ?? []),
    ...((variantRef.value ?? [])
      .map((v: any) => v?.getSelectWrapper?.())
      .filter((w: any): w is HTMLElement => !!w)),
  ];
  return candidates.find(w => w === el || w.contains(el)) ?? null;
};

const findVariantIndexFromEl = (el: HTMLElement | null): number | null => {
  const root = el?.closest?.('[data-variant-index]') as HTMLElement | null;
  if (!root) return null;
  const idx = Number(root.getAttribute('data-variant-index'));
  return Number.isFinite(idx) ? idx : null;
};

const findSizeIndexFromEl = (el: HTMLElement | null): number | null => {
  const row = el?.closest?.('[data-size-index]') as HTMLElement | null;
  if (!row) return null;
  const idx = Number(row.getAttribute('data-size-index'));
  return Number.isFinite(idx) ? idx : null;
};

const focusVariantFirst = (index: number) => {
  nextTick(() => nextTick(() => {
    const refInstance = variantRef.value?.[index];
    refInstance?.focusFirst?.();
  }));
};

const triggerSave = (e: Event) => {
  if (isLoad.value) return;
  if (clearInputs.value) handleAdd(e);
  else handleEdit(e);
};

// Text-like input types where the caret position is meaningful. `number` is
// included so left/right navigate through digits first, but its
// `selectionStart` is `null` per spec — fall back to value-length heuristic:
// empty value → at-edge (lets the user escape), non-empty → not-at-edge (let
// the native caret move; user can Tab/Shift+Tab to leave).
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'password', 'email', 'number']);
const isCaretAtLeftEdge = (el: HTMLInputElement): boolean => {
  if (!TEXT_INPUT_TYPES.has(el.type)) return true;
  if (el.selectionStart === null) return (el.value ?? '').length === 0;
  return el.selectionStart === 0 && el.selectionEnd === 0;
};
const isCaretAtRightEdge = (el: HTMLInputElement): boolean => {
  if (!TEXT_INPUT_TYPES.has(el.type)) return true;
  if (el.selectionStart === null) return (el.value ?? '').length === 0;
  const len = (el.value ?? '').length;
  return el.selectionStart === len && el.selectionEnd === len;
};

const findFocusableNeighbor = (
  current: HTMLElement,
  direction: 'up' | 'down' | 'left' | 'right'
): HTMLElement | null => {
  const container = formPaneRef.value;
  if (!container) return null;
  const all = Array.from(
    container.querySelectorAll('input, textarea, button')
  ) as HTMLElement[];
  const visible = all.filter(el => {
    if (el === current) return false;
    if ((el as HTMLInputElement).disabled) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  });

  const cr = current.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;

  let best: { el: HTMLElement; score: number } | null = null;
  for (const el of visible) {
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

const focusElement = (el: HTMLElement | null) => {
  if (!el) return;
  el.focus();
  if (el.tagName === 'INPUT') {
    const input = el as HTMLInputElement;
    if (TEXT_INPUT_TYPES.has(input.type)) input.select?.();
  }
};

// Tab/Shift+Tab fallback — when there's no in-row neighbor on left/right,
// jump to the previous/next focusable element in DOM order. This wraps to the
// last field of the row above (or first field of the row below) the way users
// expect from a typical form.
const findDocOrderNeighbor = (
  current: HTMLElement,
  direction: 'prev' | 'next'
): HTMLElement | null => {
  const container = formPaneRef.value;
  if (!container) return null;
  const all = Array.from(
    container.querySelectorAll('input, textarea, button')
  ) as HTMLElement[];
  const visible = all.filter(el => {
    if ((el as HTMLInputElement).disabled) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return true;
  });
  const idx = visible.indexOf(current);
  if (idx === -1) return null;
  return visible[direction === 'prev' ? idx - 1 : idx + 1] ?? null;
};

const onFormKeydown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName;
  const isInput = tag === 'INPUT';
  const isTextarea = tag === 'TEXTAREA';

  // Ctrl+ shortcuts. preventDefault + stopPropagation on every branch so
  // Chrome's defaults (V=paste, R=reload, S=save-page, D=bookmark,
  // Enter=submit-form) are fully suppressed on this page.
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    const key = e.key.toLowerCase();
    const isEnterKey = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (isEnterKey) {
      e.preventDefault();
      e.stopPropagation();
      triggerSave(e);
      return;
    }
    if (key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      addVariant();
      const newIndex = variants.value.length - 1;
      focusVariantFirst(newIndex);
      return;
    }
    if (key === 'r') {
      e.preventDefault();
      e.stopPropagation();
      const vIdx = findVariantIndexFromEl(target);
      if (vIdx == null) return;
      if (variants.value.length <= 1) {
        toast.add({ title: 'At least one variant is required', color: 'orange' });
        return;
      }
      removeVariant(vIdx);
      const nextIdx = Math.min(vIdx, variants.value.length - 1);
      focusVariantFirst(nextIdx);
      return;
    }
    if (key === 's') {
      e.preventDefault();
      e.stopPropagation();
      const vIdx = findVariantIndexFromEl(target);
      if (vIdx == null) return;
      const vRef = variantRef.value?.[vIdx];
      vRef?.addItem?.();
      nextTick(() => vRef?.focusLastSize?.());
      return;
    }
    if (key === 'd') {
      e.preventDefault();
      e.stopPropagation();
      const vIdx = findVariantIndexFromEl(target);
      const sIdx = findSizeIndexFromEl(target);
      if (vIdx == null || sIdx == null) return;
      const vRef = variantRef.value?.[vIdx];
      vRef?.removeItem?.(sIdx);
      nextTick(() => {
        const itemsArr = (vRef?.items?.value ?? vRef?.items) as any[] | undefined;
        const newLen = itemsArr?.length ?? 0;
        // removeItem keeps one row but nulls its size — template hides size
        // rows when items[0].size === null, so treat that as "all gone".
        const sizesGone = newLen === 0 || (newLen === 1 && itemsArr?.[0]?.size === null);
        if (!sizesGone) {
          const focusIdx = Math.min(sIdx, newLen - 1);
          vRef?.focusSizeAt?.(focusIdx, 'size');
        } else {
          vRef?.focusFirst?.();
        }
      });
      return;
    }
  }

  // Arrow navigation (no Alt/Ctrl/Meta)
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

  // Textarea — only escape via arrows when cursor is at the matching edge:
  //   Up    → only when caret is on the first line
  //   Down  → only when caret is on the last line
  //   Left  → only when caret is at position 0
  //   Right → only when caret is at end of text
  // Otherwise let native cursor movement happen.
  if (isTextarea) {
    const ta = target as HTMLTextAreaElement;
    const value = ta.value ?? '';
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (e.key === 'ArrowUp') {
      if (value.substring(0, start).includes('\n')) return;
    } else if (e.key === 'ArrowDown') {
      if (value.substring(end).includes('\n')) return;
    } else if (e.key === 'ArrowLeft') {
      if (start !== 0 || end !== 0) return;
    } else if (e.key === 'ArrowRight') {
      if (start !== value.length || end !== value.length) return;
    }
  }

  // ── USelectMenu interop ────────────────────────────────────────────────
  // Trigger button uses aria-haspopup="listbox" + aria-expanded. When the
  // menu is searchable, focus lands on a search input inside the [role=
  // "listbox"] panel while the menu is open.
  //   • Up / Down on the trigger OR inside the open panel → let Headless UI
  //     handle (open menu / move option highlight).
  //   • Left / Right on a closed trigger → navigate fields as usual.
  //   • Left / Right on an OPEN trigger / inside the panel → close the menu
  //     and keep focus on the trigger (do NOT navigate). User can arrow
  //     again from the closed trigger to move on.
  const isSelectTrigger =
    target.tagName === 'BUTTON' &&
    (target.getAttribute('aria-haspopup') === 'listbox' ||
      target.getAttribute('role') === 'combobox');
  const isSelectOpen = isSelectTrigger && target.getAttribute('aria-expanded') === 'true';
  const isInsideListbox = !!target.closest('[role="listbox"]');

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (isSelectTrigger || isInsideListbox) {
      if (isSelectTrigger) presentSelectRef.value = resolveSelectWrapper(target);
      return; // native handles option nav
    }
    const next = findFocusableNeighbor(target, e.key === 'ArrowUp' ? 'up' : 'down');
    if (next) {
      e.preventDefault();
      focusElement(next);
    }
    return;
  }

  // Left/Right
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const dir = e.key === 'ArrowLeft' ? 'left' : 'right';

    // Caret edge check for plain inputs (already handled for textarea above)
    if (isInput) {
      const input = target as HTMLInputElement;
      const atEdge = dir === 'left' ? isCaretAtLeftEdge(input) : isCaretAtRightEdge(input);
      if (!atEdge) return;
    }

    // Open USelectMenu → close via the saved wrapper, keep focus on the
    // trigger button (no neighbor nav). Mirrors pages/erp/billing.vue.
    if (isSelectOpen || isInsideListbox) {
      e.preventDefault();
      const wrapper = presentSelectRef.value ?? resolveSelectWrapper(target);
      const button = wrapper?.querySelector('button') as HTMLElement | null;
      if (!button) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
        return;
      }
      button.focus();
      button.click();
      nextTick(() => {
        button.focus();
        presentSelectRef.value = null;
      });
      return;
    }

    // First try in-row neighbor; fall back to Shift+Tab / Tab order so the
    // leftmost field jumps to the last field of the row above, and the
    // rightmost field jumps to the first field of the row below.
    const next =
      findFocusableNeighbor(target, dir) ??
      findDocOrderNeighbor(target, dir === 'left' ? 'prev' : 'next');
    if (next) {
      e.preventDefault();
      focusElement(next);
    }
  }
};

watch(variants, (newVariants) => {
  // Handle variant changes
  console.log("Variants updated:", newVariants);
},{immediate: true, deep: true}); 

// Deferred model: nothing is written to the DB until Save, so the left table
// renders the in-memory/localStorage staged products directly — no fetch, no
// placeholder swap, no flicker. In PO-edit mode it also shows the existing PO's
// products (already persisted) above any newly staged ones.
const isLoading = ref(false)
const tableProducts = computed(() =>
  isEditingPurchaseOrder.value
    ? [...(editPurchaseOrder.value?.products || []), ...draft.stagedProducts.value]
    : draft.stagedProducts.value
)


const addProductTopBarRef = ref<any>(null)


const resetTopBar = () => {
  console.log('🧹 Resetting AddProductTopBar from parent')
  addProductTopBarRef.value?.reset()
}

const printBarcodes = async() => {
  isPrint.value = true
  try{
    const response = await printLabel(barcodes.value,useAuth().session.value?.printerLabelSize);
    toast.add({
        title: 'Printing success!',
        color: 'green',
      });
      
  }catch(err){
    console.log(err)
    toast.add({
        title: 'Printing failed!',
        description: err.message,
        color: 'red',
      });
  }finally{
    isPrint.value = false
  }
}

const isCreatePOConfirmOpen = ref(false)
const isSavingWithPOIntent = ref(false)

const generateBarcodes = (products: any[]) => {
  barcodes.value = (products || []).flatMap(product =>
    product.variants.flatMap(variant =>
      variant.items.flatMap(item =>
        item.qty === 0
          ? []
          : Array.from({ length: item.qty ?? 1 }, () => ({
              barcode: item.barcode ?? '',
              code: variant.code ?? '',
              shopname: useAuth().session.value?.companyName,
              productName: product.name || product.category?.name || '',
              brand: product.brand?.name || product.subcategory?.name || '',
              name: variant.name || '',
              variantName: variant.name || '',
              sprice: variant.sprice,
              ...(variant.sprice !== variant.dprice && {
                dprice: variant.dprice
              }),
              size: item.size
            }))
      )
    )
  )
}

const handleSave = () => {
  const hasProducts = draft.stagedProducts.value.length > 0
    || (isEditingPurchaseOrder.value && !!editPurchaseOrder.value?.products?.length)

  if (!hasProducts) {
    toast.add({ title: 'Add at least one product before saving.', color: 'red' })
    return
  }

  if (isEditingPurchaseOrder.value) {
    handleSaveEditedPurchaseOrder()
    return
  }

  if (isDistributorPurchaseOrderFlow.value) {
    openPurchaseInfoForSave()
    return
  }

  isCreatePOConfirmOpen.value = true
}

const handleSaveEditedPurchaseOrder = async () => {
  isSave.value = true
  try {
    // PO-edit: batch-create any newly staged products into the existing PO, then
    // refresh + print. Staged products are cleared only after the batch succeeds.
    if (draft.stagedProducts.value.length) {
      await $fetch('/api/products/save-batch', {
        method: 'POST',
        body: { products: draft.stagedProducts.value, poId: editPurchaseOrderId.value },
      })
      draft.stagedProducts.value = []
    }
    const result = await refetchEditPurchaseOrder()
    generateBarcodes(result.data?.products || editPurchaseOrder.value?.products || [])
    isOpen.value = true
  } catch (error) {
    console.error('Failed to save products / prepare labels', error)
    toast.add({ title: 'Failed to save products', color: 'red' })
  } finally {
    isSave.value = false
  }
}

const handleSaveNoPO = async () => {
  isSave.value = true
  try {
    // Batch-create all staged products in ONE transaction (no PO).
    const res: any = await $fetch('/api/products/save-batch', {
      method: 'POST',
      body: { products: draft.stagedProducts.value },
    })
    generateBarcodes(res?.products || [])
    clearCurrentDraftForNextProducts()   // reset staged ONLY after success
    isOpen.value = true
  } catch (error) {
    console.error('Failed to save products', error)
    toast.add({ title: 'Failed to save products', color: 'red' })
    // keep staged products as-is so the user can retry
  } finally {
    isSave.value = false
    isCreatePOConfirmOpen.value = false
  }
}

const openPurchaseInfoForSave = () => {
  isCreatePOConfirmOpen.value = false
  isSavingWithPOIntent.value = true
  addProductTopBarRef.value?.openPurchaseInfo()
}

const onPurchaseInfoSubmitted = async () => {
  if (isEditingPurchaseOrder.value) {
    await saveEditedPurchaseInfo()
    return
  }

  if (!isSavingWithPOIntent.value) return
  await handleSaveWithPO()
}

const saveEditedPurchaseInfo = async () => {
  isSave.value = true

  try {
    const activePoId = editPurchaseOrderId.value
    const createdAtDate = billDate.value
      ? new Date(billDate.value)
      : new Date()

    // One atomic endpoint: replays the credit/payment transition matrix
    // (keyed by purchase_order_id) + updates the PO row.
    await $fetch('/api/purchaseorder/update', {
      method: 'POST',
      body: {
        poId: activePoId,
        payment: {
          paymentType: paymentType.value || null,
          oldPaymentType: oldPaymentType.value || null,
          billNo: billNo.value || null,
          distributorId: distributorId.value || null,
          totalAmount: totalAmount.value,
          subTotalAmount: subTotalAmount.value,
          discount: discount.value || 0,
          tax: tax.value || 0,
          adjustment: adjustment.value || 0,
          createdAt: createdAtDate,
        },
      },
    })

    oldPaymentType.value = paymentType.value
    addProductTopBarRef.value?.syncPaymentState?.()
    await refetchEditPurchaseOrder()
    toast.add({ title: 'Purchase info updated', color: 'green' })
  } catch (error: any) {
    console.error('Failed to update purchase info', error)
    toast.add({
      title: 'Failed to update purchase info',
      description: error?.message,
      color: 'red'
    })
  } finally {
    isSave.value = false
    isSavingWithPOIntent.value = false
  }
}

const handleSaveWithPO = async () => {
  isSave.value = true

  try {
    const createdAtDate = billDate.value
      ? new Date(billDate.value)
      : new Date()

    // Create flow: ONE atomic transaction creates all staged products, the PO
    // (number = counter-1), links them, and creates the PO-linked credit/payment.
    const res: any = await $fetch('/api/products/save-batch', {
      method: 'POST',
      body: {
        products: draft.stagedProducts.value,
        po: {
          paymentType: paymentType.value || null,
          billNo: billNo.value || null,
          distributorId: distributorId.value || null,
          totalAmount: totalAmount.value,
          subTotalAmount: subTotalAmount.value,
          discount: discount.value || 0,
          tax: tax.value || 0,
          adjustment: adjustment.value || 0,
          createdAt: createdAtDate,
        },
      },
    })

    if (!res?.poId) throw new Error('Purchase order was not created')
    generateBarcodes(res.products || [])
    clearCurrentDraftForNextProducts()   // reset staged + PO info ONLY after success
    isOpen.value = true
  } catch (error) {
    console.error('Failed to save purchase order', error)
    toast.add({ title: 'Failed to save purchase order', color: 'red' })
    // keep staged products + purchase info as-is so the user can retry
  } finally {
    isSave.value = false
    isSavingWithPOIntent.value = false
  }
}

const clearCurrentDraftForNextProducts = () => {
  draft.resetDraft()
  pendingDraftProducts.value = []
  settledMap.value = new Map()
  distributorId.value = ''
  paymentType.value = ''
  oldPaymentType.value = ''
  billNo.value = ''
  totalAmount.value = 0
  subTotalAmount.value = 0
  discount.value = 0
  tax.value = 0
  adjustment.value = 0
  billDate.value = new Date().toISOString().split('T')[0]
  resetTopBar()
  handleReset()
}


const handleReset = () => {

  clearInputs.value = true
  createRef.value?.resetForm()
  variantRef.value.forEach((refInstance:any) => {
    refInstance?.resetForm();
  });
  mediaRefs.value.forEach((media:any) => media?.resetForm());
  variants.value = [{
    id: uuidv4(),
    key: String(idCounter.value++),
    name: '', 
    code: '', 
    unit: 'Nos',
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    dprice: 0, 
    discount: 0, 
    items: [{ id: uuidv4(), size: null, qty: undefined }], 
    images: []
  }];
  selectedProduct.value = {
    id:'',
    name: '',
    brandId:'',
    brand:{},
    description: '',
    files: [], // Reset reactive array
    category: {},
    subcategory: {},
    categoryId: '',
    subcategoryId: '',
    variants: [{
        id: uuidv4(),
        key: String(idCounter.value++),
        name: '', 
        code: '', 
        unit: 'Nos',
        qty: 0, 
        sprice: 0, 
        pprice: 0, 
        dprice: 0, 
        discount: 0, 
        items: [{ id: uuidv4(), size: null, qty: undefined }], 
        images: [] 
    }]
}
  persistDraftForm()
}


const handleSkip = () => {
     isAdd.value =true
    draft.deleteDraft(draft.draftNo.value)
    router.push(returnTo.value)
    resetTopBar()
    isAdd.value =false
    isOpen.value = false
}


const handleAddNew = async() => {
     isAdd.value =true
    clearCurrentDraftForNextProducts()
    isAdd.value =false
    isOpen.value = false
}

const handleNewProduct = () => {
  isOpenAdd.value = true
}

const onDeleteDraft = (no: string) => {
  if (!no) return
  if (!confirm(`Delete Draft ${no}?`)) return
  draft.deleteDraft(no)
}





</script>

<template>
    <UDashboardPanelContent>
          <AddProductTopBar
            ref="addProductTopBarRef"
            @update="handleDistributorValue"
            @submit="onPurchaseInfoSubmitted"
            :totalAmount="subTotalAmount"
            :distributorId="isEditingPurchaseOrder ? editPurchaseOrder?.distributorId : draftPurchaseInfo.distributorId"
            :paymentType="isEditingPurchaseOrder ? editPurchaseOrder?.paymentType : draftPurchaseInfo.paymentType"
            :billNo="isEditingPurchaseOrder ? editPurchaseOrder?.billNo : draftPurchaseInfo.billNo"
            :discount="isEditingPurchaseOrder ? editPurchaseOrder?.discount : draftPurchaseInfo.discount"
            :tax="isEditingPurchaseOrder ? editPurchaseOrder?.tax : draftPurchaseInfo.taxPercent"
            :adjustment="isEditingPurchaseOrder ? editPurchaseOrder?.adjustment : draftPurchaseInfo.adjustment"
            :billDate="isEditingPurchaseOrder ? editPurchaseOrder?.createdAt : draftPurchaseInfo.billDate"
            :purchase-order-no="isEditingPurchaseOrder ? editPurchaseOrder?.purchaseOrderNo : null"
            :show-purchase-info-button="isEditingPurchaseOrder"
            :force-order-delivery-type="isDistributorPurchaseOrderFlow"
            :submit-loading="isSave"
          >
            <template v-if="!isEditingPurchaseOrder" #draft>
              <div class="flex items-center gap-2">

                <USelectMenu
                  v-model="selectedDraft"
                  :options="draftProducts"
                  option-attribute="draftNo"
                >
                  <template #label>
                    <span>Draft {{ currentDraftNo }}</span>
                  </template>
                  <template #option="{ option }">
                    <div class="flex items-center justify-between gap-2 w-full">
                      <span>Draft {{ option.draftNo }}</span>
                      <UButton
                        icon="i-heroicons-trash"
                        size="2xs"
                        color="red"
                        variant="ghost"
                        square
                        @click.stop.prevent="onDeleteDraft(option.draftNo)"
                      />
                    </div>
                  </template>
                </USelectMenu>
                <UButton
                  icon="i-heroicons-plus"
                  :disabled="draftProducts.length >= draft.MAX_DRAFTS"
                  @click="draft.createNewDraft"
                />
              </div>
            </template>
          </AddProductTopBar>

          <UDivider class="py-4"/>

        <div class="md:flex md:flex-row">
            <div class="md:w-1/2">
              <div  class="m-3">
                    <UButton
                        @click="handleSave"
                        color="green"
                        :loading="isLoad && isSave"
                        :disabled="isSaveDisable"
                    >
                        Save Order
                    </UButton>
                </div>

              <UPageCard class="m-3">
                <AddProductTable
                  @product-selected="handleProductSelected"
                  @clicked="isOpenAdd = true"
                  @total-amount="(data) => subTotalAmount = data"
                  @product-deleted="onDraftProductDeleted"
                  :settledMap="settledMap"
                  :poId="editPurchaseOrderId"
                  :productIds="tableProductIds"
                  :pendingProducts="pendingDraftProducts"
                  :products="tableProducts"
                  :loading="isLoading"
                />
              </UPageCard>

              <div class="m-3">
                    <UButton
                        @click="handleSave"
                        :loading="isLoad && isSave"
                        color="green"
                        :disabled="isSaveDisable"
                    >
                        Save Order
                    </UButton>
                </div>
            </div>
            

            <div ref="formPaneRef" class=" md:flex md:flex-col md:w-1/2" @keydown.capture="onFormKeydown">
              <div class="flex flex-row">
              <div>
              <div v-if="clearInputs" class="mx-3 mt-3">
                    <UButton
                        @click="handleAdd"
                        :loading="isLoad"
                    >
                        Add Product
                    </UButton>
                </div>
                <div v-else class="mx-1 mt-3">
                    <UButton
                        @click="handleEdit"
                       :loading="isLoad"
                    >
                        Edit Product
                    </UButton>
                </div>
              </div>
                <div class="mx-1 mt-3">
                    <UButton
                        @click="handleReset"
                        color="red"
                    >
                       Reset form
                    </UButton>
                </div>
              </div>
                <UPageCard class="m-3" id="Create">
                    <AddProductCreate 
                        ref="createRef"
                        :editName="selectedProduct?.name"
                        :editBrand="selectedProduct?.brandId"
                        :editDescription="selectedProduct?.description"
                        :editCategory="selectedProduct?.categoryId"
                        :editSubcategory="selectedProduct?.subcategoryId"
                        :editCollection="selectedProduct?.collectionId"
                        :editDimensionId="selectedProduct?.dimensionId"
                        @update="createValue" />
                </UPageCard>

                <!-- <UPageCard class="m-3" id="Variants">
                    <AddProductVariants @update="variantValue" />
                </UPageCard> -->

               
                  <div v-for="(variant, index) in variants" :key="variant.key" :data-variant-index="index" class="mb-3">
                    <UPageCard class="m-3" id="Variants">
                    <div class="flex justify-between items-centerp-3 rounded-lg">
                      <div class="text-xl mb-4">Variant {{index+1}}</div>
                     
                      <UButton
                       v-if="variantInputs?.button"
                        @click="removeVariant(index)"
                        variant="outline"
                        color="red"
                      >Remove
                      </UButton>
                    </div>
                    <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
                    <AddProductVariants   
                      ref="variantRef"
                      :id="variant.id"
                      :editName="variant.name" 
                      :editCode="variant.code"
                      :editQty="variant.qty"
                      :editUnit="variant.unit"
                      :editsPrice="variant.sprice"
                      :editpPrice="variant.pprice"
                      :editdPrice="variant.dprice"
                      :editDiscount="variant.discount"
                      :editItems="variant.items"

                      @update="updateVariant(index,$event)" />
                      <AddProductMedia
                      v-if="variantInputs?.images"
                      ref="mediaRefs"
                      :editFile="variant.images"
                      :index="index" 
                      :categoryName="category.name"
                      :targetAudience="category.targetAudience"
                      :productId="selectedProduct?.id"
                      :updatedAt= "selectedProduct?.updatedAt"
                      @update="fileValue"
                    />
                  </UPageCard>
                  </div>

                <UButton
                    v-if="variantInputs?.button"
                    @click="addVariant"
                    color="green"
                    block
                  >
                    + Add Variant
                  </UButton>


                <!-- <UPageCard class="m-3" id="Live">
                    <AddProductLive @update="liveValue" />
                </UPageCard> -->

                <div v-if="clearInputs" class="m-3">
                    <UButton
                        @click="handleAdd"
                           :loading="isLoad"
                    >
                        Add Product
                    </UButton>
                </div>
                <div v-else class="m-3">
                    <UButton
                        @click="handleEdit"
                          :loading="isLoad"
                    >
                        Edit Product
                    </UButton>
                </div>
            </div>
        </div>

        <UModal v-model="isOpen" fullscreen>
        <UCard :ui="{
            base: 'h-full flex flex-col overflow-y-auto',
            rounded: '',
            divide: 'divide-y divide-gray-100 dark:divide-gray-800',
            body: {
              base: 'grow'
            }
          }">
    
        <BarcodeComponent :barcodes="barcodes" />

      
          <template #header>
          <div class="flex items-end justify-between">
          <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpen = false" />
          <div class="flex items-end justify-end">
          <UButton type="submit"  class="me-3 px-5" @click="printBarcodes" :disabled="!barcodes.length" :loading="isPrint">
                Print
                </UButton>
                 <UButton color="green" type="submit"  class="me-3 px-5" @click="handleAddNew" :loading=isAdd>
                  Add New
                </UButton>
                <UButton color="red" type="submit"  class="me-3 px-5" @click="handleSkip" :loading=isAdd>
                  Skip
                </UButton>
            </div>
              </div>
        </template>
        <template #footer>
          <div class="flex items-end justify-end">
             <UButton type="submit"  class="me-3 px-5" @click="printBarcodes" :disabled="!barcodes.length" :loading="isPrint">
                Print
                </UButton>
                 <UButton color="green" type="submit"  class="me-3 px-5" @click="handleAddNew" :loading=isAdd>
                  Add New
                </UButton>
                <UButton color="red" type="submit"  class="me-3 px-5" @click="handleSkip" :loading=isAdd>
                  Skip
                </UButton>
              </div>
        </template>
       

      </UCard>
    </UModal>

    <UModal v-model="isCreatePOConfirmOpen">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">Create Purchase Order</h3>
        </template>
        <p>Create a purchase order for this?</p>
        <template #footer>
          <div class="flex justify-end gap-3">
            <UButton color="gray" variant="soft" label="No" :loading="isSave" @click="handleSaveNoPO" />
            <UButton color="green" label="Yes" @click="openPurchaseInfoForSave" />
          </div>
        </template>
      </UCard>
    </UModal>


       
    </UDashboardPanelContent>

</template>
