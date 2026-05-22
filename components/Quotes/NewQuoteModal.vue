<script setup lang="ts">
import { BillingAddClient } from '#components'
import { hash } from '~/composables/hash'
import { format } from 'date-fns'
import {
    useCreateQuote,
    useUpdateQuote,
    useUpdateCompany,
    useFindManyCompanyClient,
    useFindManyCompanyUser,
    useFindManyProject,
    useCreateUser,
    useUpdateUser,
    useFindUniqueUser,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingQuote?: any; mode?: 'slideover' | 'page' }>()
const emit = defineEmits(['saved', 'cancel'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const route = useRoute()
const authSession = useAuth().session
const companyId = authSession.value?.companyId
const currentUserId = authSession.value?.id
const currentUserRole = authSession.value?.role
const isPageMode = computed(() => props.mode === 'page')

const wrapperProps = computed(() => isPageMode.value
    ? { class: 'flex flex-col h-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900' }
    : {
        modelValue: open.value,
        'onUpdate:modelValue': (value: boolean) => {
            open.value = value
        },
        ui: { width: 'max-w-2xl' },
    })

const CreateQuote = useCreateQuote({ optimisticUpdate: true })
const UpdateQuote = useUpdateQuote({ optimisticUpdate: true })
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })
const CreateUser = useCreateUser({ optimisticUpdate: true })
const UpdateUser = useUpdateUser({ optimisticUpdate: true })

const isSaving = ref(false)
const isClientAddModelOpen = ref(false)
const isSalespersonAddModelOpen = ref(false)
const isProjectAddModelOpen = ref(false)
const newClientSeed = ref('')
const manualClientOption = ref<{ label: string; value: string } | null>(null)
const manualSalespersonOption = ref<{ label: string; value: string } | null>(null)
const manualProjectOption = ref<{ label: string; value: string } | null>(null)
const categories = ref<any[]>([])
const itemSearchStates = reactive<Record<number, {
    query: string
    open: boolean
    loading: boolean
    options: any[]
}>>({})
const itemSearchContainers = ref<HTMLElement[]>([])

const createBlankItem = (serialNo: number) => ({
    serialNo,
    name: '',
    description: '',
    quantity: 1,
    rate: 0,
    amount: 0,
    variantId: '',
    category: [] as any[],
    categoryId: '',
    unit: null as string | null,
})

const form = reactive({
    clientId: '' as string,
    quoteNumber: '',
    referenceNumber: '',
    quoteDate: format(new Date(), 'yyyy-MM-dd'),
    expiryDate: '',
    salesperson: '',
    projectId: '' as string,
    subject: '',
    items: [createBlankItem(1)] as any[],
    discount: 0,
    discountType: 'amount' as 'amount' | 'percent',
    adjustment: 0,
    notes: 'Looking forward for your business.',
    termsAndConditions: '',
    customFields: {} as Record<string, any>,
})

const quotePreferences = reactive({
    approval: {
        type: 'none',
        approverIds: [] as string[],
        levels: [] as Array<{ approverIds?: string[] }>,
    },
    fieldCustomization: {
        fields: [] as Array<{
            id: string
            label: string
            dataType: string
            mandatory: boolean
            status: 'Active' | 'Inactive'
        }>,
    },
    validationRules: {
        rules: [] as Array<{
            id: string
            field: string
            operator: string
            value: string
            message: string
            active: boolean
        }>,
    },
    customActions: {
        actions: [] as any[],
    },
})

const activeCustomFields = computed(() =>
    (quotePreferences.fieldCustomization.fields || []).filter((field) => field.status !== 'Inactive')
)

const patchPreference = (target: Record<string, any>, source: Record<string, any>) => {
    Object.keys(target).forEach((key) => {
        if (source?.[key] !== undefined) {
            target[key] = JSON.parse(JSON.stringify(source[key]))
        }
    })
}

const loadQuotePreferences = async () => {
    try {
        const preferences = await $fetch<any[]>('/api/general-preferences', {
            query: { pageName: 'quotes' },
        })
        const byKey = Object.fromEntries((preferences || []).map((pref) => [pref.key, pref.value]))
        patchPreference(quotePreferences.approval, byKey.approval || {})
        patchPreference(quotePreferences.fieldCustomization, byKey.fieldCustomization || {})
        patchPreference(quotePreferences.validationRules, byKey.validationRules || {})
        patchPreference(quotePreferences.customActions, byKey.customActions || {})
    } catch {
        // Preferences are optional; defaults keep quote creation available.
    }
}

const loadQuoteCustomFieldValues = async (quoteId: string) => {
    try {
        const values = await $fetch<Record<string, any>>(`/api/quotes/custom-fields/${quoteId}`)
        form.customFields = {
            ...form.customFields,
            ...(values || {}),
        }
    } catch {
        // Missing custom values should not block editing the base quote.
    }
}

