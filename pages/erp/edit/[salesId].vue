
<script setup>
import {
  useUpdateBill,
  useFindUniqueBill,
  useFindFirstItem,
  useFindManyCategory,
  useUpdateVariant,
  useUpdateItem,
  useCreateAccount,
  useFindManyAccount,
  useFindUniqueClient,
  useUpdateEntry,
  useCreateEntry,
  useDeleteManyEntry,
  useUpdateManyItem,
  useFindManyEntry,
} from '~/lib/hooks';

const UpdateBill = useUpdateBill();
const CreateAccount = useCreateAccount();
const UpdateVariant = useUpdateVariant();
const UpdateItem = useUpdateItem();
const UpdateEntry = useUpdateEntry();
const CreateEntry = useCreateEntry();
const DeleteManyEntry = useDeleteManyEntry();
const UpdateManyItem = useUpdateManyItem();
const useAuth = () => useNuxtApp().$auth;
const route = useRoute();
const toast = useToast();
const { printBill } = usePrint();
const router = useRouter();
const isTaxIncluded = useAuth().session.value?.isTaxIncluded;
const isPrint = ref(false);
const isSaving = ref(false);
const paymentOptions = ['Cash', 'UPI', 'Card','Credit']
const date = ref(new Date().toISOString().split('T')[0]);
const discount = ref(0);
const accountLoaded = ref(false);
const subtotal = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.qty * item.rate || 0), 0);
});
const grandTotal = computed(() => {
  const baseTotal = items.value.reduce((sum, item) => sum + (item.value || 0), 0);

  if (discount.value < 0) {
    return parseFloat((baseTotal - Math.abs(discount.value)).toFixed(2));
  } else {
    const discounted = baseTotal - (baseTotal * discount.value) / 100;
    return parseFloat(discounted.toFixed(2));
  }
});

const returnAmt = ref(0);
const paymentMethod = ref(null);
const voucherNo = ref('');
const phoneNo = ref('');
const clientName = ref('');
const points = ref(0);
const clientId = ref('');
const scannedBarcode = ref("");
const categoryStore = useCategoryStore()
let printData = {}
const showSplitModal = ref(false)
const splitPayments = ref([
  { method: '', amount: 0 }
])
const qtyInputs = ref([]);
const barcodeInputs = ref([]);
const discountref = ref();
const paymentref = ref();
const saveref = ref();
const isOpen = ref(false);
const account = ref({
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
});
const selected = ref(null);


const items = ref([
  { id:'', variantId:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0 },
]);


const columns = ref([
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'qty', label: 'QTY' },
  { key: 'rate', label: 'RATE' },
  { key: 'discount', label: 'DISC %' },
  { key: 'tax', label: 'TAX%' },
  { key: 'value', label: 'VALUE' },

]);

const resizableTable = ref(null); // Reference to the table element

let isResizing = false;
let startX = 0;
let startWidth = 0;
let columnIndex = 0;



watch(selected, (newSelected) => {
  if(newSelected && accountLoaded.value){
    paymentMethod.value = 'Credit'
  }
  else{
     accountLoaded.value = true
  }

})


watch(items, async () => {
  for (let index = 0; index < items.value.length; index++) {
    const item = items.value[index];
    
    // ---------- Step 1: Calculate discounted rate ----------
    let discountedRate = item.rate;

    if (item.discount < 0) {
      discountedRate -= Math.abs(item.discount);
    } else {
      discountedRate -= (discountedRate * item.discount) / 100;
    }

    // ---------- Step 2: Update tax according to value/qty ----------

   

    if (item.category[0]?.id) {
      const category = categoryStore.getCategoryById(item.category[0].id)
     
      if( category){
        const { taxType, fixedTax, thresholdAmount, taxBelowThreshold, taxAboveThreshold } = category;
        console.log(taxType)
      if (taxType === 'FIXED') {
        item.tax = fixedTax ?? 0;
      } else {
        const effectiveValue = item.value / (item.qty || 1); // avoid division by zero

        if (effectiveValue > thresholdAmount) {
          item.tax = taxAboveThreshold ?? 0;
        } else {
          item.tax = taxBelowThreshold ?? 0;
        }
      }
      }
    }

    
    // ---------- Step 3: Calculate base value ----------
    let baseValue = discountedRate * item.qty;
    
    if (!isTaxIncluded) {
      baseValue += (baseValue * item.tax) / 100;
    }

    item.value = Math.max(baseValue, 0);
  }
}, { deep: true });


