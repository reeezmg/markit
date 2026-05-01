<script setup lang="ts">
import { useFindManyDistributorCompany } from '~/lib/hooks'
import { useQueryClient } from '@tanstack/vue-query'
import type { Prisma } from '@prisma/client'

const toast   = useToast()
const router  = useRouter()
const route   = useRoute()
const useAuth = () => useNuxtApp().$auth

const companyId = computed(() => useAuth().session.value?.companyId)

// ─── Categories ───────────────────────────────────────────────────────────────
const categories = ref<Array<{ id: string; name: string; hsn: string }>>([])

onMounted(async () => {
  if (!companyId.value) return
  const data = await $fetch<any[]>('/api/bill/findManyCategory', {
    query: { companyId: companyId.value },
  })
  categories.value = data ?? []
})

// ─── Distributor select ───────────────────────────────────────────────────────
const selectedDistributorId = ref((route.query.distributorId as string) || '')

const distArgs = computed<Prisma.DistributorCompanyFindManyArgs>(() => ({
  where: { companyId: companyId.value },
  select: {
    distributorId: true,
    distributor: { select: { id: true, name: true } },
    purchaseOrders: {
      select: { id: true, purchaseOrderNo: true, billNo: true, totalAmount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    },
  },
  orderBy: { distributor: { name: 'asc' } },
}))

const { data: distData } = useFindManyDistributorCompany(distArgs)

const distributorOptions = computed(() =>
  (distData.value ?? []).map(d => ({
    label: d.distributor?.name ?? '',
    value: d.distributorId,
  }))
)

const selectedDistComp = computed(() =>
  distData.value?.find(d => d.distributorId === selectedDistributorId.value)
)

// ─── PO USelectMenu ───────────────────────────────────────────────────────────
const selectedPO = ref<{ label: string; id: string } | null>(null)

const poOptions = computed(() =>
  (selectedDistComp.value?.purchaseOrders ?? []).map(p => ({
    label: `PO#${p.purchaseOrderNo}${p.billNo ? ' / ' + p.billNo : ''} — ₹${Number(p.totalAmount || 0).toFixed(2)}`,
    id: p.id,
  }))
)

watch(selectedDistributorId, () => { selectedPO.value = null })

// ─── Return rows ──────────────────────────────────────────────────────────────
const emptyRow = () => ({
  barcode: '', itemId: '', variantId: '', productName: '', size: '',
  category: null as { id: string; name: string; hsn: string } | null,
  qty: 1, rate: 0, tax: 0, taxAmount: 0, subtotal: 0,
  reason: '', loading: false,
})

const returnRows = ref([emptyRow()])

const addRow = () => returnRows.value.push(emptyRow())

const removeRow = (i: number) => {
  if (returnRows.value.length > 1) returnRows.value.splice(i, 1)
}

const isBlankRow = (row: any) =>
  !String(row.barcode || '').trim() &&
  !String(row.productName || '').trim() &&
  !row.category &&
  !String(row.size || '').trim() &&
  Number(row.rate || 0) === 0 &&
  Number(row.tax || 0) === 0 &&
  !String(row.reason || '').trim() &&
  !String(row.itemId || '').trim() &&
  !String(row.variantId || '').trim()

const handleCategorySelected = async (index: number) => {
  if (index === returnRows.value.length - 1) {
    addRow()
  }
  await nextTick()
  focusInput(index, 'size')
}

// ─── Recalculate per-row ──────────────────────────────────────────────────────
watch(returnRows, rows => {
  for (const row of rows) {
    row.taxAmount = parseFloat(((row.qty * row.rate * row.tax) / 100).toFixed(2))
    row.subtotal  = parseFloat((row.qty * row.rate + row.taxAmount).toFixed(2))
  }
}, { deep: true })

// ─── Totals ───────────────────────────────────────────────────────────────────
const subTotalAmount = computed(() => returnRows.value.reduce((s, r) => s + r.qty * r.rate, 0))
const totalTaxAmount = computed(() => returnRows.value.reduce((s, r) => s + r.taxAmount, 0))
const grandTotal     = computed(() => parseFloat((subTotalAmount.value + totalTaxAmount.value).toFixed(2)))

// ─── Fetch item by barcode ────────────────────────────────────────────────────
async function fetchItemData(barcode: string, index: number) {
  if (!barcode) return
  returnRows.value[index].loading = true
  try {
    const item = await $fetch<any>('/api/purchasereturn/findItem', { params: { barcode } })
    if (!item) {
      toast.add({ title: 'Item not found', description: `Barcode: ${barcode}`, color: 'red' })
      return
    }
    const row = returnRows.value[index]
    row.itemId      = item.id
    row.variantId   = item.variant?.id ?? ''
    row.productName = item.variant?.product?.name ?? ''
    row.size        = item.size ?? ''
    row.rate        = item.variant?.pprice ?? 0
    row.tax         = item.variant?.tax ?? 0
    row.barcode     = barcode
    const catId     = item.variant?.product?.categoryId
    row.category    = catId ? (categories.value.find(c => c.id === catId) ?? null) : null

    // Auto-add new row if this was the last one
    if (index === returnRows.value.length - 1) {
      returnRows.value.push(emptyRow())
    }
  } catch (err: any) {
    toast.add({ title: 'Lookup failed', description: err.message, color: 'red' })
  } finally {
    returnRows.value[index].loading = false
  }
}

// ─── Row input refs ───────────────────────────────────────────────────────────
const barcodeInputs  = ref<any[]>([])
const nameInputs     = ref<any[]>([])
const categoryInputs = ref<any[]>([])
const sizeInputs     = ref<any[]>([])
const qtyInputs      = ref<any[]>([])
const rateInputs     = ref<any[]>([])
const taxInputs      = ref<any[]>([])
const reasonInputs   = ref<any[]>([])

const fieldOrder = ['barcode', 'name', 'category', 'size', 'qty', 'rate', 'tax', 'reason'] as const

const focusInput = async (rowIndex: number, field: string) => {
  await nextTick()
  try {
    switch (field) {
      case 'barcode':   barcodeInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'name':      nameInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'category':  openCategory(rowIndex); break
      case 'size':      sizeInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'qty':       qtyInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'rate':      rateInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'tax':       taxInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
      case 'reason':    reasonInputs.value[rowIndex]?.$el?.querySelector('input')?.select(); break
    }
  } catch (e) { /* ignore */ }
}

const moveFocus = (currentRowIndex: number, currentField: string, direction: string) => {
  const fi = fieldOrder.indexOf(currentField as any)
  let nextRow  = currentRowIndex
  let nextField = fi

  switch (direction) {
    case 'up':    nextRow   = Math.max(0, currentRowIndex - 1); break
    case 'down':  nextRow   = Math.min(returnRows.value.length - 1, currentRowIndex + 1); break
    case 'left':  nextField = Math.max(0, fi - 1); break
    case 'right': nextField = Math.min(fieldOrder.length - 1, fi + 1); break
  }

  if (direction === 'up' || direction === 'down') nextField = fi

  focusInput(nextRow, fieldOrder[nextField])
}

const openCategory = (rowIndex: number) => {
  const td = categoryInputs.value[rowIndex]
  if (!td) return
  const btn = td.querySelector('button')
  if (!btn) return
  btn.focus()
  btn.click()

  setTimeout(() => {
    const ul = td.querySelector('ul[role="listbox"]')
    if (!ul) return

    const comboInput = ul.querySelector('input[role="combobox"]') as HTMLElement | null
    if (comboInput) comboInput.focus()
    else (ul as HTMLElement).focus()

    ul.addEventListener('keydown', function handlerRight(e: Event) {
      if ((e as KeyboardEvent).key === 'ArrowRight') {
        btn.click()
        ul.removeEventListener('keydown', handlerRight)
        focusInput(rowIndex, 'size')
      }
    })

    ul.addEventListener('keydown', function handlerLeft(e: Event) {
      if ((e as KeyboardEvent).key === 'ArrowLeft') {
        btn.click()
        ul.removeEventListener('keydown', handlerLeft)
        focusInput(rowIndex, 'name')
      }
    })
  }, 100)
}

// ─── Product search modal ─────────────────────────────────────────────────────
const showProductSearch = ref(false)

const onProductSearchDone = async (selected: Array<{ barcode: string }>) => {
  showProductSearch.value = false
  for (const { barcode } of selected) {
    const existing = returnRows.value.findIndex(r => r.barcode === barcode)
    if (existing !== -1) {
      returnRows.value[existing].qty += 1
    } else {
      const emptyIdx = returnRows.value.findIndex(r => !r.itemId)
      if (emptyIdx !== -1) {
        await fetchItemData(barcode, emptyIdx)
      } else {
        returnRows.value.push(emptyRow())
        await fetchItemData(barcode, returnRows.value.length - 1)
      }
    }
  }
}

// ─── Remarks & date ──────────────────────────────────────────────────────────
const remarks    = ref('')
const returnDate = ref(new Date().toISOString().split('T')[0])

// ─── LocalStorage persistence ─────────────────────────────────────────────────
const LS_KEY = 'purchase-return:draft'

const saveDraft = () => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      distributorId: selectedDistributorId.value,
      selectedPO:    selectedPO.value,
      returnDate:    returnDate.value,
      remarks:       remarks.value,
      rows:          returnRows.value,
    }))
  } catch { /* ignore quota errors */ }
}

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const d = JSON.parse(raw)
    if (d.distributorId) selectedDistributorId.value = d.distributorId
    if (d.selectedPO)    selectedPO.value            = d.selectedPO
    if (d.returnDate)    returnDate.value             = d.returnDate
    if (d.remarks)       remarks.value                = d.remarks
    if (d.rows?.length)  returnRows.value             = d.rows
  } catch { /* ignore parse errors */ }
}

