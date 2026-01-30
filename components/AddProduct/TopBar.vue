<script setup lang="ts">
import { useCreateDistributor, useFindManyDistributor } from '~/lib/hooks'

/* ------------------------------------
   PROPS
------------------------------------ */
const props = withDefaults(defineProps<{
  totalAmount: number
  distributorId?: string
  paymentType?: string
  billNo?: string
  discount?: number
  tax?: number
  adjustment?: number
  
}>(), {
  totalAmount: 0,
  distributorId: '',
  paymentType: '',
  billNo: '',
  discount: 0,
  tax: 0,
  adjustment: 0
})

/* ------------------------------------
   GLOBAL
------------------------------------ */
const toast = useToast()
const useAuth = () => useNuxtApp().$auth

const isPurchaseInfoOpen = ref(false)
const isDistributorOpen = ref(false)

/* ------------------------------------
   DISTRIBUTOR
------------------------------------ */
const CreateDistributor = useCreateDistributor()
const supplier = ref({
  name: '',
  street: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
  gstin: '',
  bankName: '',
  accountNo: '',
  upiId: '',
  ifsc: '',
  accHolderName: '',
})

/* ------------------------------------
   PURCHASE INFO
------------------------------------ */
const selected = ref<any>(null)
const paymentType = ref<string>('')
const billNo = ref<string>('')

watch(
  () => [props.paymentType, props.billNo],
  ([p, b]) => {
    if (typeof p === 'string') paymentType.value = p
    if (typeof b === 'string') billNo.value = b
  },
  { immediate: true }
)

/* ------------------------------------
   DELIVERY TYPE
------------------------------------ */
const DELIVERY_TYPE_KEY = 'lastDeliveryType'
const deliveryTypeOptions = ref<string[]>(useAuth().session.value?.deliveryType || [])
const deliveryType = ref<string>()

if (process.client) {
  deliveryType.value =
    localStorage.getItem(DELIVERY_TYPE_KEY) || deliveryTypeOptions.value[0]
}

watch(deliveryType, (val) => {
  if (val) localStorage.setItem(DELIVERY_TYPE_KEY, val)
})
 console.log('Prop discount changed:', props.discount);

/* ------------------------------------
   PRICING INPUTS
------------------------------------ */
const discount = ref<number>(0)     // +% or -flat
const taxPercent = ref<number>(0)   // %
const adjustment = ref<number>(0)   // + / -

/* ------------------------------------
   SYNC PROPS → LOCAL STATE (FIX)
------------------------------------ */
watch(
  () => [props.discount, props.tax, props.adjustment],
  ([d, t, a]) => {
    if (typeof d === 'number') discount.value = d
    if (typeof t === 'number') taxPercent.value = t
    if (typeof a === 'number') adjustment.value = a
  },
  { immediate: true }
)

/* ------------------------------------
   ORDER-SAFE CALCULATION (FIXED)
------------------------------------ */

// BASE (never changes)
const subtotal = computed(() => Number(props.totalAmount) || 0)

// DISCOUNT (always from subtotal)
const discountAmount = computed(() => {
  const base = subtotal.value
  const d = Number(discount.value) || 0

  if (d > 0) {
    return (base * d) / 100
  }

  // flat discount (cap at subtotal)
  return Math.min(Math.abs(d), base)
})

// AFTER DISCOUNT (LOCKED)
const discountedAmount = computed(() => {
  return subtotal.value - discountAmount.value
})

// TAX (always from discountedAmount, never from adjustment)
const taxAmount = computed(() => {
  const t = Number(taxPercent.value) || 0
  return (discountedAmount.value * t) / 100
})

// TOTAL BEFORE ADJUSTMENT (LOCKED)
const totalBeforeAdjustment = computed(() => {
  return discountedAmount.value + taxAmount.value
})

// FINAL TOTAL (adjustment applied last)
const finalTotal = computed(() => {
  const adj = Number(adjustment.value) || 0
  return totalBeforeAdjustment.value + adj
})

/* ------------------------------------
   EMIT UPDATES
------------------------------------ */
const emit = defineEmits(['update'])

watch(
  [
    selected,
    paymentType,
    billNo,
    deliveryType,
    discount,
    taxPercent,
    adjustment,
  ],
  () => {
    emit('update', {
      distributorId: selected.value?.id || null,
      paymentType: paymentType.value,
      billNo: billNo.value,
      deliveryType: deliveryType.value,
      discount: discount.value,
      taxPercent: taxPercent.value,
      adjustment: adjustment.value,
      subtotal: subtotal.value,
      discountAmount: discountAmount.value,
      taxAmount: taxAmount.value,
      total: finalTotal.value,
    })
  },
  { deep: true }
)

/* ------------------------------------
   FETCH DISTRIBUTORS
------------------------------------ */
const { data: distributors } = useFindManyDistributor({
  where: {
    companies: {
      some: { companyId: useAuth().session.value?.companyId },
    },
  },
})

watch(
  [distributors, () => props.distributorId],
  ([list, id]) => {
    if (!list || !id) return
    selected.value = list.find(d => d.id === id) || null
  },
  { immediate: true }
)

