<script setup lang="ts">
import AwsService from '~/composables/aws';
import { v4 as uuidv4 } from 'uuid';
const router = useRouter();
const toast = useToast();
const { printLabel } = usePrint();
const useAuth = () => useNuxtApp().$auth;

const variantInputs = ref(useAuth().session.value?.variantInputs)
const { defaultSizeLabel, labelFor } = useSizeLabel()
const { invalidateModels } = useModelCache()
interface ImageData {
    file: File;
    uuid: string;
}
interface Item {
    name: string;
}
interface BarcodeItem {
  barcode: string;
  code: string;
  productName: string;
  name: string;
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
  items: {id: string; size: string | null; qty: number | undefined; dimensionId?: string | null}[];
  images: string[];
  sizeLabel?: string;
  customFields?: Record<string, any>;
}

interface Product {
  id: string ;
  name: string;
  brand: Record<string, any>;
  brandId: string;
  description: string;
  files: any[]; // Adjust type based on file structure (e.g., File[])
  category:  Record<string, any>;
  subcategory:  Record<string, any>;
  categoryId:  string;
  subcategoryId:  string;
  customFields?: Record<string, any>;
  variants: Variant[];
}

const isPrintModalOpen = ref(false)
const selectedVariant = ref<any>(null)

// qty entered by user
// key = item.id, value = number of labels
const printQtyMap = ref<Record<string, number>>({})

const route = useRoute();

const awsService = new AwsService();

const clearInputs = ref(true)
const createRef = ref<any>(null);
const variantRef = ref<any>([]);
const mediaRefs = ref<any>([]);
const idCounter = ref(1);



const isOpenAdd = ref(false)
const isLoad = ref(false);
const linkList = ['Create', 'Media', 'Live'];

const name = ref('');
const brand = ref('');
const description = ref('');
const live = ref<boolean>();
const category = ref({});
const subcategory = ref('');
const collection = ref('');
// Custom product-level inputs (Settings → Products → Create fields) as a
// { fieldKey: value } map — stored on products.custom_fields.
const productCustomFields = ref<Record<string, any>>({});
// Linked product-dimension ShippingBox (products.dimension_id). Mirrors the
// select inside AddProductCreate so handleEdit can save what the user picked.
const productDimensionId = ref<string | null>(null);

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');

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
    items: { id: string; size: string | null; qty: number | undefined; dimensionId?: string | null }[];
    images: ImageData[];
    sizeLabel?: string;
    customFields?: Record<string, any>;
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
    productCustomFields.value = data.customFields || {};
};

const updateVariant = (index,data: any) => {
  variants.value[index] = { ...variants.value[index], ...data };
  console.log(variants.value)
};


const liveValue = (data: any) => {
    live.value = data.live;
};

const fileValue = (data: any) => {
   console.log(data)
    variants.value[data.index].images = [...data.files]; 
  
};


function calculateTax(variant) {
  if (!categoryTax.value) return 0;

  if (categoryTax.value.taxType === 'FIXED') {
    return categoryTax.value.fixedTax || 0;
  }

  const threshold = categoryTax.value.thresholdAmount || 0;
  return (variant.sprice || 0) > threshold
    ? (categoryTax.value.taxAboveThreshold || 0)
    : (categoryTax.value.taxBelowThreshold || 0);
}



const selectedProductRaw = ref<any>(null);
const isLoading = ref(true);
const productRefetch = async () => {
  isLoading.value = true;
  try {
    selectedProductRaw.value = await $fetch(`/api/products/${route.params.id}`);
  } catch (e) {
    console.error('Failed to load product', e);
  } finally {
    isLoading.value = false;
  }
};
onMounted(productRefetch);

const selectedProduct = ref();

watch(selectedProductRaw, (newVal) => {
  selectedProduct.value = newVal ? JSON.parse(JSON.stringify(newVal)) : null;

  // The form components emit changes into these refs, and handleEdit saves
  // from them. Seed the save buffer from the fetched product so saving does
  // not depend on child watchers having emitted before the user clicks Save.
  if (newVal) {
    name.value = newVal.name ?? '';
    brand.value = newVal.brandId ?? '';
    description.value = newVal.description ?? '';
    live.value = newVal.status;
    category.value = newVal.category ?? {};
    subcategory.value = newVal.subcategoryId ?? '';
    collection.value = newVal.collectionId ?? '';
    productDimensionId.value = newVal.dimensionId ?? null;
    productCustomFields.value = newVal.customFields ?? {};
    variants.value = JSON.parse(JSON.stringify(newVal.variants ?? []));
  }
}, { immediate: true });

