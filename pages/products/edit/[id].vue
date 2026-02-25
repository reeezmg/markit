<script setup lang="ts">
import AwsService from '~/composables/aws';
import {useUpdateProduct, useFindUniqueCategory, useFindUniqueProduct} from '~/lib/hooks';
import { v4 as uuidv4 } from 'uuid';
const router = useRouter();
const toast = useToast();
const { printLabel } = usePrint();
const useAuth = () => useNuxtApp().$auth;

const variantInputs = ref(useAuth().session.value?.variantInputs)
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
  brand: Record<string, any>;
  brandId: string;
  description: string;
  files: any[]; // Adjust type based on file structure (e.g., File[])
  category:  Record<string, any>;
  subcategory:  Record<string, any>;
  categoryId:  string;
  subcategoryId:  string;
  variants: Variant[];
}

const isPrintModalOpen = ref(false)
const selectedVariant = ref<any>(null)

// qty entered by user
// key = item.id, value = number of labels
const printQtyMap = ref<Record<string, number>>({})

const route = useRoute();
const UpdateProduct = useUpdateProduct();

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

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');

const variants = ref<{ 
    id:string;
    key:String;
    name: string; 
    code: string; 
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
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    dprice: 0, 
    discount: 0, 
    items: [{ id: uuidv4(), size: null, qty: undefined }], 
    images: [] 
}]);



const { data:categoryTax } = useFindUniqueCategory({
  where: computed(() => ({ id: category.value.id })),
  select: {
    fixedTax: true,
    taxBelowThreshold: true,
    taxAboveThreshold: true,
    thresholdAmount: true,
    taxType: true,
  }
},{ enabled: computed(() => !!category.value.id) });