/* ------------------------------------
   CREATE DISTRIBUTOR
------------------------------------ */
const submitDistributor = async () => {
  await CreateDistributor.mutateAsync({
    data: {
      name: supplier.value.name,
      accHolderName: supplier.value.accHolderName,
      ifsc: supplier.value.ifsc,
      accountNo: supplier.value.accountNo,
      bankName: supplier.value.bankName,
      gstin: supplier.value.gstin,
      upiId: supplier.value.upiId,
      address: {
        create: {
          street: supplier.value.street,
          locality: supplier.value.locality,
          city: supplier.value.city,
          state: supplier.value.state,
          pincode: supplier.value.pincode,
        },
      },
      companies: {
        create: {
          company: {
            connect: { id: useAuth().session.value?.companyId },
          },
        },
      },
    },
  })

  toast.add({ title: 'Distributor added!' })
  isDistributorOpen.value = false
}
</script>


<template>
  <!-- HEADER -->
  <div class="flex flex-col sm:flex-row justify-between gap-4">
    <div class="flex items-center gap-3">
      <UButton
        label="Purchase Info"
        icon="i-heroicons-document-text"
        size="sm"
        color="primary"
        @click="isPurchaseInfoOpen = true"
      />
      <span class="font-semibold"> Total: ₹{{ finalTotal.toFixed(2) }}</span>
    </div>

    <div class="flex items-center gap-2">
      <span class="whitespace-nowrap">Delivery Type</span>
      <USelectMenu
        v-model="deliveryType"
        :options="deliveryTypeOptions"
        placeholder="Select Delivery Type"
      />
    </div>
  </div>

  <!-- PURCHASE INFO MODAL -->
  <UModal v-model="isPurchaseInfoOpen">
    <div class="p-4 space-y-4">
      <h2 class="text-lg font-semibold">Purchase Information</h2>

      <UFormGroup label="Distributor">
        <div class="flex gap-2">
          <USelectMenu
            class="flex-1"
            v-model="selected"
            :options="distributors"
            searchable
          >
            <template #label>
              <span v-if="!selected">Select Distributor</span>
              <span v-else>{{ selected.name }}</span>
            </template>
             <template #option="{ option }">
          <span>{{ option.name }}</span>
        </template>
          </USelectMenu>
          <UButton icon="i-heroicons-plus" @click="isDistributorOpen = true" />
        </div>
      </UFormGroup>

      <UFormGroup label="Bill Number">
        <UInput v-model="billNo" placeholder="Enter bill number" />
      </UFormGroup>

      <UFormGroup label="Payment Type">
        <USelect
          v-model="paymentType"
          :options="[
            { label: 'Credit', value: 'CREDIT' },
            { label: 'Cash', value: 'CASH' },
            { label: 'Bank', value: 'BANK' },
            { label: 'UPI', value: 'UPI' },
            { label: 'Card', value: 'CARD' },
            { label: 'Cheque', value: 'CHEQUE' },
          ]"
          option-attribute="label"
          value-attribute="value"
        />
      </UFormGroup>

      <UDivider />

      <div class="flex justify-between font-medium">
        <span>Subtotal</span>
        <span>₹{{ subtotal.toFixed(2) }}</span>
      </div>

      <UFormGroup label="Discount (+% or -flat)">
        <UInput type="number" v-model.number="discount" placeholder="10 or -100" />
      </UFormGroup>

      <UFormGroup label="Tax (%)">
        <UInput type="number" v-model.number="taxPercent" placeholder="5" />
      </UFormGroup>

      <UFormGroup label="Adjustment (+ / -)">
        <UInput type="number" v-model.number="adjustment" placeholder="50 or -50" />
      </UFormGroup>

      <UDivider />

      <div class="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span>₹{{ finalTotal.toFixed(2) }}</span>
      </div>

      <UButton block @click="isPurchaseInfoOpen = false">
        Done
      </UButton>
    </div>
  </UModal>

  <!-- DISTRIBUTOR MODAL -->
  <UModal v-model="isDistributorOpen">
    <div class="p-4 space-y-3">
      <h2 class="text-lg font-semibold">Add Distributor</h2>

      <UFormGroup label="Name">
        <UInput v-model="supplier.name" />
      </UFormGroup>

      <UFormGroup label="Street">
        <UInput v-model="supplier.street" />
      </UFormGroup>

      <UFormGroup label="City">
        <UInput v-model="supplier.city" />
      </UFormGroup>

      <UFormGroup label="State">
        <UInput v-model="supplier.state" />
      </UFormGroup>

      <UFormGroup label="Pincode">
        <UInput v-model="supplier.pincode" />
      </UFormGroup>

      <UFormGroup label="GSTIN">
        <UInput v-model="supplier.gstin" />
      </UFormGroup>

      <UFormGroup label="Bank Name">
        <UInput v-model="supplier.bankName" />
      </UFormGroup>

      <UFormGroup label="Account Number">
        <UInput v-model="supplier.accountNo" />
      </UFormGroup>

      <UFormGroup label="IFSC Code">
        <UInput v-model="supplier.ifsc" />
      </UFormGroup>

      <UFormGroup label="UPI ID">
        <UInput v-model="supplier.upiId" />
      </UFormGroup>

      <UButton block @click="submitDistributor">Submit</UButton>
    </div>
  </UModal>
</template>