// Match the arrow-key field navigation available on products/add. Keeping the
// listener on the form pane avoids intercepting keys in the variant link list
// and print modal.
const formPaneRef = ref<HTMLElement | null>(null);
const presentSelectRef = ref<HTMLElement | null>(null);

const resolveSelectWrapper = (el: HTMLElement | null): HTMLElement | null => {
  if (!el) return null;
  const candidates: HTMLElement[] = [
    ...(createRef.value?.getAllSelectWrappers?.() ?? []),
    ...((variantRef.value ?? [])
      .flatMap((v: any) => v?.getSelectWrappers?.() ?? [v?.getSelectWrapper?.()])
      .filter((w: any): w is HTMLElement => !!w)),
  ];
  return candidates.find(w => w === el || w.contains(el)) ?? null;
};

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'password', 'email', 'number']);
const isCaretAtEdge = (el: HTMLInputElement, direction: 'left' | 'right') => {
  if (!TEXT_INPUT_TYPES.has(el.type)) return true;
  if (el.selectionStart === null) return (el.value ?? '').length === 0;
  const edge = direction === 'left' ? 0 : (el.value ?? '').length;
  return el.selectionStart === edge && el.selectionEnd === edge;
};

const visibleFormControls = () => {
  if (!formPaneRef.value) return [] as HTMLElement[];
  return (Array.from(formPaneRef.value.querySelectorAll('input, textarea, button')) as HTMLElement[])
    .filter((el) => {
      if ((el as HTMLInputElement).disabled) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
};

const findFocusableNeighbor = (current: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') => {
  const cr = current.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;
  let best: { el: HTMLElement; score: number } | null = null;

  for (const el of visibleFormControls()) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    let primary: number;
    let cross: number;
    if (direction === 'up') {
      if (ey >= cy - 4) continue;
      primary = cy - ey; cross = Math.abs(ex - cx);
    } else if (direction === 'down') {
      if (ey <= cy + 4) continue;
      primary = ey - cy; cross = Math.abs(ex - cx);
    } else if (direction === 'left') {
      if (ex >= cx - 4 || Math.abs(ey - cy) > Math.max(cr.height, r.height)) continue;
      primary = cx - ex; cross = Math.abs(ey - cy);
    } else {
      if (ex <= cx + 4 || Math.abs(ey - cy) > Math.max(cr.height, r.height)) continue;
      primary = ex - cx; cross = Math.abs(ey - cy);
    }
    const score = primary + cross * 3;
    if (!best || score < best.score) best = { el, score };
  }
  return best?.el ?? null;
};

const findDocOrderNeighbor = (current: HTMLElement, direction: 'prev' | 'next') => {
  const controls = visibleFormControls();
  const index = controls.indexOf(current);
  if (index < 0) return null;
  return controls[direction === 'prev' ? index - 1 : index + 1] ?? null;
};

const focusElement = (el: HTMLElement | null) => {
  if (!el) return;
  el.focus();
  if (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)) {
    (el as HTMLInputElement).select?.();
  }
};