const startResize = (index, event) => {
  isResizing = true;
  columnIndex = index;
  startX = event.clientX;
  startWidth = resizableTable.value.querySelectorAll('th')[index].offsetWidth;

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
};

const handleResize = (event) => {
  if (!isResizing) return;

  const currentX = event.clientX;
  const deltaX = currentX - startX;
  const newWidth = startWidth + deltaX;

  // Update the width of the column
  const th = resizableTable.value.querySelectorAll('th')[columnIndex];
  th.style.width = `${newWidth}px`;

  // Update the width of the corresponding cells
  const tds = resizableTable.value.querySelectorAll(`td:nth-child(${columnIndex + 1})`);
  tds.forEach((td) => {
    td.style.width = `${newWidth}px`;
  });
};

const stopResize = () => {
  isResizing = false;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
};

const addNewRow = async (index) => {
  items.value.push({
    id: '',
    variantId:'',
    sn: items.value.length + 1,
    barcode: '',
    category: [], 
    size:'',
    name: '',
    qty: 1,
    rate: 0,
    discount: 0,
    tax: 0,
    value: 0, 
    sizes:{},
    totalQty:0 
  });

  // Wait for Vue to update the DOM
  await nextTick();

  // Get the new barcode input component
  const component = barcodeInputs.value[index + 1];
  const input = component.$el.querySelector("input");
  input.focus();
  
};


const removeRow = (barcode,index) => {
  if (!barcode){
    if (items.value.length > 1) {
    items.value.splice(index, 1);
    // Reorder serial numbers after deletion
    items.value.forEach((item, i) => {
      item.sn = i + 1;
    });
  }
  const component = barcodeInputs.value[index - 1 ];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.focus();
    } else {
      console.warn("Input element not found inside barcodeInputs:", component.$el);
    }
  } else {
    console.warn("Barcode input component is not available:", component);
  }
  }

  
};

onMounted(async () => {
  await billRefetch()
  // Initialize column widths (optional)
  const ths = resizableTable.value.querySelectorAll('th');
  ths.forEach((th) => {
    th.style.width = `${th.offsetWidth}px`;
  });
});

const args = computed(() => ({
  where: {
    phone: `+91${phoneNo.value}`,
    companies: {
      some: {
        companyId: useAuth().session.value?.companyId,
      },
    },
  },
}));


 const {
  data: client,
  isLoading:isClientLoading,
  error,
  refetch:refetchClient,
} = useFindUniqueClient(
  args,
  { enabled: false } // disabled by default
);

const {
    data: categories,
} = useFindManyCategory(
  {
    where:{companyId:useAuth().session.value?.companyId},
    select:{
      id:true,
      name:true
    }
}
);


const itemargs = computed(() => ({
  where: { 
    barcode: scannedBarcode.value,
    status:'in_stock',
    companyId:useAuth().session.value?.companyId || ''

   },
  select: {
    id: true, 
    size:true,
    variant: {
      select: {
        id:true,
        sprice:true,
        name: true, 
        qty:true,
        sizes:true,
        product: {
          select: {
            name: true, 
            categoryId:true  
          }
        }
      }
    }
  }
}));


const findManyEntryargs = computed(() => ({
  
  where: {
    billId: route.params.salesId,
    id: {
      notIn: items.value
        .filter(item => item.entryId)
        .map(item => item.entryId),
    },
  },
  select: {
    id: true,
    itemId: true,
    qty: true,
    size:true,
    variantId: true,
    return:true,
    variant:{
      select:{
        sizes:true
      }
    }
  },

}));




const billArgs = computed(() => ({
  where: { id: route.params.salesId },
  select: {
    createdAt:true,
    invoiceNumber: true,
    subtotal: true,
    discount: true,
    tax: true,
    grandTotal: true,
    deliveryFees: true,
    paymentMethod: true,
    paymentStatus: true,
    notes:true,
    returnDeadline: true,
    accountId:true,
    type: true,
    status: true,
    address: {
        select:{
            street:true,
            locality:true,
            city:true,
            state:true,
            pincode:true
        }
    },
    client: {
        select:{
            name:true,
            phone:true,
            id:true,
        }
    },
    entries: {  
      select: {
        id:true,
        barcode:true,
        name: true,
        qty: true,
        rate: true,
        discount: true,
        tax: true,
        value: true,
        size: true,
        outOfStock: true,
        categoryId:true,
        item:{
          select:{
            id:true,
            size:true,
          }
        },
        variant: {  
          select: {
            id:true,
            images: true,
          }
        }
      }
    }
  }
}));


