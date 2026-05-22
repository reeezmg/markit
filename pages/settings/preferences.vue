<script setup lang="ts">
type PreferencePageKey = 'quotes' | 'sales-orders' | 'invoices' | 'payments-received'
type PreferenceTabKey = 'general' | 'approval' | 'fieldCustomization' | 'validationRules' | 'customActions' | 'recordLocking'

type CustomField = {
    id: string
    label: string
    dataType: string
    mandatory: boolean
    showInPdfs: boolean
    status: 'Active' | 'Inactive'
    linkTo?: string
}

type ValidationRule = {
    id: string
    field: string
    operator: string
    value: string
    message: string
    active: boolean
}

type CustomAction = {
    id: string
    trigger: string
    actionType: string
    name: string
    config: string
    active: boolean
}

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

const pages = [
    { label: 'Quote', value: 'quotes', description: 'Rules used while creating, approving, sending, and converting quotes.' },
    { label: 'Sales Order', value: 'sales-orders', description: 'Rules used for sales order creation, conversion, and action menus.' },
    { label: 'Invoices', value: 'invoices', description: 'Rules used for service invoices and invoice actions.' },
    { label: 'Payment Received', value: 'payments-received', description: 'Rules used when recording and editing received payments.' },
] as const

const tabs = [
    { label: 'General', key: 'general' },
    { label: 'Approval', key: 'approval' },
    { label: 'Field Customization', key: 'fieldCustomization' },
    { label: 'Validation Rules', key: 'validationRules' },
    { label: 'Custom Action', key: 'customActions' },
    { label: 'Record Locking', key: 'recordLocking' },
] as const

const dataTypeOptions = [
    { label: 'Text Box (Single Line)', value: 'text' },
    { label: 'Text Box (Multi-line)', value: 'multiline' },
    { label: 'Number', value: 'number' },
    { label: 'Decimal', value: 'decimal' },
    { label: 'Date', value: 'date' },
    { label: 'Date & Time', value: 'datetime' },
    { label: 'Checkbox', value: 'checkbox' },
    { label: 'Dropdown', value: 'dropdown' },
    { label: 'Link to Client', value: 'clientLink' },
    { label: 'Link to User', value: 'userLink' },
]

const validationOperators = [
    { label: 'Equals', value: 'equals' },
    { label: 'Does not equal', value: 'notEquals' },
    { label: 'Contains', value: 'contains' },
    { label: 'Is empty', value: 'empty' },
    { label: 'Is not empty', value: 'notEmpty' },
    { label: 'Greater than', value: 'greaterThan' },
    { label: 'Less than', value: 'lessThan' },
]

const actionTriggers = [
    { label: 'On Create', value: 'create' },
    { label: 'On Save / Edit', value: 'save' },
    { label: 'On Send', value: 'send' },
    { label: 'On Mark Accepted', value: 'markAccepted' },
    { label: 'On Mark Declined', value: 'markDeclined' },
    { label: 'On Convert', value: 'convert' },
    { label: 'On Delete', value: 'delete' },
]

const customActionTypes = [
    { label: 'In-app Notification', value: 'notification' },
    { label: 'Email', value: 'email' },
    { label: 'Webhook', value: 'webhook' },
    { label: 'Status Update', value: 'statusUpdate' },
]

const lockableActions = [
    { label: 'Edit', value: 'edit' },
    { label: 'Send', value: 'send' },
    { label: 'Mark Accepted', value: 'markAccepted' },
    { label: 'Mark Declined', value: 'markDeclined' },
    { label: 'Convert to Invoice', value: 'convertToInvoice' },
    { label: 'Convert to Sales Order', value: 'convertToSalesOrder' },
    { label: 'Record Payment', value: 'recordPayment' },
    { label: 'Delete', value: 'delete' },
]

const roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Biller', value: 'biller' },
    { label: 'Accountant', value: 'accountant' },
    { label: 'User', value: 'user' },
]

const selectedPage = ref<PreferencePageKey>('quotes')
const selectedTab = ref<PreferenceTabKey>('general')
const isLoading = ref(false)
const savingKey = ref<string | null>(null)
const users = ref<any[]>([])

