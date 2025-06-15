<script setup lang="ts">
import AwsService from '~/composables/aws';
import { useCreateProduct, useCreateVariant,useDeleteManyItem,useUpsertVariant, useUpdateProduct,useUpdatePurchaseOrder, useFindUniqueCategory,useFindUniquePurchaseOrder,useCreateDistributorPayment, useUpdateDistributorCompany} from '~/lib/hooks';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
import type { paymentType as PType } from '@prisma/client';
const { printLabel } = usePrint();
const router = useRouter();
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;

const variantInputs = ref(useAuth().session.value?.variantInputs)

interface ImageData {
    file: File;
    uuid: string;
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
  items: { size: string; qty: number; }[]; // Assuming items are strings, adjust if needed
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
const poId = route.query.poId as string;
const CreateDistributorPayment = useCreateDistributorPayment();
const CreateProduct = useCreateProduct();
const CreateVariant = useCreateVariant();
const UpdateProduct = useUpdateProduct();
const UpsertVariant = useUpsertVariant();
const DeleteManyItem = useDeleteManyItem();
const UpdateDistributorCompany = useUpdateDistributorCompany();
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
    items: [],
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
const totalAmount = ref(0);

const variants = ref<{ 
    id:string;
    name: string; 
    code: string; 
    qty: number; 
    sprice: number; 
    pprice: number; 
    dprice: number; 
    discount: number; 
    items: { size: string; qty: number }[];
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
    items: [], 
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
  console.log("update variant",index,data)
  variants.value[index] = { ...variants.value[index], ...data };
};


const liveValue = (data: any) => {
    live.value = data.live;
};

const fileValue = (data: any) => {
    variants.value[data.index].images = [...data.files]; 
  
};

watch(isOpenAdd, (newVal) => {
  if (!newVal) {
    handleReset()
  }
});


const handleProductSelected = (product:any) => {
  selectedProduct.value = product;
  clearInputs.value = false;
};

const handleDistributorValue = (data:any) => {
  distributorId.value = data.distributorId;
  paymentType.value = data.paymentType;
};

const handleAdd = async (e: Event) => {
  isLoad.value = true
  e.preventDefault();
  try {

    // if (!name.value || name.value.trim() === '') {
    //   toast.add({
    //     title: 'Please fill product name',
    //     color: 'red',
    //   });
    //   return;
    // }
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

  const productRes = await CreateProduct.mutateAsync({
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
      connect: { id: poId },
    },
    ...(category.value && {
      category: { connect: { id: category.value } }
    }),
    ...(subcategory.value && {
      subcategory: { connect: { id: subcategory.value } }
    }),
  },
  select: { id: true }
});
console.log(variants.value)
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

  const itemsToCreate = (variant.items && variant.items.length > 0)
    ? variant.items.map((size) => ({
        size: size.size || null,
        qty: size.qty || 0,
        company: {
          connect: { id: useAuth().session.value?.companyId },
        }
      }))
    : [];

  await CreateVariant.mutateAsync({
    data: {
      name: variant.name || '',
      ...(variant.code && { code: variant.code }),
      sprice: variant.sprice || 0,
      pprice: variant.pprice || 0,
      dprice: variant.dprice || 0,
      discount: variant.discount || 0,
      status: true,
      tax,
      images: variant.images?.map((file) => file.uuid) || [],
      product: {
        connect: { id: productRes.id },
      },
      company: {
        connect: { id: useAuth().session.value?.companyId },
      },
      ...(itemsToCreate.length > 0 && {
        items: {
          create: itemsToCreate
        }
      })
    }
  });
}


      // console.log(resimage)
      // await getItem(res?.variants)

    // const imageData = res?.images.map((item) => (
    //      `https://images.markit.co.in/${item}`
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


      handleReset()
      

      toast.add({
        title: 'Product added!',
        id: 'modal-success',
      });
      
   
  } catch (err: any) {
    console.log(err.info?.message ?? err);
  }finally{
    isLoad.value = false
    isOpenAdd.value = false
  }
 
};


const handleEdit = async (e: Event) => {
  e.preventDefault();
      console.log(variants.value);
  isLoad.value = true
  try {
    // Validate product name
    // if (!name.value || name.value.trim() === '') {
    //   toast.add({
    //     title: 'Please fill product name',
    //     color: 'red',
    //   });
    //   return;
    // }
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
for (const variant of variants.value) {
  // 1. Calculate tax
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

  console.log("variant", variant.items);

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
    dprice: variant.dprice || 0,
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

  // 4. If updating, delete existing items
  if (variant.id) {
    await DeleteManyItem.mutateAsync({
      where: {
        variantId: variant.id,
      },
    });
  }

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
        create: itemsToCreate, // only create since we already deleted manually
      },
    },
  });
}



    
    // console.log(res?.variants);
    // await getItem(res?.variants);
    handleReset();

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
};

