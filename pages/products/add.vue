<script setup lang="ts">
import AwsService from '~/composables/aws';
import { v4 as uuidv4 } from 'uuid';
import { useCreateProduct,useCreatePurchaseOrder,   useCreateDistributorCredit,useDeleteManyItem,useUpsertVariant,useUpdateDistributorCredit, useDeleteDistributorCredit, useUpdateProduct,useUpdatePurchaseOrder, useFindUniqueCategory,useFindUniquePurchaseOrder, useUpdateDistributorCompany} from '~/lib/hooks';
import BarcodeComponent from "@/components/BarcodeComponent.vue";
import type { paymentType as PType } from '@prisma/client';
import { useQueryClient } from '@tanstack/vue-query';
const queryClient = useQueryClient();
const { printLabel } = usePrint();
const router = useRouter();
const toast = useToast();
const useAuth = () => useNuxtApp().$auth;
const isAdd = ref(false);
const settledMap = ref(new Map());
const variantInputs = ref(useAuth().session.value?.variantInputs)
const deliveryType = ref<string>('')
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
    brand: newProduct.data.brand,
    description: newProduct.data.description,
    status: newProduct.data.status,
    companyId: newProduct.data.company?.connect?.id ?? null,
    categoryId: newProduct.data.category?.connect?.id ?? null,
    subcategoryId: newProduct.data.subcategory?.connect?.id ?? null,
    purchaseorderId: purchaseOrderId,
    variants: newProduct.data.variants?.create?.map(v => ({
      id: v.id,
      name: v.name,
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

const UpdateProduct = useUpdateProduct({

  invalidate: false, // we'll manually invalidate

  onMutate: async (updatedProductInput) => {
  const purchaseOrderId = poId.value;

  if (!purchaseOrderId) return;

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
  ];

  const previous = queryClient.getQueryData(cacheKey);


  if (!previous || typeof previous !== 'object') return;

  const input = updatedProductInput.data;
  const productId = updatedProductInput.where.id;
  settledMap.value.set(productId, false);
  // First, handle the product-level updates
  const updatedProducts = (previous.products ?? []).map(product => {
    if (product.id !== productId) return product;

    // Update the product fields
    const updatedProduct = {
      ...product,
      name: input.name ?? product.name,
      brand: input.brand ?? product.brand,
      description: input.description ?? product.description,
      status: input.status ?? product.status,
      companyId: input.company?.connect?.id ?? product.companyId,
      categoryId: input.category?.connect?.id ?? product.categoryId,
      subcategoryId: input.subcategory?.connect?.id ?? product.subcategoryId,
    };

    // Handle variants
    if (!input.variants) return updatedProduct;

    // First apply deleteMany (remove variants not in the input)
    const variantsToKeep = input.variants.upsert?.map(v => v.where.id) ?? [];
    let updatedVariants = product.variants.filter(v => 
      variantsToKeep.includes(v.id)
    );

    // Then handle upsert operations
    input.variants.upsert?.forEach(variantInput => {
      const existingVariantIndex = updatedVariants.findIndex(
        v => v.id === variantInput.where.id
      );

      const variantData = variantInput.update ?? variantInput.create;
      
      if (existingVariantIndex >= 0) {
        // Update existing variant
        const existingVariant = updatedVariants[existingVariantIndex];
        updatedVariants[existingVariantIndex] = {
          ...existingVariant,
          name: variantData?.name ?? existingVariant.name,
          sprice: variantData?.sprice ?? existingVariant.sprice,
          pprice: variantData?.pprice ?? existingVariant.pprice,
          dprice: variantData?.dprice ?? existingVariant.dprice,
          discount: variantData?.discount ?? existingVariant.discount,
          status: variantData?.status ?? existingVariant.status,
          tax: variantData?.tax ?? existingVariant.tax,
          images: variantData?.images ?? existingVariant.images,
        };

        // Handle items for this variant
        if (variantData?.items) {
          // First apply deleteMany (remove items not in the input)
          const itemsToKeep = variantData.items.upsert?.map(i => i.where?.id) ?? [];
          let updatedItems = existingVariant.items.filter(i => 
            i.id && itemsToKeep.includes(i.id)
          );

          // Then handle upsert operations for items
          variantData.items.upsert?.forEach(itemInput => {
            const existingItemIndex = updatedItems.findIndex(
              i => i.id === itemInput.where?.id
            );

            const itemData = itemInput.update ?? itemInput.create;
            
            if (existingItemIndex >= 0) {
              // Update existing item
              updatedItems[existingItemIndex] = {
                ...updatedItems[existingItemIndex],
                size: itemData?.size ?? updatedItems[existingItemIndex].size,
                qty: itemData?.qty ?? updatedItems[existingItemIndex].qty,
              };
            } else {
              // Add new item
              updatedItems.push({
                id: itemInput.where?.id ?? null,
                size: itemData?.size ?? null,
                qty: itemData?.qty ?? 0,
                companyId: useAuth().session.value?.companyId ?? null,
                variantId: variantInput.where.id,
              });
            }
          });

          updatedVariants[existingVariantIndex].items = updatedItems;
        }
      } else {
        // Add new variant
        const newVariant = {
          id: variantInput.where.id,
          name: variantData?.name ?? '',
          sprice: variantData?.sprice ?? 0,
          pprice: variantData?.pprice ?? 0,
          dprice: variantData?.dprice ?? 0,
          discount: variantData?.discount ?? 0,
          status: variantData?.status ?? true,
          tax: variantData?.tax ?? 0,
          images: variantData?.images ?? [],
          companyId: useAuth().session.value?.companyId ?? null,
          productId: productId,
          items: (variantData?.items?.upsert ?? []).map(itemInput => ({
            id: itemInput.where?.id ?? null,
            size: (itemInput.update ?? itemInput.create)?.size ?? null,
            qty: (itemInput.update ?? itemInput.create)?.qty ?? 0,
            companyId: useAuth().session.value?.companyId ?? null,
            variantId: variantInput.where.id,
          })),
        };
        updatedVariants.push(newVariant);
      }
    });

    return {
      ...updatedProduct,
      variants: updatedVariants,
    };
  });



  queryClient.setQueryData(cacheKey, {
    ...previous,
    products: updatedProducts
  });
  return { previous, cacheKey, productId : productId };
},

  onError: (_err, _newData, ctx) => {
    if (ctx?.previous) {
      queryClient.setQueryData(ctx.cacheKey, ctx.previous);
    }
  },

  onSettled: (_data, _error, _vars, ctx) => {
      settledMap.value.set(ctx?.productId, true);
    if (ctx?.cacheKey) {
      queryClient.invalidateQueries({
        queryKey: ctx.cacheKey,
        exact: true
      });
    }
  }
});


const CreatePurchaseOrder = useCreatePurchaseOrder({ optimisticUpdate: true });
const CreateDistributorCredit = useCreateDistributorCredit({ optimisticUpdate: true });
const UpdateDistributorCredit = useUpdateDistributorCredit({ optimisticUpdate: true });
const DeleteDistributorCredit = useDeleteDistributorCredit({ optimisticUpdate: true });

const UpdateDistributorCompany = useUpdateDistributorCompany({ optimisticUpdate: true });
const UpdatePurchaseOrder = useUpdatePurchaseOrder({ optimisticUpdate: true });
const awsService = new AwsService();
const selectedProduct: Ref<Product> = ref({
  id: uuidv4(), 
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
    key:'',
    name: '',
    code: '',
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
  distributorId.value = data.distributorId;
  paymentType.value = data.paymentType;
  billNo.value = data.billNo
  deliveryType.value = data.deliveryType
  totalAmount.value = data.total
  discount.value = data.discount
  tax.value = data.taxPercent
  adjustment.value = data.adjustment

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
        brand: brand.value || '',
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
              sprice: variant.sprice || 0,
              pprice: variant.pprice || 0,
              dprice: variant.dprice || 0,
              discount: variant.discount || 0,
              deliveryType: deliveryType.value || 'trynbuy',
              status: true,
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

const updatedProduct =  UpdateProduct.mutate({
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
          deliveryType: deliveryType.value || 'trynbuy',
          discount: v.discount || 0,
          status: true,
          images: v.images?.map(file => file.uuid) || [],
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
                initialQty: item.qty || 0,
              },
              create: {
                id:item.id,
                size: item.size || null,
                qty: item.qty || 0,
                initialQty: item.qty || 0,
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
          deliveryType: deliveryType.value || 'trynbuy',
          status: true,
             ...(variantInputs?.value.images && { images: (v.images || [])
                .sort((a, b) => (a.view === 'front' ? -1 : b.view === 'front' ? 1 : 0))
                .map((file) => file.uuid),}),
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
              initialQty: item.qty || 0,
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

watch(items, (newItems) => {
  if (newItems && newItems.paymentType) {
    oldPaymentType.value = newItems.paymentType;
  }
}, { immediate: true });

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
  console.log(items.value)
  isSave.value = true

  try {
    if (!items.value?.products) {
      throw new Error("No items found");
    }
    console.log("Items to save:", items.value.products);
 

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
                productName: product.name || product.category?.name || '',
                brand: product.brand || product.subcategory?.name || '' ,
                name: variant.name || '',
                sprice: variant.sprice,
                ...(variant.sprice !== variant.dprice && 
                {  dprice: variant.dprice }
              ),
                size: item.size,
            }))
        )
      )
    );

       console.log("PO ID:", barcodes.value);

    isOpen.value = true;
    UpdatePurchaseOrder.mutate({
      where: { id: poId.value }, 
      data: {
        ...(paymentType.value && {
          paymentType: paymentType.value as PType
        }),
        billNo: billNo.value || '',
        totalAmount:totalAmount.value,
        subTotalAmount: subTotalAmount.value,
        discount: discount.value,
        tax: tax.value,
        adjustment: adjustment.value
      }
    });


    if(distributorId.value){
      UpdateDistributorCompany.mutate({
      where: {
        distributorId_companyId: {
          distributorId: distributorId.value,
          companyId: useAuth().session.value?.companyId!,
        }
      },
      data: {
      
        purchaseOrders:{
          connect:{id:poId.value}
        },
      
      }
    });
    }
    const companyId = useAuth().session.value?.companyId!;
const distributorCompanyKey = {
  distributorId: distributorId.value,
  companyId
};

if (paymentType.value === 'CREDIT') {
  if (isEdit.value && oldPaymentType.value === 'CREDIT') {
    // ✏️ UPDATE existing credit
    await UpdateDistributorCredit.mutateAsync({
      where: {
        purchaseOrderId: poId.value
      },
      data: {
        amount: totalAmount.value,
        billNo: billNo.value
      }
    });
  } else {
    // ➕ CREATE new credit
    await CreateDistributorCredit.mutateAsync({
      data: {
        amount: totalAmount.value,
        billNo: billNo.value,
        distributorCompany: {
          connect: {
            distributorId_companyId: distributorCompanyKey
          }
        }
      }
    });
  }
} else {
  // ❌ PAYMENT TYPE IS NOT CREDIT
  if (isEdit.value && oldPaymentType.value === 'CREDIT') {
    // 🗑 DELETE existing credit
    await DeleteDistributorCredit.mutateAsync({
      where: {
        purchaseOrderId: poId.value
      }
    });
  }
}


  }catch (error) {
    console.error("Failed to save purchase order", error);
    // Consider adding user feedback here
  }
  finally{
    isSave.value = false
  }
};


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
    brand:'',
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
   

    isAdd.value =false
    isOpen.value = false
}


