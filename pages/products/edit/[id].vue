<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useUpsertVariant,useDeleteManyItem, useUpdateProduct, useFindUniqueCategory, useFindUniqueProduct} from '~/lib/hooks';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
import type { paymentType as PType } from '@prisma/client';

const router = useRouter();
const toast = useToast();
const { printLabel } = usePrint();
const useAuth = () => useNuxtApp().$auth;
let hasLoaded = false;

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
  code: string;
  qty: number;
  sprice: number;
  pprice: number;
  dprice: number;
  discount: number;
  sizes: { size: string; qty: number; }[]; // Assuming sizes are strings, adjust if needed
  images: string[];
}

interface Product {
  id: string ;
  name: string;
  brand: string;
  description: string;
  files: any[]; // Adjust type based on file structure (e.g., File[])
  category:  Record<string, any>;
  subcategory:  Record<string, any>;
  categoryId:  string;
  subcategoryId:  string;
  variants: Variant[];
}



const route = useRoute();
const UpdateProduct = useUpdateProduct();
const DeleteManyItem = useDeleteManyItem();
const UpsertVariant = useUpsertVariant();
const awsService = new AwsService();

const selectedProduct: Ref<Product> = ref({
  id: '', 
  name: '',
  brand: '',
  description: '',
  category: {}, 
  subcategory: {}, 
  categoryId: '', 
  subcategoryId: '', 
  variants: [{
    id:'',
    name: '',
    code: '',
    qty: 0,
    sprice: 0,
    pprice: 0,
    dprice: 0,
    discount: 0,
    sizes: [],
    images: []
  }]
});

const clearInputs = ref(true)
const createRef = ref<any>(null);
const variantRef = ref<any>([]);
const mediaRefs = ref<any>([]);
const idCounter = ref(1);



const isOpen = ref(false)
const isOpenAdd = ref(false)

const linkList = ['Create', 'Media', 'Live'];

const name = ref('');
const brand = ref('');
const description = ref('');
const live = ref<boolean>();
const category = ref('');
const subcategory = ref('');

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');

const variants = ref<{ 
    id:string;
    name: string; 
    code: string; 
    qty: number; 
    sprice: number; 
    pprice: number; 
    dprice: number; 
    discount: number; 
    sizes: { size: string; qty: number }[];
    images: ImageData[];
}[]>([{ 
    id:String(idCounter.value++),
    name: '', 
    code: '', 
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    dprice: 0, 
    discount: 0, 
    sizes: [], 
    images: [] 
}]);

const { data: categoryTax } = useFindUniqueCategory({
  where: computed(() => ({ id: category.value })),
  select: {
    fixedTax: true,
    taxBelowThreshold: true,
    taxAboveThreshold: true,
    thresholdAmount: true,
    taxType: true,
  }
},{ enabled: computed(() => !!category.value) });


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


const {data: productData, refetch:productRefetch} = useFindUniqueProduct({
  where: { id: route.params.id },
  select: {
    id: true,
    name: true,
    brand: true,
    description: true,
    categoryId: true,
    subcategoryId: true,
    category: true,
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
            barcode: true,
            size: true,
            qty: true,
          }
        }
      }
    }
  }
});

watch(productData, (newValue) => {
  if (newValue && !hasLoaded) {
    console.log(newValue)
    selectedProduct.value = newValue;
    console.log(newValue);
    hasLoaded = true;
  }
}, { immediate: true });