onMounted(() => { loadDraft() })

watch([returnRows, remarks, returnDate, selectedPO, selectedDistributorId], saveDraft, { deep: true })

// ─── Reset ───────────────────────────────────────────────────────────────────
const handleReset = () => {
  returnRows.value = [emptyRow()]
  remarks.value = ''
  returnDate.value = new Date().toISOString().split('T')[0]
  selectedPO.value = null
  savedReturnId.value = ''
  localStorage.removeItem(LS_KEY)
}

// ─── Submit & PDF ─────────────────────────────────────────────────────────────
const isSaving      = ref(false)
const savedReturnId = ref('')
const queryClient   = useQueryClient()

const handleSubmit = async () => {
  if (!selectedDistributorId.value) {
    toast.add({ title: 'Please select a distributor', color: 'red' })
    return
  }
  const validRows = returnRows.value.filter(row => !isBlankRow(row))
  if (!validRows.length) {
    toast.add({ title: 'Add at least one item', color: 'red' })
    return
  }
  const missingCategory = validRows.findIndex(r => !r.category)
  if (missingCategory !== -1) {
    toast.add({ title: `Row ${missingCategory + 1}: Category is required`, color: 'red' })
    focusInput(missingCategory, 'category')
    return
  }

  isSaving.value = true
  try {
    const result = await $fetch<{ success: boolean; purchaseReturnId: string }>('/api/purchasereturn/create', {
      method: 'POST',
      body: {
        distributorId:   selectedDistributorId.value,
        companyId:       companyId.value,
        purchaseOrderId: selectedPO.value?.id || undefined,
        remarks:         remarks.value || undefined,
        subTotalAmount:  subTotalAmount.value,
        taxAmount:       totalTaxAmount.value,
        totalAmount:     grandTotal.value,
        items: validRows.map(r => ({
          itemId:      r.barcode?.trim() ? r.itemId : undefined,
          variantId:   r.barcode?.trim() ? r.variantId : undefined,
          barcode:     r.barcode?.trim() || undefined,
          productName: r.productName || r.category?.name || '',
          categoryName: r.category?.name || '',
          size:        r.size || undefined,
          categoryId:  r.category?.id || null,
          qty:         r.qty,
          rate:        r.rate,
          tax:         r.tax,
          taxAmount:   r.taxAmount,
          subtotal:    r.subtotal,
          reason:      r.reason || undefined,
        })),
      },
    })
    savedReturnId.value = result.purchaseReturnId
    toast.add({ title: 'Purchase return saved — downloading PDF…', color: 'green' })
    await downloadPdf(result.purchaseReturnId)
    localStorage.removeItem(LS_KEY)
    await queryClient.invalidateQueries({ queryKey: ['zenstack', 'PurchaseReturn'] })
    await queryClient.invalidateQueries({ queryKey: ['zenstack', 'DistributorCompany'] })
    router.push('/distributor/purchase-return')
  } catch (err: any) {
    toast.add({ title: 'Failed to save', description: err.data?.message || err.message, color: 'red' })
  } finally {
    isSaving.value = false
  }
}