const { data: bill ,refetch:billRefetch} = useFindUniqueBill(billArgs,{enabled:false});
const { data: itemdata ,refetch:itemRefetch} = useFindFirstItem(itemargs,{enabled:false});
const {data: entriesToDelete,refetch:entriesToDeleteRefetch} =  useFindManyEntry(findManyEntryargs,{enabled:false});


watch(entriesToDelete, (newBill) => {
  console.log(newBill)
})

const handleEnterBarcode = (barcode,index) => {
  if(!barcode){
    const component = discountref.value;
    const input = component.$el.querySelector("input");
    input.focus();
    input.select();
    
  }else{
    fetchItemData(barcode, index);
  const component = qtyInputs.value[index];
  const input = component.$el.querySelector("input");
  input.focus();
  input.select();
  }
 
};

const handleEnterMainDiscount = () => {
  const component = paymentref.value;
  const select = component.$el.querySelector("select");
  select.focus();
};

const handleEnterPayment = () => {
  const component = saveref.value;
  const button = component.$el;
  button.focus();
};



watch(() => bill.value, (newData) => {
  console.log(newData)
  if (!newData || !newData.entries) return;
  discount.value = newData.discount
    selected.value = newData.accountId
    clientId.value = newData.client?.id
    clientName.value = newData.client?.name
    phoneNo.value = newData.client?.phone
  paymentMethod.value = newData.paymentMethod
   date.value = new Date(newData.createdAt).toISOString().split('T')[0]
  items.value = newData.entries.map((entry, index) => {
    return {
      entryId: entry.id || '',
      id:entry.item?.id || '',
      variantId: entry.variant?.id || '',
      sn: index + 1,
      name:entry.name || '',
      barcode: entry.barcode || '', 
      category:  categories.value.filter(category =>category.id === entry.categoryId),
      size: entry.item?.size || '',
      sizes: entry.sizes || null,
      qty: entry.qty || 1,
      rate: entry.rate || 0,
      discount: entry.discount || 0,
      tax: entry.tax || 0,
      value: entry.value || 0,
    };
  });
}, { deep: true, immediate: true });



const fetchItemData = async (barcode, index) => {
  if (!barcode) return;

  scannedBarcode.value = barcode;
  console.log(scannedBarcode.value);

  await itemRefetch();

  if (itemdata.value) {
    
    const categoryId = itemdata.value.variant.product.categoryId;

    
    items.value[index].entryId = itemdata.value.entry?.id || '';
    items.value[index].id = itemdata.value.item?.id || '';
    items.value[index].size = itemdata.value.size || '';
    items.value[index].name = `${itemdata.value.variant?.name}-${itemdata.value.variant.product.name}` || '';
    items.value[index].category = categories.value.filter(category =>category.id === categoryId);
    items.value[index].rate = itemdata.value.variant?.sprice || 0;
    items.value[index].totalQty = itemdata.value.variant?.qty || 0;
    items.value[index].sizes = itemdata.value.variant?.sizes || null;
    items.value[index].variantId = itemdata.value.variant?.id || '';
  } else {
    console.warn("itemdata is undefined");
  }
};