const saveQuoteCustomFieldValues = async (quoteId?: string) => {
    if (!quoteId || !activeCustomFields.value.length) return

    await $fetch(`/api/quotes/custom-fields/${quoteId}`, {
        method: 'PUT' as any,
        body: { values: form.customFields },
    })
}

const salespersonForm = reactive({
    name: '',
    email: '',
    phone: '',
    role: 'user' as 'admin' | 'manager' | 'biller' | 'accountant' | 'user',
})

const userRoleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Biller', value: 'biller' },
    { label: 'Accountant', value: 'accountant' },
    { label: 'User', value: 'user' },
]

const fetchCategories = async () => {
    if (!companyId) return

    try {
        categories.value = await $fetch('/api/bill/findManyCategory', {
            query: { companyId },
        })
    } catch (error) {
        categories.value = []
    }
}

const getItemSearchState = (index: number) => {
    if (!itemSearchStates[index]) {
        itemSearchStates[index] = {
            query: '',
            open: false,
            loading: false,
            options: [],
        }
    }

    return itemSearchStates[index]
}

const closeItemSearchMenus = () => {
    Object.values(itemSearchStates).forEach((state) => {
        state.open = false
    })
}

const setItemSearchContainer = (el: Element | ComponentPublicInstance | null, index: number) => {
    if (el instanceof HTMLElement) {
        itemSearchContainers.value[index] = el
    }
}

const handleOutsideItemSearchClick = (event: PointerEvent) => {
    const target = event.target as Node | null
    if (!target) return

    const clickedInsideSearch = itemSearchContainers.value.some((container) =>
        container?.contains(target)
    )

    if (!clickedInsideSearch) {
        closeItemSearchMenus()
    }
}

const getItemName = (itemData: any) => [
    itemData?.variant?.product?.subcategory?.name,
    itemData?.variant?.name,
    itemData?.variant?.product?.name,
].filter(Boolean).join(' ')

const getItemOptionLabel = (itemData: any) => {
    const name = getItemName(itemData)
    const size = itemData?.size ? ` - ${itemData.size}` : ''
    const barcode = itemData?.barcode ? ` (${itemData.barcode})` : ''

    return `${name}${size}${barcode}`.trim()
}

const searchItems = async (query: string, index: number, limit = 3) => {
    const state = getItemSearchState(index)
    const trimmedQuery = query.trim()

    state.query = trimmedQuery

    if (!trimmedQuery) {
        state.options = []
        state.open = false
        return []
    }

    state.loading = true

    try {
        const results = await $fetch<any[]>('/api/bill/searchItems', {
            query: { q: trimmedQuery, limit },
        })

        if (state.query !== trimmedQuery) return state.options

        state.options = results || []
        return state.options
    } catch (error) {
        state.options = []
        return []
    } finally {
        state.loading = false
    }
}

const populateItemFromSearch = (index: number, itemData: any) => {
    const item = form.items[index]
    if (!item || !itemData) return

    const categoryId = itemData?.variant?.product?.categoryId || ''
    const matchedCategory = categories.value.find((category: any) => category.id === categoryId)
    const fallbackCategory = itemData?.variant?.product?.category
        ? {
            id: categoryId,
            name: itemData.variant.product.category.name,
            hsn: itemData.variant.product.category.hsn,
        }
        : null

    item.name = getItemName(itemData)
    item.description = itemData?.barcode || ''
    item.rate = itemData?.variant?.sprice || 0
    item.amount = item.quantity * item.rate
    item.variantId = itemData?.variant?.id || ''
    item.categoryId = categoryId
    item.category = matchedCategory ? [matchedCategory] : fallbackCategory ? [fallbackCategory] : []
    item.unit = itemData?.variant?.unit || null

    const state = getItemSearchState(index)
    state.open = false
    state.options = []
}

const handleItemSearchInput = async (index: number) => {
    const item = form.items[index]
    if (!item) return

    item.variantId = ''
    const results = await searchItems(item.name || '', index, 3)
    getItemSearchState(index).open = results.length > 0
}

const selectItemSearchOption = (index: number, itemData: any) => {
    populateItemFromSearch(index, itemData)
    updateItemAmount(index)
}

const selectFirstItemForSearch = async (index: number) => {
    const item = form.items[index]
    if (!item?.name?.trim()) return

    const state = getItemSearchState(index)
    state.open = false

    const results = await searchItems(item.name, index, 1)
    const firstMatch = results[0]

    if (!firstMatch) {
        toast.add({ title: 'No matching item found', color: 'red' })
        return
    }

    populateItemFromSearch(index, firstMatch)
    updateItemAmount(index)
}

