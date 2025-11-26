<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import type { Period, Range } from '~/types';
import {
    useUpdateBill,
    useFindManyAccount,
    useCreateAccount,
    useUpdateAccount,
    useDeleteAccount,
    useCountAccount
} from '~/lib/hooks';
import type { Prisma } from '@prisma/client'
import { sub, format, isSameDay, type Duration } from 'date-fns'
const toast = useToast();
const UpdateBill = useUpdateBill({ optimisticUpdate: true });
const CreateAccount = useCreateAccount({ optimisticUpdate: true });
const UpdateAccount = useUpdateAccount({ optimisticUpdate: true });
const DeleteAccount = useDeleteAccount({ optimisticUpdate: true });
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const isSavingAcc = ref(false);
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
const isDeleteAccountModalOpen = ref(false)
const deletingAccountRowIdentity = ref({});
const isDeleteBillModalOpen = ref(false)
const deletingBillRowIdentity = ref({});

const selectedDate = ref({ 
    start: new Date() , 
    end: new Date() 
});

// Columns
const billColumns = [
    {
        key: 'invoiceNumber',
        label: 'Inv#',
        sortable: true,
    },
    {
        key: 'createdAt',
        label: 'Date',
        sortable: true,
    },
    {
        key: 'entries',
        label: 'Entries',
        sortable: true,
    },
    {
        key: 'grandTotal',
        label: 'Total',
        sortable: true,
    },
    {
        key: 'paymentStatus',
        label: 'Payment',
        sortable: true,
    },
    {
        key: 'notes',
        label: 'Notes',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
];

// Columns
const columns = ref([
    {
        key: 'name',
        label: 'Name',
        sortable: true,
    },
    {
        key: 'phone',
        label: 'Phone',
        sortable: true,
    },
    {
        key: 'pending',
        label: 'Pending',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
]);


const action = (row:any) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`./edit/${row.id}`),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
             click: () => {
                isDeleteBillModalOpen.value = true
                deletingBillRowIdentity.value = {name:row.invoiceNumber,id:row.id}
            }
        },
    ],
];
const actionAccount = (row:any) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => openEditModal(row),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
            click: () => {
                isDeleteAccountModalOpen.value = true
                deletingAccountRowIdentity.value = {name:row.name,id:row.id}
            }
        },
    ],
];

// Filters
const status = [
    {
        label: 'Paid',
        value: 'PAID',
    },
    {
        label: 'Pending',
        value: 'PENDING',
    },
];

const selectedColumns = ref([]);
watch(columns, (newColumns) => {
  selectedColumns.value = [...newColumns];
}, { immediate: true });

const columnsTable = computed(() =>
  columns.value.filter((column) => selectedColumns.value.includes(column))
);

const notes = ref<any>({})

const search = ref<number | null>(null);
const selectedStatus = ref<any>([]);
const searchStatus = ref(undefined);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};



// Pagination
const sort = ref({ column: 'name', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('5');

const queryArgs = computed<Prisma.AccountFindManyArgs>(() => {
  const statusFilters = selectedStatus.value?.length
    ? {
        bill: {
          some: {
            deleted: false,
            paymentStatus: {
              in: selectedStatus.value.map((s: any) => s.value),
            },
          },
        },
      }
    : {};

  return {
    where: {
      companyId: useAuth().session.value?.companyId,
      ...(search.value && {
        OR: [
          { name: { contains: search.value, mode: 'insensitive' } },
          { phone: { contains: search.value, mode: 'insensitive' } },
        ],
      }),
      ...statusFilters,
    },
    include: {
      address: true,
      bill: {
        where: {
          deleted: false,
        },
        include: {
          entries: {
            include: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      [sort.value.column]: sort.value.direction,
    },
    skip: (page.value - 1) * parseInt(pageCount.value),
    take: parseInt(pageCount.value),
  };
});



const {
    data: accounts,
    isLoading,
    error,
    refetch,
} = useFindManyAccount(queryArgs);


const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal } = useCountAccount(countArgs);

const pageFrom = computed(() => (page.value - 1) * parseInt(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * parseInt(pageCount.value), pageTotal.value || 0),
);




const deleteBillRow = () => {
    try{
        updateBill.mutate({
        where:{
            id: deletingBillRowIdentity.value.id
        },
        data:{
            deleted:true
        }
    })
     toast.add({
            title: `Bill No ${deletingBillRowIdentity.value.name} deleted successfully!`,
            color: 'green',
        });
    }catch(err){
        toast.add({
          title: 'Error while deleting the bill entries',
          description: error.message,
          color: 'red',
        });
    }finally{
        isDeleteBillModalOpen.value = false;
    }
};



const handleUpdate = async (id:string) => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            notes:notes.value[id]
        }
    })


};

const handleChange = (value:string, row:any) => {
    notes.value[row.id] = value;
};