const handleEdit = async () => {
  isSaving.value = true
  try {
    items.value = items.value.filter(item =>
    item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
  );

  if (items.value.length === 0) {
    throw new Error(`No valid items to bill.`);
    return;
  }

  items.value.forEach((item, index) => {
    if (!item.category || !item.category[0]?.id) {
      throw new Error(`No category in entry ${index + 1}`);
    }
  });
    // Separate items into those with an ID and those without
    const itemsWithId = items.value.filter(item => item.entryId);
    const itemsWithoutId = items.value.filter(item => !item.entryId);

    // Separate create and update logic

    // Create entries for new items (itemsWithoutId)
    const createPromises = itemsWithoutId.map(item => {
      return CreateEntry.mutateAsync({
        data: {
          barcode: item.barcode || undefined,
          qty: item.qty,
          rate: item.rate,
          name: item.name,
          discount: item.discount || 0,
          ...(item.variantId && { variant: { connect: { id: item.variantId } } }),
          value: item.value,
          ...(item.category?.[0]?.id && {
            category: { connect: { id: item.category[0].id } },
          }),
          ...(item.id && {
            item: { connect: { id: item.id } },
          }),
          bill: {
            connect: {
              id: route.params.salesId,
            },
          },
        },
      });
    });

    // Update entries for items with an ID (itemsWithId)
    const updatePromises = itemsWithId.map(item => {
      return UpdateEntry.mutateAsync({
        where: { id: item.entryId },
        data: {
          barcode: item.barcode || undefined,
          qty: item.qty,
          rate: item.rate,
          name: item.name,
          discount: item.discount || 0,
          ...(item.variantId && { variant: { connect: { id: item.variantId } } }),
          tax: item.tax,
          value: item.value,
          ...(item.category?.[0]?.id && {
            category: { connect: { id: item.category[0].id } },
          }),
          ...(item.id && {
            item: { connect: { id: item.id } },
          }),
          bill: {
            connect: {
              id: route.params.salesId,
            },
          },
        },
      });
    });

   // Step 1: Find entries to delete
await entriesToDeleteRefetch()
console.log(entriesToDelete)
const entryIds = entriesToDelete.value?.filter(e=>e.id).map(e => e.id);

// Step 2: Extract itemIds and entryIds
// Filter entries with return === true
const entriesReturned = entriesToDelete.value?.filter(e => e.return === true) ?? [];
const returnedItemIds = entriesReturned.filter(e => e.itemId).map(e => e.itemId);
const returnedVariantDetails = entriesReturned.map(e => ({
  variantId: e.variantId,
  qty: e.qty,
  size: e.size ?? null,
  sizes: e?.variant?.sizes ?? [],
}));

// Filter entries with return === false
const entriesNotReturned = entriesToDelete.value?.filter(e => e.return === false) ?? [];
const notReturnedItemIds = entriesNotReturned.filter(e => e.itemId).map(e => e.itemId);
const notReturnedVariantDetails = entriesNotReturned.map(e => ({
  variantId: e.variantId,
  qty: e.qty,
  size: e.size ?? null,
  sizes: e?.variant?.sizes ?? [],
}));



// Step 3: Update related items to be in_stock
if (notReturnedItemIds.length > 0) {
   UpdateManyItem.mutateAsync({
    where: { id: { in: notReturnedItemIds } },
    data: { 
      status: 'in_stock' 
    },

  });


// Step 4: update the variants
for (const { variantId, qty, size, sizes } of notReturnedVariantDetails) {
  if (!variantId || !qty) continue;

  // increment overall variant qty
  const updateData = {
    qty: { increment: qty },
  };

  // Update sizes only if size is not null
  if (size) {
    const updatedSizes = sizes.map(s => {
      if (s.size === size) {
        return {
          ...s,
          qty: Math.max((s.qty ?? 0) + qty) // Prevent negative qty
        };
      }
      return s;
    });

    updateData.sizes = updatedSizes;
  }

   UpdateVariant.mutateAsync({
    where: { id: variantId },
    data: updateData,
  });
}

}


if (returnedItemIds.length > 0) {
   UpdateManyItem.mutateAsync({
    where: { id: { in: returnedItemIds } },
    data: { 
      status: 'sold' 
    },

  });


// Step 4: update the variants
for (const { variantId, qty, size, sizes } of returnedVariantDetails) {
  if (!variantId || !qty) continue;

  // increment overall variant qty
  const updateData = {
    qty: { decrement: qty },
  };

  // Update sizes only if size is not null
  if (size) {
    const updatedSizes = sizes.map(s => {
      if (s.size === size) {
        return {
          ...s,
          qty: Math.max((s.qty ?? 0) - qty) // Prevent negative qty
        };
      }
      return s;
    });

    updateData.sizes = updatedSizes;
  }

   UpdateVariant.mutateAsync({
    where: { id: variantId },
    data: updateData,
  });
}

}

// Step 4: Delete the entries
if (entryIds.length > 0) {
   DeleteManyEntry.mutateAsync({
    where: { id: { in: entryIds } },
  });
}

   
    // Execute all create, update, and delete promises
    const updateBillPromise = () => UpdateBill.mutateAsync({
  where: { id: route.params.salesId },
  data: {
    subtotal: subtotal.value,
    discount: discount.value,
    grandTotal: grandTotal.value,
    paymentMethod: paymentMethod.value,
    paymentStatus: paymentMethod.value === 'Credit' ? 'PENDING' : 'PAID',
    ...(paymentMethod.value === 'Split' && {
      splitPayments: splitPayments.value, // e.g., [{ method: 'Cash', amount: 500 }]
    }),
    ...(selected.value && {
    account: { connect: { id: selected.value } },
    }),
    ...(clientId.value && {
    client: {
      connect: {
        id: clientId.value,
      },
    },
  }),
    createdAt: new Date(date.value).toISOString(),
    company: {
      connect: {
        id: useAuth().session.value?.companyId,
      },
    },
  },
  select: {
    id: true,
    invoiceNumber: true,
    createdAt: true,
    paymentMethod: true,
    subtotal: true,
    discount: true,
    tax: true,
    grandTotal: true,
    company: {
      select: {
        name: true,
        gstin: true,
        upiId: true,
        accHolderName: true,
        address: {
          select: {
            name: true,
            street: true,
            locality: true,
            city: true,
            state: true,
            pincode: true,
          },
        },
      },
    },
    entries: {
      select: {
        name: true,
        qty: true,
        rate: true,
        discount: true,
        tax: true,
        value: true,
        barcode: true,
        size: true,
        item: {
          select: {
            id: true,
          },
        },
        category: {
          select: {
            name: true,
            hsn: true,
          },
        },
      },
    },
  },
});

// Run all promises in parallel
const results = await Promise.all([
  ...createPromises,
  ...updatePromises,
  updateBillPromise(),
]);

const billResponse = results[results.length - 1];
console.log('Bill updated successfully:', billResponse);

    toast.add({
      title: 'Bill edited successfully!',
      color: 'green',
    });

    try {
        isPrint.value = true
      printData = {
          invoiceNumber: billResponse.invoiceNumber || 'N/A',
          date: billResponse.createdAt,
          entries: billResponse.entries.map(entry => {
          let calculatedDiscount = 0;

          if (entry.discount < 0) {
            // Fixed discount
            calculatedDiscount = Math.abs(entry.discount) * entry.qty;
          } else {
            // Percentage discount
            calculatedDiscount = ((entry.rate * entry.discount) / 100) * entry.qty;
          }

          return {
            description: entry.barcode ? entry.name : entry.category.name,
            hsn: entry.category.hsn,
            qty: entry.qty,
            mrp: entry.rate,
            discount: calculatedDiscount, // ✅ set calculated discount
            tax: entry.tax,
            value: entry.qty * entry.rate ,
            size: entry.size,
            barcode: entry.barcode,
            tvalue:entry.value,
          };
        }),
 
  subtotal: billResponse.subtotal,
  discount: billResponse.discount,
  grandTotal: billResponse.grandTotal,
  paymentMethod: billResponse.paymentMethod,
  companyName: billResponse.company.name || '',
  companyAddress: billResponse.company.address || {},
  gstin: billResponse.company.gstin || '',
  accHolderName: billResponse.company.accHolderName || '',
  upiId: billResponse.company.upiId || '',
  // 🆕 Add total qty
  tqty: billResponse.entries.reduce((sum, entry) => sum + entry.qty, 0),
  tvalue: billResponse.entries.reduce((sum, entry) => sum + (entry.qty * entry.rate), 0),
  tdiscount: billResponse.entries.reduce((sum, entry) => {
    if (entry.discount < 0) {
      return sum + (Math.abs(entry.discount) * entry.qty);
    } else {
      return sum + (((entry.rate * entry.discount) / 100) * entry.qty);
    }
  }, 0),
};

    } catch (err) {
      console.error('Printing error:', err);
      toast.add({
        title: 'Printing failed!',
        description: err.message,
        color: 'red',
      });
    }



  } catch (error) {
    console.error('Error updating bill', error);
    toast.add({
      title: 'Bill update failed!',
      description: error.message,
      color: 'red',
    });
  }finally {
      isSaving.value = false;
    }

  // Collect all async operations in an array for items with a barcode
  const updatePromises = [];

  for (const item of items.value) {
    if (item.barcode) {
      let updatedQty = item.totalQty ? (item.totalQty - item.qty) : 0;
      let updatedSizes = item.sizes ? item.sizes.map(sizeData => {
        if (sizeData.size === item.size) {
          return { ...sizeData, qty: Math.max((sizeData.qty || 0) - 1, 0) };
        }
        return sizeData;
      }) : [];

      // Push update promises to the array
      updatePromises.push(
        UpdateVariant.mutateAsync({
          where: { id: item.variantId },
          data: { qty: updatedQty, sizes: updatedSizes },
        }).catch(error => console.error(`Error updating variant ${item.variantId}`, error))
      );

      updatePromises.push(
        UpdateItem.mutateAsync({
          where: { id: item.id },
          data: { status: 'sold' },
        }).catch(error => console.error(`Error updating item ${item.id}`, error))
      );
    }
  }

  // Wait for all updates to finish before proceeding
 Promise.all(updatePromises);


};