const handleEdit = async (e: Event) => {
  e.preventDefault();
  try {
    // Validate product name
    if (!category.value || category.value.trim() === '') {
         toast.add({
           title: 'Please fill product category',
           color: 'red',
         });
         return;
       }
   
       // Validate variant names
       // const emptyVariantIndex = variants.value.findIndex(
       //   (variant) => !variant.name || variant.name.trim() === ''
       // );
       
       // if (emptyVariantIndex !== -1) {
       //   toast.add({
       //     title: `Please fill variant ${emptyVariantIndex + 1} name`,
       //     color: 'red',
       //   });
       //   return;
       // }
   
       const base64files = await Promise.all(
         variants.value.flatMap((variant) =>
           variant.images
             .filter((file) => file.file instanceof File) // Only process if file.file is a File
             .map(async (file) => {
               const base64 = await prepareFileForApi(file.file);
               return { base64, uuid: file.uuid };
             })
         )
       );
   
       if (base64files.length > 0) {
         const awsres = await Promise.all(
           base64files.map((file) =>
             awsService.uploadBase64File(file.base64, file.uuid)
           )
         );
       }
   
       const productId = selectedProduct.value.id;
   
   
       // Step 3: Update product and add new categories
      const productRes = await UpdateProduct.mutateAsync({
     where: { id: productId },
     data: {
       name: name.value || '',
       brand: brand.value || '',
       description: description.value || '',
       status: live.value ?? undefined,
       company: {
         connect: { id: useAuth().session.value?.companyId },
       },
       ...(category.value && {
         category: { connect: { id: category.value } }
       }),
       ...(subcategory.value && {
         subcategory: { connect: { id: subcategory.value } }
       }),
       variants: {
         deleteMany: {
           id: {
             notIn: variants.value.filter(v => v.id).map(v => v.id)
           }
         }
       },
     },
     select: { id: true }
   });

   // 1. Collect all variant IDs that need deletion
const variantIdsToDelete = variants.value
  .map((v) => v.id)
  .filter((id): id is string => !!id);

if (variantIdsToDelete.length > 0) {
  await DeleteManyItem.mutateAsync({
    where: {
      variantId: { in: variantIdsToDelete },
    },
  });
}

  for (const variant of variants.value) {
  let tax = 0;
  if (categoryTax.value) {
    if (categoryTax.value.taxType === 'FIXED') {
      tax = categoryTax.value.fixedTax || 0;
    } else if (categoryTax.value.taxType === 'VARIABLE') {
      const threshold = categoryTax.value.thresholdAmount || 0;
      tax = (variant.sprice || 0) > threshold 
        ? (categoryTax.value.taxAboveThreshold || 0)
        : (categoryTax.value.taxBelowThreshold || 0);
    }
  }

  // 2. Prepare Item creation
  const itemsToCreate = (variant.items && variant.items.length > 0)
    ? variant.items.map((size) => ({
        size: size.size || null,
        qty: size.qty || 0,
        company: {
          connect: { id: useAuth().session.value?.companyId },
        }
      }))
    : [];

  // 3. Common variant data
  const variantData = {
    name: variant.name || '',
    ...(variant.code && { code: variant.code }),
    sprice: variant.sprice || 0,
    pprice: variant.pprice || 0,
    ...(variant.sprice !== variant.dprice && {
      dprice: variant.dprice || 0,
    }),
    discount: variant.discount || 0,
    status: true,
    images: variant.images?.map((file) => file.uuid) || [],
    tax,
    product: {
      connect: { id: productId },
    },
    company: {
      connect: { id: useAuth().session.value?.companyId },
    },
  };


  // 5. Upsert the variant
  await UpsertVariant.mutateAsync({
    where: { id: variant.id },
    create: {
      ...variantData,
      items: {
        create: itemsToCreate,
      },
    },
    update: {
      ...variantData,
      items: {
        create: itemsToCreate, // only create since we already deleted
      },
    },
  });
}


    await handleSave()

    toast.add({
      title: 'Product Edited!',
      id: 'modal-success',
    });
    
  } catch (err: any) {
    console.error(err);
    toast.add({
        title: `Something went wrong!`,
        color: 'red',
      });
  }
};

const addVariant = async() => {
    // Create a shallow copy of the variants array to ensure it's not read-only
    const newVariants = [...selectedProduct.value.variants];
    newVariants.push({id:String(idCounter.value++), name: '', code:'',qty: 0, sprice: 0,pprice: 0,dprice: 0,discount: 0,  sizes: [], images: [] });
    
    // Update the selectedProduct with the new variants array
    selectedProduct.value = {
      ...selectedProduct.value,
      variants: newVariants,
    }; 
  }


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
 
    const response = await printLabel(barcodes.value);
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

