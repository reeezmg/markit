<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import type { Prisma } from '@prisma/client'
import { BillingAddClient } from '#components';

import {
    useFindManyClient,
    useUpdateClient,
    useUpdateManyClient,
    useUpdatePipeline,
    useUpdateBill,
    useCountClient
} from '~/lib/hooks';


const UpdateClient = useUpdateClient({ optimisticUpdate: true });
const UpdatePipeline = useUpdatePipeline({ optimisticUpdate: true });
const UpdateManyClient = useUpdateManyClient({ optimisticUpdate: true });
const UpdateBill = useUpdateBill({ optimisticUpdate: true });
const router = useRouter();
const route = useRoute();
const useAuth = () => useNuxtApp().$auth;
const isClientAddModelOpen = ref(false);
const phoneNo = ref('');

// Columns
const columns = [
    {
        key: 'name',
        label: 'name',
        sortable: true,
    },
    {
        key: 'phone',
        label: 'Phone No',
        sortable: true,
    },
    {
        key: 'email',
        label: 'Email',
        sortable: true,
    },
    {
        key: 'points',
        label: 'Points',
        sortable: true,
    },
    {
        key: 'status',
        label: 'Status',
        sortable: true,
    },
    {
        key: 'actions',
        label: 'Actions',
        sortable: false,
    },
];

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





const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

// Selected Rows
const selectedRows = ref([]);

// Actions
const active = (selectedRows) => [
    [
        {
            key: 'active',
            label: 'Active',
            icon: 'i-heroicons-check',
            click: () =>
                multiToggle(
                    selectedRows.map((item) => {
                        return item.id;
                    }),
                    true,
                ),
        },
    ],
    [
        {
            key: 'inactive',
            label: 'Inactive',
            icon: 'i-heroicons-x-mark',
            click: () =>
                multiToggle(
                    selectedRows.map((item) => {
                        return item.id;
                    }),
                    false,
                ),
        },
    ],
    [
        {
            key: 'delete',
            label: 'Delete',
            icon: 'i-heroicons-trash',
        },
    ],
];

const action = (row) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => router.push(`products/edit/${row.id}`),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
        },
    ],
];

const billAction = (row:any) => [
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
            click: () => deleteBill(row.id),
        },
    ],
];




const pipelineStatus = (row) => [
    [
        {
            label: 'new',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => changePipeline(useAuth().session.value?.pipelineId,row.pipelineStatus,'new',row.id),
        },
    ],
    
    [
        {
            label: 'prospect',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => changePipeline(useAuth().session.value?.pipelineId,row.pipelineStatus,'prospect',row.id),
        },
    ],
    
    [
        {
            label: 'viewing',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => changePipeline(useAuth().session.value?.pipelineId,row.pipelineStatus,'viewing',row.id),
        },
    ],
    
    [
        {
            label: 'reject',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => changePipeline(useAuth().session.value?.pipelineId,row.pipelineStatus,'reject',row.id),
        },
    ],
    
    [
        {
            label: 'close',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => changePipeline(useAuth().session.value?.pipelineId,row.pipelineStatus,'close',row.id),
        },
    ],
    
];


const deleteBill = async (id:string) => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            deleted:true
        }
    })
};



const changePipeline = async(pipelineId:string | undefined,fromPipeline:string,toPipeline:string,clientId:string) => {
    const res = await UpdatePipeline.mutateAsync({
      where: { id: pipelineId },
      data: {
        ['prospectClients']: {
          disconnect: { id: clientId },
        },
      },
    });

    // Add the client to the specified category in the toPipeline
    if(res){
        await UpdatePipeline.mutateAsync({
      where: { id: pipelineId },
      data: {
        [`${toPipeline}Clients`]: {
          connect: { id: clientId },
        },
      },
    });
    }

    await UpdateClient.mutateAsync({
      where: { id: clientId },
      data: {
        pipelineStatus:toPipeline
      },
    });
  
  

}

// Filters
const todoStatus = [
    {
        key: 'inactive',
        label: 'Inactive',
        value: false,
    },
    {
        key: 'active',
        label: 'Active',
        value: true,
    },
    {
        key: 'reset',
        label: 'Reset',
        value: true,
    },  
];

