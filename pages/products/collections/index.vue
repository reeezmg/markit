<script setup lang="ts">
import { Switch } from '@headlessui/vue';
import {
  useUpdateCollection,
  useFindManyCollection,
  useDeleteCollection,
} from '~/lib/hooks';

const UpdateCollection = useUpdateCollection({ optimisticUpdate: true });
const DeleteCollection = useDeleteCollection({ optimisticUpdate: true });
const router = useRouter();
const useAuth = () => useNuxtApp().$auth;
const toast = useToast();

const isDeleteModalOpen = ref(false);
const deletingRow = ref<{ name?: string; id?: string; productsLength?: number }>({});

const columns = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'targetAudience', label: 'Audience', sortable: true },
  { key: 'products', label: 'Products', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Actions', sortable: false },
];

const action = (row: any) => [
  [
    {
      label: 'Edit',
      icon: 'i-heroicons-pencil-square-20-solid',
      click: () => router.push(`/products/collections/edit/${row.id}`),
    },
  ],
  [
    {
      label: 'Delete',
      icon: 'i-heroicons-trash-20-solid',
      click: () => {
        isDeleteModalOpen.value = true;
        deletingRow.value = { name: row.name, id: row.id, productsLength: row.products?.length || 0 };
      },
    },
  ],
];

const todoStatus = [
  { key: 'inactive', label: 'Inactive', value: false },
  { key: 'active', label: 'Active', value: true },
];

const search = ref('');
const selectedStatus = ref<any>([]);
const resetFilters = () => {
  search.value = '';
  selectedStatus.value = [];
};

const sort = ref({ column: 'createdAt', direction: 'desc' as const });
const page = ref(1);
const pageCount = ref(10);
const pageTotal = ref(0);
const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1);
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value));

const queryArgs = reactive<any>({
  where: {
    AND: [
      { name: { contains: search.value } },
      { companyId: useAuth().session.value?.companyId },
      { OR: [{ status: true }, { status: false }] },
    ],
  },
  orderBy: { [sort.value.column]: sort.value.direction },
  skip: (page.value - 1) * pageCount.value,
  take: pageCount.value,
  select: {
    id: true,
    name: true,
    image: true,
    targetAudience: true,
    status: true,
    products: { select: { id: true } },
  },
});

const { data: collections, isLoading, refetch } = useFindManyCollection(queryArgs);

watch(collections, () => {
  pageTotal.value = collections.value ? collections.value.length : 0;
});

watchEffect(() => {
  queryArgs.where.AND[0].name.contains = search.value;
  queryArgs.where.AND[2].OR = selectedStatus.value?.length
    ? selectedStatus.value.map((item: any) => ({ status: item.value }))
    : [{ status: true }, { status: false }];
  queryArgs.orderBy = { [sort.value.column]: sort.value.direction };
  queryArgs.skip = (page.value - 1) * pageCount.value;
  queryArgs.take = Number(pageCount.value);
  refetch();
});

const removeCollection = () => {
  if (deletingRow.value.productsLength) {
    toast.add({
      title: 'Collection deletion failed!',
      description: `Please clear products of collection "${deletingRow.value.name}" first.`,
      color: 'red',
    });
    isDeleteModalOpen.value = false;
    return;
  }
  try {
    DeleteCollection.mutate({ where: { id: deletingRow.value.id } });
  } catch (err) {
    console.log(err);
  } finally {
    isDeleteModalOpen.value = false;
  }
};

function toggleStatus(id: string) {
  const row = collections.value?.find((item: any) => item.id === id);
  if (!row) return;
  try {
    UpdateCollection.mutate({ where: { id }, data: { status: !row.status } });
  } catch (error) {
    console.error('Error updating collection status:', error);
  }
}
</script>

<template>
  <UDashboardPanelContent class="pb-24">
    <UCard
      class="w-full"
      :ui="{
        base: '',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        header: { padding: 'px-4 py-5' },
        body: { padding: '', base: 'divide-y divide-gray-200 dark:divide-gray-700' },
        footer: { padding: 'p-4' },
      }"
    >
      <div class="flex flex-col sm:flex-row justify-between gap-3 px-4 py-3 w-full">
        <div class="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <UInput v-model="search" icon="i-heroicons-magnifying-glass-20-solid" placeholder="Search..." class="w-full sm:w-60" />
          <USelectMenu v-model="selectedStatus" :options="todoStatus" multiple placeholder="Status" class="w-full sm:w-60" />
        </div>
        <div class="w-full flex flex-col gap-2 sm:flex-row sm:justify-end sm:items-center">
          <UButton icon="i-heroicons-plus" size="sm" color="primary" variant="solid" label="Add Collection" class="w-full sm:w-40" @click="() => router.push('/products/collections/add')" />
        </div>
      </div>

      <div class="flex justify-between items-center w-full px-4 py-3">
        <div class="flex items-center gap-1.5">
          <span class="text-sm leading-5 sm:block hidden">Rows per page:</span>
          <USelect v-model="pageCount" :options="[3, 5, 10, 20, 30, 40]" class="me-2 w-20" size="xs" />
        </div>
        <div class="flex gap-1.5 items-center z-10">
          <UButton icon="i-heroicons-funnel" color="gray" size="xs" :disabled="search === '' && selectedStatus.length === 0" @click="resetFilters">Reset</UButton>
        </div>
      </div>

      <UTable
        v-model:sort="sort"
        :rows="collections"
        :columns="columns"
        :loading="isLoading"
        sort-asc-icon="i-heroicons-arrow-up"
        sort-desc-icon="i-heroicons-arrow-down"
        sort-mode="manual"
      >
        <template #actions-data="{ row }">
          <UDropdown :items="action(row)">
            <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal-20-solid" />
          </UDropdown>
        </template>

        <template #name-data="{ row }">
          <div class="flex flex-row items-center">
            <UAvatar :src="`https://images.markit.co.in/${row.image || ''}`" :alt="row.name" size="lg" />
            <div class="ms-3">{{ row.name }}</div>
          </div>
        </template>

        <template #targetAudience-data="{ row }">
          <UBadge color="gray" variant="subtle" class="capitalize">{{ row.targetAudience || 'all' }}</UBadge>
        </template>

        <template #products-data="{ row }">
          {{ row.products?.length || 0 }}
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
            />
          </Switch>
        </template>
      </UTable>

      <template #footer>
        <div class="flex flex-wrap justify-between items-center">
          <span class="text-sm leading-5 sm:block hidden">
            Showing <span class="font-medium">{{ pageFrom }}</span> to
            <span class="font-medium">{{ pageTo }}</span> of
            <span class="font-medium">{{ pageTotal }}</span> results
          </span>
          <UPagination v-model="page" :page-count="pageCount" :total="pageTotal" />
        </div>
      </template>
    </UCard>

    <UDashboardModal
      v-model="isDeleteModalOpen"
      title="Delete Collection"
      :description="`Are you sure you want to delete collection ${deletingRow.name}?`"
      icon="i-heroicons-exclamation-circle"
      prevent-close
      :close-button="null"
      :ui="{ icon: { base: 'text-red-500 dark:text-red-400' } as any, footer: { base: 'ml-16' } as any }"
    >
      <template #footer>
        <UButton color="red" label="Delete" @click="() => removeCollection()" />
        <UButton color="white" label="Cancel" @click="isDeleteModalOpen = false" />
      </template>
    </UDashboardModal>
  </UDashboardPanelContent>
</template>
