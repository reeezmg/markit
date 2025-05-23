<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import { hash } from '~/composables/hash';
import {
    useFindManyUser,
    useUpdateUser,
    useDeleteUser,
    useUpdateManyUser,
    useCreateUser,
    useFindUniqueUser
} from '~/lib/hooks';
const toast = useToast();
definePageMeta({
    auth: true,
});
const CreateUser = useCreateUser();
const UpdateUser = useUpdateUser();
const DeleteUser = useDeleteUser();
const UpdateManyUser = useUpdateManyUser();
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
            click:() => deleteUser(row.id)
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

const formData = reactive({
    email: '',
    name: '',
    role: { label: '', value: '' },
});

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
const pageTotal = ref(0); // This value should be dynamic coming from the API
const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1);
const pageTo = computed(() =>
    Math.min(page.value * pageCount.value, pageTotal.value),
);

const deleteUser = async (id: string) => {
  const res = await UpdateUser.mutateAsync({
    where: {
      id,
    },
    data: {
    companies: {
      deleteMany: {
        companyId: useAuth().session.value?.companyId!, // 👈 add `!` if you're sure it's always defined
              userId: id,
      },
    },
}
  });
  console.log(res)

  if (id === useAuth().session.value?.id) {
    await authLogout();
  }
};


// Data
const queryArgs = computed(() => {
    const selectedStatusCondition =
        selectedStatus.value.length > 0
            ? {
                  OR: selectedStatus.value.map((item) => {
                      return { status: item.value };
                  }),
              }
            : {};

    return {
        where: {
            AND: [
                {
                    companies: {
                        some: { companyId: useAuth().session.value?.companyId },
                    },
                },
                { name: { contains: search.value } },
                selectedStatusCondition,
            ],
        },
        orderBy: {
            [sort.value.column]: sort.value.direction,
        },
        skip: (page.value - 1) * pageCount.value,
        take: pageCount.value,
        include: {
            companies: {
                include: {
                    company: true,
                },
            },
        },
    };
});
const { data: users, isLoading, error, refetch } = useFindManyUser(queryArgs);

watch(users, () => {
    pageTotal.value = users.value ? users.value.length : 0;
    console.log(users)
});

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

async function toggleStatus(id: string) {
    if (users.value) {
        const userToUpdate = users.value.find((item) => item.id === id);
        if (!userToUpdate) return;

        const updatedStatus = !userToUpdate.status;

        try {
            await UpdateUser.mutateAsync({
                where: { id },
                data: { status: updatedStatus },
            });
        } catch (error) {
            console.error('Error updating user status:', error);
        }
    }
}

const handleSubmit = async (e: Event) => {
    try {
        const { data } = await refetchUser();
         if (data) {
         await UpdateUser.mutateAsync({
                where: { id:data.id },
                data: {
                name: formData.name || '',
                companies: {
                    create: [{ company: { connect: { id: useAuth().session.value?.companyId} } }],
                },
            },
            });
        } else {
            const res = await CreateUser.mutateAsync({
            data: {
                name: formData.name || '',
                email: formData.email || '',
                password: await hash(formData.email),
                role: formData.role.value,
                companies: {
                    create: {
                        company: {
                            connect: {
                                id: useAuth().session.value?.companyId,
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
        isOpen.value = false;
    } catch (err: any) {
        console.log(err.info?.message ?? err);
    }
};
</script>

<template>
    <UDashboardPanelContent class="pb-24">
        <UCard
            class="w-full"
            :ui="{
                base: '',
                ring: '',
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
            <div class="flex items-center justify-between gap-3 px-4 py-3">
                <UInput
                    v-model="search"
                    icon="i-heroicons-magnifying-glass-20-solid"
                    placeholder="Search..."
                />
                <div class="flex flex-row">
                    <USelectMenu
                        v-model="selectedStatus"
                        :options="todoStatus"
                        multiple
                        placeholder="Status"
                        class="w-40"
                    />
                    <UButton
                        class="ms-5"
                        icon="i-heroicons-plus"
                        size="sm"
                        color="primary"
                        variant="solid"
                        label="Add user"
                        @click="() => (isOpen = true)"
                    />
                </div>
            </div>

            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">
                    <span class="text-sm leading-5">Rows per page:</span>
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
                        <span class="text-sm leading-5">
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
                    >
                        Continue
                    </UButton>
                </template>
            </UCard>
        </UModal>
    </UDashboardPanelContent>
</template>
