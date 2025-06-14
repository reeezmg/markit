
<script setup>
import { BillingAddClient } from '#components';
import { useUpdateCompany,useCreateBill,useFindUniqueClient,useCreateTokenEntry,useFindFirstItem,useFindManyTokenEntry, useFindManyCategory, useUpdateVariant,useUpdateItem, useCreateAccount,useFindManyAccount, useDeleteTokenEntry,useUpdateManyItem } from '~/lib/hooks';


const currentRequestIds = ref({}); // Tracks the latest request ID per index
const lastResponse  = ref({}); // Stores responses by request ID

const { printBill } = usePrint();
const CreateBill = useCreateBill();
const CreateTokenEntry = useCreateTokenEntry();
const CreateAccount = useCreateAccount();
const UpdateVariant = useUpdateVariant();
const UpdateCompany = useUpdateCompany();
const UpdateItem = useUpdateItem();
const UpdateManyItem = useUpdateManyItem();
const DeleteTokenEntry = useDeleteTokenEntry();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const router = useRouter();
const isTaxIncluded = ref(useAuth().session.value?.isTaxIncluded);
const isBarcodeIncluded = ref(useAuth().session.value?.isBarcodeIncluded);
const date = ref(new Date().toISOString().split('T')[0]);
const discount = ref(0);

const subtotal = computed(() => {
  return items.value.reduce((sum, item) => sum + ((item.qty || 1) * (item.rate || 0)), 0);
});
const grandTotal = computed(() => {
  const baseTotal = items.value.reduce((sum, item) => sum + (item.value || 0), 0);

  if (discount.value < 0) {
    return parseFloat((baseTotal - Math.abs(discount.value)).toFixed(2));
  } else {``
    const discounted = baseTotal - (baseTotal * discount.value) / 100;
    return parseFloat(discounted.toFixed(2));
  }
});

const returnAmt = ref(0);
const paymentOptions = ['Cash', 'UPI', 'Card','Credit']
const paymentMethod = ref('Cash');
const voucherNo = ref('');
const phoneNo = ref('');
const points = ref(0);
const clientName = ref('');
const clientId = ref('');
const scannedBarcode = ref("");
const activeCategoryId = ref("");
const activeSPrice = ref(null);
const token = ref("")
const tokenEntries = ref([])
const showSplitModal = ref(false)
const tempSplits = ref(
  Object.fromEntries(paymentOptions.map(method => [method, { method, amount: null }]))
)

const splitPayments = ref([])
const barcodeInputs = ref([]);
const categoryInputs = ref([]);
const nameInputs = ref([]);
const qtyInputs = ref([]);
const rateInputs = ref([]);
const discountInputs = ref([]);
const taxInputs = ref([]);
const discountref = ref();
const paymentref = ref();
const saveref = ref();
const savetokenref = ref();
const addTokenRef = ref();
const tokenInputs = ref(['']);
const categoryStore = useCategoryStore()

const isPrint = ref(false);
const isSaving = ref(false);
let printData = {}

const isMobile = ref(false);


const isOpen = ref(false);
const isSavingAcc = ref(false)
const isTokenOpen = ref(false);
const issalesReturnModelOpen = ref(false);
const isClientAddModelOpen = ref(false);
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
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: null, discount: null, tax: null, value: 0,sizes:{}, totalQty:0 ,return:false},
]);



watch(
  items,
  (newItems) => {
    newItems.forEach((item, index) => {
      if (item.category.length > 1) {
        // Keep only the latest selected category
        const lastCategory = item.category[item.category.length - 1];
        items.value[index].category = [lastCategory];
      }
    });
    console.log(newItems)
  },
  { deep: true }
);


const columns = ref([
  { key: 'sn', label: 'S.N' },
  { key: 'barcode', label: 'BAR CODE' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'name', label: 'NAME' },
  { key: 'rate', label: 'RATE' },
  { key: 'qty', label: 'QTY' },
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
  if(newSelected){
    paymentMethod.value = 'Credit'
  }
  console.log(newSelected)
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
    let baseValue = discountedRate * (item.qty || 1);
    
    if (!isTaxIncluded.value) {
      baseValue += (baseValue * item.tax) / 100;
    }

    item.value = parseFloat(baseValue.toFixed(2));
  }
}, { deep: true });


const tQty = computed(() =>
  items.value.reduce((sum, item) => {
    if (item.barcode || item.name || item.category.length > 0) {
      return sum + (item.qty || 1);
    }
    return sum
  }, 0)
)

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
  const hasEmptyRow = items.value.some(item => {
    return !item.variantId?.trim() && !item.name?.trim() && !item.barcode?.trim() && !item.category?.length && item.qty > 0;
  });

  if (hasEmptyRow) {
  const component = barcodeInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  input.focus();
  input.select();
  return;
  };   

  items.value.push({
    id: '',
    variantId: '',
    sn: items.value.length + 1,
    barcode: '',
    category: {},
    size: '',
    name: '',
    qty: 1,
    rate: null,
    discount: null,
    tax: null,
    value: 0,
    sizes: {},
    totalQty: 0,
    return:false
  });

  await nextTick();

  const component = barcodeInputs.value[index + 1];
  const input = component?.$el?.querySelector("input");
  if (input) input.focus();
};


