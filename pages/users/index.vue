<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import { hash } from '~/composables/hash';
import {
    useFindManyCompanyUser,
    useUpdateUser,
    useUpdateManyUser,
    useDeleteCompanyUser,
    useUpdateCompanyUser,
    useCreateUser,
    useFindUniqueUser,
    useCountCompanyUser,
} from '~/lib/hooks';
const userStore = useUserStore()
const toast = useToast();
const isSaving = ref(false)
const isDeleting = ref(false)
const isDeleteModalOpen = ref(false)
const deletingRowIdentinty = ref({})
const CreateUser = useCreateUser({ optimisticUpdate: true });
const UpdateUser = useUpdateUser({ optimisticUpdate: true });
const UpdateManyUser = useUpdateManyUser({ optimisticUpdate: true });
const DeleteCompanyUser = useDeleteCompanyUser({ optimisticUpdate: true });
const UpdateCompanyUser = useUpdateCompanyUser({ optimisticUpdate: true });
const router = useRouter();
const route = useRoute();
const isOpen = ref(false);
const useAuth = () => useNuxtApp().$auth;

// Columns
const columns = [
    {
        key: 'name',
        label: 'name',
        sortable: true,
    },
    {
        key: 'email',
        label: 'email',
        sortable: true,
    },
    {
        key: 'code',
        label: 'Code',
        sortable: true,
    },
    {
        key: 'role',
        label: 'role',
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

const formData = reactive({
    email: '',
    name: '',
    role: { label: '', value: '' },
    id:''
});


const openEdit = (row) => {
    isOpen.value = true 
    formData.email = row.user.email
    formData.name = row.name
    formData.role.label = row.role
    formData.role.value = row.role
    formData.id = row.userId
    }


const action = (row) => [
    [
        {
            label: 'Edit',
            icon: 'i-heroicons-pencil-square-20-solid',
            click: () => openEdit(row),
        },
    ],
    [
        {
            label: 'Delete',
            icon: 'i-heroicons-trash-20-solid',
           click: () => {
                isDeleteModalOpen.value = true
                deletingRowIdentinty.value = {name:row.name,id:row.userId}
                }
        },
    ],
];

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
];

const search = ref('');
const selectedStatus = ref<any>([]);



const options = [
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
];

const resetFilters = () => {
    search.value = '';
    selectedStatus.value = [];
};


const { data: existingUser, refetch: refetchUser } = useFindUniqueUser(
  () => ({ where: { email: formData.email } }),
  { enabled: false }
);



// Pagination
const sort = ref({ column: 'id', direction: 'asc' as const });
const page = ref(1);
const pageCount = ref(10);


const deleteUser = async (id: string) => {
  isDeleting.value = true

  const companyId = useAuth().session.value?.companyId!
  const currentUserId = useAuth().session.value?.id

  try {
    // ✅ Ensure users are loaded
    if (!users.value || users.value.length === 0) {
      throw new Error('User list not loaded')
    }

    // 🔍 Find user being deleted
    const userToDelete = users.value.find(u => u.userId === id)
    if (!userToDelete) return

    // 🔐 Admin safety check
    if (userToDelete.role === 'admin') {
      const adminCount = users.value.filter(u => u.role === 'admin' && !u.deleted).length

      if (adminCount <= 1) {
        alert('At least one admin must remain in the company')
            toast.add({
            title: 'At least one admin must remain in the company!',
            description: 'You cannot delete the last admin user.',
            color: 'red',
            id: 'modal-success',
        });
        return
      }
    }

    // ✅ Proceed with soft delete
     UpdateCompanyUser.mutate({
      where: {
        companyId_userId: {
          companyId,
          userId: id,
        },
      },
        data: {
            deleted: true,
            status: false
        },
    });


    // 🚪 Logout if deleting self
    if (id === currentUserId) {
      await authLogout()
    }

    await userStore.fetchUsers(companyId)
  } catch (error) {
    console.error('Failed to delete user:', error)
  } finally {
    isDeleting.value = false
    isDeleteModalOpen.value = false
  }
}


const queryArgs = computed(() => {
  const selectedStatusCondition =
    selectedStatus.value.length > 0
      ? {
          OR: selectedStatus.value.map((item) => ({
            status: item.value, // Correct: status is on CompanyUser
          })),
        }
      : {};

  return {
    where: {
      AND: [
        {
          companyId: useAuth().session.value?.companyId,
          deleted: false
        },
        {
          name: {
            contains: search.value,
            mode: 'insensitive',
          },
        },
        selectedStatusCondition,
      ],
    },
    include: {
      user: true,
      company: true,
    },
    orderBy: {
      user: {
        [sort.value.column]: sort.value.direction,
      },
    },
    skip: (page.value - 1) * pageCount.value,
    take: pageCount.value,
  };
});

const { data: users, isLoading, error, refetch } = useFindManyCompanyUser(queryArgs);

const countArgs = computed(() => ({
  where: queryArgs.value.where,
}));

const { data: pageTotal } = useCountCompanyUser(countArgs);

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1);
const pageTo = computed(() =>
    Math.min(page.value * pageCount.value, pageTotal.value),
);