const onPaymentStatusChange = async (id:string, status:string, billNo) => {
    try{
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            paymentStatus:status,
            ...(status === 'PAID' && {
                createdAt: new Date().toISOString()
            })
        }
    })
     toast.add({
          title: `Bill ${billNo} status changed to ${status}`,
          color: 'green',
        });
    }catch(err){
         toast.add({
          title: 'Error while changing the bill status',
          color: 'red',
        });
    }
}

const openEditModal = (row:any) => {
    account.value = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        street: row.address?.street || '',
        locality: row.address?.locality || '',
        city: row.address?.city || '',
        state: row.address?.state || '',
        pincode: row.address?.pincode || '',
    };
    isOpen.value = true;
};


const submitForm = () => {
  isSavingAcc.value = true
  try {
    
    if (!account.value.name) {
        throw new Error(`Plase Fill name`);
      }
    
    if(account.value.id){
        // Update existing account
        const res = UpdateAccount.mutate({
            where: { id: account.value.id },
            data: {
                name: account.value.name,
                phone: account.value.phone,
                address: {
                    update: {
                        street: account.value.street,
                        locality: account.value.locality,
                        city: account.value.city,
                        state: account.value.state,
                        pincode: account.value.pincode,
                    },
                },
            }
        });
        toast.add({
            title: 'Account updated !',
            id: 'modal-success',
        });
    } else {
    const res = CreateAccount.mutate({
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
    }
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

const deleteAccountRow = async () => {
    try {
        DeleteAccount.mutate({
            where: { id: deletingAccountRowIdentity.value.id },
        });
        toast.add({
            title: `Account ${deletingAccountRowIdentity.value.name} deleted successfully!`,
            color: 'green',
        });
    } catch (error) {
        toast.add({
            title: 'Error while deleting the account',
            description: error.message,
            color: 'red',
        });
        console.log(error);
    } finally {
        isDeleteAccountModalOpen.value = false;
    }
};



</script>
<template>
    <UDashboardPanelContent class="pb-24">
        <UCard
            class="w-full"
            :ui="{
                base: '',
                divide: 'divide-y divide-gray-200 dark:divide-gray-700',
                header: { padding: 'px-4 py-5' },
                body: {
                    padding: '',
                    base: 'divide-y divide-gray-200 dark:divide-gray-700',
                },
                footer: { padding: 'p-4' },
            }"
        >
        <!-- Filters -->
            <template #header>
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 w-full">
                <div class="flex sm:flex-row flex-col gap-3 w-full sm:w-auto">
                <div class="flex flex-row gap-3 w-full sm:w-auto">    
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    type="text"
                    placeholder="Search"
                    class="w-full sm:w-40"
                />
                 <USelectMenu
                    v-model="selectedStatus"
                    :options="status"
                    multiple
                    placeholder="Status"
                    class="w-full sm:w-40"
                />
                </div>
                </div>

                
                <!-- Right side: Buttons -->
                <div class="flex flex-row gap-3 w-full sm:w-auto justify-end">
                    <UButton
                    icon="i-heroicons-plus"
                    size="sm"
                    color="primary"
                    variant="solid"
                    label="Add Account"
                    class="w-full flex-1 sm:w-auto sm:flex-none"
                    @click="isOpen = true"
                    />
                </div>   
            </div>
        </template>

            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
                    <USelect
                        v-model="pageCount"
                        :options="[3, 5, 10, 20, 30, 40].map(num => ({ label: num, value: num }))"
                        class="me-2 w-20"
                        size="xs"
                    />
                </div>

                <div class="flex gap-1.5 items-center z-10">

                    <USelectMenu
                        v-model="selectedColumns"
                        :options="columns"
                        multiple
                    >
                        <UButton
                            icon="i-heroicons-view-columns"
                            color="gray"
                            size="xs"
                        >
                            Columns
                        </UButton>
                    </USelectMenu>

                    <UButton
                        icon="i-heroicons-funnel"
                        color="gray"
                        size="xs"
                        :disabled="search === '' && selectedStatus.length === 0"
                        @click="resetFilters"
                    >
                        Reset
                    </UButton>
                </div>
            </div>

            <!-- Table -->
            <UTable
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="accounts"
                :columns="columnsTable"
                :loading="isLoading"
                :multiple-expand="false"
                sort-mode="manual"
                class="w-full"
            >

            <template #pending-data="{ row }">
            {{
                row.bill
                ?.filter(b => b.paymentStatus === 'PENDING')
                .reduce((sum, b) => {
                    if (b.paymentMethod === 'Split' && b.splitPayments) {
                    // Sum only the credit part
                    const creditAmount = b.splitPayments
                        .filter(sp => sp.method === 'Credit')
                        .reduce((cSum, sp) => cSum + (sp.amount ?? 0), 0);
                    return sum + creditAmount;
                    } else {
                    // Normal case → take full grandTotal
                    return sum + (b.grandTotal ?? 0);
                    }
                }, 0)
                .toFixed(2)
            }}
            </template>


                <template #actions-data="{ row }">
                <UDropdown :items="actionAccount(row)">
                    <UButton
                        color="gray"
                        variant="ghost"
                        icon="i-heroicons-ellipsis-horizontal-20-solid"
                    />
                </UDropdown>
            </template>

                <template #expand="{ row }">
                    <UTable 
                        :rows="row.bill" 
                        :columns="billColumns"
                    >
                        <template #actions-data="{ row }">
                            <UDropdown :items="action(row)">
                                <UButton
                                    color="gray"
                                    variant="ghost"
                                    icon="i-heroicons-ellipsis-horizontal-20-solid"
                                />
                            </UDropdown>
                        </template>

                        <template #entries-data="{ row }">
                            {{ row.entries.length }}
                        </template>

                        <template #grandTotal-data="{ row }">
                            <UPopover mode="hover">
                                {{ row.grandTotal }}
                                <template #panel>
                                    <div class="p-4 space-y-1">
                                        <div class="font-semibold">Payment Method:</div>
                                        <div v-if="row.paymentMethod === 'Split'">
                                            <ul class="list-disc list-inside">
                                                <li v-for="(payment, idx) in row.splitPayments" :key="idx">
                                                    {{ payment.method }} – ₹{{ payment.amount }}
                                                </li>
                                            </ul>
                                        </div>
                                        <div v-else>
                                            {{ row.paymentMethod }}
                                        </div>
                                    </div>
                                </template>
                            </UPopover>
                        </template>

                        <template #createdAt-data="{ row }">
                            {{ row.createdAt.toLocaleDateString('en-GB') }}
                        </template>

                        <template #paymentStatus-data="{ row }">
                            <USelect
                                v-model="row.paymentStatus"
                                :options="['PAID', 'PENDING']"
                                @update:model-value="status => onPaymentStatusChange(row.id, status, row.invoiceNumber)"
                                size="xs"
                                class="w-28"
                            />
                        </template>

                        <template #notes-data="{ row }">
                            <UPopover> 
                                <UButton 
                                    color="white" 
                                    :label="row.notes ? 'Open' : 'Add'" 
                                    trailing-icon="i-heroicons-chevron-down-20-solid" 
                                />
                                <template #panel>
                                    <div class="p-4">
                                        <UTextarea 
                                            :model-value="row.notes" 
                                            color="white" 
                                            variant="outline" 
                                            placeholder="Notes..." 
                                            :autoresize="true" 
                                            @update:modelValue="handleChange($event, row)"
                                        />
                                        <UButton
                                            trailingIcon="i-heroicons-cloud-arrow-up"
                                            size="sm"
                                            color="green"
                                            variant="solid"
                                            label="Update"
                                            :trailing="false"
                                            class="mt-3"
                                            @click="handleUpdate(row.id)"
                                        />
                                    </div>
                                </template>
                            </UPopover>
                        </template>
                    </UTable>
                </template>
            </UTable>

            <template #footer>
                <div class="flex flex-wrap justify-between items-center">
                    <div>
                        <span class="text-sm leading-5 hidden sm:block">
                            Showing
                            <span class="font-medium">{{ pageFrom }}</span>
                            to
                            <span class="font-medium">{{ pageTo }}</span>
                            of
                            <span class="font-medium">{{ pageTotal }}</span>
                            results
                        </span>
                    </div>

                    <UPagination
                        v-model="page"
                        :page-count="parseInt(pageCount)"
                        :total="pageTotal"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded: '!rounded-full min-w-[32px] justify-center',
                            default: {
                                activeButton: {
                                    variant: 'outline',
                                },
                            },
                        }"
                    />
                </div>
            </template>
        </UCard>

        
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
          <UButton @click="submitForm" :loading="isSavingAcc" block>Submit</UButton>
        </div>
      </UModal>

      <UDashboardModal
        v-model="isDeleteAccountModalOpen"
        title="Delete Account"
        :description="`Are you sure you want to delete Account ${deletingAccountRowIdentity.name}?`"
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            } as any,
            footer: {
                base: 'ml-16',
            } as any,
        }"
    >
        <template #footer>
            <UButton
                color="red"
                label="Delete"
                @click="() =>  deleteAccountRow()"
            />
            <UButton color="white" label="Cancel" @click="isDeleteAccountModalOpen = false" />
        </template>
    </UDashboardModal>

      <UDashboardModal
        v-model="isDeleteBillModalOpen"
        title="Delete Bill"
        :description="`Are you sure you want to delete Bill ${deletingBillRowIdentity.name}?`"
        icon="i-heroicons-exclamation-circle"
        prevent-close
        :close-button="null"
        :ui="{
            icon: {
                base: 'text-red-500 dark:text-red-400',
            } as any,
            footer: {
                base: 'ml-16',
            } as any,
        }"
    >
        <template #footer>
            <UButton
                color="red"
                label="Delete"
                @click="() =>  deleteBillRow()"
            />
            <UButton color="white" label="Cancel" @click="isDeleteBillModalOpen = false" />
        </template>
    </UDashboardModal>

    </UDashboardPanelContent>
</template>