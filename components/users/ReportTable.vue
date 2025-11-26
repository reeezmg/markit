<script setup lang="ts">
import { sub, format, isSameDay, type Duration } from 'date-fns'
import {
    useFindManyCompanyUser,
} from '~/lib/hooks';

const props = defineProps<{
  users: {
    labels: string[]
    countData: number[]
    salesData: number[]
    entryGroups: any[]
  }
}>()

const selectedDate = defineModel<{ start: Date; end: Date }>('selectedDate', {
  default: () => ({
    start: new Date(new Date().setHours(0, 0, 0, 0)),
    end: new Date(new Date().setHours(23, 59, 59, 999))
  })
})


const users = ref<{ label: string; sales: number; group: any }[]>([])
const search = ref('')


// Filter users based on search input
const filteredUsers = computed(() => {
  if (!search.value) return users.value
  
  const searchTerm = search.value.toLowerCase()
  return users.value.filter(user => 
    user.label.toLowerCase().includes(searchTerm)
  )
})
watch(
  () => props.users,
  (newUsers) => {
    if (newUsers && newUsers.labels) {
      users.value = newUsers.labels.map((label, index) => ({
        label,
        sales: newUsers.salesData?.[index] ?? 0,
        count: newUsers.countData?.[index] ?? 0,
        group: Array.isArray(newUsers.entryGroups?.[label]) ? newUsers.entryGroups[label] : []
      }))
    } else {
      users.value = []
    }
  },
  { immediate: true, deep: true }
)


// Columns
const columns = [
    {
        key: 'label',
        label: 'Name',
        sortable: true,
    },
    {
        key: 'count',
        label: 'Count',
        sortable: true,
    },
    {
        key: 'sales',
        label: 'Sales',
        sortable: true,
    }, 
];

const entryColumns = [
    {
        key: 'category.name',
        label: 'Category',
        sortable: true,
    },
    {
        key: 'rate',
        label: 'Rate',
        sortable: true,
    },
    {
        key: 'qty',
        label: 'Qty',
        sortable: true,
    }, 
    {
        key: 'value',
        label: 'Value',
        sortable: true,
    }, 
];

const selectedColumns = ref(columns);
const columnsTable = computed(() =>
    columns.filter((column) => selectedColumns.value.includes(column)),
);

const resetFilters = () => {
    search.value = '';
    selectedDate.value = ({
        start: new Date(new Date().setHours(0, 0, 0, 0)) , 
        end: new Date(new Date().setHours(23, 59, 59, 999)) 
    })
};

const ranges = [
  { label: 'Last 7 days', duration: { days: 7 } },
  { label: 'Last 14 days', duration: { days: 14 } },
  { label: 'Last 30 days', duration: { days: 30 } },
  { label: 'Last 3 months', duration: { months: 3 } },
  { label: 'Last 6 months', duration: { months: 6 } },
  { label: 'Last year', duration: { years: 1 } }
]

function isRangeSelected(duration: Duration) {
  return isSameDay(selectedDate.value.start, sub(new Date(), duration)) && isSameDay(selectedDate.value.end, new Date())
}

function selectRange(duration: Duration) {
  selectedDate.value = { start: sub(new Date(), duration), end: new Date() }
}


// Pagination
const sort = ref({ column: 'id', direction: 'asc' as const });
const expand = ref({ openedRows: [], row: null });


</script>

<template>
    <UDashboardPanelContent class="pb-10">
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
                
                </div>
                  <div class="w-full sm:w-auto flex justify-end">
                   <UPopover :popper="{ placement: 'bottom-start' }" class=" z-10">
                        <UButton icon="i-heroicons-calendar-days-20-solid" class=" w-full sm:w-60">
                        {{ format(selectedDate.start, 'd MMM, yyy') }} - {{ format(selectedDate.end, 'd MMM, yyy') }}
                        </UButton>

                        <template #panel="{ close }">
                        <div class="flex items-center sm:divide-x divide-gray-200 dark:divide-gray-800">
                            <div class="hidden sm:flex flex-col py-4">
                            <UButton
                                v-for="(range, index) in ranges"
                                :key="index"
                                :label="range.label"
                                color="gray"
                                variant="ghost"
                                class="rounded-none px-6 hidden sm:block"
                                :class="[isRangeSelected(range.duration) ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50']"
                                truncate
                                @click="selectRange(range.duration)"
                            />
                            </div>

                            <DatePicker v-model="selectedDate" @close="close"  />
                        </div>
                        </template>
                    </UPopover>
                </div>
            </div>
            </template>

            <!-- Header and Action buttons -->
            <div class="flex justify-between items-center w-full px-4 py-3">
                <div class="flex items-center gap-1.5">

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
                        :disabled="search === ''"
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
                :multiple-expand="false"
                :rows="filteredUsers"
                :columns="columnsTable"
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
                 <template #expand="{ row }">
                    <UTable 
                        :rows="row.group" 
                        :columns="entryColumns"
                    >
                 </UTable>
                </template>
            </UTable>
        </UCard>
    </UDashboardPanelContent>
</template>
