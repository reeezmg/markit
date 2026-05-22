<script setup lang="ts">
import { BillingAddClient } from '#components'
import { hash } from '~/composables/hash'
import { format, addDays } from 'date-fns'
import {
    useCreateBill,
    useUpdateBill,
    useUpdateCompany,
    useFindManyCompanyClient,
    useFindManyCompanyUser,
    useFindManySalesOrder,
    useCreateUser,
    useUpdateUser,
    useFindUniqueUser,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingInvoice?: any; mode?: 'slideover' | 'page' }>()
const emit = defineEmits(['saved', 'cancel'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId
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

const CreateBill = useCreateBill({ optimisticUpdate: true })
const UpdateBill = useUpdateBill({ optimisticUpdate: true })
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })
const CreateUser = useCreateUser({ optimisticUpdate: true })
const UpdateUser = useUpdateUser({ optimisticUpdate: true })

const isSaving = ref(false)
const isClientAddModelOpen = ref(false)
const isSalespersonAddModelOpen = ref(false)
const newClientSeed = ref('')
const manualClientOption = ref<{ label: string; value: string } | null>(null)
const manualSalespersonOption = ref<{ label: string; value: string } | null>(null)
const categories = ref<any[]>([])
const itemSearchStates = reactive<Record<number, {
    query: string
    open: boolean
    loading: boolean
    options: any[]
}>>({})
const itemSearchContainers = ref<HTMLElement[]>([])

const createBlankItem = () => ({
    name: '',
    description: '',
    qty: 1,
    rate: 0,
    value: 0,
    variantId: '',
    category: [] as any[],
    categoryId: '',
    unit: null as string | null,
})

const form = reactive({
    clientId: '' as string,
    invoiceCode: '',
    salesOrderId: '' as string,
    invoiceDate: format(new Date(), 'yyyy-MM-dd'),
    paymentTerms: 'Due on Receipt',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    salesperson: '',
    subject: '',
    items: [createBlankItem()] as any[],
    discount: 0,
    discountType: 'amount' as 'amount' | 'percent',
    adjustment: 0,
    notes: 'Thanks for your business.',
    termsAndConditions: '',
})

const salespersonForm = reactive({
    name: '',
    email: '',
    phone: '',
    role: 'user',
})

const paymentTermsOptions = [
    { label: 'Due on Receipt', value: 'Due on Receipt' },
    { label: 'Net 15', value: 'Net 15' },
    { label: 'Net 30', value: 'Net 30' },
    { label: 'Net 45', value: 'Net 45' },
    { label: 'Net 60', value: 'Net 60' },
    { label: 'Due end of the month', value: 'Due end of the month' },
    { label: 'Due end of next month', value: 'Due end of next month' },
]

const userRoleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Biller', value: 'biller' },
    { label: 'Accountant', value: 'accountant' },
    { label: 'User', value: 'user' },
]

watch(() => form.paymentTerms, (terms) => {
    const invoiceDate = new Date(form.invoiceDate)
    switch (terms) {
        case 'Due on Receipt':
            form.dueDate = format(invoiceDate, 'yyyy-MM-dd')
            break
        case 'Net 15':
            form.dueDate = format(addDays(invoiceDate, 15), 'yyyy-MM-dd')
            break
        case 'Net 30':
            form.dueDate = format(addDays(invoiceDate, 30), 'yyyy-MM-dd')
            break
        case 'Net 45':
            form.dueDate = format(addDays(invoiceDate, 45), 'yyyy-MM-dd')
            break
        case 'Net 60':
            form.dueDate = format(addDays(invoiceDate, 60), 'yyyy-MM-dd')
            break
    }
})

