<script setup lang="ts">
const companyScope = useCompanyScope('form', true);
await companyScope.ready;
const $fetch = companyScope.fetch;

import AwsService from '~/composables/aws';
import { v4 as uuidv4 } from 'uuid';
import { useFindUniqueCategory } from '~/lib/company-hooks/category';
import { useUpdateDistributorCompany } from '~/lib/company-hooks/distributor-company';
import { useCreateDistributorCredit, useUpdateManyDistributorCredit, useDeleteManyDistributorCredit } from '~/lib/company-hooks/distributor-credit';
import { useCreateDistributorPayment, useUpdateManyDistributorPayment, useDeleteManyDistributorPayment } from '~/lib/company-hooks/distributor-payment';
import { useDeleteManyItem } from '~/lib/company-hooks/item';
import { useCreateProduct } from '~/lib/company-hooks/product';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder, useFindUniquePurchaseOrder } from '~/lib/company-hooks/purchase-order';
import { useUpsertVariant } from '~/lib/company-hooks/variant';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
import type { paymentType as PType } from '@prisma/client';
import { useQueryClient } from '@tanstack/vue-query';
const queryClient = useQueryClient();
const { invalidateModels } = useModelCache();
const { printLabel } = usePrint();
const router = useRouter();
const toast = useToast();
const useAuth = () => companyScope.auth;
const isAdd = ref(false);
const settledMap = ref(new Map());
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
  items: {id: string; size: string | null; qty: number | undefined}[];
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



const route = useRoute();
const poId = computed(() => String(route.query.poId || ''));
const isEdit = computed(() => String(route.query.isEdit || ''));
const oldPaymentType = ref<string>('');


const CreateProduct = useCreateProduct({
  invalidate: false, // we'll manually invalidate

  onMutate: async (newProduct) => {
  const purchaseOrderId = newProduct.data.purchaseorder?.connect?.id

const cacheKey = [
    'zenstack', 'PurchaseOrder', 'findUnique',
    {
      where: { id: purchaseOrderId },
      include: { products: { include: { variants: { include: { items: true } } } } }
    },
    {
      infinite: false,
      optimisticUpdate: true
    }
]


  const previous = queryClient.getQueryData(cacheKey)
  settledMap.value.set(newProduct.data.id, false);
  // ✅ Transform payload to match cached DB structure
  const optimisticProduct = {
    id: newProduct.data.id,
    name: newProduct.data.name,
    brandId: newProduct.data.brand?.connect?.id ?? null,
    description: newProduct.data.description,
    status: newProduct.data.status,
    companyId: newProduct.data.company?.connect?.id ?? null,
    categoryId: newProduct.data.category?.connect?.id ?? null,
    subcategoryId: newProduct.data.subcategory?.connect?.id ?? null,
    purchaseorderId: purchaseOrderId,
    variants: newProduct.data.variants?.create?.map(v => ({
      id: v.id,
      name: v.name,
      unit: v.unit ?? 'Nos',
      sprice: v.sprice,
      pprice: v.pprice,
      dprice: v.dprice,
      discount: v.discount,
      status: v.status,
      tax: v.tax,
      images: v.images ?? [],
      companyId: v.company?.connect?.id ?? null,
      productId: newProduct.data.id,
      items: v.items?.create?.map(i => ({
        id: i.id,
        size: i.size,
        qty: i.qty,
        companyId: i.company?.connect?.id ?? null,
        variantId: v.id
      })) ?? []
    })) ?? []
  }

  if (previous && typeof previous === 'object') {
   
    queryClient.setQueryData(cacheKey, {
      ...previous,
      products: [...(previous.products ?? []), optimisticProduct]
    })
  }

  return { previous, cacheKey, productId: optimisticProduct.id }
},

  onError: (_err, _newData, ctx) => {
    if (ctx?.previous) {
      queryClient.setQueryData(ctx.cacheKey, ctx.previous)
    }
  },

  onSettled: (_data, _error, _vars, ctx) => {
    settledMap.value.set(ctx?.productId, true);
    if (ctx?.cacheKey) {
      queryClient.invalidateQueries({
        queryKey: ctx.cacheKey,
        exact: true
      })
    }
  }
})

const CreatePurchaseOrder = useCreatePurchaseOrder({ optimisticUpdate: true });
const CreateDistributorCredit = useCreateDistributorCredit({ optimisticUpdate: true });
const UpdateManyDistributorCredit = useUpdateManyDistributorCredit({ optimisticUpdate: true });
const DeleteManyDistributorCredit = useDeleteManyDistributorCredit({ optimisticUpdate: true });

