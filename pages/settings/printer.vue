<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import BluetoothPrinterSettings from '~/components/BluetoothPrinterSettings.vue';
import { computed, onMounted, ref } from 'vue';
import { useWebUsbPrinter, type LabelPrinterLanguage } from '~/composables/useWebUsbPrinter';
import { labelSampleData } from '~/utils/label-variables';
import { DEFAULT_RECEIPT_FINISHING, getReceiptFinishing, saveReceiptFinishing } from '~/utils/receipt-finishing';
const settingsCompany = await useSettingsCompany();
const $fetch = settingsCompany.fetch;
const useAuth = () => settingsCompany.auth;
const toast = useToast();
const nativePlatform = ref(false);
onMounted(() => { nativePlatform.value = Capacitor.isNativePlatform(); });
const receiptFinishing = ref({ ...DEFAULT_RECEIPT_FINISHING });
const labelLanguage = ref<LabelPrinterLanguage>('tspl');
const testLabelLanguage = ref<LabelPrinterLanguage>('tspl');
const deviceSettingsSnapshot = ref('');
const deviceSettingsValue = computed(() => JSON.stringify([receiptFinishing.value, labelLanguage.value]));
const deviceSettingsDirty = computed(() => deviceSettingsSnapshot.value !== deviceSettingsValue.value);
const finishingError = ref('');
const finishingSaved = ref(false);
function saveFinishing() {
  finishingError.value = ''; finishingSaved.value = false;
  try {
    saveReceiptFinishing(receiptFinishing.value);
    setLabelPrinterLanguage(labelLanguage.value);
    deviceSettingsSnapshot.value = deviceSettingsValue.value;
    finishingSaved.value = true;
  } catch (error: any) { finishingError.value = error.message || 'Could not save device settings.'; }
}
// Shipping label size (Delhivery pdf_size) — separate from the local barcode label.
const shippingLabelSizes = [
  { label: 'A4 (8×11)', value: 'A4' },
  { label: '4R (4×6, thermal)', value: '4R' },
];
const shippingLabelSize = ref('A4');
const savingShippingLabelSize = ref(false);
onMounted(async () => {
  try {
    const r: any = await $fetch('/api/ecommerce-cms/shipping/label-size');
    shippingLabelSize.value = r?.size || 'A4';
  } catch { /* shipping not configured yet */ }
});
const saveShippingLabelSize = async () => {
  savingShippingLabelSize.value = true;
  try {
    await $fetch('/api/ecommerce-cms/shipping/label-size', { method: 'POST', body: { size: shippingLabelSize.value } });
    toast.add({ title: 'Shipping label size saved', icon: 'i-heroicons-check-circle' });
  } catch (error: any) {
    toast.add({ title: 'Could not save shipping label size', description: error?.data?.statusMessage || error?.message, color: 'red' });
  } finally {
    savingShippingLabelSize.value = false;
  }
};

const {
  getLabelPrinterLanguage,
  setLabelPrinterLanguage,
  isWebUsbSupported,
  getSavedWebUsbPrinters,
  getWebUsbPrinterRoles,
  connectUsbPrinter,
  assignWebUsbPrinterRole,
  clearWebUsbPrinterRole,
  removeSavedWebUsbPrinter,
  printBillViaUsb,
  printLabelViaUsb,
} = useWebUsbPrinter();

const webUsbPrinters = ref<any[]>([]);
const webUsbRoles = ref<{ receipt: string | null; barcode: string | null }>({
  receipt: null,
  barcode: null,
});
const webUsbStatus = ref('');
const webUsbSupported = ref(false);


const refreshWebUsbState = () => {
  webUsbPrinters.value = getSavedWebUsbPrinters();
  webUsbRoles.value = getWebUsbPrinterRoles();
};

const connectWebUsbPrinter = async () => {
  webUsbStatus.value = 'connecting';
  try {
    const printer = await connectUsbPrinter();
    refreshWebUsbState();
    toast.add({
      title: 'WebUSB printer connected',
      description: printer.productName || 'USB Printer',
      color: 'green',
    });
  } catch (error: any) {
    if (error?.name !== 'NotFoundError') {
      toast.add({
        title: 'Unable to connect WebUSB printer',
        description: error?.message || 'Unknown error',
        color: 'red',
      });
    }
  } finally {
    webUsbStatus.value = '';
  }
};

const removeWebUsbPrinter = (printerId: string) => {
  removeSavedWebUsbPrinter(printerId);
  refreshWebUsbState();
};

