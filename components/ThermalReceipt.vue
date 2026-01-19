<template>
  <!-- SCALE WRAPPER (for responsiveness) -->
  <div
    class="flex justify-center origin-top
           scale-[0.95] sm:scale-100"
  >
    <!-- RECEIPT BOX -->
    <div
      class="w-[90mm] font-mono text-[11px] leading-snug text-black
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
      <div class="grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm] font-bold">
        <span>SL</span>
        <span>DESCRIPTION</span>
        <span class="text-right">QTY</span>
        <span class="text-right">MRP</span>
        <span class="text-right">TAX</span>
        <span class="text-right">DISC</span>
      </div>

      <div class="grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm] font-bold">
        <span></span><span></span><span></span><span></span>
        <span class="text-right">HSN</span>
        <span class="text-right">T.VALUE</span>
      </div>

      <!-- ITEMS -->
      <div v-for="(item, i) in data.entries" :key="i" class="mt-1">
        <div class="grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm]">
          <span>{{ i + 1 }}</span>

          <span class="break-words">
            <div v-for="(line, idx) in wrap(item.description)" :key="idx">
              {{ line }}
            </div>
            <div v-if="item.size" class="text-[10px]">
              Size: {{ item.size }}
            </div>
          </span>

          <span class="text-right">{{ item.qty }}</span>
          <span class="text-right">{{ money(item.mrp) }}</span>
          <span class="text-right">{{ item.tax }}%</span>
          <span class="text-right">{{ item.discount }}</span>
        </div>

        <div class="grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm]">
          <span></span><span></span><span></span><span></span>
          <span class="text-right">{{ item.hsn }}</span>
          <span class="text-right">{{ money(item.tvalue) }}</span>
        </div>
      </div>

      <hr class="my-1 border-dashed border-black" />

      <!-- TOTALS -->
      <div class="grid grid-cols-[6mm_29mm_6mm_13mm_13mm_13mm] font-bold">
        <span></span>
        <span>TOTAL</span>
        <span class="text-right">{{ data.tqty }}</span>
        <span class="text-right">{{ money(data.tvalue) }}</span>
        <span class="text-right">{{ money(data.tdiscount) }}</span>
        <span class="text-right">{{ money(data.ttvalue) }}</span>
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

const join = (a?: string, b?: string) =>
  a && b ? `${a}, ${b}` : a || b || ''

const wrap = (text = '', limit = 22) => {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''

  for (const w of words) {
    if ((line + w).length > limit) {
      lines.push(line.trim())
      line = w + ' '
    } else {
      line += w + ' '
    }
  }
  if (line) lines.push(line.trim())
  return lines
}

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