async function multiToggle(ids, status: boolean) {
    try {
        await UpdateManyUser.mutateAsync({
            where: { id: { in: ids } },
            data: { status: status },
        });
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

function toggleStatus(userId: string) {
  if (!users.value) return

  const user = users.value.find(u => u.userId === userId)
  if (!user) return

  const companyId = useAuth().session.value?.companyId!

  try {
    UpdateCompanyUser.mutate({
      where: {
        companyId_userId: {
          companyId,
          userId,
        },
      },
      data: {
        status: !user.status, // ✅ direct toggle
      },
    })
  } catch (error) {
    console.error('Error updating user status:', error)
  }
}


const handleSubmit = async (e: Event) => {
    isSaving.value = true
    try {
        if(formData.id){
            await UpdateUser.mutateAsync({
    where: { id: formData.id },
    data: {
        companies: {
        update: {
            where: {
            companyId_userId: {
                companyId: useAuth().session.value?.companyId!,
                userId: formData.id
            }
            },
            data: {
            name: formData.name,
            role: formData.role.value
            }
        }
        }
    }
    });
    toast.add({
            title: 'user updated !',
            id: 'modal-success',
        });
        }
    else{
        const { data } = await refetchUser();
         if (data) {
        await UpdateUser.mutateAsync({
            where: { id: data.id },
            data: {
                companies: {
                    create: [{
                        company: {
                            connect: { id: useAuth().session.value?.companyId },
                            },
                        name: formData.name, 
                        role: formData.role.value, 
                    }],
                },
            },
            });

        } else {
            const res = await CreateUser.mutateAsync({
            data: {
                email: formData.email || '',
                password: await hash(formData.email),
                companies: {
                    create: {
                        name: formData.name,  
                        role: formData.role.value, 
                        company: {
                            connect: {
                                id: useAuth().session.value?.companyId!,
                            },
                        },
                    },
                },
            },
        });
        }

        toast.add({
            title: 'user added !',
            id: 'modal-success',
        });
    }

        formData.email = ''
        formData.name = ''
        formData.role = { label: '', value: '' }
        formData.id = ''
        
        isOpen.value = false;

        await userStore.fetchUsers(useAuth().session.value?.companyId!)
    } catch (err: any) {
        console.log(err.info?.message ?? err);
         toast.add({
            title: 'Unable to add user !',
            description: `${err.info?.message ?? err}`
        });
    }finally{
        isSaving.value = false
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
                <div class="flex flex-col sm:flex-row justify-between gap-3 w-full">
                <!-- Left side: Search + Status -->
                <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    placeholder="Search..."
                     class="w-full sm:w-60"
                />
                 <USelectMenu
                        v-model="selectedStatus"
                        :options="todoStatus"
                        multiple
                        placeholder="Status"
                         class="w-full sm:w-60"
                    />
                </div>
                  <div class="w-full sm:w-auto flex justify-end">
                    <UButton
                        class="w-full sm:w-40"
                        icon="i-heroicons-plus"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Add user"
                        block
                        @click="() => (isOpen = true)"
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
                :rows="users"
                :columns="columnsTable"
                :loading="isLoading"
                sort-asc-icon="i-heroicons-arrow-up"
                sort-desc-icon="i-heroicons-arrow-down"
                sort-mode="manual"
                class="w-full"
                :ui="{
                    td: { base: 'max-w-[0] truncate' },
                    default: { checkbox: { color: 'gray' } },
                }"
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
            
                <template #email-data="{ row }">
                      <div>{{ row.user.email }}</div>
                </template>

                <template #status-data="{ row }">
                    <Switch
                        v-model="row.status"
                        @click="toggleStatus(row.userId)"
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
                        <!-- <UAvatar
                            :src="`https://images.markit.co.in/${row.images[0]}`"
                            :alt="row.name"
                            size="lg"
                        /> -->
                        <div class="ms-3">{{ row.name }}</div>
                    </div>
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
        <UModal v-model="isOpen">
            <UCard
                :ui="{
                    ring: '',
                    divide: 'divide-y divide-gray-100 dark:divide-gray-800',
                }"
            >
                <template #header>
                    <div> Add user </div>
                </template>

                <UFormGroup name="name" label="name" class="mb-5">
                    <UInput
                        v-model="formData.name"
                        type="text"
                        placeholder="Enter users name"
                    />
                </UFormGroup>
                <UFormGroup name="email" label="email" class="mb-5">
                    <UInput
                        v-model="formData.email"
                        type="text"
                        placeholder="Enter users email"
                    />
                </UFormGroup>
                <UFormGroup name="selectMenu" label="role" class="mb-5">
                    <USelectMenu
                        v-model="formData.role"
                        placeholder="Select user role"
                        :options="options"
                    />
                </UFormGroup>

                <template #footer>
                    <UButton
                        type="submit"
                        block
                        class="mb-5"
                        @click="handleSubmit"
                        :loading = "isSaving"
                    >
                        Continue
                    </UButton>
                </template>
            </UCard>
        </UModal>

         <UDashboardModal
        v-model="isDeleteModalOpen"
        title="Delete User"
        :description="`Are you sure you want to delete user ${deletingRowIdentinty.name}?`"
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
                :loading="isDeleting"
                @click="() => deleteUser(deletingRowIdentinty.id)"
            />
            <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
        </template>
    </UDashboardModal>
    </UDashboardPanelContent>
</template>