const buildSampleReceipt = () => ({
  companyId: useAuth().session.value?.companyId,
  isTaxIncluded: useAuth().session.value?.isTaxIncluded ?? true,
  invoiceNumber: 'TEST-001',
  phone: useAuth().session.value?.companyPhone || '9999999999',
  thankYouNote: 'Printer test',
  refundPolicy: 'No refund on test print',
  returnPolicy: 'Exchange within 7 days',
  date: new Date().toISOString(),
  entries: [
    {
      description: 'USB printer sample',
      hsn: '0000',
      qty: 1,
      mrp: 99,
      discount: 0,
      tax: 0,
      value: 99,
      tvalue: 99,
    },
  ],
  subtotal: 99,
  discount: '10',
  grandTotal: 99,
  paymentMethod: 'Cash',
  companyName: useAuth().session.value?.companyName || 'Store',
  companyAddress: useAuth().session.value?.address || {},
  gstin: useAuth().session.value?.gstin || '',
  clientName: 'Printer Test',
  clientPhone: '9999999999',
  tqty: 1,
  tvalue: 99,
  ttvalue: 99,
  tdiscount: 0,
  upiId: useAuth().session.value?.upiId || '',
});

const buildSampleLabel = () => [
  {
    companyId: useAuth().session.value?.companyId,
    barcode: '313063057461',
    code: 'TEST-Printer',
    shopname: useAuth().session.value?.companyName || 'Store',
    productName: 'USB Label Test',
    brand: 'Printer',
    name: 'Sample',
    sprice: 1440,
    dprice: 1299,
    size: 'M',
  },
];

const testWebUsbReceiptPrinter = async () => {
  webUsbStatus.value = 'testing-receipt';
  try {
    await printBillViaUsb(buildSampleReceipt());
    toast.add({ title: 'Receipt printer test sent', color: 'green' });
  } catch (error: any) {
    toast.add({
      title: 'Receipt printer test failed',
      description: error?.message || 'Unknown error',
      color: 'red',
    });
  } finally {
    webUsbStatus.value = '';
  }
};

const testWebUsbBarcodePrinter = async () => {
  webUsbStatus.value = 'testing-barcode';
  try {
    await printLabelViaUsb(buildSampleLabel().map(item => labelSampleData(item)), useAuth().session.value?.printerLabelSize || '50x38mm', undefined, testLabelLanguage.value);
    toast.add({ title: 'Barcode printer test sent', color: 'green' });
  } catch (error: any) {
    toast.add({
      title: 'Barcode printer test failed',
      description: error?.message || 'Unknown error',
      color: 'red',
    });
  } finally {
    webUsbStatus.value = '';
  }
};

function assignDevice(role: 'receipt' | 'barcode', id: string) {
  try {
    if (id) assignWebUsbPrinterRole(id, role); else clearWebUsbPrinterRole(role);
    refreshWebUsbState();
  } catch (error: any) { toast.add({ title: 'Could not save assignment', description: error.message, color: 'red' }); }
}
onMounted(async () => {
  webUsbSupported.value = isWebUsbSupported();
  refreshWebUsbState();
  receiptFinishing.value = getReceiptFinishing();
  labelLanguage.value = getLabelPrinterLanguage();
  testLabelLanguage.value = labelLanguage.value;
  deviceSettingsSnapshot.value = deviceSettingsValue.value;
});
</script>