const {
    data: accounts
} = useFindManyAccount({
      where: { companyId: useAuth().session.value?.companyId},
});

const submitForm = async () => {
  isSavingAcc.value = true
  try {
    
    if (!account.value.name) {
        throw new Error(`Plase Fill name`);
      }
    const res = await CreateAccount.mutateAsync({
      data: {
                name: account.value.name,
                phone: account.value.phone,
                address: {
                    create: {
                        street: account.value.street,
                        locality: account.value.locality,
                        city: account.value.city,
                        state: account.value.state,
                        pincode: account.value.pincode,
                    },
                },
                company:{
                  connect:{
                        id:useAuth().session.value?.companyId
                      }
                  }
              }
    })
    toast.add({
            title: 'Account added !',
            id: 'modal-success',
        });
    isOpen.value = false
  }catch(error){
     toast.add({
        title: 'Account creation failed!',
        description: error.message,
        color: 'red',
      });
  }finally{
    isSavingAcc.value = false
  }
};


const print = async() => {
  try{
  console.log(printData)
  await printBill(printData)
  isPrint.value = false
  toast.add({
        title: 'Printing Sucess!',
        color: 'Green',
      });
  }catch(err){
      toast.add({
        title: 'Printing failed!',
        description: err.message,
        color: 'red',
      });
  }
}