const CreateDistributorPayment = useCreateDistributorPayment({ optimisticUpdate: true });
const UpdateManyDistributorPayment = useUpdateManyDistributorPayment({ optimisticUpdate: true });
const DeleteManyDistributorPayment = useDeleteManyDistributorPayment({ optimisticUpdate: true });

const UpdateDistributorCompany = useUpdateDistributorCompany({ optimisticUpdate: true });
const UpdatePurchaseOrder = useUpdatePurchaseOrder({ optimisticUpdate: true });
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
const live = ref<boolean>();
let files = reactive<ImageData[]>([]);
const category = ref({});
const subcategory = ref('');

const barcodes = ref<BarcodeItem[]>([]);

const distributorId = ref('');
const paymentType = ref('');
const purchaseAccountingAccounts = ref<Record<string,string>>({});
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

const { data: categoryTax } = useFindUniqueCategory({
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

watch(category, (newProduct) => {
  console.log('Selected product updated:', newProduct);
}, { deep: true });

const updateVariant = (index,data: any) => {
  variants.value[index] = { ...variants.value[index], ...data };
  console.log('Updated variant:', variants.value[index]);
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
  console.log('Selected product:', selectedProduct.value);
  clearInputs.value = false;
};

const handleDistributorValue = (data:any) => {
  purchaseAccountingAccounts.value = data.accountingAccounts || {};
  console.log('Distributor data received:', data);
  distributorId.value = data.distributorId;
  paymentType.value = data.paymentType;
  oldPaymentType.value = data.oldPaymentType;
  billNo.value = data.billNo
  deliveryType.value = data.deliveryType
  totalAmount.value = data.total
  discount.value = data.discount
  tax.value = data.taxPercent
  adjustment.value = data.adjustment
  billDate.value = data.billDate

};

const handleAdd = async (e: Event) => {

  isLoad.value = true
  e.preventDefault();
  try {

    if (process.client && typeof navigator !== 'undefined' && !navigator.onLine) {
         toast.add({
           title: 'No internet connection',
           color: 'red',
         });
         throw new Error('No internet connection')
       }


    // if (!name.value || name.value.trim() === '') {
    //   toast.add({
    //     title: 'Please fill product name',
    //     color: 'red',
    //   });
    //   return;
    // }
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
          title: `In variant : Discount price cannot be greater than selling price`,
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
  console.log(variants.value)

    const productRes = CreateProduct.mutate({
      data: {
        id: uuidv4(),
        name: name.value || '',
        description: description.value || '',
        status: live.value ?? undefined,
        company: {
          connect: {
            id: useAuth().session.value?.companyId,
          },
        },
        purchaseorder: {
          connect: { id: poId.value },
        },
        ...(category.value && {
          category: { connect: { id: category.value.id } }
        }),
        ...(brand.value && {
          brand: { connect: { id: brand.value } }
        }),
        ...(subcategory.value && {
          subcategory: { connect: { id: subcategory.value } }
        }),
        variants: {
          create: variants.value.map((variant) => {
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
                id: uuidv4(),
                  size: size.size || null,
                  qty: size.qty || 0,
                  initialQty: size.qty || 0,
                  company: {
                    connect: { id: useAuth().session.value?.companyId },
                  },
                }))
              : [];

            return {
              id: uuidv4(),
              name: variant.name || '',
              ...(variant.code && { code: variant.code }),
              unit: variant.unit || 'Nos',
              sprice: variant.sprice || 0,
              pprice: variant.pprice || 0,
              dprice: variant.dprice || 0,
              discount: variant.discount || 0,
              deliveryType: deliveryType.value || 'trynbuy',
              status: true,
              sizeLabel: variant.sizeLabel || 'Size',
              tax,
              ...(variantInputs?.value.images && { images: (variant.images || [])
                .sort((a, b) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
                .map((file) => file.uuid),}),
              company: {
                connect: { id: useAuth().session.value?.companyId },
              },
              ...(itemsToCreate.length > 0 && {
                items: {
                  create: itemsToCreate,
                }
              })
            };

          })
        }
      },
      select: { id: true }
    });


//     const productRes = await $fetch('/api/products/create', {
//   method: "POST",
//   body: {
//     payload: {
//       name: name.value,
//       brand: brand.value,
//       description: description.value,
//       status: live.value
//     },
//     companyId: useAuth().session.value?.companyId,
//     poId: poId.value,
//     category: category.value,
//     subcategory: subcategory.value,
//     variants: variants.value,
//     categoryTax: categoryTax.value,
//     deliveryType: deliveryType.value
//   }
// })

  

    toast.add({
      title: 'Product Added!',
      id: 'modal-success',
    });
      handleReset();
    isOpenAdd.value = false
  } catch (err: any) {
    console.log(err.info?.message ?? err);
  }finally{
    isLoad.value = false
  }
 
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
          title: `In variant : Discount price cannot be greater than selling price`,
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
        return { base64, uuid: file.uuid };
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

    settledMap.value.set(productId, false);
    try {
      await $fetch('/api/products/update', {
        method: 'POST',
        body: {
          productId,
          product: {
            name: name.value || '',
            description: description.value || '',
            status: live.value ?? null,
            categoryId: category.value?.id || null,
            brandId: brand.value || null,
            subcategoryId: subcategory.value || null,
          },
          variants: variants.value.map(v => ({
            ...v,
            images: (v.images || []).map(file => typeof file === 'string' ? file : file.uuid),
            items: v.items.map(item => ({
              ...item,
              qty: item.qty ?? 0,
              initialQty: item.qty ?? 0,
              updateInitialQty: Number(item.qty ?? 0) !== Number(selectedProduct.value?.variants
                ?.flatMap((variant: any) => variant.items || []).find((saved: any) => saved.id === item.id)?.initialQty ?? 0),
            })),
          })),
          categoryTax: categoryTax.value,
          updateImages: !!variantInputs.value?.images,
          syncPurchaseOrder: true,
        },
      });
      await invalidateModels('Product', 'Variant', 'Item', 'PurchaseOrder');
    } finally {
      settledMap.value.set(productId, true);
    }

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

watch(variants, (newVariants) => {
  // Handle variant changes
  console.log("Variants updated:", newVariants);
},{immediate: true, deep: true}); 

const queryParams = computed(() => (
  {
  where: { id: poId.value },
  include: {
    products: { 
      include: { 
        subcategory: true,
        category: true,
        brand: true,
        variants: { 
          include: { 
            items: true 
          } 
        } 
      }
     },
  },
}
));

const {
  data: items,
  isLoading,
  error,
  refetch:itemRefetch,
} = useFindUniquePurchaseOrder(queryParams)

const { selectOwnerAndReload } = useOrganizationActions();
watch(items, record => { if (record?.companyId) void selectOwnerAndReload(record.companyId); }, { immediate: true });


const addProductTopBarRef = ref(null)


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

const handleSave = async () => {
  isSave.value = true

  try {
    console.log('🚀 handleSave started')

    /* ---------------------------------
       0️⃣ NORMALIZE BILL DATE
    ---------------------------------- */
    const createdAtDate = billDate.value
      ? new Date(billDate.value)
      : new Date()

    /* ---------------------------------
       1️⃣ VALIDATION
    ---------------------------------- */
    if (!items.value?.products) {
      throw new Error('No items found')
    }

    /* ---------------------------------
       2️⃣ BARCODE GENERATION
    ---------------------------------- */
    barcodes.value = items.value.products.flatMap(product =>
      product.variants.flatMap(variant =>
        variant.items.flatMap(item =>
          item.qty === 0
            ? []
            : Array.from({ length: item.qty ?? 1 }, () => ({
                itemId: item.id,
                companyId: useAuth().session.value?.companyId,
                barcode: item.barcode ?? '',
                code: variant.code ?? '',
                shopname: useAuth().session.value?.companyName,
                productName: product.name || product.category?.name || '',
                brand: product.brand?.name || product.subcategory?.name || '',
                name: variant.name || '',
                sprice: variant.sprice,
                ...(variant.sprice !== variant.dprice && {
                  dprice: variant.dprice
                }),
                size: item.size,
              }))
        )
      )
    )

    isOpen.value = true

    /* ---------------------------------
       3️⃣ PAYMENT / CREDIT LOGIC
    ---------------------------------- */
    await $fetch('/api/purchaseorder/update', {
      method: 'POST',
      body: {
        poId: poId.value,
        payment: {
          paymentType: paymentType.value || null,
          distributorId: distributorId.value || null,
          billNo: billNo.value || null,
          totalAmount: totalAmount.value || subTotalAmount.value,
          subTotalAmount: subTotalAmount.value,
          discount: discount.value || 0,
          tax: tax.value || 0,
          adjustment: adjustment.value || 0,
          createdAt: createdAtDate,
          accountingAccounts: purchaseAccountingAccounts.value,
        },
      },
    })
    await invalidateModels('PurchaseOrder', 'DistributorPayment')
    await itemRefetch()
    oldPaymentType.value = paymentType.value
    toast.add({ title: 'Purchase and accounting saved', color: 'green' })

  } catch (error) {
    console.error('❌ Failed to save purchase order', error)
  } finally {
    isSave.value = false
    console.log('✅ handleSave finished')
  }
}


const handleReset = () => {

  clearInputs.value = true
  createRef.value?.resetForm()
  variantRef.value.forEach((refInstance:any) => {
    refInstance?.resetForm();
  });
  mediaRefs.value.forEach((media:any) => media?.resetForm());
  variants.value = [{
    id:'',
    key:'',
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
    brandId:'',
    brand:{},
    description: '',
    files: [], // Reset reactive array
    category: {},
    subcategory: {},
    categoryId: '',
    subcategoryId: '',
    variants: [{
        id:'',
        key:'',
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
     isAdd.value =true
     if(isEdit.value){
      router.push(`/distributor/purchaseOrder`)
     }else{
      router.push(`/products`)
     }
   
         resetTopBar()
    isAdd.value =false
    isOpen.value = false
}


const handleAddNew = async() => {
     isAdd.value =true
    
    const res = await $fetch('/api/purchaseorder/create', {
      method: 'POST',
    });
   router.push(`/products/purchase?poId=${res?.id}`)
    isAdd.value =false
    isOpen.value = false
}

const handleNewProduct = () => {
  isOpenAdd.value = true
}





watch(() => companyScope.auth.session.value?.variantInputs, value => { variantInputs.value = value; });
</script>

<template>
    <UDashboardPanelContent>
      <CompanyFormField toolbar />
       
          <AddProductTopBar  ref="addProductTopBarRef" @update="handleDistributorValue" :totalAmount="subTotalAmount" :distributorId="items?.distributorId" :paymentType="items?.paymentType" :billNo="items?.billNo" :discount="items?.discount" :tax="items?.tax" :adjustment="items?.adjustment" :billDate="items?.createdAt" />   

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
                <AddProductTable @product-selected="handleProductSelected" @clicked="isOpenAdd = true" @total-amount = "(data) => subTotalAmount = data" :settledMap="settledMap" :poId="poId"/>
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
            

            <div class=" md:flex md:flex-col md:w-1/2">
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
                        hide-custom-fields
                        @update="createValue" />
                </UPageCard>

                <!-- <UPageCard class="m-3" id="Variants">
                    <AddProductVariants quantity-label="Initial quantity" @update="variantValue" />
                </UPageCard> -->

               
                  <div v-for="(variant, index) in ( selectedProduct?.variants)" :key="variant.key" class="mb-3">
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
                    <AddProductVariants quantity-label="Initial quantity"
                      ref="variantRef"
                      :id="selectedProduct?.variants[index]?.id"
                      :editName="selectedProduct?.variants[index]?.name " 
                      :editCode="selectedProduct?.variants[index]?.code || variants[0]?.code"
                      :editQty="selectedProduct?.variants[index]?.qty"
                      :editUnit="selectedProduct?.variants[index]?.unit || variants[0]?.unit"
                      :editsPrice="selectedProduct?.variants[index]?.sprice || variants[0]?.sprice"
                      :editpPrice="selectedProduct?.variants[index]?.pprice || variants[0]?.pprice"
                      :editdPrice="selectedProduct?.variants[index]?.dprice || variants[0]?.dprice"
                      :editDiscount="selectedProduct?.variants[index]?.discount || variants[0]?.discount"
                      :editItems="selectedProduct?.variants[index]?.items"
                      :editSizeLabel="selectedProduct?.variants[index]?.sizeLabel"
                      hide-custom-fields

                      @update="updateVariant(index,$event)" />
                      <AddProductMedia
                      v-if="variantInputs?.images"
                      ref="mediaRefs"
                      :editFile="selectedProduct && selectedProduct.variants[index]?.images"
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


       
    </UDashboardPanelContent>

</template>
