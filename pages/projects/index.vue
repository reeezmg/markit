<script setup lang="ts">
import {
    useFindManyProject,
    useCountProject,
    useUpdateProject,
} from '~/lib/hooks'

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const router = useRouter()
const companyId = useAuth().session.value?.companyId

// ─── Selected project & detail panel ───
const selectedProject = ref<any>(null)
const activeTab = ref(0)
const isNewProjectOpen = ref(false)
const editingProject = ref<any>(null)

const selectProject = (row: any) => {
    selectedProject.value = row
}

const closeDetail = () => {
    selectedProject.value = null
}

const tabs = [
    { label: 'Overview', icon: 'i-heroicons-eye' },
    { label: 'Sales', icon: 'i-heroicons-banknotes' },
    { label: 'Purchases', icon: 'i-heroicons-shopping-cart' },
    { label: 'Budget Configuration', icon: 'i-heroicons-calculator' },
    { label: 'Activity Logs', icon: 'i-heroicons-clock' },
]

// ─── Filters ───
const search = ref('')
const page = ref(1)
const pageCount = ref(10)
const selectedStatus = ref<any[]>([])
const sort = ref({ column: 'createdAt', direction: 'desc' as const })

const statusOptions = [
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'On Hold', value: 'ON_HOLD' },
    { label: 'Cancelled', value: 'CANCELLED' },
]

const resetFilters = () => {
    search.value = ''
    selectedStatus.value = []
}

// ─── Table columns ───
const columns = [
    { key: 'clientName', label: 'CUSTOMER NAME', sortable: true },
    { key: 'name', label: 'PROJECT NAME', sortable: true },
    { key: 'billingMethod', label: 'BILLING METHOD', sortable: true },
    { key: 'rate', label: 'RATE', sortable: true },
]

// ─── Data fetching ───
const queryArgs = computed(() => {
    const statusCondition =
        selectedStatus.value.length > 0
            ? { status: { in: selectedStatus.value.map((s: any) => s.value || s) } }
            : {}

    return {
        where: {
            AND: [
                { companyId, deleted: false },
                search.value
                    ? {
                        OR: [
                            { name: { contains: search.value, mode: 'insensitive' } },
                            { client: { name: { contains: search.value, mode: 'insensitive' } } },
                            { code: { contains: search.value, mode: 'insensitive' } },
                        ],
                    }
                    : {},
                statusCondition,
            ],
        },
        include: {
            client: true,
            users: { include: { user: { include: { user: true } } } },
            tasks: true,
        },
        orderBy: { [sort.value.column]: sort.value.direction },
        skip: (page.value - 1) * pageCount.value,
        take: pageCount.value,
    }
})

const { data: projects, isLoading } = useFindManyProject(queryArgs)
const { data: pageTotal } = useCountProject(computed(() => ({ where: queryArgs.value.where })))

const pageFrom = computed(() => (page.value - 1) * pageCount.value + 1)
const pageTo = computed(() => Math.min(page.value * pageCount.value, pageTotal.value || 0))

// ─── Mutations ───
const UpdateProject = useUpdateProject({ optimisticUpdate: true })