const onFormKeydown = (e: KeyboardEvent) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;

  if (target.tagName === 'TEXTAREA') {
    const ta = target as HTMLTextAreaElement;
    const value = ta.value ?? '';
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (e.key === 'ArrowUp' && value.substring(0, start).includes('\n')) return;
    if (e.key === 'ArrowDown' && value.substring(end).includes('\n')) return;
    if (e.key === 'ArrowLeft' && (start !== 0 || end !== 0)) return;
    if (e.key === 'ArrowRight' && (start !== value.length || end !== value.length)) return;
  }

  const isSelectTrigger = target.tagName === 'BUTTON' &&
    (target.getAttribute('aria-haspopup') === 'listbox' || target.getAttribute('role') === 'combobox');
  const isSelectOpen = isSelectTrigger && target.getAttribute('aria-expanded') === 'true';
  const isInsideListbox = !!target.closest('[role="listbox"]');

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (isSelectTrigger || isInsideListbox) {
      if (isSelectTrigger) presentSelectRef.value = resolveSelectWrapper(target);
      return;
    }
    const next = findFocusableNeighbor(target, e.key === 'ArrowUp' ? 'up' : 'down');
    if (next) { e.preventDefault(); focusElement(next); }
    return;
  }

  const direction = e.key === 'ArrowLeft' ? 'left' : 'right';
  if (target.tagName === 'INPUT' && !isCaretAtEdge(target as HTMLInputElement, direction)) return;

  if (isSelectOpen || isInsideListbox) {
    e.preventDefault();
    const wrapper = presentSelectRef.value ?? resolveSelectWrapper(target);
    const button = wrapper?.querySelector('button') as HTMLElement | null;
    if (!button) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    button.focus();
    button.click();
    nextTick(() => { button.focus(); presentSelectRef.value = null; });
    return;
  }

  const next = findFocusableNeighbor(target, direction) ??
    findDocOrderNeighbor(target, direction === 'left' ? 'prev' : 'next');
  if (next) { e.preventDefault(); focusElement(next); }
};



const handleEdit = async (e: Event) => {
  e.preventDefault();
  isLoad.value = true
  try {
     if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.add({
        title: 'No internet connection',
        color: 'red',
      });
      throw new Error('No internet connection')
    }

    if (!category.value?.id || String(category.value.id).trim() === '') {
      toast.add({
        title: 'Please fill product category',
        color: 'red',
      });
      return;
    }
     for (const v of variants.value) {
      if (v.dprice > v.sprice) {
        console.log(v)
        toast.add({
          title: `In variant: Discount price cannot be greater than selling price`,
          color: 'red',
        });
        return; // stop execution if any variant is invalid
      }
    }


    const base64files = await Promise.all(
  variants.value.flatMap((variant) =>
    (variant.images || []) // ← fallback to empty array
      .filter((file) => file.file instanceof File)
      .map(async (file) => {
        const base64 = await prepareFileForApi(file.file);
        return { base64, uuid: file.uuid, view: file.view };
      })
  )
);


    if (base64files.length > 0) {
      const awsres = await Promise.all(
        base64files.map((file) =>
           awsService.uploadBase64File(file.base64, file.uuid, file.view, category.value.name, category.value.targetAudience, useAuth().session.value?.isAiImage)
        )
      );
    }

   const productId = selectedProduct.value.id;

const updateResult: any = await $fetch('/api/products/update', {
  method: 'POST',
  body: {
    productId,
    product: {
      name: name.value || '',
      brandId: brand.value || null,
      description: description.value || '',
      status: live.value ?? null,
      categoryId: category.value?.id || null,
      subcategoryId: subcategory.value || null,
      collectionId: collection.value || null,
      dimensionId: productDimensionId.value ?? null,
      customFields: productCustomFields.value || {},
    },
    variants: variants.value.map(v => ({
      id: v.id,
      name: v.name || '',
      code: v.code || null,
      unit: v.unit || 'Nos',
      sprice: v.sprice || 0,
      pprice: v.pprice || 0,
      dprice: v.dprice || 0,
      discount: v.discount || 0,
      images: v.images || [],
      sizeLabel: v.sizeLabel || defaultSizeLabel.value,
      customFields: v.customFields || {},
      items: v.items.map(item => ({
        id: item.id, size: item.size || null, qty: item.qty || 0, dimensionId: item.dimensionId ?? null,
      })),
    })),
    categoryTax: categoryTax.value,
    updateImages: !!variantInputs?.value?.images,
  }
});
    if (updateResult?.product) {
      selectedProductRaw.value = updateResult.product;
    } else {
      await productRefetch();
    }
    // Raw-SQL write bypasses the ZenStack cache — drop it so /products shows the edit.
    await invalidateModels('Product', 'Variant', 'Item');
    toast.add({
      title: 'Product Edited!',
      id: 'modal-success',
    });
    
  } catch (err: any) {
    console.log(err)
    toast.add({
        title: `Something went wrong!`,
        color: 'red',
      });
  }
  finally{
    isLoad.value = false
    isOpenAdd.value = false
  }
}

