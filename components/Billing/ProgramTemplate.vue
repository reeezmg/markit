<script setup lang="ts">
import { newQuoteLine, quoteLineAmount, quoteMoney, quoteTotals, type QuoteInput } from '~/utils/erp-quote'
import { billingErrorMessage } from '~/utils/billing-error'
const props = defineProps<{ modelValue: QuoteInput; companyId: string; currency: string }>()
const scope = useCompanyScope()
const form = computed(() => props.modelValue), totals = computed(() => quoteTotals(form.value))
const search = ref(''), matches = ref<any[]>([]), loading = ref(false), error = ref('')
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: props.currency }).format(n || 0)
let timer: ReturnType<typeof setTimeout> | undefined, version = 0
watch(search, value => {
  clearTimeout(timer); const token = ++version; matches.value = []; error.value = ''; loading.value = !!value.trim()
  if (!loading.value) return
  timer = setTimeout(async () => {
    try {
      const rows = await scope.fetch<any[]>('/api/bill/searchItems', { headers: { 'x-company-id': props.companyId }, query: { q: value, limit: 5, field: 'all' } })
      if (token === version) matches.value = rows
    } catch (e) { if (token === version) error.value = billingErrorMessage(e) }
    finally { if (token === version) loading.value = false }
  }, 250)
})
function addProduct(product: any) {
  const variant = product.variant, category = variant.product?.category
  const net = Number(variant.sprice || 0) * (1 - Number(variant.discount || 0) / 100)
  const tax = category?.taxType === 'FIXED' ? Number(category.fixedTax || 0) : category?.taxType === 'VARIABLE'
    ? Number(net > Number(category.thresholdAmount || 0) ? category.taxAboveThreshold || 0 : category.taxBelowThreshold || 0) : Number(variant.tax || 0)
  const line = { ...newQuoteLine(crypto.randomUUID()), variantId: variant.id, name: [variant.product?.name, variant.name].filter(Boolean).join(' · '),
    barcode: product.barcode || '', size: product.size || '', unit: variant.unit || '', tax, discount: Number(variant.discount || 0),
    rate: quoteMoney(Number(variant.sprice || 0) * (scope.auth.session.value?.isTaxIncluded === false ? 1 + tax / 100 : 1)) }
  const blank = form.value.items.findIndex(i => !i.name && !i.variantId && !i.rate)
  if (blank >= 0) form.value.items.splice(blank, 1, line)
  else if (form.value.items.length < 200) form.value.items.push(line)
  search.value = ''; matches.value = []
}
function remove(index: number) { form.value.items.splice(index, 1); if (!form.value.items.length) form.value.items.push(newQuoteLine(crypto.randomUUID())) }
function addLine() { if (form.value.items.length < 200) form.value.items.push(newQuoteLine(crypto.randomUUID())) }
onBeforeUnmount(() => { clearTimeout(timer); ++version })
</script>
<template>
  <div class="program-template">
    <label>Subject<input v-model="form.subject" maxlength="500" placeholder="Let your customer know what this invoice is for"></label>
    <label>Find a product<input v-model="search" placeholder="Search products to add" autocomplete="off"></label>
    <p v-if="loading" class="program-muted">Searching products…</p><p v-if="error" class="program-error">{{ error }}</p>
    <div v-if="matches.length" class="program-matches"><button v-for="item in matches" :key="item.id" type="button" @click="addProduct(item)">{{ item.variant?.product?.name }} · {{ item.variant?.name }} · {{ item.size }} · {{ money(Number(item.variant?.sprice)) }}</button></div>
    <div class="program-scroll"><table><thead><tr><th>Item / service</th><th>Quantity</th><th>Rate (tax inclusive)</th><th>Discount %</th><th>Tax %</th><th>Amount</th><th></th></tr></thead>
      <tbody><tr v-for="(line,index) in form.items" :key="line.id">
        <td><input v-model="line.name" required maxlength="500" aria-label="Item name"><small v-if="line.variantId">{{ line.barcode }} {{ line.size }}</small></td>
        <td><input v-model.number="line.quantity" type="number" min="0.001" max="999999" step="0.001" required aria-label="Quantity"></td>
        <td><input v-model.number="line.rate" type="number" min="0" step="0.01" required aria-label="Rate"></td>
        <td><input v-model.number="line.discount" type="number" min="0" max="100" step="0.01" required aria-label="Item discount"></td>
        <td><input v-model.number="line.tax" type="number" min="0" max="100" step="0.01" required aria-label="Included tax"></td>
        <td>{{ money(quoteLineAmount(line)) }}</td><td><button type="button" class="program-link" :aria-label="'Remove item '+(index+1)" @click="remove(index)">Remove</button></td>
      </tr></tbody></table></div>
    <button type="button" class="program-secondary" :disabled="form.items.length>=200" @click="addLine">+ Add service / item</button>
    <div class="program-grid">
      <label>Discount<input v-model.number="form.discount" type="number" min="0" step="0.01" required></label>
      <label>Discount type<select v-model="form.discountType"><option value="amount">Amount</option><option value="percent">Percentage</option></select></label>
      <label>Adjustment<input v-model.number="form.adjustment" type="number" step="0.01" required></label>
      <label>Payment terms<input v-model="form.paymentTerms" maxlength="1000" placeholder="e.g. Net 15"></label>
    </div>
    <div class="program-totals"><span>Subtotal {{ money(totals.subTotal) }}</span><span>Discount {{ money(totals.discountAmount) }}</span><span>Included tax {{ money(totals.includedTax) }}</span><strong>Total {{ money(totals.total) }}</strong></div>
    <div class="program-grid"><label>Customer notes<textarea v-model="form.notes" rows="3" maxlength="5000"></textarea></label><label>Terms and conditions<textarea v-model="form.termsAndConditions" rows="3" maxlength="10000"></textarea></label></div>
  </div>
</template>