watch(paymentMethod, (val) => {

  if (val === 'Split') {
    showSplitModal.value = true
  }
})

// Add a new split row
function addSplitEntry() {
  splitPayments.value.push({ method: '', amount: 0 })
}

// Remove a row
function removeSplitEntry(index) {
  if (splitPayments.value.length > 1) {
    splitPayments.value.splice(index, 1)
  }
}

// Total calculation
const totalSplitAmount = computed(() =>
  splitPayments.value.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
)

function getAvailableOptions(index) {
  const selectedMethods = splitPayments.value.map((e) => e.method)
  const currentMethod = splitPayments.value[index].method

  // Allow current row to still show its existing selection
  const options = paymentOptions.filter(
    (opt) => !selectedMethods.includes(opt) || opt === currentMethod
  )

  return options
}


// Final submission
function submitSplitPayment() {
  if (totalSplitAmount.value !== grandTotal.value) {
    alert(`Total split amount must be exactly ${grandTotal.value}`)
    return
  }

  // Process splitPayments here
  console.log('Final Split:', splitPayments.value)
  showSplitModal.value = false
}

const handleEnterPhone = async() => {
const { data } = await refetchClient()
console.log(data)
clientName.value = data?.name
clientId.value = data?.id
if(!data){
  isClientAddModelOpen.value = true
}
}


</script>