const handleQuoteItemCategoryChange = (index: number) => {
    const item = form.items[index]
    if (!item) return

    if (item.category?.length > 1) {
        item.category = [item.category[item.category.length - 1]]
    }

    item.categoryId = item.category?.[0]?.id || ''
}

const fetchQuoteNumber = async () => {
    try {
        const res = await $fetch<{ quoteNumber: string }>('/api/quotes/next-number')
        form.quoteNumber = res.quoteNumber
    } catch (error) {
        form.quoteNumber = 'QT-000001'
    }
}

const resetSalespersonForm = () => {
    salespersonForm.name = ''
    salespersonForm.email = ''
    salespersonForm.phone = ''
    salespersonForm.role = 'user'
}

const initializeForm = async () => {
    form.customFields = {}
    activeCustomFields.value.forEach((field) => {
        form.customFields[field.id] = field.dataType === 'checkbox' ? false : ''
    })

    if (props.editingQuote) {
        form.clientId = props.editingQuote.clientId || ''
        form.quoteNumber = props.editingQuote.quoteNumber
        form.referenceNumber = props.editingQuote.referenceNumber || ''
        form.quoteDate = format(new Date(props.editingQuote.quoteDate), 'yyyy-MM-dd')
        form.expiryDate = props.editingQuote.expiryDate ? format(new Date(props.editingQuote.expiryDate), 'yyyy-MM-dd') : ''
        form.salesperson = props.editingQuote.salesperson || ''
        form.projectId = props.editingQuote.projectId || ''
        form.subject = props.editingQuote.subject || ''
        form.discount = props.editingQuote.discount || 0
        form.discountType = props.editingQuote.discountType || 'amount'
        form.adjustment = props.editingQuote.adjustment || 0
        form.notes = props.editingQuote.notes || ''
        form.termsAndConditions = props.editingQuote.termsAndConditions || ''
        form.items = (props.editingQuote.items || []).map((item: any, i: number) => ({
            serialNo: i + 1,
            name: item.name || '',
            description: item.description || '',
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
            variantId: item.variantId || '',
            category: [],
            categoryId: '',
            unit: item.unit || null,
        }))
        if (!form.items.length) {
            form.items = [createBlankItem(1)]
        }
        await loadQuoteCustomFieldValues(props.editingQuote.id)
        return
    }

    resetForm()
    await fetchQuoteNumber()

    const projectId = Array.isArray(route.query.newFromProject)
        ? route.query.newFromProject[0]
        : route.query.newFromProject

    if (projectId) {
        form.projectId = String(projectId)
    }
}

const clientSearch = ref('')
const trimmedClientSearch = computed(() => clientSearch.value.trim())
const { data: clients, refetch: refetchClients } = useFindManyCompanyClient(computed(() => ({
    where: { companyId, client: { deleted: false, ...(clientSearch.value ? { name: { contains: clientSearch.value, mode: 'insensitive' } } : {}) } },
    include: { client: true },
    take: 20,
})))

const clientOptions = computed(() => {
    const options = (clients.value || []).map((cc: any) => ({
        label: cc.client?.name || cc.name || '-',
        value: cc.client?.id || cc.clientId,
    }))

    if (manualClientOption.value && !options.some((option: any) => option.value === manualClientOption.value?.value)) {
        options.unshift(manualClientOption.value)
    }

    return options
})

const openCreateClientModal = (query = trimmedClientSearch.value) => {
    clientSearch.value = query
    newClientSeed.value = query
    isClientAddModelOpen.value = true
}

const handleClientAdded = async (id: string, name: string, phone: string) => {
    manualClientOption.value = { label: name, value: id }
    clientSearch.value = name
    form.clientId = id
    newClientSeed.value = phone || name
    isClientAddModelOpen.value = false
    await refetchClients()
}

const salespersonSearch = ref('')
const trimmedSalespersonSearch = computed(() => salespersonSearch.value.trim())
const { data: companyUsers, refetch: refetchCompanyUsers } = useFindManyCompanyUser(computed(() => ({
    where: { companyId, deleted: false },
    take: 50,
})))

const salespersonOptions = computed(() => {
    const options = (companyUsers.value || []).map((u: any) => ({
        label: u.name || u.user?.email || '-',
        value: u.name || u.user?.email || '-',
    }))

    if (manualSalespersonOption.value && !options.some((option: any) => option.value === manualSalespersonOption.value?.value)) {
        options.unshift(manualSalespersonOption.value)
    }

    return options
})

const { refetch: refetchExistingSalesperson } = useFindUniqueUser(
    computed(() => ({
        where: { email: salespersonForm.email || '' },
    })),
    {
        enabled: false,
    }
)

const openCreateSalespersonModal = (query = trimmedSalespersonSearch.value) => {
    salespersonSearch.value = query
    resetSalespersonForm()
    salespersonForm.name = query
    isSalespersonAddModelOpen.value = true
}