const isDownloading = ref(false)
const downloadPdf = async (id?: string) => {
  const returnId = id || savedReturnId.value
  if (!returnId) return
  isDownloading.value = true
  try {
    const res = await $fetch.raw('/api/downloads/purchase-return.pdf', {
      method: 'GET',
      params: { purchaseReturnId: returnId },
    })
    const url = URL.createObjectURL(new Blob([res._data as ArrayBuffer], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `return-${returnId.slice(0, 8)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    toast.add({ title: 'Download failed', description: err.message, color: 'red' })
  } finally {
    isDownloading.value = false
  }
}
</script>

<template>
  <UDashboardPanelContent class="p-1 flex flex-col gap-2">
    <div class="flex items-center gap-2 px-1">
      <UButton icon="i-heroicons-arrow-left" color="gray" variant="ghost" size="sm" @click="router.push('/distributor/purchase-return')" />
      <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">New Purchase Return</span>
    </div>
    <UCard class="flex-1"
      :ui="{
        base: 'h-full flex flex-col',
        rounded: '',
        ring: 'ring-0 lg:ring-1 lg:ring-gray-200 lg:dark:ring-gray-800',
        divide: 'divide-y divide-gray-200 dark:divide-gray-700',
        body: {
          padding: '',
          base: 'flex-1 flex flex-col overflow-hidden grow divide-y divide-gray-200 dark:divide-gray-700 z-10'
        },
        footer: { base: 'sticky bottom-0 bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700', padding: '' },
        header: { base: '', padding: 'px-4 py-3' },
      }"
    >

      <!-- ── HEADER ── -->
      <template #header>
        <div class="flex flex-wrap items-end gap-3 w-full">
          <UFormGroup label="Date" class="w-36">
            <UInput v-model="returnDate" type="date" />
          </UFormGroup>

          <UFormGroup label="Distributor" required class="w-56">
            <USelectMenu
              v-model="selectedDistributorId"
              :options="distributorOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Select distributor"
              searchable
              searchable-placeholder="Search distributor..."
            />
          </UFormGroup>

          <UFormGroup label="Purchase Order" class="w-56">
            <USelectMenu
              v-model="selectedPO"
              :options="poOptions"
              option-attribute="label"
              placeholder="Select PO..."
              searchable
              searchable-placeholder="Search by PO no..."
              :disabled="!selectedDistributorId"
            >
              <template #empty>
                <span class="text-xs text-gray-400">{{ selectedDistributorId ? 'No purchase orders' : 'Select distributor first' }}</span>
              </template>
            </USelectMenu>
          </UFormGroup>

          <div class="ml-auto pb-0.5">
            <UButton
              icon="i-heroicons-arrow-path"
              color="gray"
              variant="outline"
              size="sm"
              label="Reset"
              @click="handleReset"
            />
          </div>
        </div>
      </template>

      <!-- ── BODY: Items table ── -->
      <div class="flex-1 overflow-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-8">#</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-28">Barcode</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500">Product</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-32">Category</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-16">Size</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-16">Qty</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-20">Rate</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500 w-14">Tax%</th>
              <th class="px-2 py-2 text-right text-xs font-medium text-gray-500 w-20">Tax Amt</th>
              <th class="px-2 py-2 text-right text-xs font-medium text-gray-500 w-22">Subtotal</th>
              <th class="px-2 py-2 text-left text-xs font-medium text-gray-500">Reason</th>
              <th class="px-2 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="(row, i) in returnRows" :key="i" class="group">
              <td class="px-2 py-1.5 text-xs text-gray-400">{{ i + 1 }}</td>

              <!-- Barcode -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => barcodeInputs[i] = el"
                  v-model="row.barcode"
                  size="xs"
                  class="w-24"
                  :loading="row.loading"
                  @keydown.enter.prevent="row.barcode?.trim() ? fetchItemData(row.barcode, i) : focusInput(i, 'category')"
                  @keydown.up.prevent="moveFocus(i, 'barcode', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'barcode', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'barcode', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'barcode', 'right')"
                />
              </td>

              <!-- Product name -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => nameInputs[i] = el"
                  v-model="row.productName"
                  size="xs"
                  placeholder="Product name"
                  class="min-w-[120px]"
                  @keydown.up.prevent="moveFocus(i, 'name', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'name', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'name', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'name', 'right')"
                />
              </td>

              <!-- Category -->
              <td :ref="el => categoryInputs[i] = el" class="px-2 py-1.5">
                <div class="w-36">
                <USelectMenu
                  v-model="row.category"
                  :options="categories"
                  option-attribute="name"
                  option-key="id"
                  track-by="id"
                  searchable
                  searchable-placeholder="Search category..."
                  class="min-w-[120px]"
                  :popper="{ placement: 'bottom-start' }"
                  @update:modelValue="() => handleCategorySelected(i)"
                  @keydown.up.prevent="moveFocus(i, 'category', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'category', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'category', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'category', 'right')"
                  @keydown.enter.prevent="openCategory(i)"
                >
                  <template #label>
                    <span v-if="row.category" class="truncate">{{ row.category.name }}</span>
                    <span v-else class="text-gray-400 text-xs">Category</span>
                  </template>
                  <template #option="{ option }">
                    <span class="truncate">{{ option.name }}</span>
                  </template>
                </USelectMenu>
                </div>
              </td>

              <!-- Size -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => sizeInputs[i] = el"
                  v-model="row.size"
                  size="xs"
                  class="w-14"
                  @keydown.up.prevent="moveFocus(i, 'size', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'size', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'size', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'size', 'right')"
                />
              </td>

              <!-- Qty -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => qtyInputs[i] = el"
                  v-model.number="row.qty"
                  type="number"
                  size="xs"
                  class="w-14"
                  min="1"
                  @keydown.up.prevent="moveFocus(i, 'qty', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'qty', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'qty', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'qty', 'right')"
                />
              </td>

              <!-- Rate -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => rateInputs[i] = el"
                  v-model.number="row.rate"
                  type="number"
                  size="xs"
                  class="w-18"
                  @keydown.up.prevent="moveFocus(i, 'rate', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'rate', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'rate', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'rate', 'right')"
                />
              </td>

              <!-- Tax% -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => taxInputs[i] = el"
                  v-model.number="row.tax"
                  type="number"
                  size="xs"
                  class="w-14"
                  @keydown.up.prevent="moveFocus(i, 'tax', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'tax', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'tax', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'tax', 'right')"
                />
              </td>

              <!-- Tax Amt -->
              <td class="px-2 py-1.5 text-right text-xs">{{ row.taxAmount.toFixed(2) }}</td>

              <!-- Subtotal -->
              <td class="px-2 py-1.5 text-right text-xs font-medium">₹{{ row.subtotal.toFixed(2) }}</td>

              <!-- Reason -->
              <td class="px-2 py-1.5">
                <UInput
                  :ref="el => reasonInputs[i] = el"
                  v-model="row.reason"
                  size="xs"
                  placeholder="Reason (optional)"
                  class="min-w-[100px]"
                  @keydown.up.prevent="moveFocus(i, 'reason', 'up')"
                  @keydown.down.prevent="moveFocus(i, 'reason', 'down')"
                  @keydown.left.prevent="moveFocus(i, 'reason', 'left')"
                  @keydown.right.prevent="moveFocus(i, 'reason', 'right')"
                />
              </td>

              <!-- Remove -->
              <td class="px-2 py-1.5">
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  color="red"
                  variant="ghost"
                  :disabled="returnRows.length === 1"
                  @click="removeRow(i)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table toolbar -->
      <div class="flex items-center gap-2 px-3 py-2">
        <UButton icon="i-heroicons-plus" size="xs" color="gray" variant="outline" label="Add Row" @click="addRow" />
        <UButton icon="i-heroicons-magnifying-glass" size="xs" color="gray" variant="outline" label="Product Search" @click="showProductSearch = true" />
      </div>

      <!-- ── FOOTER ── -->
      <template #footer>
        <!-- Totals + Remarks row -->
        <div class="flex flex-wrap items-start gap-6 px-4 py-3">
          <div class="w-64 space-y-1 text-sm pt-5">
            <div class="flex justify-between">
              <span class="text-gray-500">Subtotal</span>
              <span>₹{{ subTotalAmount.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Tax</span>
              <span>₹{{ totalTaxAmount.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between font-semibold text-base border-t border-gray-200 dark:border-gray-700 pt-1">
              <span>Grand Total</span>
              <span class="text-orange-600">₹{{ grandTotal.toFixed(2) }}</span>
            </div>
          </div>

          <UFormGroup label="Remarks" class="flex-1 min-w-[200px]">
            <UTextarea v-model="remarks" placeholder="Optional remarks..." rows="2" />
          </UFormGroup>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 px-4 py-3">
          <UButton
            color="primary"
            :loading="isSaving"
            icon="i-heroicons-arrow-uturn-left"
            label="Submit Return"
            @click="handleSubmit"
          />
          </div>
      </template>

    </UCard>

    <!-- Product Search Modal -->
    <BillingProductSearch
      :open="showProductSearch"
      @close="showProductSearch = false"
      @done="onProductSearchDone"
    />
  </UDashboardPanelContent>
</template>
