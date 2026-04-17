<script setup lang="ts">
import { format } from 'date-fns'
import {
    useCreatePayment,
    useUpdatePayment,
    useUpdateCompany,
    useUpdateBill,
    useFindManyCompanyClient,
    useFindManyBill,
} from '~/lib/hooks'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps<{ editingPayment?: any }>()
const emit = defineEmits(['saved'])

const useAuth = () => useNuxtApp().$auth
const toast = useToast()
const companyId = useAuth().session.value?.companyId

const CreatePayment = useCreatePayment({ optimisticUpdate: true })
const UpdatePayment = useUpdatePayment({ optimisticUpdate: true })
const UpdateCompany = useUpdateCompany({ optimisticUpdate: true })
const UpdateBill = useUpdateBill({ optimisticUpdate: true })

const isSaving = ref(false)

// ─── Form state ───
const form = reactive({
    clientId: '' as string,
    amount: 0,
    bankCharges: 0,
    paymentDate: format(new Date(), 'yyyy-MM-dd'),
    paymentNumber: 0,
    paymentMode: 'Cash',
    depositTo: 'Petty Cash',
    referenceNumber: '',
    taxDeducted: 'none',
    billId: '' as string,
    notes: '',
})

const paymentModeOptions = [
    { label: 'Cash', value: 'Cash' },
    { label: 'Bank Transfer', value: 'Bank Transfer' },
    { label: 'Cheque', value: 'Cheque' },
    { label: 'UPI', value: 'UPI' },
    { label: 'Credit Card', value: 'Credit Card' },
]

const depositToOptions = [
    { label: 'Petty Cash', value: 'Petty Cash' },
    { label: 'Undeposited Funds', value: 'Undeposited Funds' },
    { label: 'Bank Account', value: 'Bank Account' },
]

const taxDeductedOptions = [
    { label: 'No Tax deducted', value: 'none' },
    { label: 'Yes, TDS (Income Tax)', value: 'tds' },
]