const fetchCategories = async () => {
    if (!companyId) return

    try {
        categories.value = await $fetch('/api/bill/findManyCategory', {
            query: { companyId },
        })
    } catch {
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
    } catch {
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
    item.value = item.qty * item.rate
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
    updateItemValue(index)
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
    updateItemValue(index)
}

const handleInvoiceItemCategoryChange = (index: number) => {
    const item = form.items[index]
    if (!item) return

    if (item.category?.length > 1) {
        item.category = [item.category[item.category.length - 1]]
    }

    item.categoryId = item.category?.[0]?.id || ''
}

const fetchInvoiceNumber = async () => {
    try {
        const res = await $fetch<{ invoiceCode: string }>('/api/invoices/next-number')
        form.invoiceCode = res.invoiceCode
    } catch {
        form.invoiceCode = 'INV-000001'
    }
}

const resetSalespersonForm = () => {
    salespersonForm.name = ''
    salespersonForm.email = ''
    salespersonForm.phone = ''
    salespersonForm.role = 'user'
}

const initializeForm = async () => {
    if (props.editingInvoice) {
        form.clientId = props.editingInvoice.clientId || ''
        form.invoiceCode = props.editingInvoice.invoiceCode || ''
        form.salesOrderId = props.editingInvoice.salesOrderId || ''
        form.invoiceDate = format(new Date(props.editingInvoice.createdAt), 'yyyy-MM-dd')
        form.paymentTerms = props.editingInvoice.invoicePaymentTerms || 'Due on Receipt'
        form.dueDate = props.editingInvoice.dueDate ? format(new Date(props.editingInvoice.dueDate), 'yyyy-MM-dd') : ''
        form.salesperson = props.editingInvoice.salesperson || ''
        form.subject = props.editingInvoice.subject || ''
        form.discount = props.editingInvoice.discount || 0
        form.discountType = props.editingInvoice.discountType || 'amount'
        form.adjustment = props.editingInvoice.adjustment || 0
        form.notes = props.editingInvoice.notes || ''
        form.termsAndConditions = props.editingInvoice.termsAndConditions || ''
        form.items = (props.editingInvoice.entries || []).map((entry: any) => ({
            name: entry.name || '',
            description: '',
            qty: entry.qty || 1,
            rate: entry.rate || 0,
            value: entry.value || 0,
            variantId: entry.variantId || '',
            category: [],
            categoryId: '',
            unit: entry.unit || null,
        }))
        if (!form.items.length) {
            form.items = [createBlankItem()]
        }
        return
    }

    resetForm()
    await fetchInvoiceNumber()
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

const { data: salesOrdersList } = useFindManySalesOrder(computed(() => ({
    where: { companyId, deleted: false },
    take: 50,
})))

const salesOrderOptions = computed(() =>
    (salesOrdersList.value || []).map((so: any) => ({
        label: so.orderNumber,
        value: so.id,
    }))
)

const addItem = () => {
    form.items.push(createBlankItem())
}

const removeItem = (index: number) => {
    if (form.items.length > 1) {
        form.items.splice(index, 1)
    }
}

const updateItemValue = (index: number) => {
    const item = form.items[index]
    item.value = item.qty * item.rate
}

const subTotal = computed(() =>
    form.items.reduce((sum, item) => sum + (item.qty * item.rate), 0)
)

const discountAmount = computed(() => {
    if (form.discountType === 'percent') {
        return (subTotal.value * form.discount) / 100
    }
    return form.discount || 0
})

const grandTotal = computed(() =>
    subTotal.value - discountAmount.value + (form.adjustment || 0)
)

const saveInvoice = async (status: 'PENDING' | 'APPROVED') => {
    if (!form.invoiceCode) {
        toast.add({ title: 'Invoice number is required', color: 'red' })
        return
    }

    isSaving.value = true
    try {
        const billData: any = {
            invoiceCode: form.invoiceCode,
            createdAt: new Date(form.invoiceDate),
            dueDate: form.dueDate ? new Date(form.dueDate) : null,
            invoicePaymentTerms: form.paymentTerms || null,
            salesperson: form.salesperson || null,
            subject: form.subject || null,
            paymentStatus: status,
            notes: form.notes || null,
            termsAndConditions: form.termsAndConditions || null,
            subtotal: subTotal.value,
            discount: discountAmount.value,
            discountType: form.discountType,
            adjustment: form.adjustment || 0,
            grandTotal: grandTotal.value,
            balanceDue: grandTotal.value,
            tax: 0,
            company: { connect: { id: companyId } },
            ...(form.clientId ? { client: { connect: { id: form.clientId } } } : {}),
            ...(form.salesOrderId ? { salesOrder: { connect: { id: form.salesOrderId } } } : {}),
        }

        if (props.editingInvoice?.id) {
            await UpdateBill.mutateAsync({
                where: { id: props.editingInvoice.id },
                data: {
                    ...billData,
                    company: undefined,
                    client: form.clientId ? { connect: { id: form.clientId } } : { disconnect: true },
                    salesOrder: form.salesOrderId ? { connect: { id: form.salesOrderId } } : { disconnect: true },
                    entries: {
                        deleteMany: {},
                        create: form.items.filter(item => item.name).map((item) => ({
                            name: item.name || null,
                            qty: item.qty,
                            rate: item.rate,
                            value: item.qty * item.rate,
                            company: { connect: { id: companyId } },
                            ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
                        })),
                    },
                },
            })
        } else {
            await CreateBill.mutateAsync({
                data: {
                    ...billData,
                    entries: {
                        create: form.items.filter(item => item.name).map((item) => ({
                            name: item.name || null,
                            qty: item.qty,
                            rate: item.rate,
                            value: item.qty * item.rate,
                            company: { connect: { id: companyId } },
                            ...(item.variantId ? { variant: { connect: { id: item.variantId } } } : {}),
                        })),
                    },
                },
            })

            await UpdateCompany.mutateAsync({
                where: { id: companyId },
                data: { invoiceCounter: { increment: 1 } },
            })
        }

        toast.add({ title: props.editingInvoice ? 'Invoice updated' : 'Invoice created', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        if (!isPageMode.value) {
            open.value = false
        }
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save invoice', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

const resetForm = () => {
    form.clientId = ''
    form.invoiceCode = ''
    form.salesOrderId = ''
    form.invoiceDate = format(new Date(), 'yyyy-MM-dd')
    form.paymentTerms = 'Due on Receipt'
    form.dueDate = format(new Date(), 'yyyy-MM-dd')
    form.salesperson = ''
    form.subject = ''
    form.items = [createBlankItem()]
    form.discount = 0
    form.discountType = 'amount'
    form.adjustment = 0
    form.notes = 'Thanks for your business.'
    form.termsAndConditions = ''
    clientSearch.value = ''
    salespersonSearch.value = ''
    manualClientOption.value = null
    manualSalespersonOption.value = null
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

onMounted(() => {
    fetchCategories()
    document.addEventListener('pointerdown', handleOutsideItemSearchClick)

    if (isPageMode.value) {
        initializeForm()
    }
})

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleOutsideItemSearchClick)
})

watch(() => open.value, async (isOpen) => {
    if (isOpen && !isPageMode.value) {
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
                    {{ editingInvoice ? 'Edit Invoice' : 'New Invoice' }}
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
                    <UFormGroup label="Invoice#" required>
                        <UInput v-model="form.invoiceCode" disabled />
                    </UFormGroup>
                    <UFormGroup label="Order Number">
                        <USelectMenu
                            v-model="form.salesOrderId"
                            :options="salesOrderOptions"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select sales order"
                        />
                    </UFormGroup>
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <UFormGroup label="Invoice Date" required>
                        <UInput v-model="form.invoiceDate" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Terms">
                        <USelectMenu
                            v-model="form.paymentTerms"
                            :options="paymentTermsOptions"
                            value-attribute="value"
                            option-attribute="label"
                            placeholder="Select terms"
                        />
                    </UFormGroup>
                    <UFormGroup label="Due Date">
                        <UInput v-model="form.dueDate" type="date" />
                    </UFormGroup>
                </div>

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

                <UFormGroup label="Subject">
                    <UTextarea
                        v-model="form.subject"
                        placeholder="Let your customer know what this Invoice is for"
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
                                                    <template v-if="option.variant?.sprice"> · Rs {{ option.variant.sprice }}</template>
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
                                            @update:model-value="handleInvoiceItemCategoryChange(index)"
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
                                            v-model.number="item.qty"
                                            type="number"
                                            :min="0"
                                            size="sm"
                                            class="text-center"
                                            @input="updateItemValue(index)"
                                        />
                                    </td>
                                    <td class="px-3 py-2">
                                        <UInput
                                            v-model.number="item.rate"
                                            type="number"
                                            :min="0"
                                            size="sm"
                                            class="text-center"
                                            @input="updateItemValue(index)"
                                        />
                                    </td>
                                    <td class="px-3 py-2 text-right font-medium">
                                        {{ (item.qty * item.rate).toFixed(2) }}
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
                                        Rs
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
                            <span>Total (Rs)</span>
                            <span>{{ grandTotal.toFixed(2) }}</span>
                        </div>
                    </div>
                </div>

                <UFormGroup label="Customer Notes">
                    <UTextarea
                        v-model="form.notes"
                        placeholder="Thanks for your business."
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
                    @click="saveInvoice('PENDING')"
                />
                <UButton
                    color="primary"
                    variant="solid"
                    label="Save and Send"
                    :loading="isSaving"
                    @click="saveInvoice('APPROVED')"
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
    </component>
</template>