const createValue = (data: any) => {
    name.value = data.name;
    brand.value = data.brand;
    description.value = data.description;
    category.value = data.category;
    subcategory.value = data.subcategory;
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



const {data: selectedProductRaw, isLoading, refetch:productRefetch} = useFindUniqueProduct({
  where: { id: route.params.id },
  select: {
    id: true,
    updatedAt:true,
    name: true,
    description: true,
    categoryId: true,
    subcategoryId: true,
    category: true,
    brand: true,
    brandId: true,
    subcategory: true,
    variants: {
      select: {
        id:true,
        name:true,
        code:true,
        sprice:true,
        pprice:true,
        dprice:true,
        discount:true,
        images:true,
        items: {
          select: {
            id:true,
            barcode: true,
            size: true,
            qty: true,
          }
        }
      }
    }
  }
});

const selectedProduct = ref();

watch(selectedProductRaw, (newVal) => {
  selectedProduct.value = newVal ? JSON.parse(JSON.stringify(newVal)) : null;
}, { immediate: true });



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

    if (!category.value || category.value.id.trim() === '') {
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
   console.log(variantInputs?.value.images )

const updatedProduct =   UpdateProduct.mutateAsync({
  where: { id: productId },
  data: {
    name: name.value || '',
    ...brand.value && {
    brand: {
      connect: { id: brand.value}
    },
    },
    description: description.value || '',
    status: live.value ?? undefined,
    company: {
      connect: { id: useAuth().session.value?.companyId },
    },
    ...(category.value && {
      category: { connect: { id: category.value.id } }
    }),
    ...(subcategory.value && {
      subcategory: { connect: { id: subcategory.value } }
    }),

    variants: {
      // 1. Delete removed variants
      deleteMany: {
        id: {
          notIn: variants.value.filter(v => v.id).map(v => v.id),
        },
      },

      // 2. Upsert variants (update if exists, create if not)
      upsert: variants.value.map(v => ({
        where: { id: v.id }, // Prisma ignores if no match found
        update: {
          name: v.name || '',
          code: v.code || null,
          sprice: v.sprice || 0,
          pprice: v.pprice || 0,
          dprice: v.dprice || 0,
          discount: v.discount || 0,
          status: true,
          ...(variantInputs?.value.images && { 
          images: (v.images || [])
            .sort((a, b) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
            .map((file) => file.uuid),
          }),
          tax: calculateTax(v),
          company: {
            connect: { id: useAuth().session.value?.companyId },
          },
          items: {
            // Delete removed items
            deleteMany: {
              id: {
                notIn: v.items.filter(item => item.id).map(item => item.id)
              }
            },
            // Upsert items
            upsert: v.items.map(item => ({
              where: { id: item.id },
              update: {
                size: item.size || null,
                qty: item.qty || 0,
              },
              create: {
                id:item.id,
                size: item.size || null,
                qty: item.qty || 0,
                company: {
                  connect: { id: useAuth().session.value?.companyId },
                },
              }
            }))
          }
        },
        create: {
          id: v.id,
          name: v.name || '',
          code: v.code || null,
          sprice: v.sprice || 0,
          pprice: v.pprice || 0,
          dprice: v.dprice || 0,
          discount: v.discount || 0,
          status: true,
          ...(variantInputs?.value.images && { 
          images: (v.images || [])
            .sort((a, b) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
            .map((file) => file.uuid),
          }),
          tax: calculateTax(v),
          company: {
            connect: { id: useAuth().session.value?.companyId },
          },
          product: {
            connect: { id: productId }
          },
          items: {
            create: v.items.map(item => ({
              id: item.id,
              size: item.size || null,
              qty: item.qty || 0,
              company: {
                connect: { id: useAuth().session.value?.companyId },
              }
            }))
          }
        }
      }))
    }
  },
  select: { id: true }
});
    await productRefetch();
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
    qty: 0,
    sprice: 0,
    pprice: 0,
    dprice: 0,
    discount: 0,
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
      productName: selectedProduct.value.name || selectedProduct.value.category.name || '',
      brand: selectedProduct.value.brand.name || selectedProduct.value.subcategory.name || '' ,
      name: variant.name,
      sprice: variant.sprice,
      ...(variant.sprice !== variant.dprice && { dprice: variant.dprice }),
      size: item.size,
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
    console.log(auth.session.value?.printerLabelSize)
  barcodes.value =
    selectedVariant.value.items.flatMap((item: any) => {
      const qty = Number(printQtyMap.value[item.id]) || 0
      if (qty <= 0) return []

      const base = {
        barcode: item.barcode ?? "",
        code: selectedVariant.value.code ?? "",
        shopname: auth.session.value?.companyName,
        productName:
          selectedProduct.value.name ||
          selectedProduct.value.category.name ||
          "",
        brand:
          selectedProduct.value.brand ||
          selectedProduct.value.subcategory.name ||
          "",
        name: selectedVariant.value.name,
        sprice: selectedVariant.value.sprice,
        ...(selectedVariant.value.sprice !==
          selectedVariant.value.dprice && {
          dprice: selectedVariant.value.dprice,
        }),
        size: item.size,
      }

      return Array.from({ length: qty }, () => ({ ...base }))
    })

  isPrintModalOpen.value = false

  try {
    await printLabel(
      barcodes.value,
      auth.session.value?.printerLabelSize
    )


    toast.add({
      title: "Printing success!",
      color: "green",
    })
  } catch (err: any) {
    toast.add({
      title: "Printing failed!",
      description: err.message,
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


        <div class=" sm:w-1/2 w-full">
        
      <UPageCard class="m-3" id="Create">
        <AddProductCreate 
          ref="createRef"
          :editName="selectedProduct?.name"
          :editBrand="selectedProduct?.brandId"
          :editDescription="selectedProduct?.description"
          :editCategory="selectedProduct?.categoryId"
          :editSubcategory="selectedProduct?.subcategoryId"
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
            :editsPrice="selectedProduct?.variants[index]?.sprice"
            :editpPrice="selectedProduct?.variants[index]?.pprice"
            :editdPrice="selectedProduct?.variants[index]?.dprice"
            :editDiscount="selectedProduct?.variants[index]?.discount"
            :editItems="selectedProduct?.variants[index]?.items"
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
                  :editsPrice="selectedProduct?.variants[index].sprice"
                  :editpPrice="selectedProduct?.variants[index].pprice"
                  :editSizes="selectedProduct?.variants[index].sizes"
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
          Size: {{ item.size }}
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