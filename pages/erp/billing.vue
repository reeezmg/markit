
<script setup>
import { useCreateBill,useCreateTokenEntry,useFindFirstItem,useFindManyTokenEntry, useFindManyCategory, useUpdateVariant,useUpdateItem, useCreateAccount,useFindManyAccount, useDeleteTokenEntry } from '~/lib/hooks';

const CreateBill = useCreateBill();
const CreateTokenEntry = useCreateTokenEntry();
const CreateAccount = useCreateAccount();
const UpdateVariant = useUpdateVariant();
const UpdateItem = useUpdateItem();
const DeleteTokenEntry = useDeleteTokenEntry();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();
const router = useRouter();
const isTaxIncluded = useAuth().session.value?.isTaxIncluded;
const date = ref(new Date().toISOString().split('T')[0]);
const discount = ref(0);
const subtotal = computed(() => {
  return items.value.reduce((sum, item) => sum + (item.value || 0), 0);
});
const grandTotal = ref(0);
const returnAmt = ref(0);
const paymentMethod = ref('Cash');
const voucherNo = ref('');
const cellNo = ref('');
const points = ref(0);
const name = ref('');
const scannedBarcode = ref("");
const token = ref("")
const tokenEntries = ref([])

const qtyInputs = ref([]);
const barcodeInputs = ref([]);
const discountref = ref();
const paymentref = ref();
const saveref = ref();
const savetokenref = ref();
const addTokenRef = ref();
const tokenInputs = ref(['']);

const isOpen = ref(false);
const isTokenOpen = ref(false);
const account = ref({
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
});
const selected = ref({});


const items = ref([
  { id:'', variantId:'',name:'',sn: 1, barcode: '',category:[], size:'',item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0,sizes:{}, totalQty:0 },
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
  if(Object.keys(newSelected).length !== 0 ){
    paymentMethod.value = 'credit'
  }
  console.log(newSelected)
})

watch(items, () => {
  items.value.forEach((item) => {
    let baseValue = item.qty * item.rate;

    if (item.discount < 0) {
      baseValue -= Math.abs(item.discount);
    } else {
      baseValue -= (baseValue * item.discount) / 100;
    }

    baseValue -= (baseValue * item.tax) / 100;
    
    item.value = Math.max(baseValue, 0); 
    
  });

}, { deep: true });

watch([discount, subtotal], ([newDiscount, newTotal]) => {
  let baseValue = newTotal; // Use the updated total value

  if (newDiscount < 0) {
    baseValue -= Math.abs(newDiscount);
  } else {
    baseValue -= (baseValue * newDiscount) / 100;
  }

  grandTotal.value = parseFloat(Math.max(baseValue, 0).toFixed(2));
  // Prevent negative values
});


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
    category: {},
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

onMounted(() => {
  // Initialize column widths (optional)
  const ths = resizableTable.value.querySelectorAll('th');
  ths.forEach((th) => {
    th.style.width = `${th.offsetWidth}px`;
  });
});

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
  where: { barcode: scannedBarcode.value },
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
        tax:true,
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


const entryargs = computed(() => ({
    where: {
        tokenNo: { in: tokenEntries.value }  // Fetch all entries matching tokenNos
    }
}));

const { data: itemdata ,refetch:itemRefetch} = useFindFirstItem(itemargs);
const { data: entrydata ,refetch:entryRefetch} = useFindManyTokenEntry(entryargs,{enable:false});

const handleEnterBarcode = (barcode,index) => {
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


const fetchItemData = async (barcode, index) => {
  if (!barcode) return;

  scannedBarcode.value = barcode;
  console.log(scannedBarcode.value);

  await itemRefetch();

  if (itemdata.value) {
    
    const categoryId = itemdata.value.variant.product.categoryId;
    
    items.value[index].id = itemdata.value.id || '';
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


const handleSave = async () => {
  items.value = items.value.filter(item =>
  item.name?.trim() || item.barcode?.trim() || item.category?.length > 0
);

if (items.value.length === 0) {
  toast.add({ title: 'No valid items to bill.', color: 'red' });
  return;
}
  try {
    const billResponse = await CreateBill.mutateAsync({
      data: {
        subtotal: subtotal.value,
        discount: discount.value,
        grandTotal: grandTotal.value,
        paymentMethod: paymentMethod.value,
        createdAt: new Date(date.value).toISOString(),
        paymentStatus: Object.keys(selected.value).length !== 0 ? 'PENDING' : 'PAID',
        ...(Object.keys(selected.value).length !== 0 && { 
          account: { connect: { id: selected.value.id } }
        }),
        company: {
          connect: {
            id: useAuth().session.value?.companyId,
          },
        },
        type:'BILL',
        entries: {
          create: items.value.map(item => ({
            ...(item.barcode && { barcode: item.barcode }),
            qty: item.qty,
            rate: item.rate,
            discount: item.discount,
            name:item.name,
            //variantId present only when entry is barcoded 
            ...(item.variantId && { variant:{ connect: { id: item.variantId } }}),
            tax: item.tax,
            value: item.value,
            ...(item.category[0]?.id && {category: { connect: { id: item.category[0].id } }}),
            ...(item.barcode && {
              item: {
                connect: { id: item.id },
              },
            }),
          })),
        },
      },
    });

    toast.add({
      title: 'Bill created successfully!',
     color:'green',
      })

  } catch (error) {
    console.error('Error creating bill', error);
    toast.add({
      title: 'Bill creation failed!',
      color:'red',
      })
  }

  // Collect all async operations in an array
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
          data: { qty: updatedQty, sizes: updatedSizes }
        }).catch(error => console.error(`Error updating variant ${item.variantId}`, error))
      );

      updatePromises.push(
        UpdateItem.mutateAsync({
          where: { id: item.id },
          data: { status: 'sold' }
        }).catch(error => console.error(`Error updating item ${item.id}`, error))
      );
    }
  }

  // Wait for all updates to finish before proceeding
  await Promise.all(updatePromises);

  try {
    tokenEntries.value = tokenEntries.value.filter(token => token.trim() !== '');
    if (tokenEntries.value.length > 0) {
      await DeleteTokenEntry.mutateAsync({
        where: { tokenNo: { in: tokenEntries.value } }
      });
      console.log('Token entries deleted successfully');
    }
  } catch (error) {
    console.error('Error deleting token entries', error);
  }

  // ✅ Reset items only after all Prisma operations are complete
  items.value = [
    { id: '', variantId: '', sn: 1, size: '', barcode: '', category: [], item: '', qty: 1, rate: 0, discount: 0, tax: 0, value: 0, sizes: {}, totalQty: 0 }
  ];
  discount.value = 0;
  paymentMethod.value = 'Cash';
  tokenEntries.value = [''];
};