const saveSalesperson = async () => {
    if (!salespersonForm.name || !salespersonForm.email) {
        toast.add({ title: 'Name and email are required', color: 'red' })
        return
    }

    isSaving.value = true
    try {
        const { data: existingUser } = await refetchExistingSalesperson()
        const { number: userCode } = await $fetch('/api/counter/increment', {
            method: 'POST',
            body: { entity: 'user' },
        })

        if (existingUser) {
            await UpdateUser.mutateAsync({
                where: { id: existingUser.id },
                data: {
                    companies: {
                        create: [{
                            company: {
                                connect: { id: companyId },
                            },
                            name: salespersonForm.name,
                            role: salespersonForm.role,
                            phone: salespersonForm.phone?.trim() || null,
                            code: userCode,
                        }],
                    },
                },
            })
        } else {
            await CreateUser.mutateAsync({
                data: {
                    email: salespersonForm.email,
                    password: await hash(salespersonForm.email),
                    companies: {
                        create: {
                            name: salespersonForm.name,
                            role: salespersonForm.role,
                            phone: salespersonForm.phone?.trim() || null,
                            code: userCode,
                            company: {
                                connect: { id: companyId! },
                            },
                        },
                    },
                },
            })
        }

        manualSalespersonOption.value = {
            label: salespersonForm.name,
            value: salespersonForm.name,
        }
        form.salesperson = salespersonForm.name
        salespersonSearch.value = salespersonForm.name
        isSalespersonAddModelOpen.value = false
        await refetchCompanyUsers()
        toast.add({ title: 'Salesperson created', color: 'green' })
    } catch (error: any) {
        toast.add({
            title: 'Failed to create salesperson',
            description: error?.info?.message ?? error?.message ?? 'Please try again',
            color: 'red',
        })
    } finally {
        isSaving.value = false
    }
}

const projectSearch = ref('')
const trimmedProjectSearch = computed(() => projectSearch.value.trim())
const { data: projectsList, refetch: refetchProjects } = useFindManyProject(computed(() => ({
    where: { companyId, deleted: false },
    take: 50,
})))

const projectOptions = computed(() => {
    const options = (projectsList.value || []).map((p: any) => ({
        label: p.name,
        value: p.id,
    }))

    if (manualProjectOption.value && !options.some((option: any) => option.value === manualProjectOption.value?.value)) {
        options.unshift(manualProjectOption.value)
    }

    return options
})

const openCreateProjectModal = (query = trimmedProjectSearch.value) => {
    projectSearch.value = query
    window.setTimeout(() => {
        isProjectAddModelOpen.value = true
    }, 0)
}

const handleProjectSaved = async (project?: { id?: string; name?: string }) => {
    if (project?.id && project?.name) {
        manualProjectOption.value = {
            label: project.name,
            value: project.id,
        }
        form.projectId = project.id
        projectSearch.value = project.name
    }

    isProjectAddModelOpen.value = false
    await refetchProjects()
}

const addItem = () => {
    form.items.push(createBlankItem(form.items.length + 1))
}

const removeItem = (index: number) => {
    if (form.items.length > 1) {
        form.items.splice(index, 1)
        form.items.forEach((item, i) => { item.serialNo = i + 1 })
    }
}

const updateItemAmount = (index: number) => {
    const item = form.items[index]
    item.amount = item.quantity * item.rate
}

const subTotal = computed(() =>
    form.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0)
)

const discountAmount = computed(() => {
    if (form.discountType === 'percent') {
        return (subTotal.value * form.discount) / 100
    }
    return form.discount || 0
})

const total = computed(() =>
    subTotal.value - discountAmount.value + (form.adjustment || 0)
)

const getComparableValue = (field: string, status: 'DRAFT' | 'SENT') => {
    const values: Record<string, any> = {
        status,
        total: total.value,
        subTotal: subTotal.value,
        discount: discountAmount.value,
        adjustment: form.adjustment,
        clientId: form.clientId,
        salesperson: form.salesperson,
        subject: form.subject,
        notes: form.notes,
        termsAndConditions: form.termsAndConditions,
        itemCount: form.items.length,
        quoteDate: form.quoteDate,
        expiryDate: form.expiryDate,
    }

    return values[field] ?? form.customFields[field]
}

const ruleMatches = (actual: any, operator: string, expected: string) => {
    const actualText = String(actual ?? '').trim()
    const expectedText = String(expected ?? '').trim()
    const actualNumber = Number(actual)
    const expectedNumber = Number(expected)

    switch (operator) {
        case 'equals':
            return actualText === expectedText
        case 'notEquals':
            return actualText !== expectedText
        case 'contains':
            return actualText.toLowerCase().includes(expectedText.toLowerCase())
        case 'empty':
            return actualText === ''
        case 'notEmpty':
            return actualText !== ''
        case 'greaterThan':
            return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && actualNumber > expectedNumber
        case 'lessThan':
            return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && actualNumber < expectedNumber
        default:
            return false
    }
}

