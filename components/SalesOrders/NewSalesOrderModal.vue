<script setup lang="ts">
import { format } from 'date-fns'
import {
    useCreateSalesOrder,
    useUpdateSalesOrder,
    useUpdateCompany,
    useFindManyCompanyClient,
    useFindManyCompanyUser,
    useFindManyProject,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingOrder?: any }>()
const emit = defineEmits(['saved'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

const CreateSalesOrder = useCreateSalesOrder({ optimisticUpdate: true })
const UpdateSalesOrder = useUpdateSalesOrder({ optimisticUpdate: true })
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })

const isSaving = ref(false)

// ─── Form state ───
const form = reactive({
    clientId: '' as string,
    orderNumber: '',
    referenceNumber: '',
    orderDate: format(new Date(), 'yyyy-MM-dd'),
    expectedShipmentDate: '',
    paymentTerms: '',
    deliveryMethod: '',
    salesperson: '',
    projectId: '' as string,
    items: [{ serialNo: 1, name: '', description: '', quantity: 1, rate: 0, amount: 0, variantId: '' }] as any[],
    discount: 0,
    discountType: 'amount' as 'amount' | 'percent',
    adjustment: 0,
    notes: '',
    termsAndConditions: '',
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

// ─── Fetch order number ───
const fetchOrderNumber = async () => {
    try {
        const res = await $fetch<{ orderNumber: string }>('/api/sales-orders/next-number')
        form.orderNumber = res.orderNumber
    } catch (error) {
        form.orderNumber = 'SO-00001'
    }
}

// ─── Client search ───
const clientSearch = ref('')
const { data: clients } = useFindManyCompanyClient(computed(() => ({
    where: { companyId, client: { deleted: false, ...(clientSearch.value ? { name: { contains: clientSearch.value, mode: 'insensitive' } } : {}) } },
    include: { client: true },
    take: 20,
})))

const clientOptions = computed(() =>
    (clients.value || []).map((cc: any) => ({
        label: cc.client?.name || cc.name || '-',
        value: cc.client?.id || cc.clientId,
    }))
)

// ─── Salesperson search ───
const { data: companyUsers } = useFindManyCompanyUser(computed(() => ({
    where: { companyId, deleted: false },
    take: 50,
})))

const salespersonOptions = computed(() =>
    (companyUsers.value || []).map((u: any) => ({
        label: u.name || u.user?.email || '-',
        value: u.name || u.user?.email || '-',
    }))
)

// ─── Project search ───
const { data: projectsList } = useFindManyProject(computed(() => ({
    where: { companyId, deleted: false },
    take: 50,
})))

const projectOptions = computed(() =>
    (projectsList.value || []).map((p: any) => ({
        label: p.name,
        value: p.id,
    }))
)

// ─── Items ───
const addItem = () => {
    form.items.push({
        serialNo: form.items.length + 1,
        name: '',
        description: '',
        quantity: 1,
        rate: 0,
        amount: 0,
        variantId: '',
    })
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

// ─── Computed totals ───
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

// ─── Save ───
const saveOrder = async (status: 'DRAFT' | 'CONFIRMED') => {
    if (!form.orderNumber) {
        toast.add({ title: 'Sales order number is required', color: 'red' })
        return
    }

    isSaving.value = true
    try {
        const orderData: any = {
            orderNumber: form.orderNumber,
            referenceNumber: form.referenceNumber || null,
            orderDate: new Date(form.orderDate),
            expectedShipmentDate: form.expectedShipmentDate ? new Date(form.expectedShipmentDate) : null,
            paymentTerms: form.paymentTerms || null,
            deliveryMethod: form.deliveryMethod || null,
            salesperson: form.salesperson || null,
            status,
            notes: form.notes || null,
            termsAndConditions: form.termsAndConditions || null,
            discount: discountAmount.value,
            discountType: form.discountType,
            adjustment: form.adjustment || 0,
            subTotal: subTotal.value,
            total: total.value,
            attachments: [],
            company: { connect: { id: companyId } },
            ...(form.clientId ? { client: { connect: { id: form.clientId } } } : {}),
            ...(form.projectId ? { project: { connect: { id: form.projectId } } } : {}),
        }

        if (props.editingOrder?.id) {
            await UpdateSalesOrder.mutateAsync({
                where: { id: props.editingOrder.id },
                data: {
                    ...orderData,
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
            await CreateSalesOrder.mutateAsync({
                data: {
                    ...orderData,
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

            // Increment sales order counter
            await UpdateCompany.mutateAsync({
                where: { id: companyId },
                data: { salesOrderCounter: { increment: 1 } },
            })
        }

        toast.add({ title: props.editingOrder ? 'Sales order updated' : 'Sales order created', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        open.value = false
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save sales order', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

// ─── Reset ───
const resetForm = () => {
    form.clientId = ''
    form.orderNumber = ''
    form.referenceNumber = ''
    form.orderDate = format(new Date(), 'yyyy-MM-dd')
    form.expectedShipmentDate = ''
    form.paymentTerms = ''
    form.deliveryMethod = ''
    form.salesperson = ''
    form.projectId = ''
    form.items = [{ serialNo: 1, name: '', description: '', quantity: 1, rate: 0, amount: 0, variantId: '' }]
    form.discount = 0
    form.discountType = 'amount'
    form.adjustment = 0
    form.notes = ''
    form.termsAndConditions = ''
}

// ─── Populate on edit ───
watch(() => open.value, async (isOpen) => {
    if (isOpen) {
        if (props.editingOrder) {
            form.clientId = props.editingOrder.clientId || ''
            form.orderNumber = props.editingOrder.orderNumber
            form.referenceNumber = props.editingOrder.referenceNumber || ''
            form.orderDate = format(new Date(props.editingOrder.orderDate), 'yyyy-MM-dd')
            form.expectedShipmentDate = props.editingOrder.expectedShipmentDate ? format(new Date(props.editingOrder.expectedShipmentDate), 'yyyy-MM-dd') : ''
            form.paymentTerms = props.editingOrder.paymentTerms || ''
            form.deliveryMethod = props.editingOrder.deliveryMethod || ''
            form.salesperson = props.editingOrder.salesperson || ''
            form.projectId = props.editingOrder.projectId || ''
            form.discount = props.editingOrder.discount || 0
            form.discountType = props.editingOrder.discountType || 'amount'
            form.adjustment = props.editingOrder.adjustment || 0
            form.notes = props.editingOrder.notes || ''
            form.termsAndConditions = props.editingOrder.termsAndConditions || ''
            form.items = (props.editingOrder.items || []).map((item: any, i: number) => ({
                serialNo: i + 1,
                name: item.name || '',
                description: item.description || '',
                quantity: item.quantity,
                rate: item.rate,
                amount: item.amount,
                variantId: item.variantId || '',
            }))
            if (!form.items.length) {
                form.items = [{ serialNo: 1, name: '', description: '', quantity: 1, rate: 0, amount: 0, variantId: '' }]
            }
        } else {
            resetForm()
            await fetchOrderNumber()
        }
    }
})
</script>

<template>
    <USlideover v-model="open" :ui="{ width: 'max-w-2xl' }">
        <div class="flex flex-col h-full">
            <!-- Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-semibold">
                    {{ editingOrder ? 'Edit Sales Order' : 'New Sales Order' }}
                </h2>
                <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="open = false" />
            </div>

            <!-- Scrollable form content -->
            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                <!-- Customer -->
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
                        <template #empty>
                            <span class="text-sm text-gray-500">No customers found</span>
                        </template>
                    </USelectMenu>
                </UFormGroup>

                <!-- Row: Order# + Reference# -->
                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Sales Order#" required>
                        <UInput v-model="form.orderNumber" disabled />
                    </UFormGroup>
                    <UFormGroup label="Reference#">
                        <UInput v-model="form.referenceNumber" placeholder="" />
                    </UFormGroup>
                </div>

                <!-- Row: Dates -->
                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Sales Order Date" required>
                        <UInput v-model="form.orderDate" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Expected Shipment Date">
                        <UInput v-model="form.expectedShipmentDate" type="date" />
                    </UFormGroup>
                </div>

                <!-- Row: Payment Terms + Delivery Method -->
                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Payment Terms">
                        <USelectMenu
                            v-model="form.paymentTerms"
                            :options="paymentTermsOptions"
                            value-attribute="value"
                            option-attribute="label"
                            placeholder="Select payment terms"
                        />
                    </UFormGroup>
                    <UFormGroup label="Delivery Method">
                        <USelectMenu
                            v-model="form.deliveryMethod"
                            :options="[]"
                            placeholder="Select a delivery method"
                            creatable
                        />
                    </UFormGroup>
                </div>

                <!-- Row: Salesperson + Project -->
                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Salesperson">
                        <USelectMenu
                            v-model="form.salesperson"
                            :options="salespersonOptions"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select or Add Salesperson"
                            creatable
                        />
                    </UFormGroup>
                    <UFormGroup label="Project Name">
                        <USelectMenu
                            v-model="form.projectId"
                            :options="projectOptions"
                            value-attribute="value"
                            option-attribute="label"
                            searchable
                            placeholder="Select a project"
                        />
                    </UFormGroup>
                </div>

                <!-- Item Table -->
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="text-sm font-semibold">Item Table</h3>
                    </div>
                    <div class="border rounded-md overflow-hidden">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[40%]">ITEM DETAILS</th>
                                    <th class="px-3 py-2 text-center font-medium text-xs text-gray-500 w-[15%]">QUANTITY</th>
                                    <th class="px-3 py-2 text-center font-medium text-xs text-gray-500 w-[15%]">RATE</th>
                                    <th class="px-3 py-2 text-right font-medium text-xs text-gray-500 w-[20%]">AMOUNT</th>
                                    <th class="px-3 py-2 w-[10%]"></th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr v-for="(item, index) in form.items" :key="index">
                                    <td class="px-3 py-2">
                                        <UInput
                                            v-model="item.name"
                                            placeholder="Type or click to select an item."
                                            size="sm"
                                        />
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

                <!-- Summary -->
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

                <!-- Notes -->
                <UFormGroup label="Customer Notes">
                    <UTextarea
                        v-model="form.notes"
                        placeholder="Enter any notes for the customer"
                        :rows="2"
                    />
                </UFormGroup>

                <!-- Terms & Conditions -->
                <UFormGroup label="Terms & Conditions">
                    <UTextarea
                        v-model="form.termsAndConditions"
                        placeholder="Enter the terms and conditions of your business to be displayed in your transaction"
                        :rows="3"
                    />
                </UFormGroup>
            </div>

            <!-- Footer buttons -->
            <div class="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <UButton
                    color="gray"
                    variant="solid"
                    label="Save as Draft"
                    :loading="isSaving"
                    @click="saveOrder('DRAFT')"
                />
                <UButton
                    color="primary"
                    variant="solid"
                    label="Save and Send"
                    :loading="isSaving"
                    @click="saveOrder('CONFIRMED')"
                />
                <UButton
                    color="gray"
                    variant="ghost"
                    label="Cancel"
                    @click="open = false"
                />
            </div>
        </div>
    </USlideover>
</template>
