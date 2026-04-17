<script setup lang="ts">
import { format, addDays } from 'date-fns'
import {
    useCreateBill,
    useUpdateBill,
    useUpdateCompany,
    useFindManyCompanyClient,
    useFindManyCompanyUser,
    useFindManySalesOrder,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingInvoice?: any }>()
const emit = defineEmits(['saved'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

const CreateBill = useCreateBill({ optimisticUpdate: true })
const UpdateBill = useUpdateBill({ optimisticUpdate: true })
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })

const isSaving = ref(false)

// ─── Form state ───
const form = reactive({
    clientId: '' as string,
    invoiceCode: '',
    salesOrderId: '' as string,
    invoiceDate: format(new Date(), 'yyyy-MM-dd'),
    paymentTerms: 'Due on Receipt',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    salesperson: '',
    subject: '',
    items: [{ name: '', description: '', qty: 1, rate: 0, value: 0 }] as any[],
    discount: 0,
    discountType: 'amount' as 'amount' | 'percent',
    adjustment: 0,
    notes: 'Thanks for your business.',
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

// Auto-calculate due date based on payment terms
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

// ─── Fetch invoice number ───
const fetchInvoiceNumber = async () => {
    try {
        const res = await $fetch<{ invoiceCode: string }>('/api/invoices/next-number')
        form.invoiceCode = res.invoiceCode
    } catch (error) {
        form.invoiceCode = 'INV-000001'
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

// ─── Sales Order search ───
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

// ─── Items ───
const addItem = () => {
    form.items.push({ name: '', description: '', qty: 1, rate: 0, value: 0 })
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

// ─── Computed totals ───
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

// ─── Save ───
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
                            companyId,
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
                            companyId,
                        })),
                    },
                },
            })

            // Increment invoice counter
            await UpdateCompany.mutateAsync({
                where: { id: companyId },
                data: { invoiceCounter: { increment: 1 } },
            })
        }

        toast.add({ title: props.editingInvoice ? 'Invoice updated' : 'Invoice created', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        open.value = false
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save invoice', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

// ─── Reset ───
const resetForm = () => {
    form.clientId = ''
    form.invoiceCode = ''
    form.salesOrderId = ''
    form.invoiceDate = format(new Date(), 'yyyy-MM-dd')
    form.paymentTerms = 'Due on Receipt'
    form.dueDate = format(new Date(), 'yyyy-MM-dd')
    form.salesperson = ''
    form.subject = ''
    form.items = [{ name: '', description: '', qty: 1, rate: 0, value: 0 }]
    form.discount = 0
    form.discountType = 'amount'
    form.adjustment = 0
    form.notes = 'Thanks for your business.'
    form.termsAndConditions = ''
}

// ─── Populate on edit ───
watch(() => open.value, async (isOpen) => {
    if (isOpen) {
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
            }))
            if (!form.items.length) {
                form.items = [{ name: '', description: '', qty: 1, rate: 0, value: 0 }]
            }
        } else {
            resetForm()
            await fetchInvoiceNumber()
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
                    {{ editingInvoice ? 'Edit Invoice' : 'New Invoice' }}
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

                <!-- Row: Invoice# + Order Number -->
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

                <!-- Row: Invoice Date + Terms + Due Date -->
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

                <!-- Salesperson -->
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

                <!-- Subject -->
                <UFormGroup label="Subject">
                    <UTextarea
                        v-model="form.subject"
                        placeholder="Let your customer know what this Invoice is for"
                        :rows="2"
                    />
                </UFormGroup>

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
                            <span>{{ grandTotal.toFixed(2) }}</span>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <UFormGroup label="Customer Notes">
                    <UTextarea
                        v-model="form.notes"
                        placeholder="Thanks for your business."
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
                    @click="open = false"
                />
            </div>
        </div>
    </USlideover>
</template>