<template>
  <UDashboardPanelContent class="p-1">
    <UCard 
       :ui="{
          base: 'h-100 flex flex-col',
          rounded: '',
         divide: 'divide-y divide-gray-200 dark:divide-gray-700',
          body: {
            padding: '',
            base: 'grow divide-y divide-gray-200 dark:divide-gray-700'
          }
        }">

        <div class="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 text-sm">
        <UInput v-model="date" type="date" label="Date" class="lg:col-span-2" />

      </div>


        <!-- Responsive table wrapper -->
         
        <div class="overflow-x-auto mt-2 h-48">
          <table class="min-w-full divide-y divide-gray-50 dark:divide-gray-800" ref="resizableTable">
            <thead class="">
              <tr>
                <th
                  v-for="(column, index) in columns"
                  :key="column.key"
                  class="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider relative"
                >
                  {{ column.label }}
                  <!-- Draggable divider -->
                  <div
                    v-if="index < columns.length - 1"
                    class="absolute right-0 top-0 bottom-0 b-w cursor-col-resize dark:bg-gray-800 hover:bg-blue-300"
                    @mousedown="startResize(index, $event)"
                  ></div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
              <tr v-for="(row, index) in items" :key="row.sn">
                <td class="py-1 whitespace-nowrap">
                 {{ row.sn }}
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.barcode" ref="barcodeInputs"  size="sm" @blur="fetchItemData(row.barcode, index)" @keydown.delete="removeRow(row.barcode,index)" @keydown.enter.prevent="handleEnterBarcode(row.barcode,index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <USelectMenu  
                    v-model="row.category" 
                    :options="categories" 
                    option-attribute="name"  
                    option-key="id" 
                    track-by="id"
                    multiple 
                    searchable
                    searchable-placeholder="Search a Category..."
                >
                <template #label>
                    <span v-if="row.category.length" class="truncate">
                        {{ row.category.map(item => item.name).join(', ') }}
                    </span>
                    <span v-else>Select Category</span>
                </template>
                <template #option="{ option: category }">
                    <span class="truncate">{{ category.name }}</span>
                </template>
            </USelectMenu>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.name" size="sm"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.qty"  ref="qtyInputs" type="number" size="sm"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.rate" type="number" size="sm"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.discount" type="number" size="sm"  @keydown.enter="addNewRow(index)"/>
                </td>
                <td class="py-1 whitespace-nowrap">
                  <UInput v-model="row.tax" type="number" size="sm" @keydown.enter="addNewRow(index)" />
                </td>
                <td class="py-1 ps-2 whitespace-nowrap">
                  {{ row.value }}
                </td>
              </tr>
            </tbody>


          </table>
          
        </div>

         <div class="p-3">
            <div>
              Qty: {{ items.reduce((sum, item)=> sum + item.qty,0) }}
            </div>
          </div>

  <template #footer>
        <!-- Other form elements -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mt-4">
          <div>
            <!-- Discount Input -->
        <div class="mb-6">
          <label class="block text-gray-700 font-medium">Dis %(+) / Round Off (-)</label>
          <UInput
            ref="discountref"
            type="number"
            v-model="discount"
            @keydown.enter.prevent="handleEnterMainDiscount()"
            placeholder="Enter discount"
          />
        </div>

        <!-- Subtotal Display -->
        <div class="border border-primary-300 rounded-md mb-7">
        <div class="flex flex-col items-center justify-center py-3">
          <div class="text-s">Sub Total</div>
          <div class="text-primary-300 font-bold text-3xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
        </div>
      </div>
          

        <!-- Grand Total Display -->
        <div class="border border-green-300 rounded-md">
        <div class="flex flex-col items-center justify-center py-3">
          <div class="text-s">Grand Total</div>
          <div class="text-green-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
        </div>
      </div>
          </div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sales Return AMT</label>
              <UInput v-model="returnAmt" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Redeemed AMT</label>
              <UInput  />
            </div>
             <div class="mb-4">
              <label class="block text-gray-700 font-medium">Payment Method</label>
              <USelect ref="paymentref" v-model="paymentMethod" :options="['Cash', 'UPI','Card','Split','Credit']" @keydown.enter.prevent="handleEnterPayment(index)" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Account Name</label>
              <UInputMenu v-model="selected" :options="accounts" value-attribute="id" option-attribute="name"/>
            </div>
          </div>

          <div>
            <div class="mb-4 mt-5">
              <UButton color="primary" block>Add Voucher</UButton>
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Scanned</label>
              <UInput v-model="voucherNo" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Value</label>
              <UInput v-model="voucherNo" />
            </div>
            <div class="mt-9">
              <UButton color="primary" block @click="isOpen=true" :disabled="isSavingAcc" >Add Account</UButton>
            </div>
          </div>

          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              <UInput v-model="phoneNo" :loading="isClientLoading" icon="i-heroicons-magnifying-glass-20-solid" @keydown.enter.prevent="handleEnterPhone"/>
            </div>
           <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="clientName" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Points</label>
              <UInput v-model="points" />
            </div>
            <div>
              <UButton color="green" class="mt-9" block>Redeem Points</UButton>
            </div>
          </div>
        </div>

        <div class="mt-4 w-full flex flex-wrap gap-4">
          <UButton color="blue" class="flex-1" block @click="() => router.push('/erp/billing')">New</UButton>
          <UButton :loading="isSaving"  ref="saveref" color="green" class="flex-1" block @click="handleEdit">Save</UButton>
          <UButton color="red" class="flex-1" block  @click="deleteBill">Delete</UButton>
          <UButton class="flex-1" block>Barcode Search</UButton>
          <UButton class="flex-1" block>Sales Return</UButton>
          <UButton class="flex-1" block>Bill Search</UButton>
        </div>

    </template>
     </UCard>
  </UDashboardPanelContent>

  <UModal v-model="isOpen">
        <div class="p-4 space-y-4">
          <h2 class="text-lg font-semibold">Enter Account Details</h2>

          <!-- Name -->
          <h3 class="text-md font-semibold">Personal Details</h3>
          <UInput v-model="account.name" label="Name" placeholder="Enter full name" required />
          <UInput v-model="account.phone" label="Phone No" placeholder="Enter full name" required />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="account.street" label="Street" placeholder="Enter street name" required />
          <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required />
          <UInput v-model="account.city" label="City" placeholder="Enter city name" required />
          <UInput v-model="account.state" label="State" placeholder="Enter state name" required />
          <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required />


          <!-- Submit Button -->
          <UButton @click="submitForm" :disabled="isSavingAcc"  block>Submit</UButton>
        </div>
      </UModal>

      <UDashboardModal
        v-model="isPrint"
        title="Print Bill"
        description="Would You Like to print?"
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            },
            footer: {
                base: 'ml-16',
            },
        }"
    >
        <template #footer>
            <UButton
                color="green"
                label="Yes"
                :loading="loading"
                @click="print"
            />
            <UButton color="red" label="NO" @click="isPrint = false" />
        </template>
    </UDashboardModal>

    <BillingAddClient
  v-model:model="isClientAddModelOpen"
  v-model:phoneNo="phoneNo"
  :onVerify="handleEnterPhone"