const search = ref('');
const selectedStatus = ref<any>([]);

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};

// Pagination
const sort = ref({ column: 'name', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });
const page = ref(1);
const pageCount = ref('10');
const pageFrom = computed(() => (page.value - 1) * Number(pageCount.value) + 1);
const pageTo = computed(() =>
    Math.min(page.value * Number(pageCount.value), pageTotal.value),
);

// Data
const queryArgs = computed<Prisma.ClientFindManyArgs>(() => {
  const companyId = useAuth().session.value?.companyId
  const searchTerm = search.value?.trim()

  const selectedStatusCondition =
    selectedStatus.value.length > 0
      ? {
          OR: selectedStatus.value.map(item => ({
            status: item.value,
          })),
        }
      : {}

  return {
    where: {
      AND: [
        // client must belong to current company
        {
          companies: {
            some: {
              companyId,
            },
          },
        },

        // search
        ...(searchTerm
          ? [{
              OR: [
                {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: searchTerm,
                  },
                },
              ],
            }]
          : []),

        selectedStatusCondition,
      ],
    },

    orderBy: {
      [sort.value.column]: sort.value.direction,
    },

    skip: (page.value - 1) * Number(pageCount.value),
    take: Number(pageCount.value),

    include: {
      // 🔥 THIS is where points come from
      companies: {
        where: {
          companyId,
        },
        select: {
          points: true,
        },
      },

      bills: {
        include: {
          entries: true,
        },
      },
    },
  }
})

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const {
    data: clients,
    isLoading,
    error,
    refetch,
} = useFindManyClient(queryArgs);

const { data: pageTotal } = useCountClient(countArgs);

const handleEnterPhone = async() => {
  
}

const handleClientAdded = (id,name) => {
 
};


async function multiToggle(ids, status: boolean) {
    try {
        await UpdateManyClient.mutateAsync({
            where: { id: { in: ids } },
            data: { status: status },
        });
    } catch (error) {
        console.error('Error updating product status:', error);
    }
}

async function toggleStatus(id: string) {
    if (clients.value) {
        const clientToUpdate = clients.value.find((item) => item.id === id);
        if (!clientToUpdate) return;

        const updatedStatus = !clientToUpdate.status;

        try {
            await UpdateClient.mutateAsync({
                where: { id },
                data: { status: updatedStatus },
            });
        } catch (error) {
            console.error('Error updating product status:', error);
        }
    }
}

const handleUpdate = async (id:string) => {
    const res = await UpdateBill.mutateAsync({
        where:{
            id
        },
        data:{
            notes:notes.value[id]
        }
    })

    console.log(res)

};

const handleChange = (value:string, row:any) => {
    notes.value[row.id] = value;
};