const addVariant = () => {
  const newVariants = [...selectedProduct.value.variants];
  newVariants.push({
    id: uuidv4(), // ✅ generate a unique ID
    key: String(idCounter.value++),
    name: '',
    code: '',
    unit: 'Nos',
    qty: 0,
    sprice: 0,
    pprice: 0,
    dprice: 0,
    discount: 0,
    sizeLabel: defaultSizeLabel.value,
    items: [{ id: uuidv4(), size: null, qty: undefined }],
    images: [],
  });

  selectedProduct.value = {
    ...selectedProduct.value,
    variants: newVariants,
  };
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
   

};



const scrollToSection = (sectionId: any) => {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
};

const handleSkip = () => {
 router.push(`/products`);
}



const printBarcodes = async() => {
console.log(barcodes.value)
  try{
 
    const response = await printLabel(barcodes.value, useAuth().session.value?.printerLabelSize);
    console.log(response)
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
  }
}

const printBarcodesVariant = async (variant: any) => {
  console.log(variant)
  const auth = useAuth();

  // Build barcodes with qty-based duplicates
  barcodes.value = variant.items?.flatMap(item => {
    const qty = Number(item.qty) || 1;   // default to 1 if missing

    const base = {
      barcode: item.barcode ?? "",
      code: variant.code ?? "",
      shopname: auth.session.value?.companyName,
      productName: selectedProduct.value?.name || selectedProduct.value?.category?.name || '',
      brand: selectedProduct.value?.brand?.name || selectedProduct.value?.subcategory?.name || '' ,
      name: variant.name,
      sprice: variant.sprice,
      ...(variant.sprice !== variant.dprice && { dprice: variant.dprice }),
      size: item.size,
      sizeLabel: labelFor(variant),
    };

    // Duplicate barcode entries based on qty
    return Array.from({ length: qty }, () => ({ ...base }));
  }) ?? [];

  console.log(barcodes.value);
  console.log(variant);

  try {
    const response = await printLabel(barcodes.value, useAuth().session.value?.printerLabelSize);

    console.log(response);

    toast.add({
      title: "Printing success!",
      color: "green",
    });
  } catch (err: any) {
    console.log(err);
    toast.add({
      title: "Printing failed!",
      description: err.message,
      color: "red",
    });
  }
};

const openPrintModal = (variant: any) => {
  selectedVariant.value = variant
  printQtyMap.value = {}

  variant.items?.forEach((item: any) => {
    // default qty = item.qty or 1
    printQtyMap.value[item.id] = Number(item.qty) || 1
  })

  isPrintModalOpen.value = true
}

const confirmPrint = async () => {
  const auth = useAuth()
  const variant = selectedVariant.value
  if (!variant) return

  try {
    barcodes.value = (variant.items ?? []).flatMap((item: any) => {
      const qty = Number(printQtyMap.value[item.id]) || 0
      if (qty <= 0) return []

      const base = {
        barcode: item.barcode ?? "",
        code: variant.code ?? "",
        shopname: auth.session.value?.companyName,
        productName:
          selectedProduct.value?.name ||
          selectedProduct.value?.category?.name ||
          "",
        brand:
          selectedProduct.value?.brand?.name ||
          selectedProduct.value?.subcategory?.name ||
          "",
        name: variant.name,
        sprice: variant.sprice,
        ...(variant.sprice !== variant.dprice && {
          dprice: variant.dprice,
        }),
        size: item.size,
        sizeLabel: labelFor(variant),
      }

      return Array.from({ length: qty }, () => ({ ...base }))
    })

    if (!barcodes.value.length) {
      toast.add({
        title: "Nothing to print",
        description: "Enter a quantity of at least 1.",
        color: "orange",
      })
      return
    }

    isPrintModalOpen.value = false

    await printLabel(barcodes.value, auth.session.value?.printerLabelSize)

    toast.add({
      title: "Printing success!",
      color: "green",
    })
  } catch (err: any) {
    isPrintModalOpen.value = false
    toast.add({
      title: "Printing failed!",
      description: err?.message,
      color: "red",
    })
  }
}


</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center">
  <UIcon name="i-heroicons-arrow-path-20-solid" class="animate-spin w-5 h-5 mt-10 text-gray-500" />