const printBarcodesVariant = async(variant:any) => {
  barcodes.value = variant.items?.map(item => ({
            barcode: item.barcode ?? '',
            code: variant.code ?? '',
            shopname:useAuth().session.value?.companyName,
            productName: productData?.value?.name,
            brand: productData?.value?.brand,
            name: variant.name,
            sprice: variant.sprice,
            dprice: variant.dprice,
            size: item.size,
        })) ?? [];
       

console.log(barcodes.value)
  try{
 
    const response = await printLabel(barcodes.value);
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



const handleSave  = async () => {
  try {
     await productRefetch();
    if (!productData.value) {
      throw new Error("No items found");
    }

    console.log(productData.value)

    // Generate printable barcode format
    barcodes.value = productData.value?.variants?.flatMap(variant =>
        variant.items?.map(item => ({
            barcode: item.barcode ?? '',
            code: variant.code ?? '',
            shopname:useAuth().session.value?.companyName,
            productName: productData.value.name,
            brand: productData.value.brand,
            name: variant.name,
            sprice: variant.sprice,
             ...(variant.sprice !== variant.dprice && 
                {  dprice: variant.dprice }
              ),
            size: item.size,
        })) ?? []
        ) ?? [];


    console.log(barcodes.value)

    isOpen.value = true;

  } catch (error) {
    console.error("Failed to save purchase order", error);
    // Consider adding user feedback here
  }
};


</script>

<template>
    
    <UDashboardPanelContent class="pb-24">
      <div class="flex flex-row gap-4">
        <div class="w-1/2">
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
            <span>Price: ${{ variant.price }}</span>
            <span>Qty: {{ variant.qty }}</span>
            <span>Discount: {{ variant.discount || 0 }}%</span>
          </div>
          <UButton
        label='Print'
         @click="printBarcodesVariant(variant)"
        />
        </div>
        </ULink>
       
      
      </div>
    </template>
  </UPageCard>
</div>


        <div class=" w-1/2">
        
      <UPageCard class="m-3" id="Create">
        <AddProductCreate 
          ref="createRef"
          :editName="selectedProduct?.name"
          :editBrand="selectedProduct?.brand"
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
            ref="mediaRefs"
            :editFile="selectedProduct && selectedProduct.variants[index]?.images"
            :index="index" 
            @update="fileValue"
          />
        </UPageCard>
      </div>
  
      <button
        class="w-full rounded-md bg-green-500 hover:bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm m-3"
        @click="addVariant"
      >
        + Add Variant
      </button>
  
      <UPageCard class="m-3" id="Live">
        <AddProductLive @update="liveValue" />
      </UPageCard>

      <div class="m-3">
        <UButton
          @click="handleEdit"
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
          <BarcodeComponent v-if="barcodes.length" :barcodes="barcodes" />
          
          <template #header>
            <div class="flex items-end justify-end">
              <UButton type="submit" class="me-3 px-5" @click="printBarcodes">
                Print
              </UButton>
              <UButton type="submit" class="me-3 px-5" @click="handleSkip">
                Skip
              </UButton>
            </div>
          </template>
          
          <template #footer>
            <div class="flex items-end justify-end">
              <UButton type="submit" class="me-3 px-5" @click="printBarcodes">
                Print
              </UButton>
              <UButton type="submit" class="me-3 px-5" @click="handleSkip">
                Skip
              </UButton>
            </div>
          </template>
        </UCard>
      </UModal>
  
      <UModal v-model="isOpenAdd">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              
              <div class="m-3">
                <button
                  class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                  @click="handleEdit"
                >
                  Edit Product
                </button>
              </div>
              <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpenAdd = false" />
            </div>
          </template>
          
          <div>
            <UPageCard class="m-3" id="Create">
              <AddProductCreate 
                :editName="selectedProduct?.name"
                :editBrand="selectedProduct?.brand"
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
                    v-if="!(index === 0)"
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
                  @update="fileValue"
                />
              </UPageCard>
            </div>
  
            <button
              class="rounded-md bg-green-500 hover:bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm m-3"
              @click="addVariant"
            >
              + Add Variant
            </button>
  
            <UPageCard class="m-3" id="Live">
              <AddProductLive @update="liveValue" />
            </UPageCard>
  
           
            <div class="m-3">
              <button
                class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                @click="handleEdit"
              >
                Edit Product
              </button>
            </div>
          </div>
        </UCard>
      </UModal>
    </UDashboardPanelContent>
  </template>