// ─── Fetch payment number ───
const fetchPaymentNumber = async () => {
    try {
        const res = await $fetch<{ paymentNumber: number }>('/api/payments/next-number')
        form.paymentNumber = res.paymentNumber
    } catch (error) {
        form.paymentNumber = 1
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

// ─── Unpaid invoices for selected client ───
const { data: unpaidInvoices } = useFindManyBill(computed(() => ({
    where: {
        companyId,
        deleted: false,
        invoiceCode: { not: null },
        ...(form.clientId ? { clientId: form.clientId } : {}),
        paymentStatus: { in: ['PENDING', 'APPROVED'] },
    },
    take: 50,
})))

const invoiceOptions = computed(() =>
    (unpaidInvoices.value || []).map((inv: any) => ({
        label: `${inv.invoiceCode} - ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(inv.grandTotal || 0)}`,
        value: inv.id,
        invoiceCode: inv.invoiceCode,
        grandTotal: inv.grandTotal,
        balanceDue: inv.balanceDue,
    }))
)

// ─── Save ───
const savePayment = async (status: string) => {
    if (!form.clientId) {
        toast.add({ title: 'Customer name is required', color: 'red' })
        return
    }
    if (!form.amount || form.amount <= 0) {
        toast.add({ title: 'Amount must be greater than 0', color: 'red' })
        return
    }

    isSaving.value = true
    try {
        const paymentData: any = {
            paymentDate: new Date(form.paymentDate),
            paymentMode: form.paymentMode,
            paymentNumber: form.paymentNumber,
            referenceNumber: form.referenceNumber || null,
            amount: form.amount,
            bankCharges: form.bankCharges || 0,
            depositTo: form.depositTo || null,
            taxDeducted: form.taxDeducted,
            notes: form.notes || null,
            unusedAmount: 0,
            currency: 'INR',
            status,
            company: { connect: { id: companyId } },
            client: { connect: { id: form.clientId } },
            ...(form.billId ? { bill: { connect: { id: form.billId } } } : {}),
        }

        if (props.editingPayment?.id) {
            await UpdatePayment.mutateAsync({
                where: { id: props.editingPayment.id },
                data: {
                    ...paymentData,
                    company: undefined,
                    client: form.clientId ? { connect: { id: form.clientId } } : undefined,
                    bill: form.billId ? { connect: { id: form.billId } } : { disconnect: true },
                },
            })
        } else {
            await CreatePayment.mutateAsync({
                data: paymentData,
            })

            // Increment payment counter
            await UpdateCompany.mutateAsync({
                where: { id: companyId },
                data: { paymentCounter: { increment: 1 } },
            })
        }

        // Update invoice balance if linked
        if (form.billId && status === 'Completed') {
            const invoice = unpaidInvoices.value?.find((inv: any) => inv.id === form.billId)
            if (invoice) {
                const newBalance = Math.max(0, (invoice.balanceDue || invoice.grandTotal || 0) - form.amount)
                await UpdateBill.mutateAsync({
                    where: { id: form.billId },
                    data: {
                        balanceDue: newBalance,
                        paymentStatus: newBalance <= 0 ? 'PAID' : 'APPROVED',
                    },
                })
            }
        }

        toast.add({ title: props.editingPayment ? 'Payment updated' : 'Payment recorded', icon: 'i-heroicons-check-circle', color: 'green' })
        emit('saved')
        open.value = false
        resetForm()
    } catch (error: any) {
        console.error(error)
        toast.add({ title: 'Failed to save payment', description: error.message, color: 'red' })
    } finally {
        isSaving.value = false
    }
}

// ─── Reset ───
const resetForm = () => {
    form.clientId = ''
    form.amount = 0
    form.bankCharges = 0
    form.paymentDate = format(new Date(), 'yyyy-MM-dd')
    form.paymentNumber = 0
    form.paymentMode = 'Cash'
    form.depositTo = 'Petty Cash'
    form.referenceNumber = ''
    form.taxDeducted = 'none'
    form.billId = ''
    form.notes = ''
}

// ─── Populate on edit ───
watch(() => open.value, async (isOpen) => {
    if (isOpen) {
        if (props.editingPayment) {
            form.clientId = props.editingPayment.clientId || ''
            form.amount = props.editingPayment.amount || 0
            form.bankCharges = props.editingPayment.bankCharges || 0
            form.paymentDate = format(new Date(props.editingPayment.paymentDate), 'yyyy-MM-dd')
            form.paymentNumber = props.editingPayment.paymentNumber || 0
            form.paymentMode = props.editingPayment.paymentMode || 'Cash'
            form.depositTo = props.editingPayment.depositTo || 'Petty Cash'
            form.referenceNumber = props.editingPayment.referenceNumber || ''
            form.taxDeducted = props.editingPayment.taxDeducted || 'none'
            form.billId = props.editingPayment.billId || ''
            form.notes = props.editingPayment.notes || ''
        } else {
            resetForm()
            await fetchPaymentNumber()
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
                    {{ editingPayment ? 'Edit Payment' : 'Record Payment' }}
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
                        placeholder="Select a customer"
                        @update:query="(q: string) => clientSearch = q"
                    >
                        <template #empty>
                            <span class="text-sm text-gray-500">No customers found</span>
                        </template>
                    </USelectMenu>
                </UFormGroup>

                <!-- Amount Received -->
                <UFormGroup label="Amount Received" required>
                    <div class="flex">
                        <span class="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">INR</span>
                        <UInput v-model.number="form.amount" type="number" :min="0" class="rounded-l-none" placeholder="0.00" />
                    </div>
                </UFormGroup>

                <!-- Bank Charges -->
                <UFormGroup label="Bank Charges (if any)">
                    <UInput v-model.number="form.bankCharges" type="number" :min="0" placeholder="0.00" />
                </UFormGroup>

                <!-- Row: Payment Date + Payment# -->
                <div class="grid grid-cols-2 gap-4">
                    <UFormGroup label="Payment Date" required>
                        <UInput v-model="form.paymentDate" type="date" />
                    </UFormGroup>
                    <UFormGroup label="Payment #" required>
                        <UInput v-model.number="form.paymentNumber" type="number" disabled />
                    </UFormGroup>
                </div>

                <!-- Payment Mode -->
                <UFormGroup label="Payment Mode">
                    <USelectMenu
                        v-model="form.paymentMode"
                        :options="paymentModeOptions"
                        value-attribute="value"
                        option-attribute="label"
                    />
                </UFormGroup>

                <!-- Deposit To -->
                <UFormGroup label="Deposit To" required>
                    <USelectMenu
                        v-model="form.depositTo"
                        :options="depositToOptions"
                        value-attribute="value"
                        option-attribute="label"
                    />
                </UFormGroup>

                <!-- Reference# -->
                <UFormGroup label="Reference#">
                    <UInput v-model="form.referenceNumber" placeholder="" />
                </UFormGroup>

                <!-- Tax Deducted -->
                <UFormGroup label="Tax deducted?">
                    <div class="flex items-center gap-4">
                        <label v-for="opt in taxDeductedOptions" :key="opt.value" class="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                                type="radio"
                                :value="opt.value"
                                v-model="form.taxDeducted"
                                class="text-primary-600 focus:ring-primary-500"
                            />
                            {{ opt.label }}
                        </label>
                    </div>
                </UFormGroup>

                <!-- Unpaid Invoices -->
                <div v-if="form.clientId" class="border-t pt-4">
                    <h3 class="text-sm font-semibold mb-3">Unpaid Invoices</h3>
                    <div v-if="!unpaidInvoices?.length" class="text-sm text-primary-500 py-2">
                        There are no unpaid invoices associated with this customer.
                    </div>
                    <div v-else class="border rounded-md overflow-hidden">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500 w-[10%]"></th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500">DATE</th>
                                    <th class="px-3 py-2 text-left font-medium text-xs text-gray-500">INVOICE NUMBER</th>
                                    <th class="px-3 py-2 text-right font-medium text-xs text-gray-500">INVOICE AMOUNT</th>
                                    <th class="px-3 py-2 text-right font-medium text-xs text-gray-500">AMOUNT DUE</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                <tr
                                    v-for="inv in unpaidInvoices"
                                    :key="inv.id"
                                    class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                    :class="form.billId === inv.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
                                    @click="form.billId = form.billId === inv.id ? '' : inv.id"
                                >
                                    <td class="px-3 py-2 text-center">
                                        <input type="radio" :checked="form.billId === inv.id" class="text-primary-600" />
                                    </td>
                                    <td class="px-3 py-2">{{ format(new Date(inv.createdAt), 'dd/MM/yyyy') }}</td>
                                    <td class="px-3 py-2 text-primary-600">{{ inv.invoiceCode }}</td>
                                    <td class="px-3 py-2 text-right">{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(inv.grandTotal || 0) }}</td>
                                    <td class="px-3 py-2 text-right">{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(inv.balanceDue || inv.grandTotal || 0) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Summary -->
                <div class="border-t pt-4">
                    <div class="flex justify-end">
                        <div class="w-72 space-y-2 text-sm">
                            <div class="flex justify-between">
                                <span class="font-medium">Amount Received :</span>
                                <span>{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(form.amount || 0) }}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Amount used for Payments :</span>
                                <span>{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(form.billId ? form.amount : 0) }}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="font-medium">Amount Refunded :</span>
                                <span>{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(0) }}</span>
                            </div>
                            <div class="flex justify-between text-orange-500">
                                <span class="font-medium">Amount in Excess :</span>
                                <span>{{ new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(form.billId ? 0 : form.amount) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Notes -->
                <UFormGroup label="Notes (Internal use. Not visible to customer)">
                    <UTextarea
                        v-model="form.notes"
                        placeholder=""
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
                    @click="savePayment('Pending')"
                />
                <UButton
                    color="primary"
                    variant="solid"
                    label="Save as Paid"
                    :loading="isSaving"
                    @click="savePayment('Completed')"
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
