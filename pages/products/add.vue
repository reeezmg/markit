<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useCreateProduct,useUpdateProduct,useUpdateCategory,useUpdatePurchaseOrder} from '~/lib/hooks';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
import { paymentType as PType } from '@prisma/client';

const router = useRouter();
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;
definePageMeta({
    auth: true,
});


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
  id:number|string;
  name: string;
  code: string;
  qty: number;
  sprice: number;
  pprice: number;
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
  variants: Variant[];
}



const route = useRoute();
const poId = route.query.poId as string;
const CreateProduct = useCreateProduct();
const UpdateProduct = useUpdateProduct();
const UpdatePurchaseOrder = useUpdatePurchaseOrder();
const awsService = new AwsService();
const selectedProduct: Ref<Product> = ref({
  id: '', 
  name: '',
  brand: '',
  description: '',
  files: [], 
  category: {}, 
  subcategory: {}, 
  variants: [{
    id:0,
    name: '',
    code: '',
    qty: 0,
    sprice: 0,
    pprice: 0,
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
let files = reactive<ImageData[]>([]);
const category = ref('');
const subcategory = ref('');

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');

const variants = ref<{ 
    id:number;
    name: string; 
    code: string; 
    qty: number; 
    sprice: number; 
    pprice: number; 
    sizes: { size: string; qty: number }[];
    images: ImageData[];
}[]>([{ 
    id:0,
    name: '', 
    code: '', 
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    sizes: [], 
    images: [] 
}]);





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


const handleProductSelected = (product:any) => {
  selectedProduct.value = product;
  clearInputs.value = false;
};

const handleDistributorValue = (data:any) => {
  distributorId.value = data.distributorId;
  paymentType.value = data.paymentType;
  console.log(data)
};





const handleAdd = async (e: Event) => {

  e.preventDefault();
  try {

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


    const res = await CreateProduct.mutateAsync({
        data: {
          name: name.value || '',
          brand: brand.value || '',
          description: description.value || '',
          status: live.value ?? undefined,
          company: {
            connect: {
              id: useAuth().session.value?.companyId,
            },
          },
          purchaseorder: {
            connect: {
              id: poId, 
            },
          },
          ...(category.value && {category: {
            connect: { id:category.value }, 
          }}),
          ...(subcategory.value && {subcategory: {
            connect: { id:subcategory.value }, 
          }}),
          
          variants: {
            create: variants.value.map((variant) => ({
              name: variant.name || '',
              ...(variant.code && {code: variant.code}),
              sprice: variant.sprice || 0,
              pprice: variant.pprice || 0,
              status: true,
              qty:variant.qty,
              images: variant.images.map((file) => file.uuid),
              sizes: variant.sizes, 
              company: {
                connect: { id: useAuth().session.value?.companyId },
              },
            })),
          },
        },
      });


    // const imageData = res?.images.map((item) => (
    //      `https://unifeed.s3.ap-south-1.amazonaws.com/${item}`
    //   ))

  //   const productData: any = {
  //     title: res?.name,
  //     body_html: `<strong>${res?.description}</strong>`,
  //     product_type: res?.categories[0].category.name,
  //     status: 'active',
  //     variants: [
  //       {
  //         price: res?.price,
  //       },
  //     ],
  //   };
  //   let productRes :any
  //   try {
  //     productRes = await $fetch('/api/shopify/shopifyProduct', {
  //     method: 'POST',
  //     body: { productData },
  //   });

  //   if (productRes.success) {
  //     console.log('Product created:', productRes);
  //   } else {
  //     console.error('Error creating product:', productRes);
  //   }
  // } catch (error) {
  //   console.error('Error creating product:', error);
  // }

  // console.log("product id:",productRes)
 


    


    // try {
 
    // const imageRes = await $fetch('/api/shopify/shopifyImage', {
    //   method: 'POST',
    //   body: { productId:productRes.product.product.id, base64files },
    // });

    // if (imageRes.success) {
    //   console.log('Product image created:', imageRes);
    // } else {
    //   console.error('Error creating product:', imageRes);
    // }
    // } catch (error) {
    // console.error('Error creating product:', error);
    // }

   
      // console.log(files[0].file)
      // const resimage = await postImage(files[0].file)
      // console.log(resimage)
      handleReset()
      

      toast.add({
        title: 'Product added!',
        id: 'modal-success',
      });
      
   
  } catch (err: any) {
    console.log(err.info?.message ?? err);
  }
};




const handleEdit = async (e: Event) => {
      e.preventDefault();
      try {

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
    console.log(variants.value)

// Step 3: Update product and add new categories
const res = await UpdateProduct.mutateAsync({

  where: { id: productId },
  data: {
    name: name.value || '',
    brand: brand.value || '',
    description: description.value || '',
    status: live.value ?? undefined,
    company: {
      connect: { id: useAuth().session.value?.companyId },
    },
  
    ...(category.value && {category: {
      connect: { id:category.value }, 
          }}),

    ...(subcategory.value && {subcategory: {
      connect: { id:subcategory.value }, 
    }}),
          

    variants: {
      deleteMany: {},
      create: variants.value.map((variant) => ({
        name: variant.name || '',
        ...(variant.code && {code: variant.code}),
        sprice: variant.sprice || 0,
        pprice: variant.pprice || 0,
        status: true,
        images: variant.images.map((file) => file.uuid),
        qty:variant.qty,
        sizes: variant.sizes, 
        company: {
          connect: { id: useAuth().session.value?.companyId },
        },
      })),
    },
  },
});

handleReset()

    
      toast.add({
        title: 'Product Edited!',
        id: 'modal-success',
      });
    
  } catch (err: any) {
    console.log(err.info?.message ?? err);
  }
};



const addVariant = () => {
  if (!selectedProduct.value.id) {
    variants.value.push({id:idCounter.value++, name: '',code:'', qty: 0, sprice: 0,pprice: 0, sizes: [], images: [] });
  } else {
    // Create a shallow copy of the variants array to ensure it's not read-only
    const newVariants = [...selectedProduct.value.variants];
    newVariants.push({id:idCounter.value++, name: '', code:'',qty: 0, sprice: 0,pprice: 0,  sizes: [], images: [] });
    
    // Update the selectedProduct with the new variants array
    selectedProduct.value = {
      ...selectedProduct.value,
      variants: newVariants,
    };
  }
};

const removeVariant = (index: number) => {
  if (!selectedProduct.value.id) {
    // If no product is selected, modify the local variants array
    const newVariants = [...variants.value]; // Create a shallow copy
    newVariants.splice(index, 1); // Remove the variant at the specified index
    variants.value = newVariants; // Update the reactive array
  } else {
    // If a product is selected, modify its variants array
    const newVariants = [...selectedProduct.value.variants]; // Create a shallow copy
    newVariants.splice(index, 1); // Remove the variant at the specified index

    // Update the selectedProduct with the new variants array
    selectedProduct.value = {
      ...selectedProduct.value,
      variants: newVariants,
    };
    const newVariantss = [...variants.value]; // Create a shallow copy
    newVariantss.splice(index, 1); // Remove the variant at the specified index
    variants.value = newVariantss;
  }
};







const handleSave = async () => {
    try {
        const {items} = await getItem(poId);
        console.log(items)
        if (!items || items.length === 0) {
            console.warn("No items generated");
            return;
        }

        // Generate printable barcode format
        barcodes.value = items.map(item => ({
          barcode: item.barcode ?? '',
          code: item.variant.code ?? '',
          productName:item.variant.product.name,
          name: item.variant.name,
          sprice:item.variant.sprice,
          size:item.size,
        }));

        isOpen.value = true

        await UpdatePurchaseOrder.mutateAsync({
          where: { id: poId },
          data: {
            ...(distributorId.value && {
              distributor: {
              connect: {
                id: distributorId.value
              }
            },
            }),
            ...(paymentType.value && 
              {
                paymentType: paymentType.value as PType
              }
             )
            
             
          }
        });

    } catch (error) {
        console.error("Failed to fetch items", error);
    }
};



const handleReset = async() => {
  clearInputs.value = true
  createRef.value?.resetForm()
  variantRef.value.forEach((refInstance:any) => {
    refInstance?.resetForm();
  });
  mediaRefs.value.forEach((media:any) => media?.resetForm());
  selectedProduct.value = {
    id:'',
    name: '',
    brand:'',
    description: '',
    files: [], // Reset reactive array
    category: {},
    subcategory: {},
    variants: [{
        id:0,
        name: '', 
        code: '', 
        qty: 0, 
        sprice: 0, 
        pprice: 0, 
        sizes: [], 
        images: [] 
    }]
}
}

const printBarcodes = () => {
  window.print();
}
const handleSkip = () => {
 router.push(`/products`);
}
const handleNewProduct = () => {
  isOpenAdd.value = true
}

watch(isOpenAdd, (newVal) => {
  if (!newVal) {
    handleReset()
  }
});
watch(selectedProduct, (newVal) => {
  console.log(selectedProduct)
});

</script>

<template>
     <UDashboardNavbar >
        <template #left>
          <AddProductTopBar @update="handleDistributorValue"/>   
        </template>
      </UDashboardNavbar>
    <UDashboardPanelContent class="pb-24">
  

        <div class="md:flex md:flex-row">
            <div class="md:w-1/2">
              <div v-if="clearInputs" class="m-3 hidden md:block">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleSave"
                    >
                        Save Order
                    </button>
                </div>
                <div v-else class="m-3 hidden md:block">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleReset"
                    >
                        Add Product
                    </button>
                </div>
    
                <div class="m-3 md:hidden ">
                    <button
                        class=" rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleNewProduct"
                    >
                        Add Product
                    </button>
                </div>

              <UPageCard class="m-3">
                <AddProductTable @product-selected="handleProductSelected" @clicked="isOpenAdd = true"/>
              </UPageCard>

              <div v-if="clearInputs" class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleSave"
                    >
                        Save Order
                    </button>
                </div>
                <div v-else class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleReset"
                    >
                        Add Product
                    </button>
                </div>
            </div>
            

            <div class="hidden md:flex md:flex-col md:w-1/2">
              <div v-if="clearInputs" class="mx-3 mt-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                    >
                        Add Product
                    </button>
                </div>
                <div v-else class="mx-3 mt-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleEdit"
                    >
                        Edit Product
                    </button>
                </div>
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

                <!-- <UPageCard class="m-3" id="Variants">
                    <AddProductVariants @update="variantValue" />
                </UPageCard> -->

               
                  <div v-for="(variant, index) in ( selectedProduct?.variants[0].id ? selectedProduct?.variants : variants)" :key="variant.id" class="mb-3">
                    <UPageCard class="m-3" id="Variants">
                    <div class="flex justify-between items-centerp-3 rounded-lg">
                      <div class="text-xl mb-4">Variant {{index+1}}</div>
                     
                      <button
                        @click="removeVariant(index)"
                        class="text-red-500 hover:text-red-700 text-sm"
                      >Remove
                      </button>
                    </div>
                    <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
                    <AddProductVariants   
                      ref="variantRef"
                      :editName="selectedProduct?.variants[index]?.name "
                      :editCode="selectedProduct?.variants[index]?.code"
                      :editQty="selectedProduct?.variants[index]?.qty"
                      :editsPrice="selectedProduct?.variants[index]?.sprice"
                      :editpPrice="selectedProduct?.variants[index]?.pprice"
                      :editSizes="selectedProduct?.variants[index]?.sizes"
          
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
                    class="rounded-md bg-green-500 hover:bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm m-3"
                    @click="addVariant"
                  >
                    + Add Variant
                  </button>


                <UPageCard class="m-3" id="Live">
                    <AddProductLive @update="liveValue" />
                </UPageCard>

                <div v-if="clearInputs" class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                    >
                        Add Product
                    </button>
                </div>
                <div v-else class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleEdit"
                    >
                        Edit Product
                    </button>
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
      
          <!-- <PrintBarcodeComponent :barcodes="barcodes" /> -->
          <template #header>
          <div class="flex items-end justify-end">
          <UButton type="submit"  class="me-3 px-5" @click="printBarcodes">
                Print
                </UButton>
                <UButton type="submit"  class="me-3 px-5" @click="handleSkip">
                  Skip
                </UButton>
              </div>
        </template>
        <template #footer>
          <div class="flex items-end justify-end">
          <UButton type="submit"  class="me-3 px-5" @click="printBarcodes">
                Print
                </UButton>
                <UButton type="submit"  class="me-3 px-5" @click="handleSkip">
                  Skip
                </UButton>
              </div>
        </template>
       

      </UCard>
    </UModal>


    
    <UModal v-model="isOpenAdd">
      <UCard >
        <template #header>
          <div class="flex items-center justify-between">
             <div v-if="clearInputs" class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                    >
                        Add Product
                    </button>
                </div>
                <div v-else class="m-3">
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

                <!-- <UPageCard class="m-3" id="Variants">
                    <AddProductVariants @update="variantValue" />
                </UPageCard> -->

               
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

                <div v-if="clearInputs" class="m-3">
                    <button
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                    >
                        Add Product
                    </button>
                </div>
                <div v-else class="m-3">
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