const removeRow = (event,barcode,index) => {
  const inputValue = event.target.value;
  if (!inputValue) {
    event.preventDefault();
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

onMounted(() => {
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
      name:true,
      hsn:true,
    }
}
);


const itemargs = computed(() => ({
  where:  {
        barcode: scannedBarcode.value,
        companyId: useAuth().session.value?.companyId
      },
  select: {
    id: true,
    size: true,
    qty: true,
    variant: {
      select: {
        id: true,
        sprice: true,
        name: true,
        tax: true,
        discount: true,
        product: {
          select: {
            name: true,
            categoryId: true,
            category: {
              select: {
                taxType: true,
                fixedTax: true,
                thresholdAmount: true,
                taxBelowThreshold: true,
                taxAboveThreshold: true
              }
            }
          }
        }
      }
    }
  }
}));




const entryargs = computed(() => ({
    where: {
        tokenNo: { in: tokenEntries.value }  // Fetch all entries matching tokenNos
    }
}));

const { data: itemdata ,refetch:itemRefetch} = useFindFirstItem(itemargs);
const { data: entrydata ,refetch:entryRefetch} = useFindManyTokenEntry(entryargs,{enable:false});

const handleEnterBarcode = (barcode,index) => {
 const pattern = /^\d+[A-Z]\d{6}$/;

  if(!barcode){
    if(token.value){
      const component = savetokenref.value;
      const button = component.$el;
      button.focus();
    }
    else{
    const component = discountref.value;
    const input = component.$el.querySelector("input");
    input.focus();
    input.select();
    }
  }else{
    if(!pattern.test(barcode)){
      const categorystore = categoryStore.getCategoryByShortCut(barcode)
      console.log(categorystore)
      items.value[index].category = categories.value.filter(category =>category.id === categorystore.id)
      items.value[index].barcode = '';
      const component = rateInputs.value[index];
      const input = component.$el.querySelector("input");
      input.select();
    }else{
      fetchItemData(barcode, index);
      addNewRow(index);
    }
}}

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


const handleTokenInputEnter = async(index) => {
  if(!tokenEntries.value[index]){
    const component = addTokenRef.value;
    const button = component.$el;
    button.focus();
    
  }else{
    addEntry()
    await nextTick();
    const component = tokenInputs.value[index + 1];
    const input = component.$el.querySelector("input");
    input.focus();
    input.select();
  }
  
}

const handleTokenDelete = (index, event) => {
  if(!tokenEntries.value[index] && tokenEntries.value.length > 1){
    event.preventDefault()
    tokenEntries.value.splice(index,1)
    const component = tokenInputs.value[index-1];
    const input = component.$el.querySelector("input");
    input.focus();

  }
}

const selectAllText = (index) => {
  const component = barcodeInputs.value[index];
  if (component?.$el) {
    const input = component.$el.querySelector("input");
    if (input) {
      input.select();
    }
  }
};

watch(itemdata, (newData) => {
  if (!newData) return;
  
  lastResponse.value = {
    data: newData,
    requestId: scannedBarcode.value 
  };
  
  processItemResponse(newData);
});

const fetchItemData = async (barcode, index) => {
  if (!barcode) return;

  // Store the current barcode and index
  currentRequestIds.value[index] = barcode;
  scannedBarcode.value = barcode;
  
  try {
    await itemRefetch();
    
    // Check if this is still the active request for this index
    if (currentRequestIds.value[index] !== barcode) {
      return; // Newer request has been made
    }
    
    // Process the response if we got one
    if (lastResponse.value?.requestId === barcode && itemdata.value) {
      processItemResponse(itemdata.value, index);
    } else if (!itemdata.value) {
      handleInvalidBarcode(index);
    }
  } catch (error) {
    console.error('Error fetching item:', error);
    if (currentRequestIds.value[index] === barcode) {
      handleInvalidBarcode(index);
    }
  }
};

const fetchItemDataNonBarcode = async (categoryId, sPrice, index) => {
  if (!categoryId || !sPrice) return;

  try {
    const { data } = await useFetch('/api/items/findFirst', {
      query: {
        categoryId,
        sPrice
      }
    });

    if (data.value?.data) {
      const itemData = data.value.data;
      items.value[index] = {
        ...items.value[index],
        id: itemData.id || '',
        size: itemData.size || '',
        name: `${itemData.variant?.name}-${itemData.variant?.product?.name}` || '',
        rate: itemData.variant?.sprice || 0,
        discount: itemData.variant?.discount || 0,
        tax: itemData.variant?.tax || 0,
        totalQty: itemData.variant?.qty || 0,
        sizes: itemData.variant?.sizes || null,
        variantId: itemData.variant?.id || ''
      };
    }
  } catch (error) {
    console.error('Error fetching item:', error);
  }
};

const processItemResponse = (itemData, index) => {
  if (!items.value[index]) {
    return;
  }

  const categoryId = itemData.variant.product.categoryId;

  items.value[index].id = itemData.id || '';
  items.value[index].size = itemData.size || '';
  items.value[index].name = `${itemData.variant?.name}-${itemData.variant.product.name}` || '';
  items.value[index].category = categories.value.filter(category => category.id === categoryId);
  items.value[index].rate = itemData.variant?.sprice || 0;
  items.value[index].discount = itemData.variant?.discount || 0;
  items.value[index].tax = itemData.variant?.tax || 0;
  items.value[index].totalQty = itemData.variant?.qty || 0;
  items.value[index].sizes = itemData.variant?.sizes || null;
  items.value[index].variantId = itemData.variant?.id || '';

  delete currentRequestIds.value[index];
};

const handleInvalidBarcode = (index) => {
  items.value[index].barcode = '';
  toast.add({
    title: 'Barcode is invalid or item is empty!',
    color: 'red',
  });
  delete currentRequestIds.value[index];
};

const handleSave = async () => {
    isSaving.value = true
    let itemIds = []
    let variantDetails = []
    try {
    items.value = items.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );
  
    if (items.value.length === 0) {
        items.value = [
          { id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '', qty: 1, rate: 0, discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0 }
        ];
        discount.value = 0;
        paymentMethod.value = 'Cash';
        tokenEntries.value = [''];
        throw new Error(`No valid items to bill.`);
      }
    console.log(items.value)
   items.value.forEach((item, index) => {
    if (!item.category || !item.category[0]?.id) {
      throw new Error(`No category in entry ${index + 1}`);
    }
  });

  if(!isBarcodeIncluded.value){
      const results = await Promise.all(
        items.value.map((item, index) =>
          fetchItemDataNonBarcode(item.category[0]?.id, item.rate, index)
        )
      );
      console.log('Fetched items:', results);
    };



  
   const returnedItems = items.value.filter(item => item.return);
    

    const billid = await UpdateCompany.mutateAsync({
      where:{
        id:useAuth().session.value?.companyId
      },
    data: {
        billCounter: {
          increment: 1, 
      },
    },
    select:{
        billCounter:true,
        address:true,
        gstin:true,
        accHolderName:true,
        upiId:true
      }
    })


const entriesData = items.value.map(item => {
  const entry = {
    name: item.name || '',
    qty: Number(item.qty || 1),
    rate: Number(item.rate || 0),
    discount: Number(item.discount || 0),
    tax: Number(item.tax || 0),
    value: Number(item.value || 0),
    return: item.return || false,
    ...(item.size && { size: item.size })
  };

  if (item.barcode) {
    entry.barcode = item.barcode;
    entry.item = { connect: { id: item.id } };
  }

  if (item.variantId) {
    entry.variant = { connect: { id: item.variantId } };
  }

  if (item.category?.[0]?.id) {
    entry.category = { connect: { id: item.category[0].id } };
  }

  return entry;
});
console.log(selected.value)
const payload = {
  invoiceNumber: billid.billCounter,
  subtotal: Number(subtotal.value) || 0,
  discount: Number(discount.value) || 0,
  grandTotal: Number(grandTotal.value) || 0,
  returnAmt: Number(returnAmt.value) || 0,
  paymentMethod: paymentMethod.value || 'Cash',
  createdAt: new Date(date.value).toISOString(),
  paymentStatus: paymentMethod.value === 'Credit' ? 'PENDING' : 'PAID',
  type: 'BILL',
  entries: {
    create: entriesData,
  },
  company: {
    connect: {
      id: useAuth().session.value?.companyId,
    },
  },
  ...(clientId.value && {
    client: {
      connect: {
        id: clientId.value,
      },
    },
  }),
  ...(selected.value && {
    account: { connect: { id: selected.value } },
  }),

  ...(paymentMethod.value === 'Split' && {
    splitPayments: splitPayments.value, // e.g., [{ method: 'Cash', amount: 500 }]
  }),
};

  isSaving.value = false;
          isPrint.value = true
           printData = {
              invoiceNumber: billid.billCounter,
              date: new Date(date.value).toISOString(),
              entries: items.value.map(entry => {
              let calculatedDiscount = 0;
    
              if (entry.discount < 0) {
                // Fixed discount
                calculatedDiscount = entry.discount;
              } else if( entry.discount > 0) {
                // Percentage discount
                calculatedDiscount = `${entry.discount}%`;
              }else if (entry.discount === null || entry.discount === undefined) {
                calculatedDiscount = 0;
              }else{
                calculatedDiscount = 0;
              }
    
              return {
                description: entry.barcode ? entry.name : entry.category[0].name,
                hsn: entry.category[0].hsn,
                qty: entry.qty,
                mrp: entry.rate,
                discount: calculatedDiscount || 0, // ✅ set calculated discount
                tax: entry.tax,
                value: entry.qty * entry.rate ,
                size: entry.size,
                barcode: entry.barcode,
                tvalue:entry.value,
              };
            }),
    
          subtotal: subtotal.value,
         discount: Number(discount.value),
          grandTotal: grandTotal.value,
          paymentMethod: paymentMethod.value,
          companyName: useAuth().session.value?.companyName || '',
          companyAddress: billid.address || {},
          gstin: billid.gstin || '',
          ...(paymentMethod.value === 'Split' && {
            splitPayments: splitPayments.value, // e.g., [{ method: 'Cash', amount: 500 }]
          }),
          accHolderName: billid.accHolderName || '',
          ...(paymentMethod.value === 'Split' && {
            splitPayments: splitPayments.value,
          }),
          upiId: billid.upiId || '',
          clientName:clientName.value,
          clientPhone:phoneNo.value,
          // 🆕 Add total qty
          tqty: items.value.reduce((sum, entry) => sum + entry.qty, 0),
          tvalue: items.value.reduce((sum, entry) => sum + (entry.qty * entry.rate), 0),
          ttvalue: items.value.reduce((sum, entry) => sum + (entry.value), 0),
          tdiscount: items.value.reduce((sum, entry) => {
            if (entry.discount < 0) {
              return sum + (Math.abs(entry.discount) * entry.qty);
            } else {
              return sum + (((entry.rate * entry.discount) / 100) * entry.qty);
            }
          }, 0)
        };
console.log(printData)
        const billResponse = await  useFetch('/api/bills/create', {
          method: 'POST',
          body: payload
        });

        if (!billResponse.data.value) {
          throw new Error('Failed to create bill');
        }

        const billId = billResponse.data.value.id;
        console.log('Bill created with ID:', billId);

        // Notify the user
      CreateBill.mutateAsync({
        data: payload
          });
        toast.add({
          title: 'Bill created successfully!',
          color: 'green',
        });


         for (const item of items.value) {
          if ((item.barcode && item.return === false) || (!isBarcodeIncluded.value && item.variantId && item.return === false)) {
              UpdateVariant.mutateAsync({
                where: { id: item.variantId },
                data: { 
                  sold: { increment: item.qty },
                }
              }).catch(error => console.error(`Error updating variant ${item.variantId}`, error))
          
    
  
              UpdateItem.mutateAsync({
              where: { id: item.id },
              data: { 
                qty: { decrement: item.qty },
              }
              }).catch(error => console.error(`Error updating item ${item.id}`, error))
            }
        }

        
        if (returnedItems.length > 0) {
          console.log('returnedItems', returnedItems)
         for (const item of returnedItems) {
        console.log(item)
            UpdateVariant.mutateAsync({
              where: { id: item.variantId },
              data: { 
                sold: { decrement: item.qty },
               }
            }).catch(error => console.error(`Error updating variant`, error))
         
              UpdateItem.mutateAsync({
              where: { id: item.id },
              data: { 
                qty: { increment: item.qty },
              }
            }).catch(error => console.error(`Error updating item}`, error))
          }
        }
      


  
   console.log(printData)
        $fetch('/api/notifications/notify', {
        method: 'POST',
        body: {
          userId:useAuth().session.value?.id,
          type: 'BILL',
          companyId: useAuth().session.value?.companyId,
          // id: billResponse.id,
          invoiceNumber: billid.billCounter,
          amount: grandTotal.value
        }
      })

           items.value = [
      { id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '', qty: 1, rate: 0, discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0 }
      ];
      discount.value = 0;
      paymentMethod.value = 'Cash';
      tokenEntries.value = [''];
        const input = barcodeInputs.value[0]?.$el?.querySelector('input');
    input?.focus();
  
    
    } catch (error) {
      isSaving.value = false;
      console.error('Error creating bill', error);
      toast.add({
        title: 'Bill creation failed!',
        description: error.message,
        color: 'red',
      });
    }
   
     
      
  
    try {
      tokenEntries.value = tokenEntries.value.filter(token => token.trim() !== '');
      if (tokenEntries.value.length > 0) {
         DeleteTokenEntry.mutateAsync({
          where: { tokenNo: { in: tokenEntries.value } }
        });
        console.log('Token entries deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting token entries', error);
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



const handleTokenSave = async () => {
  items.value = items.value.filter(item => item.id || item.barcode);
  try {
    // Create the bill first
    const billResponse = await Promise.all(
    items.value.map(item => 
        CreateTokenEntry.mutateAsync({
            data: {
                tokenNo: token.value,
                createdAt: new Date().toISOString(),
                company: {
                    connect: {
                        id: useAuth().session.value?.companyId,
                    },
                },
                itemId: item.id || '',
                variantId: item.variantId || '',
                barcode: item.barcode || '',
                categoryId: item.category[0]?.id || '', 
                size: item.size || '',
                name: item.name || '',
                qty: item.qty,
                rate: item.rate,
                discount: item.discount,
                tax: item.tax,
                value: item.value,
                sizes: item.sizes, 
                totalQty: item.totalQty,
            }
        })
    )
);



    console.log('Bill created successfully:', billResponse);
    
  } catch (error) {
    console.error('Error creating bill', error);
  }


  try {
   
    for (const item of items.value) {
          await UpdateItem.mutateAsync({
            where: { id: item.id },
            data: {
              status: 'tokened',
            },
          });

         
        }
    } catch (error) {
    console.error('Error updating item and variant', error);
  }
    

    // Optionally, you can reset the form or perform other actions after successful creation
    items.value = [
    { id:'', variantId:'',sn: 1,size:'', barcode: '',category:[], item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0, sizes:{}, totalQty:0 }
    ];
    token.value = '';
    discount.value = 0;
    paymentMethod.value = 'Cash';

};

const addEntry = () => {
  tokenEntries.value.push('')  // Add a new empty entry
}

const removeEntry = (index) => {
  if (tokenEntries.value.length > 1) {
    tokenEntries.value.splice(index, 1)
  }
}

const submitEntryForm = async () => {
    await entryRefetch();

    if (entrydata.value) {
        // Remove existing empty item if it exists
        items.value = items.value.filter(item => item.id || item.barcode);

        // Add fetched entries to existing items
        const newItems = entrydata.value.map((entry, index) => ({
            id: entry.id || '',
            variantId: entry.variantId || '',
            barcode: entry.barcode || '',
            category: categories.value.filter(category => category.id === entry.categoryId) || [],
            size: entry.size || '',
            item: entry.name || '',
            qty: entry.qty || 0,
            rate: entry.rate|| 0,
            discount: entry.discount|| 0,
            tax: entry.tax|| 0,
            value: entry.value|| 0,
            sizes: entry.sizes || '{}',
            totalQty: entry.totalQty|| 0,
        }));

        // Append the new items
        items.value = newItems;

        // Add an empty item at the end
        items.value.push({
            id: '', variantId: '', sn: items.value.length + 1, barcode: '',
            category: {}, size: '', item: '', qty: 1, rate: 0,
            discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0
        });

        console.log('Items populated:', items.value);
    } else {
        console.warn("entrydata is undefined");
    }
};

const newBill = () => {
  window.open(window.location.href, '_blank');

  // items.value = [
  //   { id:'', variantId:'',sn: 1,size:'', barcode: '',category:[], item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0, sizes:{}, totalQty:0 }
  // ];
  // discount.value = 0;
  // paymentMethod.value = 'Cash';

  // token.value = '';
  // tokenEntries.value = [''];
  // grandTotal.value = 0;
  // returnAmt.value = 0;
  // phoneNo.value = '';
  // points.value = 0;
  // name.value = '';
  // voucherNo.value = '';
  // selected.value = {};
  // account.value = {
  //   name: '',
  //   phone:'',
  //   street: '',
  //   locality: '',
  //   city: '',
  //   state: '',
  //   pincode: '',
  // };

};


const moveFocus = (currentRowIndex, currentField, direction) => {
  const fieldOrder = ['barcode', 'category', 'name', 'rate', 'qty', 'discount', 'tax'];
  const currentFieldIndex = fieldOrder.indexOf(currentField);
  
  let nextRowIndex = currentRowIndex;
  let nextFieldIndex = currentFieldIndex;
  
  switch (direction) {
    case 'up':
      nextRowIndex = Math.max(0, currentRowIndex - 1);
      break;
    case 'down':
      nextRowIndex = Math.min(items.value.length - 1, currentRowIndex + 1);
      break;
    case 'left':
      nextFieldIndex = Math.max(0, currentFieldIndex - 1);
      break;
    case 'right':
      nextFieldIndex = Math.min(fieldOrder.length - 1, currentFieldIndex + 1);
      break;
  }
  
  // If we changed rows, keep the same column
  if (direction === 'up' || direction === 'down') {
    nextFieldIndex = currentFieldIndex;
  }
  
  focusInput(nextRowIndex, fieldOrder[nextFieldIndex]);
};

const focusInput = async (rowIndex, field) => {
  await nextTick();
  try {
    switch (field) {
      case 'barcode':
        if (barcodeInputs.value[rowIndex]?.$el) {
          barcodeInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
      case 'category':
      const td = categoryInputs.value[rowIndex]
      const button = td?.querySelector('button')
      button.focus()                                            
        break;
      case 'name':
        if (nameInputs.value[rowIndex]?.$el) {
          nameInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
      case 'qty':
        if (qtyInputs.value[rowIndex]?.$el) {
          qtyInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
      case 'rate':
        if (rateInputs.value[rowIndex]?.$el) {
          rateInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
      case 'discount':
        if (discountInputs.value[rowIndex]?.$el) {
          discountInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
      case 'tax':
        if (taxInputs.value[rowIndex]?.$el) {
         taxInputs.value[rowIndex].$el.querySelector('input')?.select();
        }
        break;
    }
  } catch (e) {
    console.error('Error focusing input:', e);
  }
};

const movecatgeory = (rowIndex) => {
  const td = categoryInputs.value[rowIndex];
  if (!td) return;

  const button = td.querySelector('button');
  if (!button) return;

  button.focus();
  button.click(); // Open the dropdown

  setTimeout(() => {
    const ul = td.querySelector('ul[role="listbox"]');
    if (!ul) return;

    // Set focus to the input inside the dropdown if available
    const comboInput = ul.querySelector('input[role="combobox"]');
    if (comboInput) {
      comboInput.focus();
    } else {
      ul.focus(); // fallback
    }

    // Add key listener to ul
    ul.addEventListener('keydown', function handler(e) {
      if (e.key === 'ArrowRight') {
        button.click(); 
        nameInputs.value[rowIndex].$el.querySelector('input')?.focus();
       
      
      }
    });

    ul.addEventListener('keydown', function handler(e) {
      if (e.key === 'ArrowLeft') {
        button.click(); 
        barcodeInputs.value[rowIndex].$el.querySelector('input').focus();
        requestAnimationFrame(() => {
          barcodeInputs.value[rowIndex].$el.querySelector('input').select();
        });
      }
    });
  }, 100); // enough time for dropdown to render
};

onMounted(() => {
  nextTick(() => {
    const input = barcodeInputs.value[0]?.$el?.querySelector('input');
    input?.focus();
  });
});

const handleReturnData = ({ totalreturnvalue, returnedItems }) => {
  items.value = items.value.filter(item =>
      item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
    );
    const baseIndex = items.value.length;

    returnedItems.forEach((item, i) => {
      item.sn = baseIndex + i + 1; // Ensure sn = position in array (1-based)
    });

    items.value.push(...returnedItems);
    addNewRow(items.value.length - 1);

};


const handleEnterPhone = async() => {
const { data } = await refetchClient()
console.log(data)
clientName.value = data?.name
clientId.value = data?.id
if(!data){
  isClientAddModelOpen.value = true
}
}


watch(paymentMethod, (val) => {
  if (val === 'Split') {
    showSplitModal.value = true
  }
})
watch(items, (val) => {
  console.log(val)
})

const handleAmountEntry = (method) => {
  const entry = tempSplits.value[method]
  const exists = splitPayments.value.find(p => p.method === method)

  if (entry.amount && !exists) {
    splitPayments.value.push({ method, amount: entry.amount })
  } else if (!entry.amount && exists) {
    // If amount cleared, remove from list
    splitPayments.value = splitPayments.value.filter(p => p.method !== method)
  } else if (entry.amount && exists) {
    // Update amount if already present
    exists.amount = entry.amount
  }
}



// Total calculation
const totalSplitAmount = computed(() =>
  splitPayments.value.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
)



const handleSplit = () => {
  showSplitModal.value = true
  paymentMethod.value = 'Split'
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

function handleCategoryChange(category, rowIndex) {
  console.log(category);
  
  const isEmpty = !category || Object.keys(category).length === 0;

  if (!isEmpty) {
    rateInputs.value[rowIndex]?.$el?.querySelector('input')?.focus();
  }
}

onMounted(() => {
  isMobile.value = window.innerWidth < 640;
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 640;
  });
});

</script>


<template>
  <UDashboardPanelContent class="p-1">
      <UCard 
    :ui="{
      base: 'h-full flex flex-col',
      rounded: '',
      ring: 'ring-0 sm:ring-1 sm:ring-gray-200 sm:dark:ring-gray-800', // force no ring on mobile
      divide: 'divide-y divide-gray-200 dark:divide-gray-700',
      body: {
        padding: '',
        base: 'sm:flex-1 sm:flex sm:flex-col sm:overflow-hidden grow divide-y divide-gray-200 dark:divide-gray-700'
      },
      footer: {
        base: 'divide-y divide-gray-200 dark:divide-gray-700',
        padding: ''
      }
    }"
  >
     <div class="w-full flex flex-wrap gap-4  px-3 py-3 sm:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  v-if="!token" :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  v-if="token" ref="savetokenref" color="green" class="flex-1" block @click="handleTokenSave">Save</UButton>
          <UButton v-if="!token" class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
        </div>
    
        <div  class="sm:hidden flex flex-row items-center justify-between lg:col-span-2 gap-2 py-2 px-2">
        <div class="flex-1 border border-primary-700 dark:border-primary-300 rounded-md">
          <div class="flex flex-col items-center justify-center py-3">
            <div class="text-s">Sub Total</div>
            <div class="text-primary-700 dark:text-primary-300 font-bold text-2xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
          </div>
        </div>
            

          <!-- Grand Total Display -->
          <div class="flex-1 border border-green-700 dark:border-green-300 rounded-md">
          <div class="flex flex-col items-center justify-center py-3">
            <div class="text-s">Grand Total</div>
            <div class="text-green-700 dark:text-green-300 font-bold text-2xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
          </div>
        </div>
        </div>
     
         <div class="sm:hidden col-span-2 flex flex-row gap-2 py-2">
            <UInput v-if="!token" v-model="date" type="date" label="Date" class="flex-1" />
            <UButton color="primary" icon="i-heroicons-camera" label="Scan" block class="flex-1"/>
          </div>
        
        <div class="sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 text-sm py-3 hidden">
        <UInput v-if="!token" v-model="date" type="date" label="Date" class="lg:col-span-2"  />
        <UInput v-model="token" label="Token" type="text" placeholder="Token No" class="lg:col-span-2 " />
        <UButton color="primary" label="Token Entries " block @click="isTokenOpen=true" class="lg:col-start-11 lg:col-span-2" />
      </div>


        <!-- Responsive table wrapper -->  
         
        <!-- Mobile layout with alternating colors -->
<div  v-if="isMobile" class="block sm:hidden space-y-4 py-1 px-2">
  <div
    v-for="(row, index) in items"
    :key="row.sn"    
    :class="[
      'p-4 text-sm space-y-3',   
      index % 2 === 0 
        ? 'bg-gray-300 dark:bg-zinc-700'  // Even rows
        : 'bg-gray-100 dark:bg-zinc-900'     // Odd rows
    ]"
  >
    <!-- SN, Name, Value row -->
    <div class="flex justify-between text-gray-800 dark:text-gray-200 font-medium">
      <span>SN: {{ row.sn }}</span>
      <span>{{ row.name }}</span>
      <span>₹{{ row.value }}</span>
    </div>

    <!-- Row 1: Barcode | Qty | Discount -->
    <div class="grid grid-cols-3 gap-2">
      <UInput
        v-model="row.barcode"
        placeholder="Barcode"
        size="sm"
        ref="barcodeInputs"
        @blur="fetchItemData(row.barcode, index)"
        @focus="selectAllText(index)"
        @keyup.delete="removeRow($event, row.barcode, index)"
          enterkeyhint="enter"
        @keyup.enter.prevent="handleEnterBarcode(row.barcode, index)"
        @keyup.tab.prevent="handleEnterBarcode(row.barcode, index)"
      />
       <UInput
        v-model="row.rate"
        ref="rateInputs"
        placeholder="Rate"
        type="number"
        size="sm"
         enterkeyhint="enter"
        @keyup.enter="moveFocus(index, 'rate', 'right')"
        @keyup.tab.prevent="moveFocus(index, 'rate', 'right')"
      />
      
      <UInput
        v-model="row.discount"
        placeholder="Discount"
        ref="discountInputs" 
        type="text"
        size="sm"
         enterkeyhint="enter"
        @keyup.enter="addNewRow(index)"
        @keyup.tab.prevent="addNewRow(index)"
      />
    </div>

    <!-- Row 2: Category | Rate | Tax -->
    <div class="grid grid-cols-3 gap-2 ">
      <USelectMenu
        v-model="row.category"
        :options="categories"
        option-attribute="name"
        @update:modelValue="() => handleCategoryChange(row.category, index)"
        track-by="id"
        multiple
        searchable
        placeholder="Category"
      >
        <template #label>
          <span v-if="row.category.length">{{ row.category.map(c => c.name).join(', ') }}</span>
          <span v-else class="text-gray-400">Category</span>
        </template>
      </USelectMenu>
      <UInput
        v-model="row.qty"
        placeholder="Qty"
        ref="qtyInputs" 
        type="number"
        size="sm"
         enterkeyhint="enter"
       @keyup.enter="moveFocus(index, 'qty', 'right')"
       @keyup.tab.prevent="moveFocus(index, 'qty', 'right')"
      />
     
      <UInput
        v-model="row.tax"
        ref="taxInputs"
        placeholder="Tax"
        type="number"
        size="sm"
         enterkeyhint="enter"
       @keyup.enter="addNewRow(index)"
       @keyup.tab.prevent="addNewRow(index)"
      />
    </div>
  </div>
</div>

         
        <div v-else class="overflow-x-auto p-3 hidden sm:block">    
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
      <UInput
        v-model="row.barcode"
        ref="barcodeInputs"
        size="sm"
        @focus="selectAllText(index)"
        @blur="fetchItemData(row.barcode, index)"
        @keydown.delete="removeRow($event, row.barcode, index)"
        @keydown.enter.prevent="handleEnterBarcode(row.barcode, index)"
        @keydown.up.prevent="moveFocus(index, 'barcode', 'up')"
        @keydown.down.prevent="moveFocus(index, 'barcode', 'down')"
        @keydown.left.prevent="moveFocus(index, 'barcode', 'left')"
        @keydown.right.prevent="moveFocus(index, 'barcode', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap"  ref="categoryInputs">
      <USelectMenu  
        v-model="row.category" 
        @update:modelValue="() => handleCategoryChange(row.category, index)"
        :options="categories" 
        option-attribute="name"  
        option-key="id" 
        track-by="id"
        multiple 
        searchable
        searchable-placeholder="Search a Category..."
        @keydown.up.prevent="moveFocus(index, 'category', 'up')"
        @keydown.down.prevent="moveFocus(index, 'category', 'down')"
        @keydown.left.prevent="movecatgeory(index)"
        @keydown.right.prevent="movecatgeory(index)"
        @keydown.enter.prevent="movecatgeory(index)"
      >
        <template #label>
          <span v-if="row.category.length" class="truncate">
            {{ row.category.map(item => item.name).join(', ') }}
          </span>
          <span v-else>Select Category</span>
        </template>
        <template  #option="{ option: category }">
          <span class="truncate">{{ category.name }}</span>
        </template>
      </USelectMenu>
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.name" 
        ref="nameInputs"
        size="sm"  
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'name', 'up')"
        @keydown.down.prevent="moveFocus(index, 'name', 'down')"
        @keydown.left.prevent="moveFocus(index, 'name', 'left')"
        @keydown.right.prevent="moveFocus(index, 'name', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.rate" 
        type="number" 
        ref="rateInputs"
        size="sm"  
        @keydown.enter="moveFocus(index, 'rate', 'right')"
        @keydown.up.prevent="moveFocus(index, 'rate', 'up')"
        @keydown.down.prevent="moveFocus(index, 'rate', 'down')"
        @keydown.left.prevent="moveFocus(index, 'rate', 'left')"
        @keydown.right.prevent="moveFocus(index, 'rate', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.qty"  
        ref="qtyInputs" 
        type="number" 
        size="sm"  
         @keydown.enter="moveFocus(index, 'qty', 'right')"
        @keydown.up.prevent="moveFocus(index, 'qty', 'up')"
        @keydown.down.prevent="moveFocus(index, 'qty', 'down')"
        @keydown.left.prevent="moveFocus(index, 'qty', 'left')"
        @keydown.right.prevent="moveFocus(index, 'qty', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.discount" 
        type="text"
        ref="discountInputs" 
        size="sm"  
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'discount', 'up')"
        @keydown.down.prevent="moveFocus(index, 'discount', 'down')"
        @keydown.left.prevent="moveFocus(index, 'discount', 'left')"
        @keydown.right.prevent="moveFocus(index, 'discount', 'right')"
      />
    </td>
    <td class="py-1 whitespace-nowrap">
      <UInput 
        v-model="row.tax" 
          ref="taxInputs"
        type="number" 
        size="sm" 
        @keydown.enter="addNewRow(index)"
        @keydown.up.prevent="moveFocus(index, 'tax', 'up')"
        @keydown.down.prevent="moveFocus(index, 'tax', 'down')"
        @keydown.left.prevent="moveFocus(index, 'tax', 'left')"
        @keydown.right.prevent="moveFocus(index, 'tax', 'right')"
      />
    </td>
    <td class="py-1 ps-2 whitespace-nowrap">
      {{ row.value }}
    </td>
  </tr>
</tbody>


          </table>
          
        </div>

        
         

  <template #footer>
   <div class="px-3 py-2">
            <div>
           Qty: {{ tQty }}
            </div>
          </div>
        <!-- Other form elements -->
         <div v-if="!token && !isMobile" class="sm:grid hidden grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm px-3 py-3">

          <div class="">

        <!-- Discount Input -->
        <div class="mb-6">
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-)</label>
          <UInput
            ref="discountref"
            type="text"
            v-model="discount"
            @keydown.enter.prevent="handleEnterMainDiscount()"
            placeholder="Enter discount"
          />
        </div>

  <!-- Subtotal Display -->
  <div class="border border-primary-700 dark:border-primary-300 rounded-md mb-7">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Sub Total</div>
    <div class="text-primary-700 dark:text-primary-300 font-bold text-3xl leading-none">₹{{ subtotal.toFixed(2) }}</div>
  </div>
</div>
    

  <!-- Grand Total Display -->
   <div class="border border-green-700 dark:border-green-300 rounded-md">
  <div class="flex flex-col items-center justify-center py-3">
    <div class="text-s">Grand Total</div>
    <div class="text-green-700 dark:text-green-300 font-bold text-3xl leading-none ">₹{{ grandTotal.toFixed(2) }}</div>
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
              <div class="w-full flex flex-row gap-2">
                <USelect
                  ref="paymentref"
                  v-model="paymentMethod"
                  :options="['Cash', 'UPI', 'Card', 'Split', 'Credit']"
                  @keydown.enter.prevent="handleEnterPayment(index)"
                  class="flex-1"
                />
                <UButton
                  icon="i-heroicons-pencil-square"
                  size="sm"
                  color="primary"
                  square
                  variant="solid"
                  class="w-auto"
                  @click="handleSplit"
                />
              </div>
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
              <UButton color="primary" block @click="isOpen=true" :disabled="isSavingAcc">Add Account</UButton>
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

        <!-- mobile view -->
        <div  v-if="isMobile" class="sm:hidden flex flex-col gap-3 py-3 text-sm px-2" >
        <div class="">
          <label class="block text-gray-700 font-medium">Dis % (+) / Round Off (-)</label>
          <UInput
          ref="discountref"
          type="text"
          v-model="discount"
          @keydown.enter.prevent="handleEnterMainDiscount()"
          placeholder="Enter discount"
          />
        </div>

        <div class="">
          <label class="block text-gray-700 font-medium">Payment Method</label>
          <div class="w-full flex flex-row gap-2">
            <USelect
            ref="paymentref"
            v-model="paymentMethod"
            :options="['Cash', 'UPI', 'Card', 'Split', 'Credit']"
            @keydown.enter.prevent="handleEnterPayment(index)"
            class="flex-1"
            />
            <UButton
            icon="i-heroicons-pencil-square"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            @click="handleSplit"
            />
          </div>    
        </div>    

        <div class="">
          <label class="block text-gray-700 font-medium">Sales Return AMT</label>
          <UInput v-model="returnAmt" />
        </div>

        <div class=" flex flex-row gap-2">
          <div class="">
            <label class="block text-gray-700 font-medium">Cell No.</label>
            <UInput v-model="phoneNo" :loading="isClientLoading" icon="i-heroicons-magnifying-glass-20-solid" @keydown.enter.prevent="handleEnterPhone"/>
          </div>
          <div class="">
            <label class="block text-gray-700 font-medium">Name</label>
            <UInput v-model="clientName" />
          </div>
        </div>

        <div class="">
          <label class="block text-gray-700 font-medium">Account Name</label>
          <div class="w-full flex flex-row gap-2">
            <UInputMenu class="flex-1" v-model="selected" :options="accounts" value-attribute="id" option-attribute="name"/>
            <UButton
            icon="i-heroicons-plus"
            size="sm"
            color="primary"
            square
            variant="solid"
            class="w-auto"
            :disabled="isSavingAcc"
            @click="isOpen=true"
            />
          </div>
        </div>

          <div>
            <label class="block text-gray-700 font-medium">Token</label>
            <div class=" flex flex-row items-center justify-between gap-2">
              <UInput v-model="token" label="Token" type="text" placeholder="Token No" class="w-full" />
              <UButton color="primary" label="Token Entries " hidden @click="isTokenOpen=true" class=""/>
            </div>
          </div>

        </div>

         

        <div v-else class="w-full flex-wrap gap-4  px-3 py-3 hidden sm:flex">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  v-if="!token" :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  v-if="token" ref="savetokenref" color="green" class="flex-1" block @click="handleTokenSave">Save</UButton>
          <UButton color="gray" class="flex-1" block disabled>Delete</UButton>
          <UButton class="flex-1" block>Barcode Search</UButton>
          <UButton v-if="!token" class="flex-1" @click="issalesReturnModelOpen = true" block>Sales Return</UButton>
          <UButton v-if="!token" class="flex-1"  @click="isClientAddModelOpen = true" block>Add Client</UButton>
        </div>

          <div v-if="isMobile" class="w-full flex flex-wrap gap-4  px-3 py-3 sm:hidden">
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  v-if="!token" :loading="isSaving" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  v-if="token" ref="savetokenref" color="green" class="flex-1" block @click="handleTokenSave">Save</UButton>
          <UButton v-if="!token" class="flex-1" @click="issalesReturnModelOpen = true" block>Return</UButton>
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
          <UInput v-model="account.phone" label="Phone No" placeholder="Enter Phone Number" required />

          <!-- Address -->
          <h3 class="text-md font-semibold mt-4">Address Details</h3>
          <UInput v-model="account.street" label="Street" placeholder="Enter street name" required />
          <UInput v-model="account.locality" label="Locality" placeholder="Enter locality" required />
          <UInput v-model="account.city" label="City" placeholder="Enter city name" required />
          <UInput v-model="account.state" label="State" placeholder="Enter state name" required />
          <UInput v-model="account.pincode" label="Pincode" placeholder="Enter pincode" required />


          <!-- Submit Button -->
          <UButton @click="submitForm" :disabled="isSavingAcc" block>Submit</UButton>
        </div>
      </UModal>


     
<!-- sales return -->
<BillingSalesReturn
  v-model="issalesReturnModelOpen"
  @totalreturnvalue="handleReturnData"
/>
<BillingAddClient
  v-model:model="isClientAddModelOpen"
  v-model:phoneNo="phoneNo"
  :onVerify="handleEnterPhone"
/>

<!-- token modal -->
    <UModal v-model="isTokenOpen">
        <div class="p-4 space-y-4">
          <div v-for="(entry, index) in tokenEntries" :key="index">
            <div class="flex flex-row items-center">
              <UInput ref="tokenInputs" v-model="tokenEntries[index]" size="sm" type="text" @keydown.enter="handleTokenInputEnter(index)"   @keydown.delete="(event) => handleTokenDelete(index, event)" />
              <UButton 
                icon="i-heroicons-trash" 
                color="red" 
                class="ms-2" 
                @click="removeEntry(index)"
                :disabled="tokenEntries.length === 1"
              />
            </div>
          </div>

          <div class="mt-4">
            <UButton  color="green" @click="addEntry" >Add</UButton>
          </div>

          <UButton ref="addTokenRef"  @click="submitEntryForm" block class="mt-4">Submit</UButton>
        </div>
    </UModal>

   <!-- split payment method modal -->
   <UModal v-model="showSplitModal">
  <div class="p-4 space-y-4">
    <h2 class="text-lg font-semibold">Split Payment</h2>

    <div
      v-for="(method, index) in paymentOptions"
      :key="method"
      class="flex gap-2 items-center"
    >
      <USelect
        v-model="tempSplits[method].method"
        :options="[method]"
        disabled
        class="w-1/2"
      />
      <UInput
        v-model.number="tempSplits[method].amount"
        type="number"
        placeholder="Enter amount"
        class="w-1/2"
        @update:modelValue="() => handleAmountEntry(method)"
      />
    </div>

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
                @click="print"
            />
            <UButton color="red" label="NO" @click="isPrint = false" />
        </template>
    </UDashboardModal>

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