const validateQuotePreferences = (status: 'DRAFT' | 'SENT') => {
    const missingField = activeCustomFields.value.find((field) =>
        field.mandatory && !String(form.customFields[field.id] ?? '').trim()
    )

    if (missingField) {
        toast.add({ title: `${missingField.label} is required`, color: 'red' })
        return false
    }

    const failedRule = (quotePreferences.validationRules.rules || []).find((rule) =>
        rule.active && rule.field && ruleMatches(getComparableValue(rule.field, status), rule.operator, rule.value)
    )

    if (failedRule) {
        toast.add({
            title: 'Validation rule blocked this quote',
            description: failedRule.message || 'Please check quote preferences.',
            color: 'red',
        })
        return false
    }

    return true
}

const approvalApproverIds = computed(() => {
    if (quotePreferences.approval.type === 'simple') {
        return quotePreferences.approval.approverIds || []
    }

    if (quotePreferences.approval.type === 'multiLevel') {
        return (quotePreferences.approval.levels || [])
            .flatMap((level: any) => level.approverIds || [])
    }

    return []
})

const approvalBlocksSend = () =>
    quotePreferences.approval.type !== 'none'
    && currentUserRole !== 'admin'
    && (!currentUserId || !approvalApproverIds.value.includes(currentUserId))

const runCustomActions = (trigger: string) => {
    const actions = quotePreferences.customActions.actions || []
    actions
        .filter((action: any) => action.active && action.trigger === trigger)
        .forEach((action: any) => {
            toast.add({
                title: `Custom action: ${action.name || action.actionType}`,
                description: `Triggered on quote ${trigger}`,
                icon: 'i-heroicons-bolt',
                color: 'blue',
            })
        })
}

