<template>
  <!-- SCALE WRAPPER (for responsiveness) -->
  <div
    class="flex justify-center origin-top
           scale-[0.95] sm:scale-100"
  >
    <!-- RECEIPT BOX -->
    <div
      class="w-[90mm] font-mono text-[11px] leading-snug text-black bg-white
             border border-dashed border-black p-2 receipt-border"
    >
      <!-- HEADER -->
      <div class="text-center font-bold text-[14px]">
        {{ data.companyName }}
      </div>

      <div class="text-center">
        {{ join(data.companyAddress?.name, data.companyAddress?.street) }}
      </div>
      <div class="text-center">
        {{ join(data.companyAddress?.locality, data.companyAddress?.city) }}
      </div>
      <div class="text-center">
        {{ join(data.companyAddress?.state, data.companyAddress?.pincode) }}
      </div>

      <div v-if="data.gstin" class="text-center">
        GSTIN: {{ data.gstin }}
      </div>

      <hr class="my-1 border-dashed border-black" />

      <!-- BILL INFO -->
      <div>Invoice: {{ data.invoiceNumber }}</div>
      <div>Date: {{ formatDate(data.date) }}</div>
      <div>Payment: {{ data.paymentMethod }}</div>

      <div v-if="data.clientName">
        <div>Client: {{ data.clientName }}</div>
        <div>Phone: {{ data.clientPhone }}</div>
      </div>

      <hr class="my-1 border-dashed border-black" />

      <!-- TABLE HEADER -->
      <div :class="columnsClass" class="font-bold">
        <span>SL</span>
        <span class="min-w-0">DESCRIPTION</span>
        <span v-if="showUnit" class="text-right">UNIT</span>
        <span class="text-right">QTY</span>
        <span class="text-right">MRP</span>
        <span class="text-right">DISC</span>
        <span class="text-right">VALUE</span>
      </div>

      <!-- ITEMS -->
      <div v-for="(item, i) in data.entries" :key="i" class="mt-1 mb-4">
        <div :class="columnsClass">
          <span>{{ i + 1 }}</span>

          <span class="min-w-0">
            <div class="truncate" :title="item.description || ''">
              {{ item.description || '' }}
            </div>
            <div v-if="item.size" class="truncate text-[10px]" :title="`${labelFor(item)}: ${item.size}`">
              {{ labelFor(item) }}: {{ item.size }}
            </div>
            <div v-if="item.hsn || Number(item.tax || 0)" class="truncate text-[9px] text-gray-600">
              <span v-if="item.hsn">HSN: {{ item.hsn }}</span>
              <span v-if="item.hsn && Number(item.tax || 0)"> · </span>
              <span v-if="Number(item.tax || 0)">Tax: {{ item.tax }}%</span>
            </div>
          </span>

          <span v-if="showUnit" class="text-right tabular-nums whitespace-nowrap">{{ item.unit || 'Nos' }}</span>
          <span class="text-right tabular-nums whitespace-nowrap">{{ item.qty }}</span>
          <span class="text-right tabular-nums whitespace-nowrap">{{ money(item.mrp) }}</span>
          <span class="text-right tabular-nums whitespace-nowrap">{{ money(item.discount) }}</span>
          <span class="text-right tabular-nums whitespace-nowrap">{{ money(item.tvalue) }}</span>
        </div>
      </div>

      <hr class="my-1 border-dashed border-black" />

      <!-- TOTALS -->
      <div :class="columnsClass" class="font-bold text-[10px] leading-none py-1">
        <span></span>
        <span>TOTAL</span>
        <span v-if="showUnit"></span>
        <span class="text-right tabular-nums whitespace-nowrap">{{ data.tqty }}</span>
        <span class="text-right tabular-nums whitespace-nowrap">{{ money(data.tvalue) }}</span>
        <span class="text-right tabular-nums whitespace-nowrap">{{ money(data.tdiscount) }}</span>
        <span class="text-right tabular-nums whitespace-nowrap">{{ money(data.ttvalue) }}</span>
      </div>

      <hr class="my-1 border-dashed border-black" />

      <!-- ROUND OFF -->
      <div class="text-center">
        DISC / ROUND OFF (+/-): {{ money(data.discount) }}
      </div>

      <!-- GRAND TOTAL -->
      <div class="text-center text-[16px] font-bold my-2">
        GRAND TOTAL: {{ money(data.grandTotal) }}
      </div>

      <!-- SAVINGS -->
      <div class="border border-black text-center font-bold py-1 my-2">
        YOUR SAVING: {{ money(data.tdiscount) }}
      </div>

      <!-- FOOTER -->
      <div v-if="data.thankYouNote" class="text-center mb-3">
        {{ data.thankYouNote }}
      </div>
      <div v-if="data.returnPolicy" class="text-center mb-3">
        {{ data.returnPolicy }}
      </div>
      <div v-if="data.refundPolicy" class="text-center mb-3">
        {{ data.refundPolicy }}
      </div>
      <div v-if="data.phone" class="text-center mb-3">
        Customer Care: {{ data.phone }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ data: any }>()
console.log('Receipt data:', props.data)

const showUnit = computed(() => Boolean(props.data?.showUnit))
// Entries carry their variant's sizeLabel when available; otherwise this falls
// back to the company's first configured label.
const { labelFor } = useSizeLabel()
const columnsClass = computed(() =>
  showUnit.value
    ? 'grid grid-cols-[6mm_23mm_8mm_6mm_11mm_11mm_11mm]'
    : 'grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm]'
)

const join = (a?: string, b?: string) =>
  a && b ? `${a}, ${b}` : a || b || ''

const money = (v: any) => Number(v || 0).toFixed(2)
const formatDate = (d: any) => new Date(d).toLocaleString()
</script>

<style scoped>
@media print {
  body {
    margin: 0;
  }

  /* Remove preview border & scaling while printing */
  .receipt-border {
    border: none !important;
  }

  .scale-\[0\.95\] {
    transform: scale(1) !important;
  }
}
</style>