</div>
    
    <UDashboardPanelContent v-else class="pb-24">
      <div class="flex sm:flex-row flex-col gap-4">
        <div class="sm:w-1/2 w-full ">
  <UPageCard class="m-3">
    <div class="text-lg mb-4">Variant Links</div>

    <template v-if="selectedProduct?.variants.length">
      <div class="space-y-3">
        <ULink
          v-for="(variant, index) in selectedProduct?.variants"
          :key="variant.id"
          :to="`#variant-${index}`"
          @click="scrollToSection(`variant-${index}`)"
          active-class="ring-2 ring-primary"
          inactive-class="hover:bg-gray-100 dark:hover:bg-gray-700"
          class="block rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition cursor-pointer"
        >
          <div class="flex flex-col space-y-2 sm:flex-row sm:justify-between sm:space-y-0">
            <div class="text-gray-900 dark:text-gray-100 font-medium">{{ variant.name }}</div>
            <div class="text-gray-500 dark:text-gray-400 text-sm">Code: {{ variant.code || '-' }}</div>
          </div>
          <div  class="flex flex-col space-y-2 sm:flex-row sm:justify-between sm:space-y-0">
          <div class="mt-2 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span>Price: Rs {{ variant.sprice }}</span>
            <span>Qty: {{ variant.items?.reduce((variantTotal, item) => {
                        return variantTotal + (item.qty || 0);
                    }, 0)}}</span>
            <span>Discount: {{ variant.discount || 0 }}%</span>
          </div>
          <UButton
            label="Print"
            :loading="isLoad"
            @click.stop.prevent="openPrintModal(variant)"
          />
        </div>
        </ULink>
       
      
      </div>
    </template>
  </UPageCard>