const addVariant = () => {
 
    // Create a shallow copy of the variants array to ensure it's not read-only
    const newVariants = [...selectedProduct.value.variants];
    newVariants.push({id:String(idCounter.value++), name: '', code:'',qty: 0, sprice: 0,pprice: 0,dprice: 0,discount: 0,  items: [], images: [] });
    
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


const { data: items, refetch: itemRefetch } = useFindUniquePurchaseOrder({
  where: computed(() => ({ id: poId })), // Ensure poId is not undefined
  select: {
    id: true,
    products: {
      select: {
        name: true,
        brand:true,
        variants: {
          select: {
            code: true,
            name: true,
            sprice: true,
            dprice: true,
            pprice:true,
            items: {
              select: {
                barcode: true,
                size: true,
                qty:true
              }
            }
          }
        }
      }
    }
  }
});

watch(
  () => items.value, // Watch the fetched items
  (val) => {
    if (!val) return

    const variants = val.products.flatMap((product) => product.variants)

    totalAmount.value = variants.reduce((sum, variant) => {
      const qty = variant.qty || 0
      const pprice = variant.pprice || 0
      return sum + qty * pprice
    }, 0)
  },
  { immediate: true, deep: true }
)


const printBarcodes = async() => {
  try{
 
    const response = await printLabel(barcodes.value);
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
const handleSave = async () => {
  isSave.value = true
  await itemRefetch()

  try {
    if (!items.value?.products) {
      throw new Error("No items found");
    }


    // Generate printable barcode format
    barcodes.value = items.value?.products.flatMap(product => 
      product.variants.flatMap(variant => 
        variant.items.flatMap(item => 
          item.qty === 0
            ? [] // Skip if qty is 0
            : Array.from({ length: item.qty ?? 1 }, () => ({
                barcode: item.barcode ?? '',
                code: variant.code ?? '',
                shopname: useAuth().session.value?.companyName,
                productName: product.name,
                brand: product.brand,
                name: variant.name,
                sprice: variant.sprice,
                ...(variant.sprice !== variant.dprice && 
                {  dprice: variant.dprice }
              ),
                size: item.size,
            }))
        )
      )
    );



    isOpen.value = true;
    await UpdatePurchaseOrder.mutateAsync({
      where: { id: poId }, // Use .value if poId is a ref
      data: {
        ...(paymentType.value && {
          paymentType: paymentType.value as PType
        }),
          totalAmount:totalAmount.value,
      }
    });

if(distributorId.value){
  await UpdateDistributorCompany.mutateAsync({
  where: {
    distributorId_companyId: {
      distributorId: distributorId.value,
      companyId: useAuth().session.value?.companyId!, // Ensure this value is not undefined
    }
  },
  data: {
   
    purchaseOrders:{
      connect:{id:poid}
    },
   
  }
});
}

  } catch (error) {
    console.error("Failed to save purchase order", error);
    // Consider adding user feedback here
  }
  finally{
    isSave.value = false
  }
};


const handleReset = async() => {

  clearInputs.value = true
  // createRef.value?.resetForm()
  variantRef.value.forEach((refInstance:any) => {
    refInstance?.resetForm();
  });
  mediaRefs.value.forEach((media:any) => media?.resetForm());
  variants.value = [{
    id:'',
    name: '', 
    code: '', 
    qty: 0, 
    sprice: 0, 
    pprice: 0, 
    dprice: 0, 
    discount: 0, 
    items: [], 
    images: []
  }];
  selectedProduct.value = {
    id:'',
    name: '',
    brand:'',
    description: '',
    files: [], // Reset reactive array
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
        items: [], 
        images: [] 
    }]
}
}


const handleSkip = () => {
 router.push(`/products`);
}
const handleNewProduct = () => {
  isOpenAdd.value = true
}



</script>

<template>
    <UDashboardPanelContent>
       
          <AddProductTopBar @update="handleDistributorValue" :totalAmount="totalAmount"/>   

          <UDivider class="py-4"/>

        <div class="md:flex md:flex-row">
            <div class="md:w-1/2">
              <div  class="m-3 hidden md:block">
                    <UButton
                        @click="handleSave"
                        :loading="isSave || isLoad"
                        color="green"
                    >
                        Save Order
                    </UButton>
                </div>
               
    
                <div class="m-3 md:hidden ">
                    <UButton
                        @click="handleNewProduct"
                    >
                        Add Product
                    </UButton>
                </div>

              <UPageCard class="m-3">
                <AddProductTable @product-selected="handleProductSelected" @clicked="isOpenAdd = true"/>
              </UPageCard>

              <div class="m-3">
                    <UButton
                        @click="handleSave"
                        :loading="isSave || isLoad"
                        color="green"
                    >
                        Save Order
                    </UButton>
                </div>
              
            </div>
            

            <div class="hidden md:flex md:flex-col md:w-1/2">
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
                        :editBrand="selectedProduct?.brand"
                        :editDescription="selectedProduct?.description"
                        :editCategory="selectedProduct?.categoryId"
                        :editSubcategory="selectedProduct?.subcategoryId"
                        @update="createValue" />
                </UPageCard>

                <!-- <UPageCard class="m-3" id="Variants">
                    <AddProductVariants @update="variantValue" />
                </UPageCard> -->

               
                  <div v-for="(variant, index) in ( selectedProduct?.variants)" :key="variant.id" class="mb-3">
                    <UPageCard class="m-3" id="Variants">
                    <div class="flex justify-between items-centerp-3 rounded-lg">
                      <div class="text-xl mb-4">Variant {{index+1}}</div>
                     
                      <UButton
                        @click="removeVariant(index)"
                        variant="outline"
                        color="red"
                      >Remove
                      </UButton>
                    </div>
                    <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
                    <AddProductVariants   
                      ref="variantRef"
                      :id="selectedProduct?.variants[index]?.id"
                      :editName="selectedProduct?.variants[index]?.name " 
                      :editCode="selectedProduct?.variants[index]?.code || variants[0]?.code"
                      :editQty="selectedProduct?.variants[index]?.qty"
                      :editsPrice="selectedProduct?.variants[index]?.sprice || variants[0]?.sprice"
                      :editpPrice="selectedProduct?.variants[index]?.pprice || variants[0]?.pprice"
                      :editdPrice="selectedProduct?.variants[index]?.dprice || variants[0]?.dprice"
                      :editDiscount="selectedProduct?.variants[index]?.discount || variants[0]?.discount"
                      :editItems="selectedProduct?.variants[index]?.items"
          
                      @update="updateVariant(index,$event)" />
                      <AddProductMedia
                      v-if="variantInputs?.images"
                      ref="mediaRefs"
                      :editFile="selectedProduct && selectedProduct.variants[index]?.images"
                      :index="index" 
                      @update="fileValue"
                    />
                  </UPageCard>
                  </div>

                <UButton
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
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
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
    
        <BarcodeComponent v-if="barcodes.length" :barcodes="barcodes" />
      
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
                    <UButton
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                        :loading="isLoad"
                    >
                        Add Product
                    </UButton>
                </div>
                <div v-else class="m-3">
                    <UButton
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleEdit"
                        :loading="isLoad"
                    >
                        Edit Product
                    </UButton>
                </div>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpenAdd = false" />
          </div>
        </template>
      <div>
        

             
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
                 
          

                <div v-for="(variant, index) in ( selectedProduct?.variants)" :key="variant.id" class="mb-3">
                    <UPageCard class="m-3" id="Variants">
                    <div class="flex justify-between items-centerp-3 rounded-lg">
                      <div class="text-xl mb-4">Variant {{index+1}}</div>
                     
                      <UButton
                        @click="removeVariant(index)"
                        variant="outline"
                        color="red"
                      >Remove
                      </UButton>
                    </div>
                    <hr class="h-px my-4 bg-gray-200 border-0 dark:bg-gray-700" />
                    <AddProductVariants   
                      ref="variantRef"
                      :id="selectedProduct?.variants[index]?.id"
                      :editName="selectedProduct?.variants[index]?.name " 
                      :editCode="selectedProduct?.variants[index]?.code || variants[0]?.code"
                      :editQty="selectedProduct?.variants[index]?.qty"
                      :editsPrice="selectedProduct?.variants[index]?.sprice || variants[0]?.sprice"
                      :editpPrice="selectedProduct?.variants[index]?.pprice || variants[0]?.pprice"
                      :editdPrice="selectedProduct?.variants[index]?.dprice || variants[0]?.dprice"
                      :editDiscount="selectedProduct?.variants[index]?.discount || variants[0]?.discount"
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

                <UButton
                    @click="addVariant"
                    color="green"
                    block
                  >
                    + Add Variant
                  </UButton>


                <UPageCard class="m-3" id="Live">
                    <AddProductLive @update="liveValue" />
                </UPageCard>

                <div v-if="clearInputs" class="m-3">
                    <UButton
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleAdd"
                        :loading="isLoad"
                    >
                        Add Product
                    </UButton>
                </div>
                <div v-else class="m-3">
                    <UButton
                        class="rounded-md me-3 dark:text-gray-900 bg-primary-400 hover:bg-primary-500 px-3 py-2 text-sm font-semibold text-white shadow-sm"
                        @click="handleEdit"
                        :loading="isLoad"
                    >
                        Edit Product
                    </UButton>
                </div>
            </div>   
      </UCard>
    </UModal>
       
       
    </UDashboardPanelContent>

</template>