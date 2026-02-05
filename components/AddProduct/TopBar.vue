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
      <span class="font-semibold">
        Total: ₹{{ finalTotal.toFixed(2) }}
      </span>
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
           <!-- 🆕 BILL DATE -->
      <UFormGroup label="Bill Date">
        <UInput
          type="date"
          v-model="billDate"
        />
      </UFormGroup>
      <!-- DISTRIBUTOR -->
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

          <UButton
            icon="i-heroicons-plus"
            @click="isDistributorOpen = true"
          />
        </div>
      </UFormGroup>

      <!-- BILL NUMBER -->
      <UFormGroup label="Bill Number">
        <UInput
          v-model="billNo"
          placeholder="Enter bill number"
        />
      </UFormGroup>

 

      <!-- PAYMENT TYPE -->
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

      <!-- SUBTOTAL -->
      <div class="flex justify-between font-medium">
        <span>Subtotal</span>
        <span>₹{{ subtotal.toFixed(2) }}</span>
      </div>

      <!-- DISCOUNT -->
      <UFormGroup label="Discount (+% or -flat)">
        <UInput
          type="number"
          v-model.number="discount"
          placeholder="10 or -100"
        />
      </UFormGroup>

      <!-- TAX -->
      <UFormGroup label="Tax (%)">
        <UInput
          type="number"
          v-model.number="taxPercent"
          placeholder="5"
        />
      </UFormGroup>

      <!-- ADJUSTMENT -->
      <UFormGroup label="Adjustment (+ / -)">
        <UInput
          type="number"
          v-model.number="adjustment"
          placeholder="50 or -50"
        />
      </UFormGroup>

      <UDivider />

      <!-- FINAL TOTAL -->
      <div class="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span>₹{{ finalTotal.toFixed(2) }}</span>
      </div>

      <UButton
        block
        @click="isPurchaseInfoOpen = false"
      >
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

      <UButton block @click="submitDistributor">
        Submit
      </UButton>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import { useCreateDistributor, useFindManyDistributor } from '~/lib/hooks'

/* ------------------------------------
   PROPS (DB STATE)
------------------------------------ */
const props = withDefaults(defineProps<{
  totalAmount: number
  distributorId?: string
  paymentType?: string   // OLD from DB
  billNo?: string
  billDate?: string      // 🆕 NEW
  discount?: number
  tax?: number
  adjustment?: number
}>(), {
  totalAmount: 0,
  distributorId: '',
  paymentType: '',
  billNo: '',
  billDate: '',
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
   PURCHASE INFO STATE
------------------------------------ */
const selected = ref<any>(null)

// 🆕 NEW (editable)
const paymentType = ref<string>('')

// 🧊 OLD (frozen DB state)
const oldPaymentType = ref<string | null>(null)

const billNo = ref<string>('')

// 🆕 BILL DATE (yyyy-mm-dd)
const billDate = ref<string>('')

/* ------------------------------------
   INIT OLD vs NEW (CRITICAL FIX)
------------------------------------ */


watch(
  () => props.paymentType,
  (val) => {
    if (oldPaymentType.value === null) {
      oldPaymentType.value =
        typeof val === 'string' && val !== '' ? val : null
    }

    if (paymentType.value === '' && typeof val === 'string') {
      paymentType.value = val
    }
  },
  { immediate: true }
)

watch(
  () => props.billNo,
  (val) => {
    if (typeof val === 'string') billNo.value = val
  },
  { immediate: true }
)

watch(
  () => props.billDate,
  (val) => {
     console.log('Initializing billDate from props.createdAt:', val)
    if (!val || billDate.value) return
   
    // ISO → YYYY-MM-DD
    billDate.value = new Date(val).toISOString().split('T')[0]
  },
  { immediate: true }
)

/* ------------------------------------
   DELIVERY TYPE
------------------------------------ */
const DELIVERY_TYPE_KEY = 'lastDeliveryType'
const deliveryTypeOptions = ref<string[]>(
  useAuth().session.value?.deliveryType || []
)
const deliveryType = ref<string>()

if (process.client) {
  deliveryType.value =
    localStorage.getItem(DELIVERY_TYPE_KEY) || deliveryTypeOptions.value[0]
}

watch(deliveryType, (val) => {
  if (val) localStorage.setItem(DELIVERY_TYPE_KEY, val)
})

/* ------------------------------------
   PRICING INPUTS
------------------------------------ */
const discount = ref<number>(0)
const taxPercent = ref<number>(0)
const adjustment = ref<number>(0)

/* ------------------------------------
   SYNC PROPS → LOCAL
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
   CALCULATIONS
------------------------------------ */
const subtotal = computed(() => Number(props.totalAmount) || 0)

const discountAmount = computed(() => {
  const base = subtotal.value
  const d = Number(discount.value) || 0
  return d > 0 ? (base * d) / 100 : Math.min(Math.abs(d), base)
})

const discountedAmount = computed(() => {
  return subtotal.value - discountAmount.value
})

const taxAmount = computed(() => {
  const t = Number(taxPercent.value) || 0
  return (discountedAmount.value * t) / 100
})

const totalBeforeAdjustment = computed(() => {
  return discountedAmount.value + taxAmount.value
})

const finalTotal = computed(() => {
  return totalBeforeAdjustment.value + (Number(adjustment.value) || 0)
})

/* ------------------------------------
   EMIT (OLD + NEW)
------------------------------------ */
const emit = defineEmits(['update'])

watch(
  [
    selected,
    paymentType,
    billNo,
    billDate,
    deliveryType,
    discount,
    taxPercent,
    adjustment,
    finalTotal
  ],
  () => {
    emit('update', {
      distributorId: selected.value?.id || null,

      // payment state
      oldPaymentType: oldPaymentType.value,
      paymentType: paymentType.value,

      billNo: billNo.value,
      billDate: billDate.value, // 🆕 EMITTED

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

/* ------------------------------------
   RESET (SAFE)
------------------------------------ */
const reset = () => {
  selected.value = null
  paymentType.value = ''
  billNo.value = ''
  billDate.value = ''
  discount.value = 0
  taxPercent.value = 0
  adjustment.value = 0
  deliveryType.value = deliveryTypeOptions.value[0] || ''

  // ⚠️ DO NOT reset oldPaymentType
}

/* ------------------------------------
   EXPOSE
------------------------------------ */
defineExpose({
  reset
})
</script>