const deleteProject = async (project: any) => {
    try {
        await UpdateProject.mutateAsync({
            where: { id: project.id },
            data: { deleted: true },
        })
        if (selectedProject.value?.id === project.id) {
            selectedProject.value = null
        }
        toast.add({ title: 'Project deleted', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error) {
        toast.add({ title: 'Failed to delete project', color: 'red' })
    }
}

const toggleDashboardWatch = async (project: any) => {
    try {
        await UpdateProject.mutateAsync({
            where: { id: project.id },
            data: { dashboardWatch: !project.dashboardWatch },
        })
        if (selectedProject.value?.id === project.id) {
            selectedProject.value = { ...selectedProject.value, dashboardWatch: !project.dashboardWatch }
        }
    } catch (error) {
        toast.add({ title: 'Failed to update', color: 'red' })
    }
}

// ─── Actions dropdown ───
const projectActions = (row: any) => [
    [{
        label: 'Edit',
        icon: 'i-heroicons-pencil-square',
        click: () => { editingProject.value = row; isNewProjectOpen.value = true },
    }],
    [{
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteProject(row),
    }],
]

// ─── New Transaction dropdown ───
const newTransactionItems = computed(() => [[
    { label: 'Create Quote', icon: 'i-heroicons-document-text', click: () => router.push({ path: '/quotes', query: { newFromProject: selectedProject.value?.id } }) },
    { label: 'Create Invoice', icon: 'i-heroicons-document-duplicate', disabled: true },
    { label: 'Create Sales Order', icon: 'i-heroicons-clipboard-document-list', disabled: true },
], [
    { label: 'Create Expense', icon: 'i-heroicons-banknotes', disabled: true },
    { label: 'Create Purchase Order', icon: 'i-heroicons-shopping-cart', disabled: true },
]])

// ─── Helpers ───
const billingMethodLabel = (method: string) => {
    switch (method) {
        case 'FIXED_COST': return 'Fixed Cost for Project'
        case 'HOURLY': return 'Hourly'
        case 'TASK_BASED': return 'Task Based'
        default: return method || '-'
    }
}

const statusColor = (status: string) => {
    switch (status) {
        case 'ACTIVE': return 'green'
        case 'COMPLETED': return 'blue'
        case 'ON_HOLD': return 'orange'
        case 'CANCELLED': return 'red'
        default: return 'gray'
    }
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0)
}

const onNewProject = () => {
    editingProject.value = null
    isNewProjectOpen.value = true
}

const onProjectSaved = () => {
    isNewProjectOpen.value = false
    editingProject.value = null
}
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <div class="flex border border-gray-200 dark:border-gray-700 rounded-md">
            <!-- ─── Left: Project List ─── -->
            <div
                :class="[
                    'flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out',
                    selectedProject ? 'w-[30%] min-w-[240px]' : 'w-full'
                ]"
            >
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
                    <template #header>
                        <div class="flex flex-wrap items-center justify-between gap-3 w-full">
                            <div class="flex" :class="[selectedProject ? 'w-full justify-between items-center' : 'gap-2']">
                                <UInput
                                    v-model="search"
                                    icon="i-heroicons-magnifying-glass-20-solid"
                                    placeholder="Search projects..."
                                    size="sm"
                                />
                                <USelectMenu
                                    v-if="!selectedProject"
                                    v-model="selectedStatus"
                                    :options="statusOptions"
                                    multiple
                                    placeholder="Status"
                                    value-attribute="value"
                                    option-attribute="label"
                                    size="sm"
                                />
                            </div>
                            <div>
                                <UButton
                                    v-if="!selectedProject"
                                    icon="i-heroicons-plus"
                                    size="sm"
                                    color="primary"
                                    variant="solid"
                                    label="New"
                                    @click="onNewProject"
                                />
                            </div>
                        </div>
                    </template>

                    <div class="flex justify-between items-center w-full px-4 py-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm leading-5 hidden sm:block">Rows per page:</span>
                            <USelect
                                v-model="pageCount"
                                :options="[5, 10, 20, 30, 50]"
                                class="me-2 w-20"
                                size="xs"
                            />
                        </div>
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

                    <!-- Full table (no selection) -->
                    <div v-if="!selectedProject">
                        <UTable
                            v-model:sort="sort"
                            :rows="projects"
                            :columns="columns"
                            :loading="isLoading"
                            sort-asc-icon="i-heroicons-arrow-up"
                            sort-desc-icon="i-heroicons-arrow-down"
                            sort-mode="manual"
                            class="w-full"
                            :ui="{
                                td: { base: 'max-w-[0] truncate' },
                                tr: { base: 'cursor-pointer' },
                            }"
                            @select="selectProject"
                        >
                            <template #clientName-data="{ row }">
                                {{ row.client?.name || '-' }}
                            </template>
                            <template #name-data="{ row }">
                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ row.name }}</span>
                            </template>
                            <template #billingMethod-data="{ row }">
                                {{ billingMethodLabel(row.billingMethod) }}
                            </template>
                            <template #rate-data="{ row }">
                                {{ formatCurrency(row.rate) }}
                            </template>
                        </UTable>
                    </div>

                    <!-- Compact list (when detail open) -->
                    <div v-else>
                        <div v-if="isLoading" class="p-4 text-sm text-gray-500">Loading projects...</div>
                        <div v-else-if="!projects?.length" class="p-4 text-sm text-gray-500">No projects found.</div>
                        <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
                            <button
                                v-for="row in projects"
                                :key="row.id"
                                type="button"
                                class="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                :class="selectedProject?.id === row.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                @click="selectProject(row)"
                            >
                                <div class="flex items-start justify-between">
                                    <div class="min-w-0 flex-1">
                                        <p class="truncate text-sm font-medium text-primary-600 dark:text-primary-400">{{ row.name }}</p>
                                        <p class="mt-0.5 truncate text-xs text-gray-500">{{ row.client?.name || '-' }}</p>
                                    </div>
                                    <div class="flex flex-col items-end gap-1">
                                        <span class="text-sm font-medium">{{ formatCurrency(row.rate) }}</span>
                                        <UBadge :color="statusColor(row.status)" size="xs" variant="subtle">{{ row.status }}</UBadge>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <template #footer>
                        <div class="flex flex-wrap justify-between items-center">
                            <span class="text-xs leading-5">{{ pageFrom }}-{{ pageTo }} of {{ pageTotal }}</span>
                            <UPagination
                                v-model="page"
                                :page-count="pageCount"
                                :total="pageTotal || 0"
                                size="xs"
                                :ui="{
                                    wrapper: 'flex items-center gap-1',
                                    rounded: '!rounded-full min-w-[28px] justify-center',
                                    default: { activeButton: { variant: 'outline' } },
                                }"
                            />
                        </div>
                    </template>
                </UCard>
            </div>

            <!-- ─── Right: Detail Panel ─── -->
            <Transition
                enter-active-class="transition-all duration-300 ease-in-out"
                enter-from-class="opacity-0 translate-x-4"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 translate-x-4"
            >
                <div v-if="selectedProject" class="flex-1 flex flex-col overflow-hidden min-h-0">
                    <!-- Detail Header -->
                    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div>
                            <div class="font-semibold text-sm">{{ selectedProject.name }}</div>
                            <div class="text-xs text-gray-500">
                                <UBadge :color="statusColor(selectedProject.status)" size="xs" variant="subtle">{{ selectedProject.status }}</UBadge>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <UButton
                                icon="i-heroicons-pencil-square"
                                color="gray" variant="ghost" size="xs" label="Edit"
                                @click="() => { editingProject = selectedProject; isNewProjectOpen = true }"
                            />
                            <UDropdown :items="newTransactionItems">
                                <UButton
                                    color="primary" variant="solid" size="xs"
                                    label="New Transaction"
                                    trailing-icon="i-heroicons-chevron-down-20-solid"
                                />
                            </UDropdown>
                            <UDropdown :items="projectActions(selectedProject)">
                                <UButton icon="i-heroicons-ellipsis-horizontal-20-solid" color="gray" variant="ghost" size="xs" />
                            </UDropdown>
                            <UButton icon="i-heroicons-x-mark" color="red" variant="soft" size="sm" @click="closeDetail" />
                        </div>
                    </div>

                    <!-- Tabs -->
                    <UTabs
                        v-model="activeTab"
                        :items="tabs"
                        class="flex-1 flex flex-col overflow-hidden"
                        color="primary"
                        :ui="{ list: { tab: { active: 'text-primary-600 dark:text-primary-400' }, background: 'bg-gray-50 dark:bg-gray-800/50' } }"
                    >
                        <template #item="{ item, index }">
                            <div class="flex-1 flex flex-col overflow-auto p-4">
                                <!-- Overview Tab -->
                                <template v-if="index === 0">
                                    <div class="flex gap-6">
                                        <!-- Left info card -->
                                        <div class="w-72 shrink-0 space-y-4">
                                            <div class="flex items-center gap-3">
                                                <UIcon name="i-heroicons-briefcase" class="text-lg text-gray-400" />
                                                <span class="font-semibold text-lg">{{ selectedProject.name }}</span>
                                            </div>
                                            <div class="flex items-center gap-3">
                                                <UIcon name="i-heroicons-user" class="text-lg text-gray-400" />
                                                <span class="text-primary-600 dark:text-primary-400 font-medium">{{ selectedProject.client?.name || '-' }}</span>
                                            </div>

                                            <div class="space-y-3 text-sm pt-2">
                                                <div>
                                                    <span class="text-gray-500">Project Code</span>
                                                    <p class="font-medium">{{ selectedProject.code || '-' }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Billing Method</span>
                                                    <p class="font-semibold">{{ billingMethodLabel(selectedProject.billingMethod) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Total Project Cost</span>
                                                    <p class="font-semibold">{{ formatCurrency(selectedProject.totalCost || selectedProject.rate) }}</p>
                                                </div>
                                                <div>
                                                    <span class="text-gray-500">Add to dashboard watchlist.</span>
                                                    <p>
                                                        <span class="font-medium">{{ selectedProject.dashboardWatch ? 'Enabled' : 'Disabled' }}</span>
                                                        -
                                                        <button class="text-primary-600 dark:text-primary-400 text-sm" @click="toggleDashboardWatch(selectedProject)">
                                                            {{ selectedProject.dashboardWatch ? 'Disable' : 'Enable' }}
                                                        </button>
                                                    </p>
                                                </div>
                                                <div class="space-y-1 pt-2">
                                                    <div class="flex items-center gap-2">
                                                        <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                                                        <span class="text-gray-500">Unbilled Amount</span>
                                                    </div>
                                                    <p class="pl-4 text-primary-600 dark:text-primary-400 font-medium">{{ formatCurrency(selectedProject.unbilledAmount) }}</p>
                                                </div>
                                                <div class="space-y-1">
                                                    <div class="flex items-center gap-2">
                                                        <span class="w-2 h-2 rounded-full bg-orange-500"></span>
                                                        <span class="text-gray-500">Billed Amount</span>
                                                    </div>
                                                    <p class="pl-4 text-orange-600 font-medium">{{ formatCurrency(selectedProject.billedAmount) }}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Right content area -->
                                        <div class="flex-1 min-w-0 space-y-6">
                                            <!-- Placeholder for project hours chart -->
                                            <UCard :ui="{ body: { padding: 'p-6' } }">
                                                <div class="text-center text-sm text-gray-400 py-8">
                                                    Project Hours chart will be available in a future update.
                                                </div>
                                            </UCard>
                                        </div>
                                    </div>

                                    <!-- Users Section -->
                                    <div class="mt-8">
                                        <div class="flex items-center justify-between mb-3">
                                            <h3 class="font-semibold text-base">Users</h3>
                                            <UButton size="xs" color="primary" variant="ghost" icon="i-heroicons-plus" label="Add User" disabled />
                                        </div>
                                        <UTable
                                            :rows="selectedProject.users || []"
                                            :columns="[
                                                { key: 'name', label: 'NAME' },
                                                { key: 'role', label: 'ROLE' },
                                            ]"
                                            :ui="{ td: { base: 'text-sm' }, th: { base: 'text-xs' } }"
                                        >
                                            <template #name-data="{ row }">
                                                <div>
                                                    <p class="font-medium">{{ row.user?.name || '-' }}</p>
                                                    <p class="text-xs text-gray-500">{{ row.user?.user?.email || '-' }}</p>
                                                </div>
                                            </template>
                                            <template #role-data="{ row }">
                                                {{ row.role === 'admin' ? 'Admin' : row.role === 'member' ? 'Member' : row.role }}
                                            </template>
                                        </UTable>
                                        <div v-if="!selectedProject.users?.length" class="text-sm text-gray-400 text-center py-4">No users assigned.</div>
                                    </div>

                                    <!-- Project Tasks Section -->
                                    <div class="mt-8">
                                        <div class="flex items-center justify-between mb-3">
                                            <h3 class="font-semibold text-base">Project Tasks</h3>
                                            <UButton size="xs" color="primary" variant="ghost" icon="i-heroicons-plus" label="Add Task" disabled />
                                        </div>
                                        <UTable
                                            :rows="selectedProject.tasks || []"
                                            :columns="[
                                                { key: 'name', label: 'NAME' },
                                            ]"
                                            :ui="{ td: { base: 'text-sm' }, th: { base: 'text-xs' } }"
                                        />
                                        <div v-if="!selectedProject.tasks?.length" class="text-sm text-gray-400 text-center py-4">No tasks added.</div>
                                    </div>
                                </template>

                                <!-- Sales Tab -->
                                <template v-if="index === 1">
                                    <div class="text-sm text-gray-500 text-center py-8">Sales linked to this project will appear here.</div>
                                </template>

                                <!-- Purchases Tab -->
                                <template v-if="index === 2">
                                    <div class="text-sm text-gray-500 text-center py-8">Purchases linked to this project will appear here.</div>
                                </template>

                                <!-- Budget Configuration Tab -->
                                <template v-if="index === 3">
                                    <div class="grid grid-cols-2 gap-6 max-w-md">
                                        <div>
                                            <span class="text-sm text-gray-500">Cost Budget</span>
                                            <p class="font-semibold text-lg">{{ formatCurrency(selectedProject.costBudget) }}</p>
                                        </div>
                                        <div>
                                            <span class="text-sm text-gray-500">Revenue Budget</span>
                                            <p class="font-semibold text-lg">{{ formatCurrency(selectedProject.revenueBudget) }}</p>
                                        </div>
                                    </div>
                                </template>

                                <!-- Activity Logs Tab -->
                                <template v-if="index === 4">
                                    <div class="text-sm text-gray-500 text-center py-8">No activity logs yet.</div>
                                </template>
                            </div>
                        </template>
                    </UTabs>
                </div>
            </Transition>
        </div>

        <!-- New Project Modal -->
        <ProjectsNewProjectModal
            v-model="isNewProjectOpen"
            :editing-project="editingProject"
            @saved="onProjectSaved"
        />
    </UDashboardPanelContent>
</template>