const general = reactive({
    enabled: true,
    allowEditingAcceptedQuotes: false,
    allowCustomerAcceptDecline: false,
    quoteToInvoiceRetainFields: {
        customerNotes: true,
        termsAndConditions: false,
        address: false,
    },
    quoteToSalesOrderRetainFields: {
        customerNotes: true,
        termsAndConditions: false,
        address: false,
    },
})

const approval = reactive({
    type: 'none' as 'none' | 'simple' | 'multiLevel',
    approverIds: [] as string[],
    levels: [
        { id: 'level-1', name: 'Level 1: Approver', approverIds: [] as string[] },
    ],
    notifyOnSubmit: false,
    notifyOnDecision: false,
})

const fieldCustomization = reactive({
    fields: [
        { id: 'terms', label: 'Terms & Conditions', dataType: 'multiline', mandatory: false, showInPdfs: true, status: 'Active' as const },
        { id: 'salesperson', label: 'Sales person', dataType: 'text', mandatory: false, showInPdfs: true, status: 'Active' as const },
        { id: 'subject', label: 'Subject', dataType: 'text', mandatory: false, showInPdfs: true, status: 'Active' as const },
    ] as CustomField[],
})

const validationRules = reactive({
    rules: [] as ValidationRule[],
})

const customActions = reactive({
    actions: [] as CustomAction[],
})

const recordLocking = reactive({
    enabled: false,
    lockWhenStatus: [] as string[],
    restrictedActions: [] as string[],
    appliesToRoles: [] as string[],
    allowAdminsToBypass: true,
})

const selectedPageMeta = computed(() =>
    pages.find((page) => page.value === selectedPage.value) || pages[0]
)

const userOptions = computed(() =>
    users.value.map((user) => ({
        label: `${user.name || user.email || 'User'}${user.email ? ` (${user.email})` : ''}`,
        value: user.id,
    }))
)

const statusOptions = computed(() => {
    if (selectedPage.value === 'quotes') {
        return [
            { label: 'Draft', value: 'DRAFT' },
            { label: 'Sent', value: 'SENT' },
            { label: 'Accepted', value: 'ACCEPTED' },
            { label: 'Declined', value: 'DECLINED' },
            { label: 'Expired', value: 'EXPIRED' },
        ]
    }

    if (selectedPage.value === 'sales-orders') {
        return [
            { label: 'Draft', value: 'DRAFT' },
            { label: 'Confirmed', value: 'CONFIRMED' },
            { label: 'Closed', value: 'CLOSED' },
            { label: 'Cancelled', value: 'CANCELLED' },
        ]
    }

    return [
        { label: 'Pending', value: 'PENDING' },
        { label: 'Approved', value: 'APPROVED' },
        { label: 'Paid', value: 'PAID' },
        { label: 'Rejected', value: 'REJECTED' },
    ]
})

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const patchObject = (target: Record<string, any>, source: Record<string, any>) => {
    Object.keys(target).forEach((key) => {
        const sourceValue = source?.[key]
        if (sourceValue !== undefined) {
            target[key] = Array.isArray(sourceValue) || typeof sourceValue === 'object'
                ? clone(sourceValue)
                : sourceValue
        }
    })
}

const loadUsers = async () => {
    if (!companyId) return

    try {
        users.value = await $fetch<any[]>('/api/getuser', {
            query: { companyId },
        })
    } catch {
        users.value = []
    }
}

const loadPreferences = async () => {
    isLoading.value = true
    try {
        const preferences = await $fetch<any[]>('/api/general-preferences', {
            query: { pageName: selectedPage.value },
        })
        const byKey = Object.fromEntries((preferences || []).map((pref) => [pref.key, pref.value]))

        patchObject(general, byKey.general || {})
        patchObject(approval, byKey.approval || {})
        patchObject(fieldCustomization, byKey.fieldCustomization || {})
        patchObject(validationRules, byKey.validationRules || {})
        patchObject(customActions, byKey.customActions || {})
        patchObject(recordLocking, byKey.recordLocking || {})

        if (selectedPage.value === 'quotes') {
            if (byKey['quote.toInvoice.retainFields']) {
                general.quoteToInvoiceRetainFields = clone(byKey['quote.toInvoice.retainFields'])
            }
            if (byKey['quote.toSalesOrder.retainFields']) {
                general.quoteToSalesOrderRetainFields = clone(byKey['quote.toSalesOrder.retainFields'])
            }
        }
    } catch (error: any) {
        toast.add({
            title: 'Failed to load preferences',
            description: error?.message || 'Please try again',
            color: 'red',
        })
    } finally {
        isLoading.value = false
    }
}