const downloadClientsAsVCF = () => {
  if (!clients.value || clients.value.length === 0) {
    return;
  }

  // Build vCard entries for each client
  const vcfData = clients.value
    .map((client) => {
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${client.name || ''}`, // Full Name
        client.phone ? `TEL;TYPE=CELL:${client.phone}` : '',
        client.email ? `EMAIL:${client.email}` : '',
        'END:VCARD',
      ]
        .filter(Boolean) // remove empty lines
        .join('\n');
    })
    .join('\n');

  // Create Blob and trigger download
  const blob = new Blob([vcfData], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'clients.vcf';
  a.click();

  URL.revokeObjectURL(url);
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
                <!-- Left side: Search + Status -->
                <div class="flex flex-row gap-3 w-full sm:w-auto">
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    placeholder="Search..."
                    class="w-full sm:w-auto"
                />
                  <USelectMenu
                        v-model="selectedStatus"
                        :options="todoStatus"
                        multiple
                        placeholder="Status"
                        class="w-full sm:w-40"
                    />
            </div>
                <div class="flex flex-row gap-3 w-full sm:w-auto justify-end">
                  
                    <UButton
                        class="w-full flex-1 sm:w-auto sm:flex-none"
                        icon="i-heroicons-plus"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Add Client"
                        @click="isClientAddModelOpen = true" 
                    />
                    <UButton
                        class="w-full flex-1 sm:w-auto sm:flex-none"
                        icon="i-heroicons-arrow-down-tray"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Download"
                        @click="downloadClientsAsVCF"
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
                        :options="[3, 5, 10, 20, 30, 40]"
                        class="me-2 w-20"
                        size="xs"
                    />
                </div>

                <div class="flex gap-1.5 items-center z-10">
                    <UDropdown
                        v-if="selectedRows.length > 1"
                        :items="active(selectedRows)"
                        :ui="{ width: 'w-36' }"
                    >
                        <UButton
                            icon="i-heroicons-chevron-down"
                            trailing
                            color="gray"
                            size="xs"
                        >
                            Mark as
                        </UButton>
                    </UDropdown>

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
                v-model="selectedRows"
                v-model:sort="sort"
                v-model:expand="expand"
                :rows="clients"
                :columns="columnsTable"
                :loading="isLoading"
                :multiple-expand="false"
                sort-asc-icon="i-heroicons-arrow-up"
                sort-desc-icon="i-heroicons-arrow-down"
                sort-mode="manual"
                class="w-full"
              
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

                <template #points-data="{ row }">
                   {{ row.companies[0]?.points || 0 }}
                </template>

                <template #status-data="{ row }">
                    <Switch
                        v-model="row.status"
                        @click="toggleStatus(row.id)"
                        :class="[
                            row.status ? 'bg-orange-400' : 'bg-gray-200',
                            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2',
                        ]"
                    >
                        <span class="sr-only">Use setting</span>
                        <span
                            :class="[
                                row.status ? 'translate-x-5' : 'translate-x-0',
                                'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                            ]"
                        >
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-0 duration-100 ease-out'
                                        : 'opacity-100 duration-200 ease-in',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-gray-400"
                                    fill="none"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M4 8l2-2m0 0l2-2M6 6L4 4m2 2l2 2"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    />
                                </svg>
                            </span>
                            <span
                                :class="[
                                    row.status
                                        ? 'opacity-100 duration-200 ease-in'
                                        : 'opacity-0 duration-100 ease-out',
                                    'absolute inset-0 flex h-full w-full items-center justify-center transition-opacity',
                                ]"
                                aria-hidden="true"
                            >
                                <svg
                                    class="h-3 w-3 text-orange-400"
                                    fill="currentColor"
                                    viewBox="0 0 12 12"
                                >
                                    <path
                                        d="M3.707 5.293a1 1 0 00-1.414 1.414l1.414-1.414zM5 8l-.707.707a1 1 0 001.414 0L5 8zm4.707-3.293a1 1 0 00-1.414-1.414l1.414 1.414zm-7.414 2l2 2 1.414-1.414-2-2-1.414 1.414zm3.414 2l4-4-1.414-1.414-4 4 1.414 1.414z"
                                    />
                                </svg>
                            </span>
                        </span>
                    </Switch>
                </template>

                <template #name-data="{ row }">
                    <div class="flex flex-row items-center">
                        <div class="ms-3">{{ row.name }}</div>
                    </div>
                </template>
                 <template #expand="{ row }">
                    <UTable 
                        :rows="row.bills" 
                        :columns="billColumns"
                    >
                      <template #actions-data="{ row }">
                    <UDropdown :items="billAction(row)">
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

                <template #createdAt-data="{ row }">
                    {{ row.createdAt.toLocaleDateString('en-GB') }}
                </template>

                <template #paymentStatus-data="{ row }">
                    {{ row.paymentStatus }}
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

            <!-- Number of rows & Pagination -->
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
                        :page-count="pageCount"
                        :total="pageTotal"
                        :ui="{
                            wrapper: 'flex items-center gap-1',
                            rounded:
                                '!rounded-full min-w-[32px] justify-center',
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

<BillingAddClient
  v-model:model="isClientAddModelOpen"
  v-model:phoneNo="phoneNo"
  :onVerify="handleEnterPhone"
  :clientAdded="handleClientAdded"
/>
    </UDashboardPanelContent>
</template>