/>

     <!-- split payment method modal -->
   <UModal v-model="showSplitModal">
    <div class="p-4 space-y-4">
      <h2 class="text-lg font-semibold">Split Payment</h2>

      <div v-for="(entry, index) in splitPayments" :key="index" class="flex gap-2 items-center">
        <USelect
          v-model="entry.method"
           :options="getAvailableOptions(index)"
          class="w-1/2"
          placeholder="Select Method"
        />
        <UInput
          v-model.number="entry.amount"
          type="number"
          placeholder="Amount"
          class="w-1/2"
        />
        <UButton
          icon="i-heroicons-trash"
          color="red"
          size="sm"
          @click="removeSplitEntry(index)"
          :disabled="splitPayments.length === 1"
        />
      </div>

      <UButton @click="addSplitEntry" color="gray" variant="outline">Add More</UButton>

      <div class="mt-4">
        <p class="text-sm font-medium">Total Entered: ₹{{ totalSplitAmount }}</p>
        <p
          class="text-sm"
          :class="{
            'text-green-600': totalSplitAmount === grandTotal,
            'text-red-600': totalSplitAmount !== grandTotal
          }"
        >
          Grand Total: ₹{{ grandTotal }}
        </p>
      </div>

      <UButton
        :disabled="totalSplitAmount !== grandTotal"
        color="green"
        block
        class="mt-4"
        @click="submitSplitPayment"
      >
        Submit Split Payment
      </UButton>
    </div>
  </UModal>



</template>


<style scoped>
.relative {
  position: relative;
}

.cursor-col-resize {
  cursor: col-resize;
}

.hover\:bg-blue-300:hover {
  background-color: #93c5fd;
}

.b-w{
  width:1px;
}
</style>