const {
    data: accounts
} = useFindManyAccount({
      where: { companyId: useAuth().session.value?.companyId},
});


const submitForm = async () => {
  try {
    const res = await CreateAccount.mutateAsync({
      data: {
                name: account.value.name,
                phone: account.value.name,
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
    console.log(error)
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
  items.value = [
    { id:'', variantId:'',sn: 1,size:'', barcode: '',category:[], item: '', qty: 1,rate: 0, discount: 0, tax: 0, value: 0, sizes:{}, totalQty:0 }
  ];
  discount.value = 0;
  paymentMethod.value = 'Cash';

  token.value = '';
  tokenEntries.value = [''];
  grandTotal.value = 0;
  returnAmt.value = 0;
  cellNo.value = '';
  points.value = 0;
  name.value = '';
  voucherNo.value = '';
  selected.value = {};
  account.value = {
    name: '',
    phone:'',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
  };

};


</script>


<template>
  <UDashboardPanelContent class="p-1">
    <div>
      <UCard class="max-w-[1400px] mx-auto">
        <div class="mb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 text-sm">
        <UInput v-if="!token" v-model="date" type="date" label="Date" class="lg:col-span-2" />
        <UInput v-model="token" label="Token" type="text" placeholder="Token No" class="lg:col-span-2" />
        <UButton color="primary" label="Token Entries " block @click="isTokenOpen=true" class="lg:col-start-11 lg:col-span-2"/>
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

        <!-- Other form elements -->
        <div v-if="!token" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm mt-4">
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sub Total</label>
              <UInput :model-value="subtotal"  disabled />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Discount %</label>
              <UInput ref="discountref"  type="number" v-model="discount" @keydown.enter.prevent="handleEnterMainDiscount()" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Payment Method</label>
              <USelect ref="paymentref" v-model="paymentMethod" :options="['Cash', 'Card']" @keydown.enter.prevent="handleEnterPayment(index)" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Account Name</label>
              <UInputMenu v-model="selected" :options="accounts" value-attribute="id" option-attribute="name"/>
            </div>
          </div>
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Sales Return AMT</label>
              <UInput v-model="returnAmt" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Total Redeemed AMT</label>
              <UInput v-model="returnAmt" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Grand Total</label>
              <UInput v-model="grandTotal" type="number" disabled class="font-bold rounded-md border-2 border-primary-300" />
            </div>
            <div class="mt-8">
              <UButton color="primary" block @click="isOpen=true">Add Account</UButton>
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
            <div>
              <UButton color="green" class="mt-9" block>Redeem Voucher</UButton>
            </div>
          </div>
          <div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Cell No.</label>
              <UInput v-model="cellNo" :loading="false" icon="i-heroicons-magnifying-glass-20-solid" />
            </div>
            <div class="mb-4">
              <label class="block text-gray-700 font-medium">Name</label>
              <UInput v-model="name" />
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
          <UButton color="blue" class="flex-1" block @click="newBill" >New</UButton>
          <UButton  v-if="!token" ref="saveref" color="green" class="flex-1" block @click="handleSave">Save</UButton>
          <UButton  v-if="token" ref="savetokenref" color="green" class="flex-1" block @click="handleTokenSave">Save</UButton>
          <UButton color="gray" class="flex-1" block disabled>Delete</UButton>
          <UButton class="flex-1" block>Barcode Search</UButton>
          <UButton v-if="!token" class="flex-1" block>Sales Return</UButton>
          <UButton v-if="!token" class="flex-1" block>Bill Search</UButton>
        </div>
      </UCard>
    </div>
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
          <UButton @click="submitForm" block>Submit</UButton>
        </div>
      </UModal>


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