const savePreference = async (key: string, value: unknown) => {
    savingKey.value = key
    try {
        await $fetch('/api/general-preferences', {
            method: 'PUT',
            body: {
                pageName: selectedPage.value,
                key,
                value,
            },
        })
        toast.add({ title: 'Preferences saved', icon: 'i-heroicons-check-circle', color: 'green' })
    } catch (error: any) {
        toast.add({
            title: 'Failed to save preferences',
            description: error?.message || 'Please try again',
            color: 'red',
        })
    } finally {
        savingKey.value = null
    }
}

const saveGeneral = async () => {
    await savePreference('general', clone(general))

    if (selectedPage.value === 'quotes') {
        await savePreference('quote.toInvoice.retainFields', clone(general.quoteToInvoiceRetainFields))
        await savePreference('quote.toSalesOrder.retainFields', clone(general.quoteToSalesOrderRetainFields))
    }
}

const addApprovalLevel = () => {
    approval.levels.push({
        id: `level-${Date.now()}`,
        name: `Level ${approval.levels.length + 1}: Approver`,
        approverIds: [],
    })
}

const removeApprovalLevel = (index: number) => {
    if (approval.levels.length <= 1) return
    approval.levels.splice(index, 1)
}

const addCustomField = () => {
    fieldCustomization.fields.push({
        id: `field-${Date.now()}`,
        label: '',
        dataType: 'text',
        mandatory: false,
        showInPdfs: true,
        status: 'Active',
    })
}

const removeCustomField = (index: number) => {
    fieldCustomization.fields.splice(index, 1)
}

const addValidationRule = () => {
    validationRules.rules.push({
        id: `rule-${Date.now()}`,
        field: '',
        operator: 'equals',
        value: '',
        message: '',
        active: true,
    })
}

const removeValidationRule = (index: number) => {
    validationRules.rules.splice(index, 1)
}

const addCustomAction = () => {
    customActions.actions.push({
        id: `action-${Date.now()}`,
        trigger: 'save',
        actionType: 'notification',
        name: '',
        config: '',
        active: true,
    })
}

const removeCustomAction = (index: number) => {
    customActions.actions.splice(index, 1)
}

watch(selectedPage, () => {
    loadPreferences()
})

onMounted(async () => {
    await Promise.all([loadUsers(), loadPreferences()])
})
</script>