<template>
  <UDashboardPanelContent class="printer-settings pb-24">
    <header class="mb-6"><h1 class="text-2xl font-semibold">Printing workspace</h1><p class="text-sm text-gray-500 mt-1">Connect your printers, choose your designs, and print consistently across your store.</p></header>
    <BluetoothPrinterSettings v-if="nativePlatform" :receipt-data="buildSampleReceipt()" :label-data="labelSampleData(buildSampleLabel()[0])" :settings-dirty="deviceSettingsDirty" />
    <section class="printer-section" aria-labelledby="usb-title">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div><h2 id="usb-title" class="text-lg font-semibold">1. WebUSB Printers</h2><p class="text-sm text-gray-500">Connections are saved in this browser. Assign a printer to each job.</p></div>
        <UButton label="Connect USB printer" icon="i-heroicons-plus" :disabled="!webUsbSupported || !!webUsbStatus" :loading="webUsbStatus === 'connecting'" @click="connectWebUsbPrinter" />
      </div>
      <p v-if="!webUsbSupported && !nativePlatform" class="rounded-lg bg-amber-50 text-amber-800 p-4 mb-4" role="status">Open this page in Chrome or Edge with WebUSB support to connect a printer.</p>
      <div class="grid gap-4 md:grid-cols-2">
        <div v-for="role in (['receipt', 'barcode'] as const)" :key="role" class="device-card">
          <div class="flex items-center justify-between"><h3 class="font-semibold">{{ role === 'receipt' ? 'Receipt printer' : 'Product label printer' }}</h3><span class="text-xs text-gray-500">{{ role === 'receipt' ? 'ESC/POS' : labelLanguage.toUpperCase() }}</span></div>
          <label class="block text-sm mt-4">Assigned USB device
            <select :value="webUsbRoles[role] || ''" :disabled="!!webUsbStatus" @change="assignDevice(role, ($event.target as HTMLSelectElement).value)"><option value="">Choose a connected printer</option><option v-for="p in webUsbPrinters" :key="p.id" :value="p.id">{{ p.productName }}{{ p.serialNumber ? ' / ' + p.serialNumber : '' }}</option></select>
          </label>
          <p class="text-xs text-gray-500 my-3">{{ role === 'receipt' ? 'Used by billing, bill edit and reports.' : 'Used by product label printing and label test prints.' }}</p>
          <label v-if="role === 'barcode'" class="block text-sm mb-3">Test command language
            <select v-model="testLabelLanguage" aria-label="Test label command language" :disabled="!!webUsbStatus"><option value="tspl">TSPL</option><option value="cpcl">CPCL</option></select>
            <small class="text-gray-500">Applies to this test only. Saved printer language: {{ labelLanguage.toUpperCase() }}.</small>
          </label>
          <UButton :label="role === 'receipt' ? 'Test receipt' : 'Test label'" variant="soft" :disabled="!webUsbSupported || !webUsbRoles[role] || !!webUsbStatus || deviceSettingsDirty" @click="role === 'receipt' ? testWebUsbReceiptPrinter() : testWebUsbBarcodePrinter()" />
        </div>
      </div>
      <details v-if="webUsbPrinters.length" class="mt-4 text-sm"><summary class="cursor-pointer text-gray-500">Manage saved devices ({{ webUsbPrinters.length }})</summary><div v-for="p in webUsbPrinters" :key="p.id" class="flex justify-between items-center py-3 border-b"><span>{{ p.productName }} <small>{{ p.serialNumber }}</small></span><UButton label="Forget device" variant="ghost" color="red" :disabled="!!webUsbStatus" @click="removeWebUsbPrinter(p.id)" /></div></details>
      <details class="mt-5" open><summary class="font-medium cursor-pointer">Paper finishing &amp; label language</summary>
        <div class="grid gap-5 md:grid-cols-3 mt-4" @change="finishingSaved = false">
          <label class="text-sm">Receipt bottom blank lines<input v-model.number="receiptFinishing.bottomLines" type="number" min="0" max="30" step="1" /><small class="text-gray-500">Extra feed before cutting. Use 0 for none.</small></label>
          <label class="flex items-center gap-3 text-sm"><UToggle v-model="receiptFinishing.autoCut" aria-label="Automatically cut receipt" @update:model-value="finishingSaved = false" />Cut after receipt</label>
          <label class="text-sm">Label printer language<select v-model="labelLanguage"><option value="tspl">TSPL</option><option value="cpcl">CPCL</option></select><small class="text-gray-500">Match the language supported by your label printer.</small></label>
        </div>
        <div class="flex items-center gap-3 mt-4"><UButton label="Save device settings" @click="saveFinishing" /><span v-if="finishingSaved" role="status" class="text-sm text-green-700">Saved on this device</span></div>
        <p v-if="deviceSettingsDirty" class="text-sm text-amber-700 mt-2">Save device settings before testing.</p>
        <p v-if="finishingError" role="alert" class="text-sm text-red-600 mt-2">{{ finishingError }}</p>
      </details>
    </section>
    <section class="printer-section"><h2 class="text-lg font-semibold mb-1">2. Designs &amp; paper sizes</h2><p class="text-sm text-gray-500 mb-5">Choose company defaults below. Open a design to set its paper size and edit its canvas, then save.</p><PrinterTemplateDesigner hide-original-receipt :receipt-data="buildSampleReceipt()" :label-data="buildSampleLabel()[0]" /></section>
    <details class="printer-section"><summary class="font-semibold cursor-pointer">Courier shipping labels</summary><p class="text-sm text-gray-500 my-3">Separate carrier-generated PDFs for delivery orders.</p><div class="flex gap-3 items-end"><label class="text-sm">PDF paper size<select v-model="shippingLabelSize"><option v-for="size in shippingLabelSizes" :key="size.value" :value="size.value">{{ size.label }}</option></select></label><UButton label="Save shipping size" :loading="savingShippingLabelSize" @click="saveShippingLabelSize" /></div></details>
  </UDashboardPanelContent>
</template>
<style scoped>
.printer-section { border:1px solid rgb(148 163 184 / .25); border-radius:16px; padding:24px; margin-bottom:24px; }
.device-card { border:1px solid rgb(148 163 184 / .25); border-radius:12px; padding:20px; background:rgb(148 163 184 / .04); }
select,input[type=number] { display:block; width:100%; margin-top:8px; padding:10px 12px; border:1px solid rgb(148 163 184 / .5); border-radius:8px; background:transparent; color:inherit; }
select option { color:#0f172a; background:white; }
@media(max-width:640px) { .printer-section { padding:16px; } }
</style>