</div>


        <div ref="formPaneRef" class="sm:w-1/2 w-full" @keydown.capture="onFormKeydown">
        
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
          :editCustomFields="selectedProduct?.customFields"
          @update="createValue" />
      </UPageCard>
  
      <div v-for="(variant, index) in (selectedProduct?.variants)" 
             :key="variant.id" 
             class="mb-3"
             :id="`variant-${index}`">
        <UPageCard class="m-3" id="Variants">
          <div class="flex justify-between items-centerp-3 rounded-lg">
            <div class="text-xl mb-4">Variant {{index+1}}</div>
            <button
             v-if="variantInputs?.button"
              @click="removeVariant(index)"
              class="text-red-500 hover:text-red-700 text-sm"
            >
              Remove
            </button>
          </div>
          <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
          
          <AddProductVariants   
            ref="variantRef"
            :id="selectedProduct?.variants[index]?.id"
            :editName="selectedProduct?.variants[index]?.name" 
            :editCode="selectedProduct?.variants[index]?.code"
            :editQty="selectedProduct?.variants[index]?.qty"
            :editUnit="selectedProduct?.variants[index]?.unit || variants[0]?.unit"
            :editsPrice="selectedProduct?.variants[index]?.sprice"
            :editpPrice="selectedProduct?.variants[index]?.pprice"
            :editdPrice="selectedProduct?.variants[index]?.dprice"
            :editDiscount="selectedProduct?.variants[index]?.discount"
            :editItems="selectedProduct?.variants[index]?.items"
            :editSizeLabel="selectedProduct?.variants[index]?.sizeLabel"
            :editCustomFields="selectedProduct?.variants[index]?.customFields"
            @update="updateVariant(index,$event)" />
          <AddProductMedia 
           v-if="variantInputs?.images"
            ref="mediaRefs"
            :editFile="selectedProduct && selectedProduct.variants[index]?.images"
            :index="index" 
            :categoryName="category.name"
            :targetAudience = "category.targetAudience"
            :productId = "selectedProduct?.id"
            :updatedAt = "selectedProduct?.updatedAt"
            @update="fileValue"
          />
        </UPageCard>
      </div>
  
      <button
        v-if="variantInputs?.button"
        class="w-full rounded-md bg-green-500 hover:bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm m-3"
        @click="addVariant"
      >
        + Add Variant
      </button>
  
      <!-- <UPageCard class="m-3" id="Live">
        <AddProductLive @update="liveValue" />
      </UPageCard> -->

      <div class="m-3">
        <UButton
          @click="handleEdit"
          :loading="isLoad"
        >
          Save Edit
        </UButton>
      </div>
        </div>
      </div>
      
  
      <UModal v-model="isOpenAdd">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              
              <div class="m-3">
                <button
                  class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  @click="handleEdit"
                  :loading="isLoad"
                >
                  Save Edit
                </button>
              </div>
              <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpenAdd = false" />
            </div>
          </template>
          
          <div>
            <UPageCard class="m-3" id="Create">
              <AddProductCreate 
                :editName="selectedProduct?.name"
                :editBrand="selectedProduct?.brandId"
                :editDescription="selectedProduct?.description"
                :editCategory="selectedProduct?.categoryId"
                :editSubcategory="selectedProduct?.subcategoryId"
                :editCollection="selectedProduct?.collectionId"
                :editDimensionId="selectedProduct?.dimensionId"
                :editCustomFields="selectedProduct?.customFields"
                @update="createValue" />
            </UPageCard>
  
            <div v-for="(variant, index) in variants" :key="index" class="mb-3">
              <UPageCard class="m-3" id="Variants">
                <div class="flex justify-between items-centerp-3 rounded-lg">
                  <div class="text-xl mb-4">Variant {{index+1}}</div>
                  <button
                    v-if="variantInputs?.button"
                    @click="removeVariant(index)"
                    class="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
                <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
                <AddProductVariants :key="index"
                  :editName="selectedProduct?.variants[index].name"
                  :editCode="selectedProduct?.variants[index].code"
                  :editQty="selectedProduct?.variants[index].qty"
                  :editUnit="selectedProduct?.variants[index].unit || variants[0]?.unit"
                  :editsPrice="selectedProduct?.variants[index].sprice"
                  :editpPrice="selectedProduct?.variants[index].pprice"
                  :editSizes="selectedProduct?.variants[index].sizes"
                  :editSizeLabel="selectedProduct?.variants[index].sizeLabel"
                  :editCustomFields="selectedProduct?.variants[index].customFields"
                  @update="updateVariant(index,$event)" />
                <AddProductMedia
                  :key="index"
                  :editFile="selectedProduct && selectedProduct.variants[index].images"
                  :index="index" 
                  :categoryName="category.name"
                  :targetAudience = "category.targetAudience"
                  :productId = "selectedProduct?.id"
                  :updatedAt = "selectedProduct?.updatedAt"
                  @update="fileValue"
                />
              </UPageCard>
            </div>
  
            <button
            v-if="variantInputs?.button"
              class="rounded-md bg-green-500 hover:bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm m-3"
              @click="addVariant"
            >
              + Add Variant
            </button>
  
            <!-- <UPageCard class="m-3" id="Live">
              <AddProductLive @update="liveValue" />
            </UPageCard> -->
  
           
            <div class="m-3">
              <button
                class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                @click="handleEdit"
                :loading="isLoad"
              >
                Save Edit
              </button>
            </div>
          </div>
        </UCard>
      </UModal>
    </UDashboardPanelContent>

    <UModal v-model="isPrintModalOpen">
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Print Labels</h3>
    </template>

    <!-- CASE A: Single item & size is null -->
    <div
      v-if="
        selectedVariant?.items?.length === 1 &&
        selectedVariant.items[0].size === null
      "
      class="space-y-2"
    >
      <label class="text-sm font-medium">
        Number of labels to print
      </label>

      <UInput
        type="number"
        min="1"
        v-model.number="printQtyMap[selectedVariant.items[0].id]"
      />
    </div>

    <!-- CASE B: Multiple sizes -->
    <div v-else class="space-y-3">
      <div
        v-for="item in selectedVariant?.items"
        :key="item.id"
        class="flex items-center justify-between gap-3"
      >
        <span class="text-sm font-medium">
          <span v-if="item.size">{{ labelFor(selectedVariant) }}: {{ item.size }}</span>
        </span>

        <UInput
          type="number"
          min="0"
          class="w-24"
          v-model.number="printQtyMap[item.id]"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="gray"
          variant="soft"
          @click="isPrintModalOpen = false"
        >
          Cancel
        </UButton>

        <UButton
          color="primary"
          @click="confirmPrint"
        >
          Print
        </UButton>
      </div>
    </template>
  </UCard>
</UModal>

  </template>