const saveQuote = async (status: 'DRAFT' | 'SENT') => {
    if (!form.quoteNumber) {
        toast.add({ title: 'Quote number is required', color: 'red' })
        return
    }

    if (status === 'SENT' && approvalBlocksSend()) {
        toast.add({
            title: 'Approval required before sending',
            description: 'This quote was saved as draft because quote approval is enabled.',
            color: 'red',
        })
        status = 'DRAFT'
    }

    if (!validateQuotePreferences(status)) {
        return
    }

    isSaving.value = true
    try {
        const quoteData: any = {
            quoteNumber: form.quoteNumber,
            referenceNumber: form.referenceNumber || null,
            quoteDate: new Date(form.quoteDate),
            expiryDate: form.expiryDate ? new Date(form.expiryDate) : null,
            subject: form.subject || null,
            status,
            notes: form.notes || null,
            termsAndConditions: form.termsAndConditions || null,
            discount: discountAmount.value,
            discountType: form.discountType,
            adjustment: form.adjustment || 0,
            subTotal: subTotal.value,
            total: total.value,
            salesperson: form.salesperson || null,
            pdfTemplate: null,
            attachments: [],
            company: { connect: { id: companyId } },
            ...(form.clientId ? { client: { connect: { id: form.clientId } } } : {}),
            ...(form.projectId ? { project: { connect: { id: form.projectId } } } : {}),
        }

        let savedQuoteId = props.editingQuote?.id

        if (props.editingQuote?.id) {
            await UpdateQuote.mutateAsync({
                where: { id: props.editingQuote.id },
                data: {
                    ...quoteData,
                    company: undefined,
                    client: form.clientId ? { connect: { id: form.clientId } } : { disconnect: true },
                    project: form.projectId ? { connect: { id: form.projectId } } : { disconnect: true },
                    items: {
                        deleteMany: {},
                        create: form.items.map((item, i) => ({
                            serialNo: i + 1,
                            name: item.name || null,
                            description: item.description || null,
                            quantity: item.quantity,
                            rate: item.rate,
                            amount: item.quantity * item.rate,
                            unit: null,
                            ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
                        })),
                    },
                },
            })
        } else {
            const createdQuote: any = await CreateQuote.mutateAsync({
                data: {
                    ...quoteData,
                    items: {
                        create: form.items.map((item, i) => ({
                            serialNo: i + 1,
                            name: item.name || null,
                            description: item.description || null,
                            quantity: item.quantity,
                            rate: item.rate,
                            amount: item.quantity * item.rate,
                            unit: null,
                            ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
                        })),
                    },
                },
            })
            savedQuoteId = createdQuote?.id

            await UpdateCompany.mutateAsync({
                where: { id: companyId },
                data: { quoteCounter: { increment: 1 } },
            })
        }

        await saveQuoteCustomFieldValues(savedQuoteId)

        runCustomActions(props.editingQuote ? 'save' : 'create')
        if (status === 'SENT') runCustomActions('send')

        toast.add({ title: props.editingQuote ? 'Quote updated' : 'Quote created', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        if (!isPageMode.value) {
            open.value = false
        }
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save quote', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

const resetForm = () => {
    form.clientId = ''
    form.quoteNumber = ''
    form.referenceNumber = ''
    form.quoteDate = format(new Date(), 'yyyy-MM-dd')
    form.expiryDate = ''
    form.salesperson = ''
    form.projectId = ''
    form.subject = ''
    form.items = [createBlankItem(1)]
    form.discount = 0
    form.discountType = 'amount'
    form.adjustment = 0
    form.notes = 'Looking forward for your business.'
    form.termsAndConditions = ''
    form.customFields = {}
    activeCustomFields.value.forEach((field) => {
        form.customFields[field.id] = field.dataType === 'checkbox' ? false : ''
    })
    clientSearch.value = ''
    salespersonSearch.value = ''
    projectSearch.value = ''
    manualClientOption.value = null
    manualSalespersonOption.value = null
    manualProjectOption.value = null
    newClientSeed.value = ''
    resetSalespersonForm()
}

const closeForm = () => {
    if (isPageMode.value) {
        emit('cancel')
        return
    }
    open.value = false
}

onMounted(async () => {
    await loadQuotePreferences()
    await fetchCategories()
    document.addEventListener('pointerdown', handleOutsideItemSearchClick)

    if (isPageMode.value) {
        await initializeForm()
    }
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleOutsideItemSearchClick)
})

watch(() => open.value, async (isOpen) => {
    if (isOpen && !isPageMode.value) {
        await loadQuotePreferences()
        await fetchCategories()
        await initializeForm()
    }
})
</script>

<template>
    <component :is="isPageMode ? 'div' : 'USlideover'" v-bind="wrapperProps">
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold">
                    {{ editingQuote ? 'Edit Quote' : 'New Quote' }}
                </h2>
                <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="closeForm" />
            </div>

            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                <UFormGroup label="Customer Name" required>
                    <USelectMenu
                        v-model="form.clientId"
                        :options="clientOptions"
                        value-attribute="value"
                        option-attribute="label"
                        searchable
                        :search-attributes="['label']"
                        placeholder="Select or add a customer"
                        @update:query="(q: string) => clientSearch = q"
                    >
                        <template #option-empty="{ query }">
                            <span class="block px-1 py-1">
                                <UButton
                                    size="xs"
                                    color="primary"
                                    variant="ghost"
                                    block
                                    icon="i-heroicons-plus"
                                    :label="`Create customer '${query}'`"
                                    @pointerdown.prevent.stop
                                    @mousedown.prevent.stop
                                    @click.prevent.stop="openCreateClientModal(query)"
                                />
                            </span>
                        </template>
                    </USelectMenu>
                </UFormGroup>

                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Quote#" required>
                        <UInput v-model="form.quoteNumber" disabled />
                    </UFormGroup>
                    <UFormGroup label="Reference#">
                        <UInput v-model="form.referenceNumber" placeholder="" />
                    </UFormGroup>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Quote Date" required>
                        <UInput v-model="form.quoteDate" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Expiry Date">
                        <UInput v-model="form.expiryDate" type="date" />
                    </UFormGroup>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Salesperson">
                        <USelectMenu
                            v-model="form.salesperson"
                            :options="salespersonOptions"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select or add salesperson"
                            @update:query="(q: string) => salespersonSearch = q"
                        >
                            <template #option-empty="{ query }">
                                <span class="block px-1 py-1">
                                    <UButton
                                        size="xs"
                                        color="primary"
                                        variant="ghost"
                                        block
                                        icon="i-heroicons-plus"
                                        :label="`Create salesperson '${query}'`"
                                        @pointerdown.prevent.stop
                                        @mousedown.prevent.stop
                                        @click.prevent.stop="openCreateSalespersonModal(query)"
                                    />
                                </span>
                            </template>
                        </USelectMenu>
                    </UFormGroup>
                    <UFormGroup label="Project Name">
                        <USelectMenu
                            v-model="form.projectId"
                            :options="projectOptions"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select a project"
                            @update:query="(q: string) => projectSearch = q"
                        >
                            <template #option-empty="{ query }">
                                <span class="block px-1 py-1">
                                    <UButton
                                        size="xs"
                                        color="primary"
                                        variant="ghost"
                                        block
                                        icon="i-heroicons-plus"
                                        :label="`Create project '${query}'`"
                                        @pointerdown.prevent.stop
                                        @mousedown.prevent.stop
                                        @click.prevent.stop="openCreateProjectModal(query)"
                                    />
                                </span>
                            </template>
                        </USelectMenu>
                    </UFormGroup>
                </div>

                <UFormGroup label="Subject">
                    <UTextarea
                        v-model="form.subject"
                        placeholder="Let your customer know what this Quote is for"
                        :rows="2"
                    />
                </UFormGroup>

                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-semibold">Item Table</h3>
                    </div>
                    <div class="relative overflow-visible rounded-md border">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[32%]">ITEM DETAILS</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[22%]">CATEGORY</th>
                                    <th class="px-3 py-2 text-center font-medium text-xs text-gray-500 w-[13%]">QUANTITY</th>
                                    <th class="px-3 py-2 text-center font-medium text-xs text-gray-500 w-[13%]">RATE</th>
                                    <th class="px-3 py-2 text-right font-medium text-xs text-gray-500 w-[14%]">AMOUNT</th>
                                    <th class="px-3 py-2 w-[6%]"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="(item, index) in form.items" :key="index">
                                    <td
                                        :ref="(el) => setItemSearchContainer(el, index)"
                                        class="px-3 py-2 relative"
                                    >
                                        <UInput
                                            v-model="item.name"
                                            placeholder="Type or click to select an item."
                                            size="sm"
                                            :loading="getItemSearchState(index).loading"
                                            autocomplete="off"
                                            @update:model-value="handleItemSearchInput(index)"
                                            @keydown.enter.prevent="selectFirstItemForSearch(index)"
                                            @focus="() => {
                                                const state = getItemSearchState(index)
                                                state.open = state.options.length > 0
                                            }"
                                        />
                                        <div
                                            v-if="getItemSearchState(index).open && getItemSearchState(index).options.length"
                                            class="absolute left-3 right-3 top-[42px] z-[9999] overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900"
                                        >
                                            <button
                                                v-for="option in getItemSearchState(index).options"
                                                :key="option.id"
                                                type="button"
                                                class="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-orange-50 dark:hover:bg-gray-800"
                                                @mousedown.prevent="selectItemSearchOption(index, option)"
                                            >
                                                <span class="font-medium text-gray-800 dark:text-gray-100">
                                                    {{ getItemOptionLabel(option) }}
                                                </span>
                                                <span class="text-xs text-gray-500">
                                                    {{ option.variant?.product?.category?.name || 'No category' }}
                                                    <template v-if="option.variant?.sprice"> · ₹{{ option.variant.sprice }}</template>
                                                    <template v-if="option.qty !== undefined"> · Stock {{ option.qty }}</template>
                                                </span>
                                            </button>
                                        </div>
                                    </td>
                                    <td class="px-3 py-2">
                                        <USelectMenu
                                            v-model="item.category"
                                            :options="categories"
                                            option-attribute="name"
                                            option-key="id"
                                            track-by="id"
                                            multiple
                                            searchable
                                            searchable-placeholder="Search a Category..."
                                            placeholder="Select Category"
                                            size="sm"
                                            @update:model-value="handleQuoteItemCategoryChange(index)"
                                        >
                                            <template #label>
                                                <span v-if="item.category?.length" class="truncate">
                                                    {{ item.category.map((category: any) => category.name).join(', ') }}
                                                </span>
                                                <span v-else class="text-gray-400">Category</span>
                                            </template>
                                            <template #option="{ option: category }">
                                                <span class="truncate">{{ category.name }}</span>
                                            </template>
                                        </USelectMenu>
                                    </td>
                                    <td class="px-3 py-2">
                                        <UInput
                                            v-model.number="item.quantity"
                                            type="number"
                                            :min="0"
                                            size="sm"
                                            class="text-center"
                                            @input="updateItemAmount(index)"
                                        />
                                    </td>
                                    <td class="px-3 py-2">
                                        <UInput
                                            v-model.number="item.rate"
                                            type="number"
                                            :min="0"
                                            size="sm"
                                            class="text-center"
                                            @input="updateItemAmount(index)"
                                        />
                                    </td>
                                    <td class="px-3 py-2 text-right font-medium">
                                        {{ (item.quantity * item.rate).toFixed(2) }}
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                        <UButton
                                            icon="i-heroicons-x-mark"
                                            color="red"
                                            variant="ghost"
                                            size="xs"
                                            :disabled="form.items.length <= 1"
                                            @click="removeItem(index)"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-2">
                        <UButton
                            icon="i-heroicons-plus"
                            color="primary"
                            variant="soft"
                            size="xs"
                            label="Add New Row"
                            @click="addItem"
                        />
                    </div>
                </div>

                <div class="flex justify-end">
                    <div class="w-72 space-y-3">
                        <div class="flex justify-between text-sm">
                            <span class="font-medium">Sub Total</span>
                            <span>{{ subTotal.toFixed(2) }}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-sm">
                            <span class="font-medium">Discount</span>
                            <div class="flex items-center gap-1">
                                <UInput
                                    v-model.number="form.discount"
                                    type="number"
                                    :min="0"
                                    size="xs"
                                    class="w-20"
                                />
                                <UButtonGroup size="xs">
                                    <UButton
                                        :color="form.discountType === 'amount' ? 'primary' : 'gray'"
                                        variant="solid"
                                        size="xs"
                                        @click="form.discountType = 'amount'"
                                    >
                                        ₹
                                    </UButton>
                                    <UButton
                                        :color="form.discountType === 'percent' ? 'primary' : 'gray'"
                                        variant="solid"
                                        size="xs"
                                        @click="form.discountType = 'percent'"
                                    >
                                        %
                                    </UButton>
                                </UButtonGroup>
                            </div>
                            <span>{{ discountAmount.toFixed(2) }}</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 text-sm">
                            <span class="font-medium">Adjustment</span>
                            <UInput
                                v-model.number="form.adjustment"
                                type="number"
                                size="xs"
                                class="w-24"
                            />
                        </div>
                        <div class="flex justify-between text-sm font-semibold border-t pt-2 border-gray-200 dark:border-gray-700">
                            <span>Total (₹)</span>
                            <span>{{ total.toFixed(2) }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="activeCustomFields.length" class="space-y-4 rounded-md border border-gray-200 p-4 dark:border-gray-700">
                    <div>
                        <h3 class="text-sm font-semibold">Custom Fields</h3>
                        <p class="mt-1 text-xs text-gray-500">Fields configured from Settings > Preferences > Quote.</p>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                        <UFormGroup
                            v-for="field in activeCustomFields"
                            :key="field.id"
                            :label="field.label"
                            :required="field.mandatory"
                        >
                            <UCheckbox
                                v-if="field.dataType === 'checkbox'"
                                v-model="form.customFields[field.id]"
                                :label="field.label"
                            />
                            <UTextarea
                                v-else-if="field.dataType === 'multiline'"
                                v-model="form.customFields[field.id]"
                                :rows="3"
                            />
                            <UInput
                                v-else
                                v-model="form.customFields[field.id]"
                                :type="field.dataType === 'number' || field.dataType === 'decimal' ? 'number' : field.dataType === 'date' ? 'date' : 'text'"
                            />
                        </UFormGroup>
                    </div>
                </div>

                <UFormGroup label="Customer Notes">
                    <UTextarea
                        v-model="form.notes"
                        placeholder="Looking forward for your business."
                        :rows="2"
                    />
                </UFormGroup>

                <UFormGroup label="Terms & Conditions">
                    <UTextarea
                        v-model="form.termsAndConditions"
                        placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                        :rows="3"
                    />
                </UFormGroup>
            </div>

            <div class="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <UButton
                    color="gray"
                    variant="solid"
                    label="Save as Draft"
                    :loading="isSaving"
                    @click="saveQuote('DRAFT')"
                />
                <UButton
                    color="primary"
                    variant="solid"
                    label="Save and Send"
                    :loading="isSaving"
                    @click="saveQuote('SENT')"
                />
                <UButton
                    color="gray"
                    variant="ghost"
                    label="Cancel"
                    @click="closeForm"
                />
            </div>
        </div>

        <BillingAddClient
            v-model:model="isClientAddModelOpen"
            v-model:phoneNo="newClientSeed"
            :clientAdded="handleClientAdded"
        />

        <UModal v-model="isSalespersonAddModelOpen">
            <UCard>
                <template #header>
                    <div class="text-base font-semibold">Add Salesperson</div>
                </template>

                <div class="space-y-4">
                    <UFormGroup label="Name" required>
                        <UInput v-model="salespersonForm.name" placeholder="Enter salesperson name" />
                    </UFormGroup>
                    <UFormGroup label="Email" required>
                        <UInput v-model="salespersonForm.email" type="email" placeholder="Enter salesperson email" />
                    </UFormGroup>
                    <UFormGroup label="Phone">
                        <UInput v-model="salespersonForm.phone" type="tel" placeholder="Enter salesperson phone" />
                    </UFormGroup>
                    <UFormGroup label="Role">
                        <USelectMenu
                            v-model="salespersonForm.role"
                            :options="userRoleOptions"
                            value-attribute="value"
                            option-attribute="label"
                            placeholder="Select role"
                        />
                    </UFormGroup>
                </div>

                <template #footer>
                    <div class="flex justify-end gap-2">
                        <UButton color="gray" variant="ghost" @click="isSalespersonAddModelOpen = false">Cancel</UButton>
                        <UButton color="primary" :loading="isSaving" @click="saveSalesperson">Save</UButton>
                    </div>
                </template>
            </UCard>
        </UModal>

        <ProjectsNewProjectModal
            v-model="isProjectAddModelOpen"
            mode="slideover"
            :initial-name="projectSearch"
            @saved="handleProjectSaved"
        />
    </component>
</template>