<template>
    <UDashboardPanelContent class="p-4">
        <SettingsTabNav />

        <div class="mb-6">
            <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">Preferences</h1>
            <p class="mt-1 text-sm text-gray-500">
                Configure reusable rules by page. These settings are stored per page now and can be applied to more modules later.
            </p>
        </div>

        <div class="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside class="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                <p class="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Page</p>
                <div class="space-y-1">
                    <button
                        v-for="page in pages"
                        :key="page.value"
                        type="button"
                        class="w-full rounded-md px-3 py-3 text-left transition"
                        :class="selectedPage === page.value ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800'"
                        @click="selectedPage = page.value"
                    >
                        <span class="block text-sm font-medium">{{ page.label }}</span>
                        <span class="mt-1 block text-xs text-gray-500">{{ page.description }}</span>
                    </button>
                </div>
            </aside>

            <section class="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div class="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ selectedPageMeta.label }} Preferences</h2>
                            <p class="mt-1 text-sm text-gray-500">{{ selectedPageMeta.description }}</p>
                        </div>
                        <UBadge color="gray" variant="subtle">{{ selectedPage }}</UBadge>
                    </div>

                    <div class="mt-4 flex flex-wrap gap-2">
                        <button
                            v-for="tab in tabs"
                            :key="tab.key"
                            type="button"
                            class="rounded-md px-3 py-2 text-sm font-medium transition"
                            :class="selectedTab === tab.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
                            @click="selectedTab = tab.key"
                        >
                            {{ tab.label }}
                        </button>
                    </div>
                </div>

                <div v-if="isLoading" class="p-8 text-sm text-gray-500">Loading preferences...</div>

                <div v-else class="p-5">
                    <div v-if="selectedTab === 'general'" class="space-y-6">
                        <UCard>
                            <div class="space-y-4">
                                <UCheckbox v-model="general.enabled" label="Enable preferences for this page" />
                                <UCheckbox
                                    v-if="selectedPage === 'quotes'"
                                    v-model="general.allowEditingAcceptedQuotes"
                                    label="Allow editing of accepted quotes"
                                />
                                <UCheckbox
                                    v-if="selectedPage === 'quotes'"
                                    v-model="general.allowCustomerAcceptDecline"
                                    label="Allow customers to accept or decline quotes from WhatsApp and public links"
                                />
                            </div>
                        </UCard>

                        <UCard v-if="selectedPage === 'quotes'">
                            <div class="space-y-5">
                                <div>
                                    <h3 class="font-semibold text-gray-900 dark:text-white">Quote conversion retain fields</h3>
                                    <p class="mt-1 text-sm text-gray-500">
                                        Select which quote fields should be carried into generated sales orders and invoices.
                                    </p>
                                </div>

                                <div class="grid gap-6 md:grid-cols-2">
                                    <div class="space-y-3">
                                        <h4 class="text-sm font-semibold">Quote to Invoice</h4>
                                        <UCheckbox v-model="general.quoteToInvoiceRetainFields.customerNotes" label="Customer Notes" />
                                        <UCheckbox v-model="general.quoteToInvoiceRetainFields.termsAndConditions" label="Terms & Conditions" />
                                        <UCheckbox v-model="general.quoteToInvoiceRetainFields.address" label="Address" />
                                    </div>
                                    <div class="space-y-3">
                                        <h4 class="text-sm font-semibold">Quote to Sales Order</h4>
                                        <UCheckbox v-model="general.quoteToSalesOrderRetainFields.customerNotes" label="Customer Notes" />
                                        <UCheckbox v-model="general.quoteToSalesOrderRetainFields.termsAndConditions" label="Terms & Conditions" />
                                        <UCheckbox v-model="general.quoteToSalesOrderRetainFields.address" label="Address" />
                                    </div>
                                </div>
                            </div>
                        </UCard>

                        <UButton color="primary" :loading="savingKey === 'general'" @click="saveGeneral">
                            Save General Preferences
                        </UButton>
                    </div>

                    <div v-if="selectedTab === 'approval'" class="space-y-6">
                        <div>
                            <h3 class="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Approval Type</h3>
                            <div class="grid gap-4 md:grid-cols-3">
                                <button
                                    v-for="option in [
                                        { value: 'none', title: 'No Approval', text: 'Create and perform further actions without approval.' },
                                        { value: 'simple', title: 'Simple Approval', text: 'Any one selected approver can approve the transaction.' },
                                        { value: 'multiLevel', title: 'Multi-Level Approval', text: 'All approval levels must approve before actions continue.' },
                                    ]"
                                    :key="option.value"
                                    type="button"
                                    class="rounded-lg border p-4 text-left transition"
                                    :class="approval.type === option.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30' : 'border-gray-200 hover:border-primary-300 dark:border-gray-800'"
                                    @click="approval.type = option.value as any"
                                >
                                    <div class="flex items-center gap-2">
                                        <span
                                            class="h-4 w-4 rounded-full border"
                                            :class="approval.type === option.value ? 'border-primary-500 bg-primary-500 ring-4 ring-primary-100' : 'border-gray-300'"
                                        />
                                        <span class="font-semibold">{{ option.title }}</span>
                                    </div>
                                    <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">{{ option.text }}</p>
                                </button>
                            </div>
                        </div>

                        <UCard v-if="approval.type === 'simple'">
                            <UFormGroup label="Approvers">
                                <USelectMenu
                                    v-model="approval.approverIds"
                                    :options="userOptions"
                                    value-attribute="value"
                                    option-attribute="label"
                                    multiple
                                    searchable
                                    placeholder="Select approvers"
                                />
                            </UFormGroup>
                            <p class="mt-2 text-sm text-gray-500">Only one selected user's approval is required.</p>
                        </UCard>

                        <UCard v-if="approval.type === 'multiLevel'">
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="font-semibold">Set the approval hierarchy</h3>
                                        <p class="text-sm text-gray-500">Each level must approve before the record is considered approved.</p>
                                    </div>
                                    <UButton size="xs" color="primary" variant="soft" @click="addApprovalLevel">Add New Level</UButton>
                                </div>

                                <div v-for="(level, index) in approval.levels" :key="level.id" class="grid gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-800 md:grid-cols-[220px_minmax(0,1fr)_auto]">
                                    <UInput v-model="level.name" />
                                    <USelectMenu
                                        v-model="level.approverIds"
                                        :options="userOptions"
                                        value-attribute="value"
                                        option-attribute="label"
                                        multiple
                                        searchable
                                        placeholder="Select approvers"
                                    />
                                    <UButton icon="i-heroicons-trash" color="red" variant="ghost" :disabled="approval.levels.length <= 1" @click="removeApprovalLevel(index)" />
                                </div>
                            </div>
                        </UCard>

                        <UCard>
                            <h3 class="mb-4 font-semibold">Notification Preferences</h3>
                            <div class="space-y-3">
                                <UCheckbox v-model="approval.notifyOnSubmit" label="Send email and in-app notifications when transactions are submitted for approval" />
                                <UCheckbox v-model="approval.notifyOnDecision" label="Notify the submitter when a transaction is approved or rejected" />
                            </div>
                        </UCard>

                        <UButton color="primary" :loading="savingKey === 'approval'" @click="savePreference('approval', clone(approval))">
                            Save Approval Preferences
                        </UButton>
                    </div>

                    <div v-if="selectedTab === 'fieldCustomization'" class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold">Field Customization</h3>
                                <p class="text-sm text-gray-500">Add page-specific custom fields, including links to clients and users.</p>
                            </div>
                            <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="addCustomField">Add Field</UButton>
                        </div>

                        <div class="space-y-3">
                            <div v-for="(field, index) in fieldCustomization.fields" :key="field.id" class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                                <div class="grid gap-3 lg:grid-cols-[1fr_220px_120px_120px_120px_auto]">
                                    <UFormGroup label="Field Name">
                                        <UInput v-model="field.label" placeholder="Field name" />
                                    </UFormGroup>
                                    <UFormGroup label="Data Type">
                                        <USelectMenu v-model="field.dataType" :options="dataTypeOptions" value-attribute="value" option-attribute="label" />
                                    </UFormGroup>
                                    <UFormGroup label="Mandatory">
                                        <USelectMenu v-model="field.mandatory" :options="[{ label: 'No', value: false }, { label: 'Yes', value: true }]" value-attribute="value" option-attribute="label" />
                                    </UFormGroup>
                                    <UFormGroup label="Show in PDFs">
                                        <USelectMenu v-model="field.showInPdfs" :options="[{ label: 'Yes', value: true }, { label: 'No', value: false }]" value-attribute="value" option-attribute="label" />
                                    </UFormGroup>
                                    <UFormGroup label="Status">
                                        <USelectMenu v-model="field.status" :options="['Active', 'Inactive']" />
                                    </UFormGroup>
                                    <div class="flex items-end">
                                        <UButton icon="i-heroicons-trash" color="red" variant="ghost" @click="removeCustomField(index)" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <UButton color="primary" :loading="savingKey === 'fieldCustomization'" @click="savePreference('fieldCustomization', clone(fieldCustomization))">
                            Save Field Customization
                        </UButton>
                    </div>

                    <div v-if="selectedTab === 'validationRules'" class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold">Validation Rules</h3>
                                <p class="text-sm text-gray-500">Create conditional rules that can block saves or actions later.</p>
                            </div>
                            <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="addValidationRule">Add Rule</UButton>
                        </div>

                        <UAlert
                            v-if="!validationRules.rules.length"
                            color="primary"
                            variant="subtle"
                            title="No validation rules yet"
                            description="Add rules like: when field X equals Y, require field Z or show a message."
                        />

                        <div v-for="(rule, index) in validationRules.rules" :key="rule.id" class="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                            <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_180px_1fr_1fr_80px]">
                                <UFormGroup label="Field">
                                    <UInput v-model="rule.field" placeholder="status, total, salesperson..." />
                                </UFormGroup>
                                <UFormGroup label="Condition">
                                    <USelectMenu v-model="rule.operator" :options="validationOperators" value-attribute="value" option-attribute="label" />
                                </UFormGroup>
                                <UFormGroup label="Value">
                                    <UInput v-model="rule.value" placeholder="Accepted, 10000..." />
                                </UFormGroup>
                                <UFormGroup label="Error Message">
                                    <UInput v-model="rule.message" placeholder="Message shown to user" />
                                </UFormGroup>
                                <div class="flex items-end justify-end gap-2">
                                    <UCheckbox v-model="rule.active" />
                                    <UButton icon="i-heroicons-trash" color="red" variant="ghost" @click="removeValidationRule(index)" />
                                </div>
                            </div>
                        </div>

                        <UButton color="primary" :loading="savingKey === 'validationRules'" @click="savePreference('validationRules', clone(validationRules))">
                            Save Validation Rules
                        </UButton>
                    </div>

                    <div v-if="selectedTab === 'customActions'" class="space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="font-semibold">Custom Actions</h3>
                                <p class="text-sm text-gray-500">Define actions to trigger when records are created, edited, accepted, declined, converted, or deleted.</p>
                            </div>
                            <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="addCustomAction">Add Action</UButton>
                        </div>

                        <UAlert
                            v-if="!customActions.actions.length"
                            color="primary"
                            variant="subtle"
                            title="No custom actions yet"
                            description="Add an action such as sending a notification, email, webhook, or updating status."
                        />

                        <div v-for="(action, index) in customActions.actions" :key="action.id" class="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                            <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_180px_180px_90px]">
                                <UFormGroup label="Action Name">
                                    <UInput v-model="action.name" placeholder="Notify manager" />
                                </UFormGroup>
                                <UFormGroup label="Trigger">
                                    <USelectMenu v-model="action.trigger" :options="actionTriggers" value-attribute="value" option-attribute="label" />
                                </UFormGroup>
                                <UFormGroup label="Action Type">
                                    <USelectMenu v-model="action.actionType" :options="customActionTypes" value-attribute="value" option-attribute="label" />
                                </UFormGroup>
                                <div class="flex items-end justify-end gap-2">
                                    <UCheckbox v-model="action.active" />
                                    <UButton icon="i-heroicons-trash" color="red" variant="ghost" @click="removeCustomAction(index)" />
                                </div>
                            </div>
                            <UFormGroup label="Config">
                                <UTextarea v-model="action.config" :rows="3" placeholder="Webhook URL, email template, notification text, or JSON config" />
                            </UFormGroup>
                        </div>

                        <UButton color="primary" :loading="savingKey === 'customActions'" @click="savePreference('customActions', clone(customActions))">
                            Save Custom Actions
                        </UButton>
                    </div>

                    <div v-if="selectedTab === 'recordLocking'" class="space-y-6">
                        <UCard>
                            <div class="space-y-4">
                                <UCheckbox v-model="recordLocking.enabled" label="Enable record locking for this page" />
                                <UFormGroup label="Lock records when status is">
                                    <USelectMenu
                                        v-model="recordLocking.lockWhenStatus"
                                        :options="statusOptions"
                                        value-attribute="value"
                                        option-attribute="label"
                                        multiple
                                        placeholder="Select statuses"
                                    />
                                </UFormGroup>
                                <UFormGroup label="Disable these action menu items">
                                    <USelectMenu
                                        v-model="recordLocking.restrictedActions"
                                        :options="lockableActions"
                                        value-attribute="value"
                                        option-attribute="label"
                                        multiple
                                        placeholder="Select actions"
                                    />
                                </UFormGroup>
                                <UFormGroup label="Apply lock to roles">
                                    <USelectMenu
                                        v-model="recordLocking.appliesToRoles"
                                        :options="roleOptions"
                                        value-attribute="value"
                                        option-attribute="label"
                                        multiple
                                        placeholder="Select roles"
                                    />
                                </UFormGroup>
                                <UCheckbox v-model="recordLocking.allowAdminsToBypass" label="Allow admins to bypass record locking" />
                            </div>
                        </UCard>

                        <UButton color="primary" :loading="savingKey === 'recordLocking'" @click="savePreference('recordLocking', clone(recordLocking))">
                            Save Record Locking
                        </UButton>
                    </div>
                </div>
            </section>
        </div>
    </UDashboardPanelContent>
</template>
