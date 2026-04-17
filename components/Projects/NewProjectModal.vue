<script setup lang="ts">
import {
    useCreateProject,
    useUpdateProject,
    useFindManyCompanyClient,
    useFindManyCompanyUser,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingProject?: any }>()
const emit = defineEmits(['saved'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

const CreateProject = useCreateProject({ optimisticUpdate: true })
const UpdateProject = useUpdateProject({ optimisticUpdate: true })

const isSaving = ref(false)

// ─── Form state ───
const form = reactive({
    name: '',
    code: '',
    clientId: '' as string,
    billingMethod: 'FIXED_COST',
    description: '',
    costBudget: 0,
    revenueBudget: 0,
    rate: 0,
    dashboardWatch: true,
    users: [] as { companyId: string; userId: string; name: string; email: string; role: string }[],
    tasks: [] as { name: string; description: string; billable: boolean }[],
})

const billingMethodOptions = [
    { label: 'Fixed Cost for Project', value: 'FIXED_COST' },
    { label: 'Hourly', value: 'HOURLY' },
    { label: 'Task Based', value: 'TASK_BASED' },
]

// ─── Client search ───
const clientSearch = ref('')
const { data: clients } = useFindManyCompanyClient(computed(() => ({
    where: {
        companyId,
        client: {
            deleted: false,
            ...(clientSearch.value ? { name: { contains: clientSearch.value, mode: 'insensitive' } } : {}),
        },
    },
    include: { client: true },
    take: 20,
})))

const clientOptions = computed(() =>
    (clients.value || []).map((cc: any) => ({
        label: cc.client?.name || '-',
        value: cc.client?.id || cc.clientId,
    }))
)

// ─── Company users for assignment ───
const { data: companyUsers } = useFindManyCompanyUser(computed(() => ({
    where: { companyId, deleted: false },
    include: { user: true },
    take: 50,
})))

const availableUsers = computed(() =>
    (companyUsers.value || [])
        .filter((u: any) => !form.users.some(fu => fu.userId === u.userId))
        .map((u: any) => ({
            label: u.name || u.user?.email || '-',
            value: u.userId,
            email: u.user?.email || '',
            companyId: u.companyId,
            name: u.name || '',
        }))
)

const addUser = (selected: any) => {
    if (!selected) return
    const user = availableUsers.value.find((u: any) => u.value === selected)
    if (user) {
        form.users.push({
            companyId: user.companyId,
            userId: user.value,
            name: user.label,
            email: user.email,
            role: 'member',
        })
    }
    selectedUserToAdd.value = ''
}

const selectedUserToAdd = ref('')

const removeUser = (index: number) => {
    form.users.splice(index, 1)
}

// ─── Tasks ───
const addTask = () => {
    form.tasks.push({ name: '', description: '', billable: true })
}

const removeTask = (index: number) => {
    form.tasks.splice(index, 1)
}

// ─── Save ───
const saveProject = async () => {
    if (!form.name) {
        toast.add({ title: 'Project name is required', color: 'red' })
        return
    }

    isSaving.value = true
    try {
        const projectData: any = {
            name: form.name,
            code: form.code || null,
            description: form.description || null,
            billingMethod: form.billingMethod,
            rate: form.rate || 0,
            costBudget: form.costBudget || 0,
            revenueBudget: form.revenueBudget || 0,
            dashboardWatch: form.dashboardWatch,
        }

        if (props.editingProject?.id) {
            await UpdateProject.mutateAsync({
                where: { id: props.editingProject.id },
                data: {
                    ...projectData,
                    ...(form.clientId ? { client: { connect: { id: form.clientId } } } : {}),
                    tasks: {
                        deleteMany: {},
                        create: form.tasks.filter(t => t.name).map(t => ({
                            name: t.name,
                            description: t.description || null,
                            billable: t.billable,
                        })),
                    },
                    users: {
                        deleteMany: {},
                        create: form.users.map(u => ({
                            companyId: u.companyId,
                            userId: u.userId,
                            role: u.role,
                        })),
                    },
                },
            })
        } else {
            await CreateProject.mutateAsync({
                data: {
                    ...projectData,
                    company: { connect: { id: companyId } },
                    ...(form.clientId ? { client: { connect: { id: form.clientId } } } : {}),
                    tasks: {
                        create: form.tasks.filter(t => t.name).map(t => ({
                            name: t.name,
                            description: t.description || null,
                            billable: t.billable,
                        })),
                    },
                    users: {
                        create: form.users.map(u => ({
                            companyId: u.companyId,
                            userId: u.userId,
                            role: u.role,
                        })),
                    },
                },
            })
        }

        toast.add({ title: props.editingProject ? 'Project updated' : 'Project created', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        open.value = false
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save project', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

// ─── Reset ───
const resetForm = () => {
    form.name = ''
    form.code = ''
    form.clientId = ''
    form.billingMethod = 'FIXED_COST'
    form.description = ''
    form.costBudget = 0
    form.revenueBudget = 0
    form.rate = 0
    form.dashboardWatch = true
    form.users = []
    form.tasks = []
}

// ─── Populate on edit ───
watch(() => open.value, (isOpen) => {
    if (isOpen && props.editingProject) {
        form.name = props.editingProject.name || ''
        form.code = props.editingProject.code || ''
        form.clientId = props.editingProject.clientId || ''
        form.billingMethod = props.editingProject.billingMethod || 'FIXED_COST'
        form.description = props.editingProject.description || ''
        form.costBudget = props.editingProject.costBudget || 0
        form.revenueBudget = props.editingProject.revenueBudget || 0
        form.rate = props.editingProject.rate || 0
        form.dashboardWatch = props.editingProject.dashboardWatch ?? true
        form.users = (props.editingProject.users || []).map((pu: any) => ({
            companyId: pu.companyId,
            userId: pu.userId,
            name: pu.user?.name || '-',
            email: pu.user?.user?.email || '-',
            role: pu.role || 'member',
        }))
        form.tasks = (props.editingProject.tasks || []).map((t: any) => ({
            name: t.name || '',
            description: t.description || '',
            billable: t.billable ?? true,
        }))
    } else if (isOpen) {
        resetForm()
    }
})
</script>

<template>
    <USlideover v-model="open" :ui="{ width: 'max-w-2xl' }">
        <div class="flex flex-col h-full">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold">{{ editingProject ? 'Edit Project' : 'New Project' }}</h2>
                <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="open = false" />
            </div>

            <!-- Form -->
            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                <!-- Project Name -->
                <UFormGroup label="Project Name" required>
                    <UInput v-model="form.name" placeholder="Enter project name" />
                </UFormGroup>

                <!-- Project Code -->
                <UFormGroup label="Project Code">
                    <UInput v-model="form.code" placeholder="" />
                </UFormGroup>

                <!-- Customer Name -->
                <UFormGroup label="Customer Name" required>
                    <USelectMenu
                        v-model="form.clientId"
                        :options="clientOptions"
                        value-attribute="value"
                        option-attribute="label"
                        searchable
                        :search-attributes="['label']"
                        placeholder="Select customer"
                        @update:query="(q: string) => clientSearch = q"
                    />
                </UFormGroup>

                <!-- Billing Method -->
                <UFormGroup label="Billing Method" required>
                    <USelectMenu
                        v-model="form.billingMethod"
                        :options="billingMethodOptions"
                        value-attribute="value"
                        option-attribute="label"
                    />
                </UFormGroup>

                <!-- Rate (shown for all billing methods) -->
                <UFormGroup label="Rate (INR)">
                    <UInput v-model.number="form.rate" type="number" :min="0" placeholder="0" />
                </UFormGroup>

                <!-- Description -->
                <UFormGroup label="Description">
                    <UTextarea v-model="form.description" placeholder="Max. 2000 characters" :rows="3" :maxlength="2000" />
                </UFormGroup>

                <!-- Budget -->
                <div class="border-t pt-4">
                    <h3 class="text-sm font-semibold mb-3">Budget</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <UFormGroup label="Cost Budget">
                            <div class="flex">
                                <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">INR</span>
                                <UInput v-model.number="form.costBudget" type="number" :min="0" class="rounded-l-none" />
                            </div>
                        </UFormGroup>
                        <UFormGroup label="Revenue Budget">
                            <div class="flex">
                                <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">INR</span>
                                <UInput v-model.number="form.revenueBudget" type="number" :min="0" class="rounded-l-none" />
                            </div>
                        </UFormGroup>
                    </div>
                </div>

                <!-- Users -->
                <div class="border-t pt-4">
                    <h3 class="text-sm font-semibold mb-3">Users</h3>
                    <div class="border rounded-md overflow-hidden" v-if="form.users.length">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[10%]">S.NO</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[40%]">USER</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[40%]">EMAIL</th>
                                    <th class="px-3 py-2 w-[10%]"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="(u, index) in form.users" :key="index">
                                    <td class="px-3 py-2">{{ index + 1 }}</td>
                                    <td class="px-3 py-2 font-medium">{{ u.name }}</td>
                                    <td class="px-3 py-2 text-gray-500">{{ u.email }}</td>
                                    <td class="px-3 py-2 text-center">
                                        <UButton icon="i-heroicons-trash" color="red" variant="ghost" size="xs" @click="removeUser(index)" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-2 flex items-center gap-2">
                        <USelectMenu
                            v-model="selectedUserToAdd"
                            :options="availableUsers"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select a user"
                            class="w-64"
                            size="sm"
                            @update:model-value="addUser"
                        />
                    </div>
                </div>

                <!-- Project Tasks -->
                <div class="border-t pt-4">
                    <h3 class="text-sm font-semibold mb-3">Project Tasks</h3>
                    <div class="border rounded-md overflow-hidden" v-if="form.tasks.length">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[8%]">S.NO</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[32%]">TASK NAME</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[35%]">DESCRIPTION</th>
                                    <th class="px-3 py-2 text-center font-medium text-xs text-gray-500 w-[15%]">BILLABLE</th>
                                    <th class="px-3 py-2 w-[10%]"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="(task, index) in form.tasks" :key="index">
                                    <td class="px-3 py-2">{{ index + 1 }}</td>
                                    <td class="px-3 py-2">
                                        <UInput v-model="task.name" placeholder="Task Name" size="sm" />
                                    </td>
                                    <td class="px-3 py-2">
                                        <UInput v-model="task.description" placeholder="Description" size="sm" />
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                        <UCheckbox v-model="task.billable" />
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                        <UButton icon="i-heroicons-trash" color="red" variant="ghost" size="xs" @click="removeTask(index)" />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-2">
                        <UButton icon="i-heroicons-plus" color="primary" variant="soft" size="xs" label="Add Project Task" @click="addTask" />
                    </div>
                </div>

                <!-- Dashboard watchlist -->
                <div class="border-t pt-4">
                    <UCheckbox v-model="form.dashboardWatch" label="Add to the watchlist on my dashboard" />
                </div>
            </div>

            <!-- Footer -->
            <div class="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <UButton color="primary" variant="solid" label="Save" :loading="isSaving" @click="saveProject" />
                <UButton color="gray" variant="ghost" label="Cancel" @click="open = false" />
            </div>
        </div>
    </USlideover>
</template>