const handleAddNew = async() => {
     isAdd.value =true
    
    const res = await $fetch('/api/purchaseorder/create', {
      method: 'POST',
    });
   router.push(`/products/add?poId=${res?.id}`)
    isAdd.value =false
    isOpen.value = false
}

const handleNewProduct = () => {
  isOpenAdd.value = true
}



</script>

<template>
    <UDashboardPanelContent>
       
          <AddProductTopBar @update="handleDistributorValue" :totalAmount="subTotalAmount" :distributorId="items?.distributorId" :paymentType="items?.paymentType" :billNo="items?.billNo" :discount="items?.discount" :tax="items?.tax" :adjustment="items?.adjustment" />   

          <UDivider class="py-4"/>

        <div class="md:flex md:flex-row">
            <div class="md:w-1/2">
              <div  class="m-3 hidden md:block">
                    <UButton
                        @click="handleSave"
                        color="green"
                        :loading="isLoad && isSave"
                        :disabled="isSaveDisable"
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
                <AddProductTable @product-selected="handleProductSelected" @clicked="isOpenAdd = true" @total-amount = "(data) => subTotalAmount = data" :settledMap="settledMap"/>
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


    
    <UModal v-model="isOpenAdd">
      <UCard >
        <template #header>
          <div class="flex items-center justify-between">
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

<!-- 
                <UPageCard class="m-3" id="Live">
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
      </UCard>
    </UModal>
       
       
    </UDashboardPanelContent>

</template>